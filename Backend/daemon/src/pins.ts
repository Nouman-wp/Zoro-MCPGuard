import path from 'node:path';
import semver from 'semver';
import { appendLog } from './auditlog';
import { all, get, getSetting, json, run, setSetting } from './db';
import { raiseIncident } from './incidents';
import { checkPackage, packageSummary, parseSpec, type PackageReport } from './packages';

/**
 * Pinning for servers launched through package runners (npx, pnpx, bunx, pnpm dlx, yarn dlx, npm exec).
 * `npx some-server` fetches whatever version is newest at launch, so a malicious release would run with no change to
 * anything Zoro could see. Zoro resolves the spec once, verifies the package, and launches that exact version from then
 * on. A newer release is verified and offered as an update; it only runs after a person accepts it.
 */

export interface Pin {
  serverId: string;
  name: string;
  version: string;
  integrity: string | null;
  verdict: PackageReport['verdict'];
  pinnedAt: number;
  requested: string;
}

export interface PendingUpdate {
  name: string;
  from: string;
  to: string;
  verdict: PackageReport['verdict'];
  summary: string;
  checkedAt: number;
}

const RUNNERS = new Set(['npx', 'pnpx', 'bunx']);

/** Find the package spec a runner command will execute, and where it sits in the argument list. */
export function runnerSpec(command: string, args: string[]): { index: number; spec: string } | null {
  const bin = path.basename(command).toLowerCase().replace(/\.(cmd|exe)$/, '');
  let start: number;
  if (RUNNERS.has(bin)) start = 0;
  else if ((bin === 'pnpm' || bin === 'yarn' || bin === 'bun') && (args[0] === 'dlx' || args[0] === 'x')) start = 1;
  else if (bin === 'npm' && (args[0] === 'exec' || args[0] === 'x')) start = 1;
  else return null;
  for (let i = start; i < args.length; i++) {
    const a = args[i];
    if (a === '-p' || a === '--package') return args[i + 1] ? { index: i + 1, spec: args[i + 1] } : null;
    if (a === '--') continue;
    if (a.startsWith('-')) continue;
    return { index: i, spec: a };
  }
  return null;
}

export const getPin = (serverId: string) => json<Pin | null>(getSetting(`pin:${serverId}`), null);
export const getPendingUpdate = (serverId: string) => json<PendingUpdate | null>(getSetting(`update:${serverId}`), null);

/**
 * Returns the arguments to launch with. Unpinned specs are resolved and pinned; an unsafe package refuses to launch
 * (fail closed, with an incident that says why).
 */
export async function pinnedArgs(serverId: string, command: string, args: string[]): Promise<{ args: string[]; pin: Pin | null }> {
  const found = runnerSpec(command, args);
  if (!found) return { args, pin: null };
  const { name, range } = parseSpec(found.spec);
  const existing = getPin(serverId);
  if (existing && existing.name === name && (!semver.valid(range) || range === existing.version)) {
    const out = [...args];
    out[found.index] = `${name}@${existing.version}`;
    return { args: out, pin: existing };
  }
  const rep = await checkPackage('npm', found.spec, { source: 'mcp_server', ref: serverId });
  if (rep.verdict === 'unsafe') {
    raiseIncident({
      type: 'package_risk',
      severity: 'critical',
      title: `Server not started: its package ${rep.name}@${rep.version ?? found.spec} is unsafe`,
      summary: packageSummary(rep),
      groupKey: `pin-unsafe:${serverId}:${rep.name}@${rep.version}`,
      serverId,
      evidence: { report: rep },
    });
    throw new Error(`Zoro refused to launch ${rep.name}@${rep.version ?? found.spec}: ${packageSummary(rep)}`);
  }
  if (!rep.version) {
    // The registry could not be reached: launch the exact spec the user configured, and say it is unverified.
    return { args, pin: null };
  }
  const pin: Pin = { serverId, name: rep.name, version: rep.version, integrity: rep.integrity, verdict: rep.verdict, pinnedAt: Date.now(), requested: found.spec };
  setSetting(`pin:${serverId}`, JSON.stringify(pin));
  appendLog('package', `Pinned ${rep.name}@${rep.version} for server ${serverId} (requested “${found.spec}”)`, { pin }, serverId);
  const out = [...args];
  out[found.index] = `${rep.name}@${rep.version}`;
  return { args: out, pin };
}

/** Look for newer releases of every pinned package and verify them before offering the update. */
export async function checkPinnedUpdates() {
  const pins = all<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key LIKE 'pin:%'").map((r) => json<Pin | null>(r.value, null)).filter(Boolean) as Pin[];
  for (const p of pins) {
    if (!get('SELECT 1 FROM servers WHERE id = ?', p.serverId)) continue;
    try {
      const latest = await checkPackage('npm', `${p.name}@latest`, { source: 'mcp_server', ref: p.serverId });
      if (!latest.version || !semver.valid(latest.version) || !semver.gt(latest.version, p.version)) continue;
      const prev = getPendingUpdate(p.serverId);
      if (prev?.to === latest.version) continue;
      const upd: PendingUpdate = { name: p.name, from: p.version, to: latest.version, verdict: latest.verdict, summary: packageSummary(latest), checkedAt: Date.now() };
      setSetting(`update:${p.serverId}`, JSON.stringify(upd));
      raiseIncident({
        type: 'package_risk',
        severity: latest.verdict === 'unsafe' ? 'critical' : latest.verdict === 'warning' ? 'medium' : 'info',
        title: `${latest.verdict === 'unsafe' ? 'Unsafe update held back' : 'Update available'}: ${p.name} ${p.version} → ${latest.version}`,
        summary: `${upd.summary}. The server keeps running the pinned ${p.version} until you accept the update.`,
        groupKey: `pin-update:${p.serverId}:${latest.version}`,
        serverId: p.serverId,
        evidence: { update: upd, report: latest },
      });
    } catch {
      /* registry unreachable: try again next round */
    }
  }
}

/** Accept a verified update: re-pin to the new version. The caller restarts the server. */
export function acceptUpdate(serverId: string): Pin | null {
  const upd = getPendingUpdate(serverId);
  const pin = getPin(serverId);
  if (!upd || !pin) return null;
  if (upd.verdict === 'unsafe') throw new Error('This update was found unsafe and cannot be accepted.');
  const next: Pin = { ...pin, version: upd.to, verdict: upd.verdict, pinnedAt: Date.now() };
  setSetting(`pin:${serverId}`, JSON.stringify(next));
  run('DELETE FROM settings WHERE key = ?', `update:${serverId}`);
  appendLog('package', `Update accepted: ${pin.name} ${pin.version} → ${upd.to}`, { serverId, update: upd }, serverId);
  return next;
}
