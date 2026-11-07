import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import os from 'node:os';
import { actionDigest } from '@zoro/core';
import { loadAuditor } from '@zoro/blockchain/auditor';
import { appendLog } from './auditlog';
import { bus } from './bus';
import { VERSION, config, isWorldConfigured } from './config';
import { all, get, getSetting, json, run, setSetting } from './db';
import { completeHumanSeal, getHumanSeal, startHumanSeal } from './humanseal';
import { activateLockdown, getLockdown, liftLockdown } from './lockdown';
import { claudeHookStatus } from './onboarding';
import { vulnerabilitiesFor } from './recall';

/**
 * Organizations. A manager runs the organization server (the hosted Zoro) and invites the team. Each employee joins
 * from their own Zoro by proving with World ID that they are a unique human: the proof's nullifier, scoped to this
 * organization, is the member's identity — stable, pseudonymous, and impossible to register twice. It is independent
 * of the AI account (a Claude Team or Max seat): Zoro attributes activity to the verified person and their device.
 *
 * Each member's Zoro then syncs its inventory — MCP servers and their verdicts, npm/PyPI packages, skills, clients —
 * so the manager sees who uses what. Per-call activity never leaves a member's machine; the organization chooses
 * between "inventory" (default) and "inventory + incident titles", and members see that choice before they join.
 *
 * Credentials are signed tokens (HMAC with a key derived from the auditor key, or ZORO_ORG_SECRET), so a host whose
 * disk is wiped (Render free) rebuilds its member and device records from the next sync instead of locking everyone out.
 */

export type ShareLevel = 'inventory' | 'events';

interface TokenBody {
  v: 1;
  t: 'invite' | 'device';
  org: string;
  orgName: string;
  member?: string;
  device?: string;
  nul?: string;
  name?: string;
  iat: number;
  exp?: number;
  share?: ShareLevel;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
let secretCache: Buffer | null = null;
const secret = () => {
  if (secretCache) return secretCache;
  const env = process.env.ZORO_ORG_SECRET?.trim();
  secretCache = env ? createHash('sha256').update(env).digest() : createHmac('sha256', loadAuditor().privateKey).update('zoro-org-secret/1').digest();
  return secretCache;
};

export function signToken(body: TokenBody): string {
  const payload = b64u(JSON.stringify(body));
  return `${payload}.${b64u(createHmac('sha256', secret()).update(payload).digest())}`;
}

export function verifyToken(token: string, type: TokenBody['t']): TokenBody | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const body = json<TokenBody | null>(Buffer.from(payload, 'base64url').toString('utf8'), null);
  if (!body || body.v !== 1 || body.t !== type) return null;
  if (body.exp && Date.now() > body.exp) return null;
  return body;
}

// =====================================================================================================================
// Organization host (the manager's Zoro)
// =====================================================================================================================

export interface OrgRow {
  id: string;
  name: string;
  created_at: number;
  lockdown: string | null;
  share_level: ShareLevel;
}

const ensureOrg = (id: string, name: string) => {
  run('INSERT OR IGNORE INTO orgs(id, name, created_at) VALUES(?,?,?)', id, name, Date.now());
  return get<OrgRow>('SELECT * FROM orgs WHERE id = ?', id)!;
};

export function createOrg(name: string) {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error('Organization name required');
  const id = `org_${randomBytes(6).toString('hex')}`;
  ensureOrg(id, clean);
  appendLog('org', `Organization created: ${clean}`, { id });
  return get<OrgRow>('SELECT * FROM orgs WHERE id = ?', id)!;
}

/** An invite code is a signed token naming the organization; it is shown once and expires. */
export function createInvite(orgId: string, days = 14) {
  const org = get<OrgRow>('SELECT * FROM orgs WHERE id = ?', orgId);
  if (!org) throw new Error('Unknown organization');
  const code = signToken({ v: 1, t: 'invite', org: org.id, orgName: org.name, iat: Date.now(), exp: Date.now() + Math.max(1, Math.min(90, days)) * 86_400_000, share: org.share_level });
  appendLog('org', `Invite created for ${org.name} (expires in ${days} day(s))`, { org: org.id });
  return { code, expiresAt: Date.now() + days * 86_400_000, server: config.publicUrl };
}

