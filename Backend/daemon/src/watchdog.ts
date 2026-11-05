import { existsSync, readdirSync, readFileSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isSkillPath, scanSkill, sha256Hex, skillNameFromPath } from '@zoro/core';
import { appendLog } from './auditlog';
import { bus } from './bus';
import { all, get, json, run } from './db';
import { raiseIncident, setIncidentStatus } from './incidents';
import { clientConfigPaths } from './onboarding';
import { recordSkill } from './skills';

/**
 * Settings watchdog: the AI clients' own configuration is part of the attack surface. A script (or a manipulated
 * agent) that adds an MCP server, a hook or a command to a client config can disable every protection. Zoro hashes
 * each known config file, watches it, and opens an incident within a second when it changes without going through
 * Zoro — with the exact added lines, the servers that bypass the Zoro bridge, and one-click restore.
 * Skill folders are watched too: every new or changed skill file is scanned as it lands.
 */

interface Snapshot {
  path: string;
  client: string | null;
  hash: string;
  content: string;
  good_content: string | null;
  updated_at: number;
  expected_until: number;
}

const watchers = new Map<string, FSWatcher>();
const timers = new Map<string, NodeJS.Timeout>();

export const skillRoots = () => [path.join(os.homedir(), '.claude', 'skills'), path.join(os.homedir(), '.claude', 'agents'), path.join(os.homedir(), '.claude', 'commands'), path.join(os.homedir(), '.claude', 'plugins')];

/** Zoro is about to write this file itself (routing, restore, hook install): do not treat it as tampering. */
export function expectChange(file: string, ms = 5_000) {
  run('UPDATE config_snapshots SET expected_until = ? WHERE path = ?', Date.now() + ms, file);
}

function readSafe(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function snapshot(file: string, client: string | null) {
  const content = readSafe(file);
  if (content === null) return;
  const hash = sha256Hex(content);
  run('INSERT INTO config_snapshots(path, client, hash, content, good_content, updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET hash = excluded.hash, content = excluded.content, updated_at = excluded.updated_at', file, client, hash, content, content, Date.now());
}

const parse = (s: string): Record<string, unknown> => {
  try {
    return JSON.parse(s.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1')) as Record<string, unknown>;
  } catch {
    return {};
  }
};

/** Servers anywhere in a config (top-level mcpServers/servers and Claude Code's per-project entries). */
function serversIn(doc: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  const take = (o: unknown, prefix: string) => {
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o as Record<string, unknown>)) out.set(prefix + k, (v ?? {}) as Record<string, unknown>);
  };
  take(doc.mcpServers, '');
  take(doc.servers, '');
  const projects = doc.projects as Record<string, { mcpServers?: unknown }> | undefined;
  if (projects && typeof projects === 'object') for (const [p, v] of Object.entries(projects)) take(v?.mcpServers, `${path.basename(p)}:`);
  return out;
}

const hooksIn = (doc: Record<string, unknown>) => JSON.stringify(doc.hooks ?? null);

export function diffConfig(before: string, after: string) {
  const a = parse(before);
  const b = parse(after);
  const sa = serversIn(a);
  const sb = serversIn(b);
  const added = [...sb.keys()].filter((k) => !sa.has(k));
  const removed = [...sa.keys()].filter((k) => !sb.has(k));
  const changed = [...sb.keys()].filter((k) => sa.has(k) && JSON.stringify(sa.get(k)) !== JSON.stringify(sb.get(k)));
  const bypass = [...added, ...changed].filter((k) => {
    const s = sb.get(k)!;
    const text = JSON.stringify(s);
    return !/zoro-bridge/.test(text) && (s.command || s.url || s.type);
  });
  const oldLines = new Set(before.split(/\r?\n/).map((l) => l.trim()));
  const addedLines = after.split(/\r?\n/).filter((l) => l.trim() && !oldLines.has(l.trim())).slice(0, 40);
  const hooksChanged = hooksIn(a) !== hooksIn(b);
  return { added, removed, changed, bypass, addedLines, hooksChanged };
}

