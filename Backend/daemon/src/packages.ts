import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import semver from 'semver';
import { levenshtein, type Severity } from '@zoro/core';
import { appendLog } from './auditlog';
import { bus } from './bus';
import { get, getSetting, json, run } from './db';
import { raiseIncident } from './incidents';

/**
 * Package verification for npm (and known-vulnerability lookups for PyPI). Used before an agent installs or runs a
 * package (npm/pnpm/yarn/bun add, npx, pnpm dlx, pip, uvx), when an MCP server is launched through npx, and by the
 * recall checker. Public lookups only: the package name and version go to registry.npmjs.org, api.npmjs.org and
 * api.osv.dev, nothing else (listed in Settings → Privacy, and switchable off).
 */

export type Ecosystem = 'npm' | 'pypi';
export type PackageVerdict = 'clean' | 'warning' | 'unsafe' | 'unknown';

export interface PackageFinding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

export interface Vuln {
  id: string;
  summary: string;
  severity: Severity;
  fixed: string | null;
  malicious: boolean;
}

export interface PackageReport {
  ecosystem: Ecosystem;
  name: string;
  requested: string;
  version: string | null;
  latest: string | null;
  verdict: PackageVerdict;
  findings: PackageFinding[];
  publishedAt: number | null;
  publisher: string | null;
  previousPublisher: string | null;
  installScripts: string[];
  integrity: string | null;
  signature: 'valid' | 'invalid' | 'missing' | 'unchecked';
  provenance: boolean;
  weeklyDownloads: number | null;
  deprecated: string | null;
  vulns: Vuln[];
  checkedAt: number;
  error: string | null;
}

export const remoteChecksEnabled = () => getSetting('remote_package_checks') !== 'off';

const MIN_AGE_HOURS = 48;
const UA = { 'user-agent': 'zoro-gateway (package verification)' };

/** Popular packages and MCP servers: a name one or two edits away from one of these is a typosquat signal. */
const POPULAR = [
  'react', 'react-dom', 'next', 'vue', 'svelte', 'angular', 'express', 'lodash', 'axios', 'chalk', 'commander', 'debug', 'dotenv', 'moment', 'dayjs',
  'typescript', 'eslint', 'prettier', 'webpack', 'vite', 'rollup', 'esbuild', 'jest', 'vitest', 'mocha', 'chai', 'zod', 'yup', 'uuid', 'nanoid',
  'request', 'node-fetch', 'cross-env', 'rimraf', 'glob', 'minimist', 'yargs', 'inquirer', 'ora', 'ws', 'socket.io', 'mongoose', 'sequelize', 'prisma',
  'pg', 'mysql', 'mysql2', 'redis', 'ioredis', 'sqlite3', 'better-sqlite3', 'jsonwebtoken', 'bcrypt', 'bcryptjs', 'passport', 'cors', 'helmet',
  'body-parser', 'cookie-parser', 'multer', 'sharp', 'puppeteer', 'playwright', 'cheerio', 'tailwindcss', 'postcss', 'autoprefixer', 'babel-core',
  'core-js', 'rxjs', 'tslib', 'classnames', 'clsx', 'framer-motion', 'ethers', 'web3', 'viem', 'wagmi', 'hardhat', 'openai', 'langchain', 'hono',
  'fastify', 'koa', 'nodemon', 'pm2', 'concurrently', 'colors', 'semver', 'mkdirp', 'fs-extra', 'tsx', 'ts-node', 'electron', 'discord.js',
  '@modelcontextprotocol/sdk', '@modelcontextprotocol/server-filesystem', '@modelcontextprotocol/server-github', '@modelcontextprotocol/server-memory',
  '@modelcontextprotocol/server-postgres', '@modelcontextprotocol/server-puppeteer', '@modelcontextprotocol/server-everything', '@modelcontextprotocol/server-sequential-thinking',
  '@anthropic-ai/sdk', '@anthropic-ai/claude-code', '@playwright/mcp', 'firecrawl-mcp', '@upstash/context7-mcp', 'pnpm', 'yarn', 'npm',
];