const joinDigest = (orgId: string) => actionDigest({ kind: 'org_join', requestId: `org:${orgId}` });

/** Step 1 of joining: check the invite, then ask the person for a World ID proof bound to this organization. */
export function hostJoinStart(invite: string) {
  const inv = verifyToken(invite, 'invite');
  if (!inv) throw new Error('This invite is not valid or has expired. Ask your manager for a new one.');
  if (!isWorldConfigured()) throw new Error('The organization server does not have World ID configured, so it cannot verify members.');
  const org = ensureOrg(inv.org, inv.orgName);
  const hs = startHumanSeal(joinDigest(org.id), null, Date.now() + 10 * 60_000);
  if (!hs.ok) throw new Error(hs.error);
  return { orgId: org.id, orgName: org.name, shareLevel: org.share_level, sealId: hs.id, request: hs.request };
}

/** Step 2: verify the proof server-side; its nullifier becomes the member's identity in this organization. */
export async function hostJoinComplete(input: { invite: string; sealId: string; result: Record<string, unknown>; name: string; device: { hostname?: string; os?: string; version?: string } }) {
  const inv = verifyToken(input.invite, 'invite');
  if (!inv) throw new Error('This invite is not valid or has expired.');
  const org = ensureOrg(inv.org, inv.orgName);
  const r = await completeHumanSeal(input.sealId, input.result);
  let nullifier = r.status === 'verified' ? r.nullifier : null;
  if (r.status === 'replay') nullifier = json<{ replayOf?: string | null }>(getHumanSeal(input.sealId)?.response, {}).replayOf ?? null;
  if (!nullifier) throw new Error(`World ID verification did not complete (${r.status}${r.error ? `: ${r.error}` : ''}).`);
  const memberId = `m_${createHash('sha256').update(`${org.id}:${nullifier}`).digest('hex').slice(0, 16)}`;
  if (get('SELECT 1 FROM org_revoked WHERE org_id = ? AND subject = ?', org.id, memberId)) throw new Error('This member was removed from the organization.');
  const name = (input.name || 'Member').trim().slice(0, 60);
  const now = Date.now();
  run('INSERT INTO org_members(org_id, id, nullifier, name, role, joined_at, last_seen) VALUES(?,?,?,?,?,?,?) ON CONFLICT(org_id, id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen', org.id, memberId, nullifier, name, 'member', now, now);
  const deviceId = `d_${randomBytes(6).toString('hex')}`;
  run('INSERT INTO org_devices(org_id, id, member_id, hostname, os, version, enrolled_at, last_seen) VALUES(?,?,?,?,?,?,?,?)', org.id, deviceId, memberId, input.device.hostname?.slice(0, 80) ?? null, input.device.os?.slice(0, 40) ?? null, input.device.version?.slice(0, 20) ?? null, now, now);
  const token = signToken({ v: 1, t: 'device', org: org.id, orgName: org.name, member: memberId, device: deviceId, nul: nullifier, name, iat: now });
  appendLog('org', `${name} joined ${org.name} as a verified human${r.status === 'replay' ? ' (new device for an existing member)' : ''}`, { org: org.id, member: memberId, device: deviceId });
  bus.emitEvent('org', { org: org.id, joined: memberId });
  return { token, orgId: org.id, orgName: org.name, memberId, deviceId, shareLevel: org.share_level, auditor: loadAuditor().account.address, returning: r.status === 'replay' };
}

export interface SyncPayload {
  device?: { hostname?: string; os?: string; version?: string };
  inventory?: { kind: 'mcp_server' | 'npm_package' | 'pypi_package' | 'skill' | 'client'; key: string; name: string; version?: string | null; verdict?: string | null; detail?: unknown }[];
  events?: { ts: number; type: string; severity: string; summary: string; data?: unknown }[];
  lockdownLocal?: boolean;
}

