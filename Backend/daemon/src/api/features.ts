import { Hono } from 'hono';
import { CAPABILITY_LABELS, type Capability } from '@zoro/core';
import { isWorldConfigured } from '../config';
import { all, get, getSetting, json, setSetting } from '../db';
import { gateway } from '../gateway/gateway';
import { activateLockdown, getLockdown, requestLift } from '../lockdown';
import { claudeHookStatus, installClaudeCodeHook, scanPermitted, uninstallClaudeCodeHook } from '../onboarding';
import {
  createInvite,
  createOrg,
  memberJoinComplete,
  memberJoinStart,
  memberLeave,
  memberSync,
  membershipPublic,
  orgOverview,
  revokeMember,
  setOrgLockdown,
  setShareLevel,
} from '../org';
import { checkPackage, remoteChecksEnabled, type PackageReport } from '../packages';
import { acceptUpdate, getPendingUpdate, getPin } from '../pins';
import { agentPowers } from '../powers';
import { checkServerVulns, vulnerabilitiesFor, vulnOverview } from '../recall';
import { listSkills } from '../skills';
import { restoreConfig, startWatchdog, watchdogStatus } from '../watchdog';

/** Console API for the newer protections. Mounted under /api/console, behind the console token. */
export const featuresApi = new Hono();

// --- Panic button ---
featuresApi.get('/lockdown', (c) => c.json({ lockdown: getLockdown(), liftNeedsHumanSeal: isWorldConfigured() }));
featuresApi.post('/lockdown', async (c) => {
  const b = await c.req.json<{ reason?: string }>().catch(() => ({} as { reason?: string }));
  return c.json({ lockdown: activateLockdown('console', b.reason?.slice(0, 200) || null) });
});
featuresApi.post('/lockdown/lift', async (c) => {
  const b = await c.req.json<{ phrase?: string }>().catch(() => ({} as { phrase?: string }));
  const r = requestLift('console', b.phrase ?? null);
  return c.json(r, r.status === 'forbidden' ? 403 : 200);
});

// --- Packages and skills ---
featuresApi.get('/packages', (c) => {
  const packages = all<{ ecosystem: string; name: string; version: string; verdict: string; report: string; checked_at: number; first_seen: number; last_seen: number }>('SELECT * FROM packages ORDER BY last_seen DESC LIMIT 500').map((p) => {
    const r = json<PackageReport | null>(p.report, null);
    const uses = all<{ source: string; n: number; last: number; agents: string | null; decisions: string | null }>("SELECT source, COUNT(*) AS n, MAX(ts) AS last, GROUP_CONCAT(DISTINCT agent) AS agents, GROUP_CONCAT(DISTINCT decision) AS decisions FROM package_uses WHERE ecosystem = ? AND name = ? AND (version = ? OR version IS NULL) GROUP BY source", p.ecosystem, p.name, p.version);
    return { ...p, report: undefined, findings: r?.findings ?? [], vulns: r?.vulns ?? [], publishedAt: r?.publishedAt ?? null, publisher: r?.publisher ?? null, provenance: r?.provenance ?? false, signature: r?.signature ?? 'unchecked', installScripts: r?.installScripts ?? [], weeklyDownloads: r?.weeklyDownloads ?? null, uses };
  });
  const recent = all('SELECT ts, ecosystem, name, version, requested, source, ref, agent FROM package_uses ORDER BY ts DESC LIMIT 100');
  return c.json({ packages, recent, remoteChecks: remoteChecksEnabled() });
});
featuresApi.post('/packages/check', async (c) => {
  const b = await c.req.json<{ spec: string; ecosystem?: 'npm' | 'pypi' }>();
  if (!b.spec?.trim()) return c.json({ error: 'Package spec required' }, 400);
  return c.json(await checkPackage(b.ecosystem === 'pypi' ? 'pypi' : 'npm', b.spec.trim().slice(0, 200), { source: 'manual' }));
});
featuresApi.get('/skills', (c) => c.json({ skills: listSkills().map((s) => ({ ...s, findings: json(s.findings, []) })) }));
featuresApi.get('/settings/package-checks', (c) => c.json({ enabled: remoteChecksEnabled() }));
featuresApi.put('/settings/package-checks', async (c) => {
  const b = await c.req.json<{ enabled: boolean }>();
  setSetting('remote_package_checks', b.enabled ? 'on' : 'off');
  return c.json({ enabled: remoteChecksEnabled() });
});