function onConfigChange(file: string) {
  const snap = get<Snapshot>('SELECT * FROM config_snapshots WHERE path = ?', file);
  const content = readSafe(file);
  if (!snap || content === null) return;
  const hash = sha256Hex(content);
  if (hash === snap.hash) return;
  const d = diffConfig(snap.content, content);
  if (Date.now() < snap.expected_until) {
    run('UPDATE config_snapshots SET hash = ?, content = ?, good_content = ?, updated_at = ? WHERE path = ?', hash, content, content, Date.now(), file);
    appendLog('config_change', `Zoro updated ${path.basename(file)}`, { path: file });
    return;
  }
  // Keep the last version Zoro trusted as the restore point; diff later changes against the newest content.
  run('UPDATE config_snapshots SET hash = ?, content = ?, updated_at = ? WHERE path = ?', hash, content, Date.now(), file);
  const severity = d.hooksChanged || d.bypass.length ? 'critical' : d.added.length || d.changed.length ? 'high' : 'medium';
  const what = [
    d.added.length ? `added server(s): ${d.added.join(', ')}` : '',
    d.changed.length ? `changed server(s): ${d.changed.join(', ')}` : '',
    d.removed.length ? `removed server(s): ${d.removed.join(', ')}` : '',
    d.hooksChanged ? 'changed hooks' : '',
    d.bypass.length ? `${d.bypass.length} server(s) bypass the Zoro bridge` : '',
  ].filter(Boolean).join('; ') || 'other settings changed';
  raiseIncident({
    type: 'config_tamper',
    severity,
    title: 'Someone changed your AI’s settings. Was it you?',
    summary: `${snap.client ?? 'An AI client'}’s configuration (${file}) changed outside Zoro: ${what}. If you did not make this change, restore the previous version.`,
    groupKey: `tamper:${file}:${hash}`,
    evidence: { path: file, client: snap.client, ...d, restorable: Boolean(snap.good_content) },
  });
  appendLog('config_change', `Unexpected change to ${file}: ${what}`, { path: file, diff: d });
  bus.emitEvent('watchdog', { path: file, severity });
}

function onSkillChange(file: string) {
  try {
    if (!existsSync(file) || !statSync(file).isFile() || statSync(file).size > 1_000_000) return;
  } catch {
    return;
  }
  if (!/\.(md|mdc|txt|sh|js|mjs|ts|py|json|ya?ml)$/i.test(file)) return;
  const text = readSafe(file);
  if (text === null) return;
  recordSkill(file, scanSkill(skillNameFromPath(file), text), 'watchdog');
}

const debounce = (key: string, fn: () => void, ms = 250) => {
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    fn();
  }, ms));
};

function watchDir(dir: string, filter: (f: string) => boolean, handler: (f: string) => void, recursive = false) {
  if (watchers.has(dir) || !existsSync(dir)) return;
  try {
    const w = watch(dir, { recursive, persistent: false }, (_e, name) => {
      if (!name) return;
      const full = path.join(dir, name.toString());
      if (filter(full)) debounce(full, () => handler(full));
    });
    w.on('error', () => watchers.delete(dir));
    watchers.set(dir, w);
  } catch {
    /* unwatchable (permissions, network drive): the periodic sweep still covers it */
  }
}

function scanSkillTree(root: string, depth = 0) {
  if (depth > 4 || !existsSync(root)) return;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) scanSkillTree(full, depth + 1);
    else if (isSkillPath(full)) onSkillChange(full);
  }
}

/** Start (or refresh) watching every known client config and skill folder. Safe to call repeatedly. */
export function startWatchdog() {
  const files = clientConfigPaths();
  const byDir = new Map<string, Set<string>>();
  for (const { path: file, client } of files) {
    if (!existsSync(file)) continue;
    if (!get('SELECT 1 FROM config_snapshots WHERE path = ?', file)) snapshot(file, client);
    const dir = path.dirname(file);
    if (!byDir.has(dir)) byDir.set(dir, new Set());
    byDir.get(dir)!.add(path.resolve(file));
  }
  for (const [dir, set] of byDir) watchDir(dir, (f) => set.has(path.resolve(f)), onConfigChange);
  for (const root of skillRoots()) {
    scanSkillTree(root);
    watchDir(root, (f) => isSkillPath(f), onSkillChange, true);
  }
}

/** Periodic sweep for platforms where file watching is unreliable. */
export function sweepWatchdog() {
  for (const s of all<Snapshot>('SELECT * FROM config_snapshots')) {
    const c = readSafe(s.path);
    if (c !== null && sha256Hex(c) !== s.hash) onConfigChange(s.path);
  }
}

export function watchdogStatus() {
  return {
    files: all<Omit<Snapshot, 'content' | 'good_content'> & { restorable: number }>('SELECT path, client, hash, updated_at, expected_until, good_content IS NOT NULL AND good_content != content AS restorable FROM config_snapshots ORDER BY path'),
    watching: [...watchers.keys()],
  };
}

/** One-click restore of the last version Zoro trusted. */
export function restoreConfig(file: string, incidentId: string | null) {
  const s = get<Snapshot>('SELECT * FROM config_snapshots WHERE path = ?', file);
  if (!s?.good_content) throw new Error('No trusted version of this file is on record');
  expectChange(file);
  writeFileSync(file, s.good_content);
  run('UPDATE config_snapshots SET hash = ?, content = ?, updated_at = ? WHERE path = ?', sha256Hex(s.good_content), s.good_content, Date.now(), file);
  appendLog('config_change', `Restored ${file} to the last trusted version`, { path: file });
  if (incidentId) setIncidentStatus(incidentId, 'resolved', 'Configuration restored to the last trusted version.');
  bus.emitEvent('watchdog', { path: file, restored: true });
  return { ok: true };
}

/** After Zoro itself rewrites a file (routing, hook install), accept the new content as trusted. */
export function trustCurrent(file: string, client: string | null) {
  expectChange(file);
  snapshot(file, client);
}

export const parseJsonLoose = (s: string) => json<Record<string, unknown>>(s, {});