export function parseSpec(spec: string): { name: string; range: string } {
  const s = spec.trim().replace(/^npm:/, '');
  if (s.startsWith('@')) {
    const i = s.indexOf('@', 1);
    return i > 0 ? { name: s.slice(0, i), range: s.slice(i + 1) || 'latest' } : { name: s, range: 'latest' };
  }
  const i = s.indexOf('@');
  return i > 0 ? { name: s.slice(0, i), range: s.slice(i + 1) || 'latest' } : { name: s, range: 'latest' };
}

async function cachedJson<T>(key: string, url: string, ttlMs: number, init: RequestInit = {}): Promise<{ status: number; body: T | null }> {
  const hit = get<{ value: string; fetched_at: number }>('SELECT value, fetched_at FROM http_cache WHERE key = ?', key);
  if (hit && Date.now() - hit.fetched_at < ttlMs) return json<{ status: number; body: T | null }>(hit.value, { status: 0, body: null });
  const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(8_000) });
  const out = { status: r.status, body: r.ok ? ((await r.json()) as T) : null };
  // Very large packuments are not worth caching whole; the verdict itself is cached in the packages table.
  const text = JSON.stringify(out);
  if (text.length < 2_000_000) run('INSERT INTO http_cache(key, value, fetched_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at', key, text, Date.now());
  return out;
}

interface Packument {
  name: string;
  'dist-tags'?: Record<string, string>;
  versions?: Record<string, { version: string; scripts?: Record<string, string>; deprecated?: string; _npmUser?: { name?: string }; dist?: { integrity?: string; signatures?: { keyid: string; sig: string }[]; attestations?: { url?: string } } }>;
  time?: Record<string, string>;
}

let registryKeys: { keyid: string; key: string }[] | null = null;
async function npmKeys() {
  if (registryKeys) return registryKeys;
  const r = await cachedJson<{ keys: { keyid: string; key: string }[] }>('npm:keys', 'https://registry.npmjs.org/-/npm/v1/keys', 24 * 3_600_000);
  registryKeys = r.body?.keys ?? [];
  return registryKeys;
}

/** Verify the npm registry's ECDSA signature over "name@version:integrity" (what `npm audit signatures` checks). */
async function checkSignature(name: string, version: string, integrity: string | undefined, sigs: { keyid: string; sig: string }[] | undefined): Promise<PackageReport['signature']> {
  if (!integrity || !sigs?.length) return 'missing';
  try {
    const keys = await npmKeys();
    for (const s of sigs) {
      const k = keys.find((x) => x.keyid === s.keyid);
      if (!k) continue;
      const pub = createPublicKey({ key: Buffer.from(k.key, 'base64'), format: 'der', type: 'spki' });
      if (cryptoVerify('sha256', Buffer.from(`${name}@${version}:${integrity}`), pub, Buffer.from(s.sig, 'base64'))) return 'valid';
      return 'invalid';
    }
    return 'unchecked';
  } catch {
    return 'unchecked';
  }
}

const sevFromOsv = (v: { database_specific?: { severity?: string }; severity?: { score?: string }[] }): Severity => {
  const s = (v.database_specific?.severity ?? '').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high') return 'high';
  if (s === 'moderate' || s === 'medium') return 'medium';
  if (s === 'low') return 'low';
  const score = v.severity?.[0]?.score ?? '';
  return /CVSS:3\.\d\/AV:N\/AC:L\/PR:N/.test(score) ? 'high' : 'medium';
};

/** OSV.dev: known vulnerabilities and known-malicious versions ("MAL-" advisories). */
export async function osvQuery(ecosystem: Ecosystem, name: string, version: string): Promise<Vuln[]> {
  const eco = ecosystem === 'npm' ? 'npm' : 'PyPI';
  const r = await cachedJson<{ vulns?: { id: string; summary?: string; details?: string; affected?: { ranges?: { events?: { fixed?: string }[] }[] }[]; database_specific?: { severity?: string }; severity?: { score?: string }[] }[] }>(
    `osv:${eco}:${name}@${version}`, 'https://api.osv.dev/v1/query', 12 * 3_600_000,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ package: { name, ecosystem: eco }, version }) },
  );
  return (r.body?.vulns ?? []).map((v) => {
    const malicious = v.id.startsWith('MAL-');
    const fixed = v.affected?.flatMap((a) => a.ranges ?? []).flatMap((x) => x.events ?? []).map((e) => e.fixed).find(Boolean) ?? null;
    return { id: v.id, summary: (v.summary ?? v.details ?? '').slice(0, 200), severity: malicious ? 'critical' : sevFromOsv(v), fixed, malicious };
  });
}