// --- Claude Code hook (built-in tools) and settings watchdog ---
featuresApi.get('/hooks/claude-code', (c) => c.json(claudeHookStatus()));
featuresApi.post('/hooks/claude-code/install', (c) => {
  if (!scanPermitted()) return c.json({ error: 'Grant permission to read client configurations in Onboarding first.' }, 400);
  const r = installClaudeCodeHook();
  startWatchdog();
  return c.json(r);
});
featuresApi.post('/hooks/claude-code/uninstall', (c) => c.json(uninstallClaudeCodeHook()));
featuresApi.get('/watchdog', (c) => c.json({ ...watchdogStatus(), permitted: scanPermitted() }));
featuresApi.post('/watchdog/restore', async (c) => {
  const b = await c.req.json<{ path: string; incidentId?: string }>();
  try {
    return c.json(restoreConfig(b.path, b.incidentId ?? null));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

// --- New-power alarm ---
featuresApi.get('/powers', (c) => {
  const agents = all<{ id: string; lab: number }>('SELECT id, lab FROM agents ORDER BY last_seen DESC LIMIT 200');
  return c.json({
    agents: agents.map((a) => {
      const rows = agentPowers(a.id);
      return {
        agent: a.id,
        lab: Boolean(a.lab),
        powers: rows.map((r) => ({ capability: r.capability, label: CAPABILITY_LABELS[r.capability as Capability] ?? r.capability, state: r.state, baseline: Boolean(r.baseline), firstSeen: r.first_seen, approvedAt: r.approved_at, approvalId: r.approval_id })),
        gainedSinceApproval: rows.filter((r) => !r.baseline).map((r) => ({ capability: r.capability, label: CAPABILITY_LABELS[r.capability as Capability] ?? r.capability, state: r.state, firstSeen: r.first_seen, approvedAt: r.approved_at })),
      };
    }),
  });
});

// --- Supply chain per server: pinned package, pending update, known vulnerabilities ---
featuresApi.get('/servers/:id/supply', (c) => {
  const id = c.req.param('id');
  return c.json({ pin: getPin(id), update: getPendingUpdate(id), vulns: vulnerabilitiesFor(id) });
});
featuresApi.post('/servers/:id/check-vulns', async (c) => c.json({ vulns: await checkServerVulns(c.req.param('id')) }));
featuresApi.post('/servers/:id/accept-update', async (c) => {
  const id = c.req.param('id');
  try {
    const pin = acceptUpdate(id);
    if (!pin) return c.json({ error: 'No pending update for this server' }, 400);
    const row = gateway.serverRow(id);
    if (row) {
      await gateway.upstreams.get(id)?.stop().catch(() => undefined);
      void gateway.startServer(row);
    }
    return c.json({ pin, restarted: Boolean(row) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
featuresApi.get('/vulns', (c) => c.json({ servers: vulnOverview().map((v) => ({ ...v, server: gateway.serverRow(v.serverId)?.name ?? v.serverId })) }));

// --- Organizations: host (manager) and member (employee) ---
featuresApi.get('/org', (c) => c.json({ host: orgOverview(), membership: membershipPublic(), worldConfigured: isWorldConfigured(), pendingJoin: Boolean(json(getSetting('org_join_pending'), null)) }));
featuresApi.post('/org/create', async (c) => {
  const b = await c.req.json<{ name: string }>();
  try {
    return c.json(createOrg(b.name ?? ''));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
featuresApi.post('/org/:id/invite', async (c) => {
  const b = await c.req.json<{ days?: number }>().catch(() => ({} as { days?: number }));
  try {
    return c.json(createInvite(c.req.param('id'), b.days ?? 14));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
featuresApi.post('/org/:id/lockdown', async (c) => {
  const b = await c.req.json<{ active: boolean; reason?: string }>();
  try {
    return c.json(setOrgLockdown(c.req.param('id'), Boolean(b.active), 'console', b.reason?.slice(0, 200) || null));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
featuresApi.post('/org/:id/share', async (c) => {
  const b = await c.req.json<{ level: 'inventory' | 'events' }>();
  setShareLevel(c.req.param('id'), b.level);
  return c.json({ ok: true });
});
featuresApi.post('/org/:id/members/:mid/revoke', (c) => {
  revokeMember(c.req.param('id'), c.req.param('mid'));
  return c.json({ ok: true });
});
featuresApi.post('/org/join/start', async (c) => {
  const b = await c.req.json<{ server: string; invite: string; name: string }>();
  if (!b.server || !b.invite) return c.json({ error: 'Organization server URL and invite code are required' }, 400);
  try {
    return c.json(await memberJoinStart(b.server, b.invite.trim(), (b.name ?? '').trim()));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
featuresApi.post('/org/join/complete', async (c) => {
  const b = await c.req.json<{ sealId: string; result: Record<string, unknown> }>();
  try {
    return c.json(await memberJoinComplete(b.sealId, b.result ?? {}));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
featuresApi.post('/org/leave', (c) => {
  memberLeave();
  return c.json({ ok: true });
});
featuresApi.post('/org/sync', async (c) => {
  const r = await memberSync();
  return c.json({ ok: Boolean(r), membership: membershipPublic() });
});

export const lockdownActive = () => Boolean(getLockdown());
export const hasServer = (id: string) => Boolean(get('SELECT 1 FROM servers WHERE id = ?', id));