/** A member device reports its inventory; the host answers with the organization's lockdown state and settings. */
export function hostSync(token: string, body: SyncPayload) {
  const t = verifyToken(token, 'device');
  if (!t?.member || !t.device || !t.nul) return { status: 401 as const, error: 'Device token not valid for this organization server. Re-join from your Zoro Console.' };
  if (get('SELECT 1 FROM org_revoked WHERE org_id = ? AND subject IN (?, ?)', t.org, t.member, t.device)) return { status: 403 as const, error: 'This device or member was removed from the organization.' };
  const org = ensureOrg(t.org, t.orgName);
  const now = Date.now();
  // Self-healing: records lost on an ephemeral host come back from the signed token.
  run('INSERT INTO org_members(org_id, id, nullifier, name, role, joined_at, last_seen) VALUES(?,?,?,?,?,?,?) ON CONFLICT(org_id, id) DO UPDATE SET last_seen = excluded.last_seen', t.org, t.member, t.nul, t.name ?? 'Member', 'member', t.iat, now);
  const d = body.device ?? {};
  run('INSERT INTO org_devices(org_id, id, member_id, hostname, os, version, enrolled_at, last_seen) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(org_id, id) DO UPDATE SET hostname = excluded.hostname, os = excluded.os, version = excluded.version, last_seen = excluded.last_seen', t.org, t.device, t.member, d.hostname?.slice(0, 80) ?? null, d.os?.slice(0, 40) ?? null, d.version?.slice(0, 20) ?? null, t.iat, now);
  const inv = (body.inventory ?? []).slice(0, 2_000);
  run('DELETE FROM org_inventory WHERE org_id = ? AND device_id = ?', t.org, t.device);
  for (const i of inv) {
    if (!i || typeof i.key !== 'string' || typeof i.kind !== 'string') continue;
    run(
      'INSERT OR REPLACE INTO org_inventory(org_id, device_id, member_id, kind, key, name, version, verdict, detail, first_seen, last_seen) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      t.org, t.device, t.member, i.kind.slice(0, 20), i.key.slice(0, 300), String(i.name ?? i.key).slice(0, 200), i.version ? String(i.version).slice(0, 60) : null, i.verdict ? String(i.verdict).slice(0, 30) : null, JSON.stringify(i.detail ?? null).slice(0, 4_000), now, now,
    );
  }
  if (org.share_level === 'events')
    for (const e of (body.events ?? []).slice(0, 200))
      run('INSERT INTO org_events(org_id, device_id, member_id, ts, type, severity, summary, data) VALUES(?,?,?,?,?,?,?,?)', t.org, t.device, t.member, Number(e.ts) || now, String(e.type).slice(0, 40), String(e.severity).slice(0, 12), String(e.summary).slice(0, 300), JSON.stringify(e.data ?? null).slice(0, 2_000));
  run('UPDATE org_devices SET summary = ? WHERE org_id = ? AND id = ?', JSON.stringify({ lockdownLocal: Boolean(body.lockdownLocal), counts: inv.reduce<Record<string, number>>((a, x) => ((a[x.kind] = (a[x.kind] ?? 0) + 1), a), {}) }), t.org, t.device);
  bus.emitEvent('org', { org: t.org, synced: t.device });
  return { status: 200 as const, body: { orgId: org.id, orgName: org.name, shareLevel: org.share_level, lockdown: json<{ by: string; at: number; reason: string | null } | null>(org.lockdown, null), auditor: loadAuditor().account.address } };
}

export function setOrgLockdown(orgId: string, active: boolean, by: string, reason: string | null) {
  const org = get<OrgRow>('SELECT * FROM orgs WHERE id = ?', orgId);
  if (!org) throw new Error('Unknown organization');
  run('UPDATE orgs SET lockdown = ? WHERE id = ?', active ? JSON.stringify({ by, at: Date.now(), reason }) : null, orgId);
  appendLog('lockdown', `Organization ${org.name}: lockdown ${active ? 'activated' : 'lifted'} by ${by}`, { org: orgId, reason });
  bus.emitEvent('org', { org: orgId, lockdown: active });
  return get<OrgRow>('SELECT * FROM orgs WHERE id = ?', orgId);
}