function typosquatOf(name: string): string | null {
  const bare = name.replace(/^@[^/]+\//, '');
  for (const p of POPULAR) {
    if (p === name) return null;
  }
  for (const p of POPULAR) {
    const pb = p.replace(/^@[^/]+\//, '');
    if (pb.length < 4) continue;
    if (name.startsWith('@') && p.startsWith('@') && name.split('/')[0] === p.split('/')[0]) continue;
    const d = levenshtein(bare.toLowerCase(), pb.toLowerCase(), 3);
    if (d >= 1 && d <= (pb.length >= 8 ? 2 : 1)) return p;
    // Scope confusion: "modelcontextprotocol-server-github" imitating "@modelcontextprotocol/server-github".
    if (p.startsWith('@') && !name.startsWith('@') && name.toLowerCase() === p.slice(1).replace('/', '-').toLowerCase()) return p;
  }
  return null;
}

const finish = (r: PackageReport): PackageReport => {
  const sev = r.findings.map((f) => f.severity);
  r.verdict = r.error && !r.version ? 'unknown' : sev.includes('critical') ? 'unsafe' : sev.includes('high') || sev.includes('medium') ? 'warning' : 'clean';
  return r;
};

/** Verify one npm package spec (name, name@version, name@range or name@tag). */
export async function verifyNpm(spec: string): Promise<PackageReport> {
  const { name, range } = parseSpec(spec);
  const rep: PackageReport = { ecosystem: 'npm', name, requested: spec, version: null, latest: null, verdict: 'unknown', findings: [], publishedAt: null, publisher: null, previousPublisher: null, installScripts: [], integrity: null, signature: 'unchecked', provenance: false, weeklyDownloads: null, deprecated: null, vulns: [], checkedAt: Date.now(), error: null };
  if (!remoteChecksEnabled()) {
    rep.error = 'Remote package checks are turned off in Settings → Privacy.';
    return finish(rep);
  }
  let pk: Packument | null;
  try {
    const r = await cachedJson<Packument>(`npm:pk:${name}`, `https://registry.npmjs.org/${name.replace('/', '%2F')}`, 30 * 60_000, { headers: { accept: 'application/json' } });
    if (r.status === 404) {
      rep.findings.push({ id: 'PK-404', severity: 'high', title: 'Package does not exist on npm', detail: `“${name}” is not on the npm registry. A misspelt name is how typosquats get installed the day someone registers it.` });
      const sq = typosquatOf(name);
      if (sq) rep.findings.push({ id: 'PK-TYPO', severity: 'high', title: `Looks like “${sq}”`, detail: `“${name}” is a near-miss of the popular package “${sq}”.` });
      rep.error = 'not found';
      return finish(rep);
    }
    pk = r.body;
  } catch (e) {
    rep.error = `npm registry unreachable: ${(e as Error).message}`;
    return finish(rep);
  }
  if (!pk?.versions) {
    rep.error = 'malformed registry response';
    return finish(rep);
  }
  const versions = Object.keys(pk.versions);
  rep.latest = pk['dist-tags']?.latest ?? null;
  const version = pk['dist-tags']?.[range] ?? (pk.versions[range] ? range : semver.maxSatisfying(versions, range === 'latest' ? '*' : range));
  if (!version || !pk.versions[version]) {
    rep.error = `no version matches “${range}”`;
    rep.findings.push({ id: 'PK-RANGE', severity: 'medium', title: 'No matching version', detail: `No published version of ${name} matches “${range}”.` });
    return finish(rep);
  }
  rep.version = version;
  const v = pk.versions[version];
  rep.integrity = v.dist?.integrity ?? null;
  rep.provenance = Boolean(v.dist?.attestations);
  rep.publisher = v._npmUser?.name ?? null;
  rep.deprecated = v.deprecated ?? null;
  rep.publishedAt = pk.time?.[version] ? Date.parse(pk.time[version]) : null;
  rep.installScripts = ['preinstall', 'install', 'postinstall'].filter((s) => v.scripts?.[s]);
  const ordered = versions.filter((x) => semver.valid(x)).sort(semver.compare);
  const prev = ordered[ordered.indexOf(version) - 1];
  const pv = prev ? pk.versions[prev] : null;
  rep.previousPublisher = pv?._npmUser?.name ?? null;

  const [sig, vulns, dl] = await Promise.all([
    checkSignature(name, version, v.dist?.integrity, v.dist?.signatures),
    osvQuery('npm', name, version).catch(() => [] as Vuln[]),
    cachedJson<{ downloads?: number }>(`npm:dl:${name}`, `https://api.npmjs.org/downloads/point/last-week/${name}`, 24 * 3_600_000).then((r) => r.body?.downloads ?? null).catch(() => null),
  ]);
  rep.signature = sig;
  rep.vulns = vulns;
  rep.weeklyDownloads = dl;

  for (const m of vulns.filter((x) => x.malicious)) rep.findings.push({ id: m.id, severity: 'critical', title: 'Known malicious package', detail: m.summary || 'OSV lists this version as malicious.' });
  for (const x of vulns.filter((y) => !y.malicious)) rep.findings.push({ id: x.id, severity: x.severity === 'critical' ? 'high' : x.severity === 'low' ? 'low' : 'medium', title: `Known vulnerability (${x.severity})`, detail: `${x.summary}${x.fixed ? ` Fixed in ${x.fixed}.` : ''}` });
  if (sig === 'invalid') rep.findings.push({ id: 'PK-SIG', severity: 'critical', title: 'Registry signature does not match', detail: 'The npm registry’s signature over this version does not verify. The package may have been tampered with in transit or in a mirror.' });
  const sq = typosquatOf(name);
  if (sq && (dl ?? 0) < 5_000) rep.findings.push({ id: 'PK-TYPO', severity: 'critical', title: `Possible typosquat of “${sq}”`, detail: `“${name}” is a near-miss of the popular package “${sq}” and has ${dl ?? 'very few'} weekly downloads.` });
  const ageH = rep.publishedAt ? (Date.now() - rep.publishedAt) / 3_600_000 : null;
  const newScripts = rep.installScripts.filter((s) => !pv?.scripts?.[s]);
  if (ageH !== null && ageH < MIN_AGE_HOURS) rep.findings.push({ id: 'PK-AGE', severity: rep.installScripts.length && ageH < 24 ? 'high' : 'medium', title: `Published ${ageH < 1 ? 'less than an hour' : `${Math.round(ageH)} hours`} ago`, detail: `Brand-new versions are where account takeovers land; most malicious releases are caught within ${MIN_AGE_HOURS} hours.` });
  if (pv && newScripts.length) rep.findings.push({ id: 'PK-SCRIPT-NEW', severity: 'high', title: `New install script: ${newScripts.join(', ')}`, detail: `This version runs code at install time (${newScripts.map((s) => `${s}: ${v.scripts![s].slice(0, 80)}`).join('; ')}); the previous version (${prev}) did not.` });
  else if (rep.installScripts.length) rep.findings.push({ id: 'PK-SCRIPT', severity: 'low', title: `Runs install scripts (${rep.installScripts.join(', ')})`, detail: 'The package executes code when it is installed.' });
  if (rep.publisher && rep.previousPublisher && rep.publisher !== rep.previousPublisher) rep.findings.push({ id: 'PK-PUBLISHER', severity: 'medium', title: 'Published by a different account', detail: `This version was published by “${rep.publisher}”; the previous one (${prev}) by “${rep.previousPublisher}”.` });
  if (rep.deprecated) rep.findings.push({ id: 'PK-DEPRECATED', severity: /malware|malicious|compromis|security/i.test(rep.deprecated) ? 'high' : 'low', title: 'Deprecated', detail: rep.deprecated.slice(0, 200) });
  if (dl !== null && dl < 50) rep.findings.push({ id: 'PK-UNPOPULAR', severity: 'low', title: 'Very few downloads', detail: `${dl} downloads last week.` });
  rep.findings.push({ id: 'PK-PROVENANCE', severity: 'info', title: rep.provenance ? 'Build provenance published' : 'No build provenance', detail: rep.provenance ? 'The publisher attached a provenance attestation linking this version to its source build (presence checked, not independently verified).' : 'This version does not say where or how it was built.' });
  return finish(rep);
}

/** Known vulnerabilities for a PyPI package (uvx / pip). Registry metadata checks are npm-only for now. */
export async function verifyPypi(spec: string): Promise<PackageReport> {
  const m = spec.match(/^([A-Za-z0-9][\w.-]*)(?:==([\w.]+))?/);
  const name = m?.[1] ?? spec;
  const version = m?.[2] ?? null;
  const rep: PackageReport = { ecosystem: 'pypi', name, requested: spec, version, latest: null, verdict: 'unknown', findings: [], publishedAt: null, publisher: null, previousPublisher: null, installScripts: [], integrity: null, signature: 'unchecked', provenance: false, weeklyDownloads: null, deprecated: null, vulns: [], checkedAt: Date.now(), error: null };
  if (!remoteChecksEnabled() || !version) {
    rep.error = !version ? 'unpinned PyPI spec: only known-vulnerability checks run on pinned versions' : 'Remote package checks are turned off';
    return finish(rep);
  }
  rep.vulns = await osvQuery('pypi', name, version).catch(() => []);
  for (const x of rep.vulns) rep.findings.push({ id: x.id, severity: x.malicious ? 'critical' : x.severity === 'critical' ? 'high' : 'medium', title: x.malicious ? 'Known malicious package' : `Known vulnerability (${x.severity})`, detail: `${x.summary}${x.fixed ? ` Fixed in ${x.fixed}.` : ''}` });
  return finish(rep);
}

/** Verify, persist and record where the package was seen. Returns the report (cached for 30 minutes per resolved version). */
export async function checkPackage(ecosystem: Ecosystem, spec: string, use: { source: 'agent_install' | 'mcp_server' | 'manual' | 'skill'; ref?: string | null; agent?: string | null }): Promise<PackageReport> {
  const cachedVerdict = (() => {
    const { name, range } = parseSpec(spec);
    if (ecosystem !== 'npm' || !semver.valid(range)) return null;
    const row = get<{ report: string; checked_at: number }>('SELECT report, checked_at FROM packages WHERE ecosystem = ? AND name = ? AND version = ?', ecosystem, name, range);
    return row && Date.now() - row.checked_at < 30 * 60_000 ? json<PackageReport | null>(row.report, null) : null;
  })();
  const rep = cachedVerdict ?? (ecosystem === 'npm' ? await verifyNpm(spec) : await verifyPypi(spec));
  const now = Date.now();
  if (rep.version)
    run(
      'INSERT INTO packages(ecosystem, name, version, verdict, report, checked_at, first_seen, last_seen) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(ecosystem, name, version) DO UPDATE SET verdict = excluded.verdict, report = excluded.report, checked_at = excluded.checked_at, last_seen = excluded.last_seen',
      ecosystem, rep.name, rep.version, rep.verdict, JSON.stringify(rep), rep.checkedAt, now, now,
    );
  run('INSERT INTO package_uses(ts, ecosystem, name, version, requested, source, ref, agent) VALUES(?,?,?,?,?,?,?,?)', now, ecosystem, rep.name, rep.version, spec, use.source, use.ref ?? null, use.agent ?? null);
  if (!cachedVerdict) {
    appendLog('package', `${ecosystem} ${rep.name}@${rep.version ?? spec}: ${rep.verdict}`, { findings: rep.findings.filter((f) => f.severity !== 'info').map((f) => f.id), source: use.source }, use.ref ?? null);
    if (rep.verdict === 'unsafe')
      raiseIncident({
        type: 'package_risk',
        severity: 'critical',
        title: `Unsafe ${ecosystem} package: ${rep.name}@${rep.version ?? spec}`,
        summary: rep.findings.filter((f) => f.severity === 'critical').map((f) => `${f.title}: ${f.detail}`).join(' ').slice(0, 600),
        groupKey: `package:${ecosystem}:${rep.name}@${rep.version ?? spec}`,
        evidence: { report: rep, source: use.source, ref: use.ref ?? null },
      });
  }
  bus.emitEvent('package', { ecosystem, name: rep.name, version: rep.version, verdict: rep.verdict });
  return rep;
}

/** A one-line, plain-language summary of the material findings. */
export const packageSummary = (r: PackageReport) => {
  const material = r.findings.filter((f) => f.severity !== 'info' && f.severity !== 'low');
  return `${r.name}@${r.version ?? r.requested}: ${r.verdict}${material.length ? ` — ${material.slice(0, 3).map((f) => f.title).join('; ')}` : ''}`;
};