export function setShareLevel(orgId: string, level: ShareLevel) {
  run('UPDATE orgs SET share_level = ? WHERE id = ?', level === 'events' ? 'events' : 'inventory', orgId);
  appendLog('org', `Organization sharing level set to ${level}`, { org: orgId });
}

export function revokeMember(orgId: string, memberId: string) {
  run('INSERT OR IGNORE INTO org_revoked(org_id, subject, revoked_at) VALUES(?,?,?)', orgId, memberId, Date.now());
  run("UPDATE org_members SET status = 'removed' WHERE org_id = ? AND id = ?", orgId, memberId);
  run('DELETE FROM org_inventory WHERE org_id = ? AND member_id = ?', orgId, memberId);
  appendLog('org', `Member ${memberId} removed from the organization`, { org: orgId });
}

/** The manager's view: members, devices, and every MCP server, package, skill and client with who uses it. */
export function orgOverview() {
  const orgs = all<OrgRow>('SELECT * FROM orgs ORDER BY created_at');
  return orgs.map((o) => {
    const members = all<{ id: string; name: string; joined_at: number; last_seen: number | null; status: string; nullifier: string }>('SELECT id, name, joined_at, last_seen, status, nullifier FROM org_members WHERE org_id = ? ORDER BY name', o.id);
    const devices = all<{ id: string; member_id: string; hostname: string | null; os: string | null; version: string | null; enrolled_at: number; last_seen: number | null; summary: string | null }>('SELECT id, member_id, hostname, os, version, enrolled_at, last_seen, summary FROM org_devices WHERE org_id = ?', o.id);
    const inv = all<{ kind: string; key: string; name: string; version: string | null; verdict: string | null; member_id: string; device_id: string; detail: string | null; last_seen: number }>('SELECT kind, key, name, version, verdict, member_id, device_id, detail, last_seen FROM org_inventory WHERE org_id = ?', o.id);
    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    const grouped = new Map<string, { kind: string; key: string; name: string; versions: Set<string>; verdicts: Set<string>; members: Set<string>; devices: Set<string>; lastSeen: number; detail: unknown }>();
    for (const i of inv) {
      const k = `${i.kind}|${i.key}`;
      const g = grouped.get(k) ?? { kind: i.kind, key: i.key, name: i.name, versions: new Set<string>(), verdicts: new Set<string>(), members: new Set<string>(), devices: new Set<string>(), lastSeen: 0, detail: json(i.detail, null) };
      if (i.version) g.versions.add(i.version);
      if (i.verdict) g.verdicts.add(i.verdict);
      g.members.add(nameOf.get(i.member_id) ?? i.member_id);
      g.devices.add(i.device_id);
      g.lastSeen = Math.max(g.lastSeen, i.last_seen);
      grouped.set(k, g);
    }
    const items = [...grouped.values()].map((g) => ({ kind: g.kind, key: g.key, name: g.name, versions: [...g.versions], verdicts: [...g.verdicts], members: [...g.members].sort(), devices: g.devices.size, lastSeen: g.lastSeen, detail: g.detail }));
    const stale = Date.now() - 10 * 60_000;
    return {
      ...o,
      lockdown: json(o.lockdown, null),
      members: members.map((m) => ({ id: m.id, name: m.name, joinedAt: m.joined_at, lastSeen: m.last_seen, status: m.status, humanId: `${m.nullifier.slice(0, 6)}…${m.nullifier.slice(-4)}`, devices: devices.filter((d) => d.member_id === m.id).map((d) => ({ ...d, summary: json(d.summary, null), online: (d.last_seen ?? 0) > stale })) })),
      inventory: {
        servers: items.filter((i) => i.kind === 'mcp_server'),
        packages: items.filter((i) => i.kind === 'npm_package' || i.kind === 'pypi_package'),
        skills: items.filter((i) => i.kind === 'skill'),
        clients: items.filter((i) => i.kind === 'client'),
      },
      events: all('SELECT e.ts, e.type, e.severity, e.summary, m.name AS member FROM org_events e LEFT JOIN org_members m ON m.org_id = e.org_id AND m.id = e.member_id WHERE e.org_id = ? ORDER BY e.ts DESC LIMIT 100', o.id),
    };
  });
}

// =====================================================================================================================
// Member (an employee's Zoro)
// =====================================================================================================================

export interface Membership {
  server: string;
  orgId: string;
  orgName: string;
  memberId: string;
  deviceId: string;
  token: string;
  name: string;
  joinedAt: number;
  shareLevel: ShareLevel;
  auditor: string | null;
  lastSync: number | null;
  lastError: string | null;
}

export const getMembership = () => json<Membership | null>(getSetting('org_membership'), null);
const saveMembership = (m: Membership | null) => setSetting('org_membership', JSON.stringify(m));
/** The organization's auditor is trusted for public revocations (the global kill switch). */
export const orgAuditor = () => getMembership()?.auditor ?? null;

const normServer = (s: string) => s.trim().replace(/\/+$/, '');

async function hostCall<T>(server: string, path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${normServer(server)}/api/org/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Organization server returned ${res.status}`);
  return data;
}

export async function memberJoinStart(server: string, invite: string, name: string) {
  const start = await hostCall<{ orgId: string; orgName: string; shareLevel: ShareLevel; sealId: string; request: unknown }>(server, '/join/start', { invite });
  setSetting('org_join_pending', JSON.stringify({ server: normServer(server), invite, name, sealId: start.sealId, at: Date.now() }));
  return start;
}

export async function memberJoinComplete(sealId: string, result: Record<string, unknown>) {
  const p = json<{ server: string; invite: string; name: string; sealId: string } | null>(getSetting('org_join_pending'), null);
  if (!p || p.sealId !== sealId) throw new Error('No join in progress for this verification. Start again.');
  const r = await hostCall<{ token: string; orgId: string; orgName: string; memberId: string; deviceId: string; shareLevel: ShareLevel; auditor: string; returning: boolean }>(p.server, '/join/complete', {
    invite: p.invite, sealId, result, name: p.name, device: { hostname: os.hostname(), os: `${os.platform()} ${os.release()}`, version: VERSION },
  });
  const m: Membership = { server: p.server, orgId: r.orgId, orgName: r.orgName, memberId: r.memberId, deviceId: r.deviceId, token: r.token, name: p.name, joinedAt: Date.now(), shareLevel: r.shareLevel, auditor: r.auditor, lastSync: null, lastError: null };
  saveMembership(m);
  setSetting('org_join_pending', 'null');
  appendLog('org', `Joined ${r.orgName} as a verified human${r.returning ? ' (existing member, new device)' : ''}`, { org: r.orgId, member: r.memberId });
  void memberSync();
  return { ...m, token: undefined };
}

export function memberLeave() {
  const m = getMembership();
  saveMembership(null);
  if (getLockdown()?.source === 'org') liftLockdown('left organization', null);
  if (m) appendLog('org', `Left ${m.orgName}`, { org: m.orgId });
}

/** What this device shares: inventory always; incident titles only when the organization chose that level. */
export function buildInventory(shareLevel: ShareLevel, since: number) {
  const inventory: NonNullable<SyncPayload['inventory']> = [];
  for (const s of all<{ id: string; label: string; name: string; transport: string; mode: string; declared_name: string | null; declared_version: string | null; status: string; url: string | null }>('SELECT id, label, name, transport, mode, declared_name, declared_version, status, url FROM servers WHERE lab = 0')) {
    const tools = all<{ name: string; fingerprint: string; state: string; verdict: string | null }>("SELECT l.name, l.fingerprint, l.state, s.verdict FROM live l LEFT JOIN seals s ON s.fingerprint = l.fingerprint WHERE l.server_id = ? AND l.kind = 'tool' AND l.state != 'removed'", s.id);
    const pin = json<{ name: string; version: string } | null>(getSetting(`pin:${s.id}`), null);
    const vulns = vulnerabilitiesFor(s.id);
    const worst = tools.some((t) => t.verdict === 'unsafe' || t.state === 'blocked') ? 'unsafe' : tools.some((t) => t.state === 'quarantined' || !t.verdict) ? 'pending' : tools.some((t) => t.verdict === 'sealed_with_warnings') ? 'sealed_with_warnings' : 'sealed';
    inventory.push({
      kind: 'mcp_server',
      key: pin ? `npm:${pin.name}` : s.url ? `url:${new URL(s.url).host}` : `label:${s.label}`,
      name: s.declared_name ?? s.name,
      version: pin?.version ?? s.declared_version,
      verdict: tools.length ? worst : 'no tools',
      detail: { transport: s.transport, mode: s.mode, status: s.status, tools: tools.map((t) => ({ name: t.name, verdict: t.verdict ?? 'pending', state: t.state, fp: t.fingerprint.slice(0, 10) })), knownVulns: vulns.map((v) => v.id) },
    });
  }
  for (const p of all<{ ecosystem: string; name: string; version: string; verdict: string; last: number }>('SELECT p.ecosystem, p.name, p.version, p.verdict, MAX(u.ts) AS last FROM package_uses u JOIN packages p ON p.ecosystem = u.ecosystem AND p.name = u.name AND p.version = u.version WHERE u.ts > ? GROUP BY p.ecosystem, p.name, p.version', Date.now() - 30 * 86_400_000))
    inventory.push({ kind: p.ecosystem === 'npm' ? 'npm_package' : 'pypi_package', key: `${p.ecosystem}:${p.name}@${p.version}`, name: p.name, version: p.version, verdict: p.verdict, detail: { lastUsed: p.last } });
  for (const k of all<{ name: string; fingerprint: string; verdict: string; source: string; path: string }>('SELECT name, fingerprint, verdict, source, path FROM skills'))
    inventory.push({ kind: 'skill', key: `skill:${k.name}:${k.fingerprint.slice(0, 12)}`, name: k.name, verdict: k.verdict, detail: { source: k.source, scope: /[\\/]\.claude[\\/]/.test(k.path) ? 'claude' : 'other' } });
  for (const c of all<{ client: string; routed: number }>('SELECT client, routed FROM client_configs'))
    inventory.push({ kind: 'client', key: `client:${c.client}`, name: c.client, verdict: c.routed ? 'protected' : 'unprotected' });
  const hook = claudeHookStatus();
  inventory.push({ kind: 'client', key: 'client:claude-code-hook', name: 'Claude Code built-in tools', verdict: hook.installed ? 'protected' : 'unprotected' });
  const events = shareLevel === 'events'
    ? all<{ created_at: number; type: string; severity: string; title: string }>('SELECT created_at, type, severity, title FROM incidents WHERE lab = 0 AND created_at > ? ORDER BY created_at LIMIT 200', since).map((i) => ({ ts: i.created_at, type: i.type, severity: i.severity, summary: i.title }))
    : [];
  return { inventory, events };
}

let syncing = false;
export async function memberSync() {
  const m = getMembership();
  if (!m || syncing) return null;
  syncing = true;
  try {
    const { inventory, events } = buildInventory(m.shareLevel, m.lastSync ?? Date.now() - 86_400_000);
    const r = await hostCall<{ orgName: string; shareLevel: ShareLevel; lockdown: { by: string; at: number; reason: string | null } | null; auditor: string }>(m.server, '/sync', {
      device: { hostname: os.hostname(), os: `${os.platform()} ${os.release()}`, version: VERSION },
      inventory,
      events,
      lockdownLocal: Boolean(getLockdown()),
    }, m.token);
    // Organization lockdown: every member device freezes together, and only the organization can lift it.
    const local = getLockdown();
    if (r.lockdown && !local) activateLockdown(`${r.orgName} admin (${r.lockdown.by})`, r.lockdown.reason, 'org', r.orgName);
    if (!r.lockdown && local?.source === 'org') liftLockdown(`${r.orgName} admin`, null);
    saveMembership({ ...m, orgName: r.orgName, shareLevel: r.shareLevel, auditor: r.auditor, lastSync: Date.now(), lastError: null });
    bus.emitEvent('org', { synced: true });
    return r;
  } catch (e) {
    saveMembership({ ...m, lastError: (e as Error).message });
    return null;
  } finally {
    syncing = false;
  }
}

export const membershipPublic = () => {
  const m = getMembership();
  return m ? { ...m, token: undefined } : null;
};

export const newRequestId = () => randomUUID();
