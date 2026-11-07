import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  PROFILE_DESCRIPTIONS,
  defaultPolicy,
  describeRule,
  diffDefinitions,
  findLoosening,
  simulatePolicy,
  type CallContext,
  type Decision,
  type DefinitionKind,
  type Policy,
  type ProfileId,
  type ServerMode,
  type SimulationRecord,
  type VerdictPackage,
} from '@zoro/core';
import { requestDanger, requestModeChange, requestOverride, requestPolicySave } from '../actions';
import { createAnchor, inclusionProof } from '../anchors';
import { askEnabled, askZoro } from '../ask';
import { verifyLogChain } from '../auditlog';
import { approvalRef, cancelApproval, decideApproval, getApproval, type ApprovalRow } from '../approvals';
import { bus, type BusEvent } from '../bus';
import { config, ensAppUrl, etherscanBase, hashscan, hcsMessageUrl, isEnsConfigured, isHederaConfigured, isWorldConfigured } from '../config';
import { providerName } from '../llm';
import { measureDeterministic, measureWithAi } from '../corpus';
import { all, get, getSetting, json, run, setSetting } from '../db';
import { listDisputes, openDispute } from '../disputes';
import { gateway } from '../gateway/gateway';
import { cancelHumanSeal, completeHumanSeal, getHumanSeal, startHumanSeal, usesTestIdentities } from '../humanseal';
import { incidentRef, listIncidentEvents, setIncidentStatus, type IncidentRow } from '../incidents';
import { publicMcpUrl, restoreClients, routeClient, scanClients, scanPermitted, settingsSnippet } from '../onboarding';
import { getPolicy, policyHistory, validatePolicy } from '../policy';
import { releaseHistory, startClaim, submitRelease, verifyClaim, instructionsFor, type ClaimMethod } from '../publisher';
import { retryFailed, outboxStats, publishVerdict } from '../registry/outbox';
import { evidencePack, exposureReport, incidentReport, postureReport, toMarkdown, toolDossier, type ReportEnvelope } from '../reports';
import { getAudit, latestPackage } from '../sentinel/runner';
import { performanceStats, protectionStatus } from '../status';

export const consoleApi = new Hono();

const err = (e: unknown) => ({ error: (e as Error).message ?? String(e) });
const q = (v: string | undefined, d: number) => (v === undefined || v === '' ? d : Number(v));

// ---------- status, notifications, search ----------

consoleApi.get('/status', (c) => c.json({ ...protectionStatus(), performance: performanceStats(24), outbox: outboxStats(), worldConfigured: isWorldConfigured(), testIdentities: usesTestIdentities(), askEnabled: askEnabled() }));

consoleApi.get('/notifications', (c) => c.json(all('SELECT * FROM notifications WHERE lab = 0 ORDER BY ts DESC LIMIT 50')));
consoleApi.post('/notifications/read', async (c) => {
  const { ids } = await c.req.json<{ ids?: string[] }>().catch(() => ({ ids: undefined }));
  if (ids?.length) for (const id of ids) run('UPDATE notifications SET read = 1 WHERE id = ?', id);
  else run('UPDATE notifications SET read = 1 WHERE lab = 0');
  return c.json({ ok: true });
});

consoleApi.get('/search', (c) => {
  const s = (c.req.query('q') ?? '').trim();
  if (s.length < 2) return c.json({ results: [] });
  const like = `%${s.toLowerCase()}%`;
  const results: { type: string; label: string; detail: string; href: string }[] = [];
  for (const r of all<{ id: string; name: string; label: string }>('SELECT id, name, label FROM servers WHERE lab = 0 AND (lower(name) LIKE ? OR label LIKE ?) LIMIT 10', like, like)) results.push({ type: 'server', label: r.name, detail: r.label, href: `/console/servers/${r.id}` });
  for (const r of all<{ server_id: string; kind: string; name: string; label: string }>("SELECT l.server_id, l.kind, l.name, s.label FROM live l JOIN servers s ON s.id = l.server_id WHERE s.lab = 0 AND lower(l.name) LIKE ? LIMIT 10", like)) results.push({ type: r.kind, label: r.name, detail: r.label, href: `/console/tools/${r.server_id}/${r.kind}/${encodeURIComponent(r.name)}` });
  for (const r of all<{ fingerprint: string; name: string; server_label: string; ens_name: string | null }>('SELECT fingerprint, name, server_label, ens_name FROM seals WHERE lab = 0 AND (fingerprint LIKE ? OR ens_name LIKE ?) LIMIT 10', like, like)) results.push({ type: 'fingerprint', label: r.ens_name ?? r.fingerprint, detail: `${r.server_label}/${r.name}`, href: `/verify?q=${r.fingerprint}` });
  const incSeq = s.match(/^inc-?(\d+)$/i);
  for (const r of all<{ id: string; seq: number; title: string }>('SELECT id, seq, title FROM incidents WHERE lab = 0 AND (lower(title) LIKE ? OR seq = ?) LIMIT 10', like, incSeq ? Number(incSeq[1]) : -1)) results.push({ type: 'incident', label: incidentRef(r.seq), detail: r.title, href: `/console/incidents/${r.id}` });
  for (const r of all<{ topic: string; seq: number; consensus_ts: string; type: string; fp: string | null }>("SELECT topic, seq, consensus_ts, type, fp FROM public_events WHERE (topic || '#' || seq) LIKE ? LIMIT 5", like)) results.push({ type: 'ledger', label: `${r.topic} #${r.seq}`, detail: r.type, href: hcsMessageUrl(r.topic, r.consensus_ts) });
  for (const r of all<{ id: string; tool: string; agent: string }>('SELECT id, tool, agent FROM calls WHERE lab = 0 AND id LIKE ? LIMIT 5', `${s}%`)) results.push({ type: 'call', label: r.id.slice(0, 8), detail: `${r.agent} → ${r.tool}`, href: `/console/traffic/${r.id}` });
  return c.json({ results });
});

// ---------- overview ----------

consoleApi.get('/overview', (c) => {
  const hours = q(c.req.query('hours'), 24);
  const since = Date.now() - hours * 3_600_000;
  const decisions = all<{ decision: string; n: number }>('SELECT decision, COUNT(*) AS n FROM calls WHERE lab = 0 AND ts >= ? GROUP BY decision', since);
  // node:sqlite binds JS numbers as REAL, so the bucket size is cast to make this an integer division.
  const bucketMs = hours <= 24 ? 3_600_000 : 86_400_000;
  const series = all<{ bucket: number; decision: string; n: number }>(`SELECT (ts / CAST(? AS INTEGER)) * CAST(? AS INTEGER) AS bucket, decision, COUNT(*) AS n FROM calls WHERE lab = 0 AND ts >= ? GROUP BY bucket, decision ORDER BY bucket`, bucketMs, bucketMs, since);
  const incidents = all<IncidentRow>("SELECT * FROM incidents WHERE lab = 0 AND status IN ('open','acknowledged') ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, updated_at DESC LIMIT 8");
  const bySeverity = all<{ severity: string; n: number }>("SELECT severity, COUNT(*) AS n FROM incidents WHERE lab = 0 AND status IN ('open','acknowledged') GROUP BY severity");
  const approvals = all<ApprovalRow>("SELECT * FROM approvals WHERE lab = 0 AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC LIMIT 6", Date.now());
  const quarantine = all<{ server_id: string; kind: string; name: string; state: string; reason: string | null; fingerprint: string; label: string }>("SELECT l.*, s.label FROM live l JOIN servers s ON s.id = l.server_id WHERE s.lab = 0 AND l.state IN ('quarantined','awaiting_release','blocked') ORDER BY l.updated_at DESC LIMIT 8");
  const posture = postureReport().body;
  const publicEvents = all<{ topic: string; seq: number; consensus_ts: string; type: string; payload: string }>(
    "SELECT topic, seq, consensus_ts, type, payload FROM public_events WHERE lab = 0 AND fp IN (SELECT fingerprint FROM live) ORDER BY consensus_ts DESC LIMIT 8",
  );
  return c.json({
    hours,
    decisions: Object.fromEntries(decisions.map((d) => [d.decision, d.n])),
    series,
    incidents: incidents.map((i) => ({ ...i, ref: incidentRef(i.seq) })),
    bySeverity: Object.fromEntries(bySeverity.map((s) => [s.severity, s.n])),
    approvals: approvals.map((a) => ({ ...a, ref: approvalRef(a.seq) })),
    quarantine: quarantine.map((x) => ({ ...x, audit: get<{ id: string; status: string; layers: string }>('SELECT id, status, layers FROM audits WHERE fingerprint = ? ORDER BY created_at DESC LIMIT 1', x.fingerprint) })),
    posture,
    publicEvents: publicEvents.map((e) => ({ ...e, payload: json(e.payload, {}), url: hcsMessageUrl(e.topic, e.consensus_ts) })),
    clients: all<{ client: string; path: string; routed: number }>('SELECT client, path, routed FROM client_configs'),
  });
});

// ---------- servers ----------

const serverSummary = (s: Record<string, unknown>) => {
  const id = String(s.id);
  const live = all<{ kind: string; state: string; fingerprint: string }>("SELECT kind, state, fingerprint FROM live WHERE server_id = ? AND state != 'removed'", id);
  const sealed = live.filter((l) => {
    const v = get<{ verdict: string; status: string }>('SELECT verdict, status FROM seals WHERE fingerprint = ?', l.fingerprint);
    return v && ['sealed', 'sealed_with_warnings'].includes(v.verdict) && v.status !== 'revoked';
  }).length;
  const sev = get<{ severity: string }>("SELECT severity FROM incidents WHERE server_id = ? AND status IN ('open','acknowledged') ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END LIMIT 1", id);
  const { env: _e, headers: _h, ...rest } = s;
  return {
    ...rest,
    args: json(s.args, []),
    envKeys: Object.keys(json<Record<string, string>>(s.env, {})),
    headerKeys: Object.keys(json<Record<string, string>>(s.headers, {})),
    tools: live.filter((l) => l.kind === 'tool').length,
    prompts: live.filter((l) => l.kind === 'prompt').length,
    templates: live.filter((l) => l.kind === 'resource_template').length,
    sealed,
    total: live.length,
    quarantined: live.filter((l) => l.state !== 'released').length,
    highestSeverity: sev?.severity ?? null,
    ensName: config.ens.root && !s.lab ? `${s.label}.${config.ens.root}` : null,
    online: gateway.upstreams.get(id)?.status ?? 'offline',
  };
};

consoleApi.get('/servers', (c) => c.json(all('SELECT * FROM servers WHERE lab = ? ORDER BY created_at', c.req.query('lab') === '1').map(serverSummary)));

consoleApi.post('/servers', async (c) => {
  const b = await c.req.json<{ name: string; transport: 'stdio' | 'http'; command?: string; args?: string[] | string; env?: Record<string, string>; url?: string; headers?: Record<string, string>; cwd?: string; mode?: ServerMode; private?: boolean }>();
  if (!b.name?.trim()) return c.json({ error: 'Name is required' }, 400);
  if (b.transport === 'stdio' && !b.command?.trim()) return c.json({ error: 'Command is required for a local server' }, 400);
  if (b.transport === 'http') {
    try {
      new URL(b.url ?? '');
    } catch {
      return c.json({ error: 'A valid URL is required for a remote server' }, 400);
    }
  }
  const args = Array.isArray(b.args) ? b.args : (b.args ?? '').match(/(?:[^\s"]+|"[^"]*")+/g)?.map((a) => a.replace(/^"|"$/g, '')) ?? [];
  const row = gateway.addServer({ name: b.name.trim(), transport: b.transport, command: b.command?.trim() ?? null, args, env: b.env ?? {}, cwd: b.cwd ?? null, url: b.url ?? null, headers: b.headers ?? {}, mode: b.mode === 'observe' ? 'observe' : 'enforce', source: 'manual', private: Boolean(b.private) });
  return c.json(serverSummary(row as unknown as Record<string, unknown>));
});

consoleApi.get('/servers/:id', (c) => {
  const row = gateway.serverRow(c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  const live = all<{ kind: DefinitionKind; name: string; fingerprint: string; exposed_fingerprint: string | null; state: string; reason: string | null; updated_at: number }>("SELECT * FROM live WHERE server_id = ? AND state != 'removed' ORDER BY kind, name", row.id);
  const entries = live.map((l) => {
    const seal = get<{ verdict: string; status: string; risk: number; ens_name: string | null }>('SELECT verdict, status, risk, ens_name FROM seals WHERE fingerprint = ?', l.fingerprint);
    const pkg = latestPackage(l.fingerprint);
    const calls = get<{ n: number; last: number | null }>('SELECT COUNT(*) AS n, MAX(ts) AS last FROM calls WHERE server_id = ? AND tool = ?', row.id, l.name);
    return { ...l, seal, capabilities: pkg?.capabilityProfile.map((x) => x.capability) ?? [], calls: calls?.n ?? 0, lastUsed: calls?.last ?? null };
  });
  const history = all<{ kind: string; name: string; fingerprint: string; first_seen: number; previous_fingerprint: string | null }>('SELECT kind, name, fingerprint, first_seen, previous_fingerprint FROM versions WHERE server_id = ? ORDER BY first_seen DESC LIMIT 200', row.id).map((v) => ({ ...v, verdict: get<{ verdict: string; status: string }>('SELECT verdict, status FROM seals WHERE fingerprint = ?', v.fingerprint) ?? null, changeClass: latestPackage(v.fingerprint)?.changeClass ?? null }));
  const policy = getPolicy().rules.filter((r) => 'server' in r && (r.server === row.label || r.server === '*')).map((r) => ({ id: r.id, type: r.type, enabled: r.enabled, reading: describeRule(r) }));
  const log = all<{ seq: number; ts: number; kind: string; summary: string }>("SELECT seq, ts, kind, summary FROM audit_log WHERE ref = ? AND kind IN ('server_change','config_change','tool_change') ORDER BY seq DESC LIMIT 50", row.id);
  const up = gateway.upstreams.get(row.id);
  return c.json({ server: serverSummary(row as unknown as Record<string, unknown>), artifact: json(row.artifact_detail, null), entries, history, policy, log, stderr: up?.stderrTail.slice(-15) ?? [], namespace: get('SELECT * FROM namespaces WHERE label = ?', row.label) ?? null, remoteNotice: row.transport === 'http' });
});

consoleApi.patch('/servers/:id/mode', async (c) => {
  const { mode, confirm } = await c.req.json<{ mode: ServerMode; confirm?: boolean }>();
  if (!['enforce', 'observe', 'disabled'].includes(mode)) return c.json({ error: 'invalid mode' }, 400);
  try {
    return c.json(await requestModeChange(c.req.param('id'), mode, Boolean(confirm)));
  } catch (e) {
    return c.json(err(e), 400);
  }
});

consoleApi.post('/servers/:id/restart', async (c) => {
  const row = gateway.serverRow(c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  await gateway.startServer(row);
  return c.json({ ok: true });
});

consoleApi.post('/servers/:id/refresh', async (c) => {
  await gateway.upstreams.get(c.req.param('id'))?.refresh('manual');
  return c.json({ ok: true });
});

consoleApi.delete('/servers/:id', async (c) => {
  await gateway.removeServer(c.req.param('id'));
  return c.json({ ok: true });
});

// ---------- tools ----------

consoleApi.get('/tools/:serverId/:kind/:name', (c) => {
  const { serverId, kind, name } = c.req.param();
  const row = gateway.serverRow(serverId);
  const live = get<{ fingerprint: string; exposed_fingerprint: string | null; state: string; reason: string | null }>('SELECT * FROM live WHERE server_id = ? AND kind = ? AND name = ?', serverId, kind, name);
  if (!row || !live) return c.json({ error: 'not found' }, 404);
  const def = gateway.definitionOf(serverId, kind as DefinitionKind, live.fingerprint);
  const sealedDef = live.exposed_fingerprint ? gateway.definitionOf(serverId, kind as DefinitionKind, live.exposed_fingerprint) : null;
  const seal = get('SELECT * FROM seals WHERE fingerprint = ?', live.fingerprint) as Record<string, unknown> | undefined;
  const pkg = latestPackage(live.fingerprint);
  const audit = get<{ id: string }>('SELECT id FROM audits WHERE fingerprint = ? ORDER BY created_at DESC LIMIT 1', live.fingerprint);
  const versions = all<{ fingerprint: string; first_seen: number; last_seen: number; previous_fingerprint: string | null }>('SELECT fingerprint, first_seen, last_seen, previous_fingerprint FROM versions WHERE server_id = ? AND kind = ? AND name = ? ORDER BY first_seen DESC', serverId, kind, name).map((v) => {
    const p = latestPackage(v.fingerprint);
    return { ...v, verdict: p?.verdict ?? null, changeClass: p?.changeClass ?? null, risk: p?.riskScore ?? null, status: get<{ status: string }>('SELECT status FROM seals WHERE fingerprint = ?', v.fingerprint)?.status ?? null, summary: p?.aiSummary ?? null };
  });
  const calls = all('SELECT id, ts, agent, decision, outcome, rule, reason, latency_ms, overhead_ms, shield_action FROM calls WHERE server_id = ? AND tool = ? ORDER BY ts DESC LIMIT 50', serverId, name);
  const policy = getPolicy().rules.filter((r) => ('tool' in r && (r.tool === name || r.tool === '*') && ('server' in r ? r.server === row.label || r.server === '*' : true)) || ['verdict_handling', 'auto_release', 'network_grace', 'human_seal', 'data_flow', 'high_impact_ask'].includes(r.type)).map((r) => ({ id: r.id, type: r.type, enabled: r.enabled, reading: describeRule(r) }));
  const baseline = get('SELECT * FROM baselines WHERE server_id = ? AND tool = ?', serverId, name);
  const st = gateway.sealStateFor(serverId, kind as DefinitionKind, name);
  return c.json({
    server: { id: row.id, name: row.name, label: row.label, transport: row.transport, lab: row.lab },
    live,
    state: st.state,
    registry: st.registry,
    definition: def,
    sealedDefinition: sealedDef,
    seal: seal ? { ...seal, ens_check: json(seal.ens_check, null), links: { ens: seal.ens_name && seal.ens_status === 'written' ? ensAppUrl(String(seal.ens_name)) : null, ensTx: seal.ens_tx ? `${etherscanBase()}/tx/${seal.ens_tx}` : null, ledger: seal.ledger_topic ? hcsMessageUrl(String(seal.ledger_topic), seal.ledger_ts as string | null) : null, badge: seal.badge_token ? `${hashscan('token', String(seal.badge_token))}/${seal.badge_serial}` : null } } : null,
    package: pkg,
    auditId: audit?.id ?? null,
    versions,
    calls,
    policy,
    baseline,
    remoteNotice: row.transport === 'http',
  });
});

consoleApi.post('/tools/:serverId/:kind/:name/:action', async (c) => {
  const { serverId, kind, name, action } = c.req.param();
  try {
    if (action === 'reaudit') return c.json({ auditId: gateway.reaudit(serverId, kind as DefinitionKind, name) });
    if (action === 'human-release') return c.json({ approval: gateway.requestHumanRelease(serverId, kind as DefinitionKind, name) });
    if (action === 'keep-blocked') {
      gateway.keepBlocked(serverId, kind as DefinitionKind, name);
      return c.json({ ok: true });
    }
    if (action === 'revoke') {
      const { reason } = await c.req.json<{ reason: string }>();
      const live = get<{ fingerprint: string }>('SELECT fingerprint FROM live WHERE server_id = ? AND kind = ? AND name = ?', serverId, kind, name);
      if (!live || !reason?.trim()) return c.json({ error: 'A reason is required' }, 400);
      gateway.revoke(live.fingerprint, reason.trim(), 'local');
      return c.json({ ok: true });
    }
    return c.json({ error: 'unknown action' }, 400);
  } catch (e) {
    return c.json(err(e), 400);
  }
});

consoleApi.get('/audits/:id', (c) => {
  const a = getAudit(c.req.param('id'));
  return a ? c.json(a) : c.json({ error: 'not found' }, 404);
});

consoleApi.get('/diff', (c) => {
  const { serverId, kind, a, b } = c.req.query();
  const da = a ? (serverId ? gateway.definitionOf(serverId, kind as DefinitionKind, a) : null) ?? json(get<{ definition: string }>('SELECT definition FROM audits WHERE fingerprint = ? LIMIT 1', a)?.definition, null) : null;
  const db = b ? (serverId ? gateway.definitionOf(serverId, kind as DefinitionKind, b) : null) ?? json(get<{ definition: string }>('SELECT definition FROM audits WHERE fingerprint = ? LIMIT 1', b)?.definition, null) : null;
  if (!db) return c.json({ error: 'version not found' }, 404);
  const pkg = b ? latestPackage(b) : null;
  return c.json({ a: da, b: db, fields: diffDefinitions(da as never, db as never), findings: pkg?.findings ?? [], summary: pkg?.aiSummary ?? null, verdict: pkg?.verdict ?? null, changeClass: pkg?.changeClass ?? null });
});

// ---------- traffic ----------

/** A call answered with "awaiting approval" keeps that outcome; lists also carry what later happened to the approval. */
const withApproval = <T extends { approval_id: string | null }>(r: T) => ({ ...r, approval: r.approval_id ? (get<{ seq: number; status: string }>('SELECT seq, status FROM approvals WHERE id = ?', r.approval_id) ?? null) : null });

consoleApi.get('/calls', (c) => {
  const where = ['lab = ?'];
  const params: (string | number)[] = [c.req.query('lab') === '1' ? 1 : 0];
  for (const [k, col] of [['agent', 'agent'], ['server', 'server_label'], ['tool', 'tool'], ['decision', 'decision']] as const) {
    const v = c.req.query(k);
    if (v) (where.push(`${col} = ?`), params.push(v));
  }
  const before = c.req.query('before');
  if (before) (where.push('ts < ?'), params.push(Number(before)));
  const since = c.req.query('since');
  if (since) (where.push('ts >= ?'), params.push(Number(since)));
  const limit = Math.min(200, q(c.req.query('limit'), 50));
  const rows = all(`SELECT id, ts, agent, client, server_id, server_label, tool, fingerprint, decision, enforced_decision, outcome, rule, reason, reason_category, observe, latency_ms, overhead_ms, shield_action, incident_id, approval_id, flows FROM calls WHERE ${where.join(' AND ')} ORDER BY ts DESC LIMIT ?`, ...params, limit);
  const facets = { agents: all<{ agent: string }>('SELECT DISTINCT agent FROM calls WHERE lab = 0').map((r) => r.agent), servers: all<{ server_label: string }>('SELECT DISTINCT server_label FROM calls WHERE lab = 0').map((r) => r.server_label) };
  return c.json({ items: rows.map((r) => withApproval({ ...(r as { approval_id: string | null; flows: string }), flows: json((r as { flows: string }).flows, []) })), facets });
});

consoleApi.get('/calls/:id', (c) => {
  const r = get<Record<string, string>>('SELECT * FROM calls WHERE id = ?', c.req.param('id'));
  if (!r) return c.json({ error: 'not found' }, 404);
  const { args: _raw, context: _ctx, ...rest } = r;
  return c.json({ ...rest, args_masked: json(r.args_masked, {}), trace: json(r.trace, []), flows: json(r.flows, []), shield_findings: json(r.shield_findings, []), incident: r.incident_id ? get('SELECT id, seq, title, severity FROM incidents WHERE id = ?', r.incident_id) : null, approval: r.approval_id ? get('SELECT id, seq, status, outcome FROM approvals WHERE id = ?', r.approval_id) : null });
});

/** Reveal recorded arguments (secret-keyed values are never stored, so they stay redacted). */
consoleApi.post('/calls/:id/reveal', (c) => {
  const r = get<{ args: string }>('SELECT args FROM calls WHERE id = ?', c.req.param('id'));
  return r ? c.json({ args: json(r.args, {}) }) : c.json({ error: 'not found' }, 404);
});

// ---------- incidents ----------

consoleApi.get('/incidents', (c) => {
  const where = ['lab = 0'];
  const params: string[] = [];
  for (const k of ['status', 'severity', 'type'] as const) {
    const v = c.req.query(k);
    if (v) (where.push(`${k} = ?`), params.push(v));
  }
  const server = c.req.query('server');
  if (server) (where.push('server_id = ?'), params.push(server));
  const rows = all<IncidentRow>(`SELECT * FROM incidents WHERE ${where.join(' AND ')} ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END, updated_at DESC LIMIT 300`, ...params);
  return c.json(rows.map((r) => ({ ...r, ref: incidentRef(r.seq), evidence: undefined })));
});

consoleApi.get('/incidents/:id', (c) => {
  const inc = get<IncidentRow>('SELECT * FROM incidents WHERE id = ?', c.req.param('id'));
  if (!inc) return c.json({ error: 'not found' }, 404);
  const evidence = json<Record<string, unknown>>(inc.evidence, {});
  const pkg = inc.fingerprint ? latestPackage(inc.fingerprint) : null;
  const prevFp = (evidence.previousFingerprint as string | undefined) ?? pkg?.previousFingerprint ?? null;
  const calls = all('SELECT id, ts, agent, decision, outcome, reason FROM calls WHERE incident_id = ? ORDER BY ts DESC LIMIT 50', inc.id);
  const approvals = all<ApprovalRow>('SELECT * FROM approvals WHERE incident_id = ? ORDER BY created_at DESC', inc.id).map((a) => ({ ...a, ref: approvalRef(a.seq) }));
  const seal = inc.fingerprint ? get<Record<string, unknown>>('SELECT * FROM seals WHERE fingerprint = ?', inc.fingerprint) : null;
  return c.json({
    incident: { ...inc, ref: incidentRef(inc.seq), evidence },
    events: listIncidentEvents(inc.id),
    verdict: pkg,
    diff: inc.fingerprint ? { serverId: inc.server_id, kind: pkg?.kind ?? 'tool', a: prevFp, b: inc.fingerprint } : null,
    seal: seal ? { ...seal, links: { ens: seal.ens_name && seal.ens_status === 'written' ? ensAppUrl(String(seal.ens_name)) : null, ledger: seal.ledger_topic ? hcsMessageUrl(String(seal.ledger_topic), seal.ledger_ts as string | null) : null } } : null,
    calls,
    approvals,
    server: inc.server_id ? get('SELECT id, name, label, mode FROM servers WHERE id = ?', inc.server_id) : null,
    exposure: inc.type === 'revocation' && inc.fingerprint ? exposureReport(inc.fingerprint).body : null,
  });
});

consoleApi.post('/incidents/:id/status', async (c) => {
  const { status, note } = await c.req.json<{ status: IncidentRow['status']; note?: string }>();
  try {
    setIncidentStatus(c.req.param('id'), status, note ?? null);
    return c.json({ ok: true });
  } catch (e) {
    return c.json(err(e), 400);
  }
});

consoleApi.post('/incidents/bulk-ack', async (c) => {
  const { ids } = await c.req.json<{ ids: string[] }>();
  let n = 0;
  for (const id of ids) {
    const inc = get<IncidentRow>('SELECT * FROM incidents WHERE id = ?', id);
    if (inc && inc.status === 'open') {
      setIncidentStatus(id, 'acknowledged', null);
      n++;
    }
  }
  return c.json({ acknowledged: n });
});

consoleApi.post('/incidents/:id/override', (c) => {
  const inc = get<IncidentRow>('SELECT * FROM incidents WHERE id = ?', c.req.param('id'));
  if (!inc) return c.json({ error: 'not found' }, 404);
  const ev = json<{ digest?: string; action?: unknown; overridable?: boolean }>(inc.evidence, {});
  if (!ev.digest || !ev.overridable) return c.json({ error: 'This incident has no single blocked action that can be overridden.' }, 400);
  return c.json(requestOverride({ incidentId: inc.id, digest: ev.digest, action: ev.action, summary: inc.title, serverId: inc.server_id, tool: inc.tool, fingerprint: inc.fingerprint, lab: Boolean(inc.lab) }));
});

consoleApi.post('/incidents/:id/disable-server', async (c) => {
  const inc = get<IncidentRow>('SELECT * FROM incidents WHERE id = ?', c.req.param('id'));
  if (!inc?.server_id) return c.json({ error: 'no server on this incident' }, 400);
  await gateway.setMode(inc.server_id, 'disabled');
  return c.json({ ok: true });
});

// ---------- approvals & Human Seal ----------

consoleApi.get('/approvals', (c) => {
  const pending = all<ApprovalRow>("SELECT * FROM approvals WHERE lab = 0 AND status IN ('pending','approved') AND expires_at > ? ORDER BY created_at DESC", Date.now());
  const history = all<ApprovalRow>("SELECT * FROM approvals WHERE lab = 0 AND (status NOT IN ('pending','approved') OR expires_at <= ?) ORDER BY created_at DESC LIMIT 100", Date.now());
  const map = (a: ApprovalRow) => ({ ...a, ref: approvalRef(a.seq), action: json(a.action, null), evidence: json(a.evidence, null) });
  return c.json({ pending: pending.map(map), history: history.map(map), worldConfigured: isWorldConfigured(), testIdentities: usesTestIdentities() });
});

consoleApi.get('/approvals/:id', (c) => {
  const a = getApproval(c.req.param('id'));
  if (!a) return c.json({ error: 'not found' }, 404);
  const seals = all('SELECT id, status, created_at, expires_at, verified_at, error, environment FROM human_seals WHERE approval_id = ? ORDER BY created_at DESC', a.id);
  return c.json({ ...a, ref: approvalRef(a.seq), action: json(a.action, null), evidence: json(a.evidence, null), humanSeals: seals });
});

consoleApi.post('/approvals/:id/decide', async (c) => {
  const { decision, humanSealId } = await c.req.json<{ decision: 'approve' | 'deny'; humanSealId?: string }>();
  try {
    const a = await decideApproval(c.req.param('id'), decision, 'console', humanSealId ?? null);
    return c.json({ ...a, ref: approvalRef(a.seq) });
  } catch (e) {
    return c.json(err(e), 400);
  }
});

consoleApi.post('/approvals/:id/cancel', (c) => {
  cancelApproval(c.req.param('id'), 'console');
  return c.json({ ok: true });
});

consoleApi.post('/human-seal/start', async (c) => {
  const { approvalId } = await c.req.json<{ approvalId: string }>();
  const a = getApproval(approvalId);
  if (!a || a.status !== 'pending') return c.json({ error: 'approval is not pending' }, 400);
  return c.json(startHumanSeal(a.digest, a.id, a.expires_at));
});

consoleApi.post('/human-seal/:id/complete', async (c) => {
  const { result } = await c.req.json<{ result: Record<string, unknown> }>();
  const r = await completeHumanSeal(c.req.param('id'), result);
  const seal = getHumanSeal(c.req.param('id'));
  if (r.status !== 'verified' || !seal?.approval_id) return c.json(r, r.status === 'verified' ? 200 : 400);
  try {
    const a = await decideApproval(seal.approval_id, 'approve', 'console (verified human)', seal.id);
    return c.json({ ...r, approval: { ...a, ref: approvalRef(a.seq) } });
  } catch (e) {
    return c.json({ ...r, ...err(e) }, 400);
  }
});

consoleApi.post('/human-seal/:id/cancel', (c) => {
  cancelHumanSeal(c.req.param('id'));
  return c.json({ ok: true });
});

consoleApi.get('/human-seal/:id', (c) => {
  const s = getHumanSeal(c.req.param('id'));
  if (!s) return c.json({ error: 'not found' }, 404);
  const { response: _r, ...rest } = s;
  return c.json(rest);
});

// ---------- quarantine ----------

consoleApi.get('/quarantine', (c) => {
  const lab = c.req.query('lab') === '1';
  const rows = all<{ server_id: string; kind: DefinitionKind; name: string; fingerprint: string; state: string; reason: string | null; updated_at: number; label: string; sname: string }>(
    "SELECT l.*, s.label AS label, s.name AS sname FROM live l JOIN servers s ON s.id = l.server_id WHERE s.lab = ? AND l.state IN ('quarantined','awaiting_release','blocked') ORDER BY l.updated_at DESC",
    lab,
  );
  return c.json(rows.map((r) => {
    const audit = get<{ id: string; status: string; layers: string; verdict: string | null }>('SELECT id, status, layers, verdict FROM audits WHERE fingerprint = ? ORDER BY created_at DESC LIMIT 1', r.fingerprint);
    const pkg = latestPackage(r.fingerprint);
    const approval = get<ApprovalRow>("SELECT * FROM approvals WHERE fingerprint = ? AND kind = 'release' AND status = 'pending' ORDER BY created_at DESC LIMIT 1", r.fingerprint);
    return { ...r, audit: audit ? { ...audit, layers: json(audit.layers, []) } : null, verdict: pkg?.verdict ?? null, changeClass: pkg?.changeClass ?? null, previousFingerprint: pkg?.previousFingerprint ?? null, pendingReason: pkg?.pendingReason ?? null, approval: approval ? { ...approval, ref: approvalRef(approval.seq) } : null };
  }));
});

// ---------- policies ----------

consoleApi.get('/policy', (c) => {
  const p = getPolicy();
  return c.json({ policy: p, readings: p.rules.map((r) => ({ id: r.id, reading: describeRule(r) })), profiles: (['standard', 'strict', 'lab'] as ProfileId[]).map((id) => ({ id, description: PROFILE_DESCRIPTIONS[id], policy: defaultPolicy(id) })), history: policyHistory(30) });
});

consoleApi.post('/policy/describe', async (c) => {
  const { rule } = await c.req.json<{ rule: Policy['rules'][number] }>();
  try {
    return c.json({ reading: describeRule(rule) });
  } catch (e) {
    return c.json(err(e), 400);
  }
});

const simulationRecords = (hours: number): SimulationRecord[] =>
  all<{ id: string; ts: number; agent: string; server_label: string; tool: string; decision: Decision; context: string }>('SELECT id, ts, agent, server_label, tool, decision, context FROM calls WHERE lab = 0 AND ts >= ? AND context IS NOT NULL ORDER BY ts DESC LIMIT 5000', Date.now() - hours * 3_600_000)
    .map((r) => ({ callId: r.id, ts: r.ts, agent: r.agent, serverName: r.server_label, tool: r.tool, originalDecision: r.decision, context: json<CallContext | null>(r.context, null)! }))
    .filter((r) => r.context);

consoleApi.post('/policy/preview', async (c) => {
  const { policy, hours } = await c.req.json<{ policy: Policy; hours?: number }>();
  try {
    const p = validatePolicy(policy);
    return c.json({ loosening: findLoosening(getPolicy(), p), simulation: simulatePolicy(simulationRecords(hours ?? 168), getPolicy(), p), readings: p.rules.map((r) => ({ id: r.id, reading: describeRule(r) })) });
  } catch (e) {
    return c.json(err(e), 400);
  }
});

consoleApi.post('/policy/save', async (c) => {
  const { policy, note, confirm } = await c.req.json<{ policy: Policy; note?: string; confirm?: boolean }>();
  try {
    return c.json(requestPolicySave(policy, note ?? null, Boolean(confirm)));
  } catch (e) {
    return c.json(err(e), 400);
  }
});

consoleApi.get('/policy/export', (c) => c.body(JSON.stringify(getPolicy(), null, 2), 200, { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="zoro-policy.json"' }));

// ---------- agents & flows ----------

consoleApi.get('/agents', (c) => {
  const agents = all<{ id: string; name: string; client: string | null; first_seen: number; last_seen: number; ens_name: string | null; declaration: string | null }>('SELECT * FROM agents WHERE lab = 0 ORDER BY last_seen DESC');
  return c.json(agents.map((a) => ({
    ...a,
    declaration: json(a.declaration, null),
    tools: all<{ server_label: string; tool: string; n: number; last: number }>('SELECT server_label, tool, COUNT(*) AS n, MAX(ts) AS last FROM calls WHERE agent = ? AND lab = 0 GROUP BY server_label, tool ORDER BY n DESC', a.id),
    decisions: Object.fromEntries(all<{ decision: string; n: number }>('SELECT decision, COUNT(*) AS n FROM calls WHERE agent = ? AND lab = 0 GROUP BY decision', a.id).map((d) => [d.decision, d.n])),
    incidents: get<{ n: number }>("SELECT COUNT(DISTINCT incident_id) AS n FROM calls WHERE agent = ? AND incident_id IS NOT NULL", a.id)?.n ?? 0,
  })));
});

consoleApi.put('/agents/:id/declaration', async (c) => {
  const { allowedTools } = await c.req.json<{ allowedTools: string[] | null }>();
  run('UPDATE agents SET declaration = ? WHERE id = ?', allowedTools ? JSON.stringify({ allowedTools }) : null, c.req.param('id'));
  return c.json({ ok: true });
});

consoleApi.get('/flows', (c) => {
  const rows = all<{ id: string; ts: number; agent: string; server_label: string; tool: string; decision: string; outcome: string; flows: string; approval_id: string | null; incident_id: string | null }>("SELECT id, ts, agent, server_label, tool, decision, outcome, flows, approval_id, incident_id FROM calls WHERE lab = 0 AND flows != '[]' ORDER BY ts DESC LIMIT 200");
  const items = rows.map((r) => {
    const flows = json<{ sourceCallId: string; sourceTool: string; sourceServer: string; sourceLabel: string; sinkTypes: string[]; matched: string; matchKind: string; argument: string }[]>(r.flows, []);
    return { ...withApproval(r), flows, sources: flows.map((f) => get('SELECT id, ts, server_label, tool, result_summary FROM calls WHERE id = ?', f.sourceCallId) ?? null) };
  });
  const summary = new Map<string, { source: string; sink: string; count: number; asked: number; blocked: number }>();
  for (const it of items)
    for (const f of it.flows) {
      const key = `${f.sourceServer}/${f.sourceTool} → ${it.server_label}/${it.tool}`;
      const s = summary.get(key) ?? { source: `${f.sourceServer}/${f.sourceTool}`, sink: `${it.server_label}/${it.tool}`, count: 0, asked: 0, blocked: 0 };
      s.count++;
      if (it.decision === 'ask') s.asked++;
      if (it.decision === 'block') s.blocked++;
      summary.set(key, s);
    }
  return c.json({ items, summary: [...summary.values()].sort((a, b) => b.count - a.count) });
});

// ---------- publisher ----------

consoleApi.get('/publisher', (c) => {
  const ns = all<{ label: string; method: ClaimMethod; target: string; challenge: string; status: string; proof: string | null; verified_at: number | null; publisher: string | null; ledger_ref: string | null; error: string | null }>('SELECT * FROM namespaces ORDER BY created_at DESC');
  const releases = all<{ id: string; created_at: number; namespace: string; version: string | null; audit_ids: string }>('SELECT id, created_at, namespace, version, audit_ids FROM releases ORDER BY created_at DESC LIMIT 50').map((r) => ({
    ...r,
    audits: json<string[]>(r.audit_ids, []).map((id) => {
      const a = getAudit(id);
      return a ? { id, name: a.name, kind: a.kind, status: a.status, verdict: a.verdict, fingerprint: a.fingerprint, layers: a.layers, findings: (a.package as VerdictPackage | null)?.findings ?? [], ens: get<{ ens_name: string | null; ledger_seq: number | null; badge_serial: number | null }>('SELECT ens_name, ledger_seq, badge_serial FROM seals WHERE fingerprint = ?', a.fingerprint) ?? null } : null;
    }),
  }));
  return c.json({ namespaces: ns.map((n) => ({ ...n, instructions: instructionsFor(n.method, n.target, n.challenge), history: releaseHistory(n.label), badge: `${config.publicUrl}/api/public/badge/${n.label}/<tool>.svg` })), releases, ensConfigured: isEnsConfigured(), ledgerConfigured: isHederaConfigured() });
});

consoleApi.post('/publisher/claims', async (c) => {
  try {
    const b = await c.req.json<{ label: string; method: ClaimMethod; target: string; publisher?: string }>();
    return c.json(startClaim({ label: b.label, method: b.method, target: b.target, publisher: b.publisher?.trim() || null }));
  } catch (e) {
    return c.json(err(e), 400);
  }
});

consoleApi.post('/publisher/claims/:label/verify', async (c) => {
  try {
    return c.json(await verifyClaim(c.req.param('label')));
  } catch (e) {
    return c.json(err(e), 400);
  }
});

consoleApi.post('/publisher/releases', async (c) => {
  try {
    const b = await c.req.json<{ namespace: string; version?: string; manifest: string }>();
    return c.json(submitRelease({ namespace: b.namespace, version: b.version ?? null, manifest: b.manifest }));
  } catch (e) {
    return c.json(err(e), 400);
  }
});

// ---------- disputes ----------

/** A stored ledger submission result. Rows written before the HashScan fix carry a broken link, so it is rebuilt from the timestamp. */
const ledgerResult = (raw: string | null) => {
  const r = json<({ topic: string; consensusTimestamp?: string } & Record<string, unknown>) | null>(raw, null);
  return r?.topic ? { ...r, url: hcsMessageUrl(r.topic, r.consensusTimestamp) } : r;
};

consoleApi.get('/disputes', (c) => c.json(listDisputes().map((d) => ({ ...d, ref: `DSP-${d.seq}`, ledger_open: ledgerResult(d.ledger_open), ledger_resolve: ledgerResult(d.ledger_resolve) }))));
consoleApi.post('/disputes', async (c) => {
  try {
    const b = await c.req.json<{ kind: 'challenge' | 'appeal'; fingerprint: string; evidence: string; submitter?: string }>();
    return c.json(openDispute({ kind: b.kind, fingerprint: b.fingerprint, evidence: b.evidence, submitter: b.submitter ?? null }));
  } catch (e) {
    return c.json(err(e), 400);
  }
});

// ---------- audit log, anchors, reports ----------

consoleApi.get('/log', (c) => {
  const where = ['1 = 1'];
  const params: (string | number)[] = [];
  const kind = c.req.query('kind');
  if (kind) (where.push('kind = ?'), params.push(kind));
  const s = c.req.query('q');
  if (s) (where.push('lower(summary) LIKE ?'), params.push(`%${s.toLowerCase()}%`));
  const before = c.req.query('before');
  if (before) (where.push('seq < ?'), params.push(Number(before)));
  if (c.req.query('lab') !== '1') where.push('lab = 0');
  const rows = all(`SELECT seq, ts, kind, ref, summary, hash, prev_hash, anchor_id FROM audit_log WHERE ${where.join(' AND ')} ORDER BY seq DESC LIMIT ?`, ...params, Math.min(500, q(c.req.query('limit'), 100)));
  const anchors = all('SELECT * FROM anchors ORDER BY ts DESC LIMIT 50');
  return c.json({ items: rows, anchors: anchors.map((a) => ({ ...(a as object), url: (a as { topic: string | null }).topic ? hcsMessageUrl(String((a as { topic: string }).topic), (a as { consensus_ts: string | null }).consensus_ts) : null })), orgTopic: config.hedera.orgTopic || null });
});
consoleApi.get('/log/verify', (c) => c.json(verifyLogChain()));
consoleApi.get('/log/:seq/proof', (c) => {
  const p = inclusionProof(Number(c.req.param('seq')));
  return p ? c.json(p) : c.json({ error: 'entry not anchored yet' }, 404);
});
consoleApi.post('/anchors', (c) => c.json(createAnchor() ?? { message: 'Nothing new to anchor' }));

consoleApi.get('/reports/:kind', (c) => {
  const kind = c.req.param('kind');
  let r: ReportEnvelope<unknown> | null = null;
  if (kind === 'posture') r = postureReport();
  else if (kind === 'incident') r = incidentReport(c.req.query('id') ?? '');
  else if (kind === 'exposure') r = exposureReport(c.req.query('fingerprint') ?? '');
  else if (kind === 'evidence') r = evidencePack(q(c.req.query('from'), Date.now() - 30 * 86_400_000), q(c.req.query('to'), Date.now()));
  else if (kind === 'dossier') r = toolDossier(c.req.query('label') ?? '', c.req.query('name') ?? '');
  if (!r) return c.json({ error: 'not found' }, 404);
  if (c.req.query('format') === 'md') return c.body(toMarkdown(r), 200, { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="zoro-${kind}-report.md"` });
  if (c.req.query('download') === '1') return c.body(JSON.stringify(r, null, 2), 200, { 'content-type': 'application/json', 'content-disposition': `attachment; filename="zoro-${kind}-report.json"` });
  return c.json(r);
});

// ---------- settings ----------

consoleApi.get('/settings', (c) =>
  c.json({
    notifications: json(getSetting('notifications'), { webhookUrl: '', webhookMinSeverity: 'high', quietHours: null, desktop: true }),
    gateway: { mcpUrl: publicMcpUrl(), refreshIntervalSec: config.refreshIntervalSec, approvalWaitSec: config.approvalWaitSec, approvalWindowSec: config.approvalWindowSec, snippet: settingsSnippet('your-client') },
    auditor: { model: config.sentinel.model, requireAi: config.sentinel.requireAi, aiConfigured: config.sentinel.apiKeyPresent, sealLifetimeDays: config.sentinel.sealLifetimeDays, publicSubmission: getSetting('public_submission') !== 'off' },
    networks: {
      ens: { configured: isEnsConfigured(), network: config.ens.network, root: config.ens.root || null, resolver: config.ens.resolver || null, registry: config.ens.registry || null, rpcUrl: config.ens.rpcUrl, operatorConfigured: Boolean(config.ens.operatorKey), cacheTtlSec: config.ens.cacheTtlSec },
      hedera: { configured: isHederaConfigured(), network: config.hedera.network, operatorId: config.hedera.operatorId || null, registryTopic: config.hedera.registryTopic || null, labTopic: config.hedera.labTopic || null, orgTopic: config.hedera.orgTopic || null, badgeToken: config.hedera.badgeToken || null },
      world: { configured: isWorldConfigured(), appId: config.world.appId || null, environment: config.world.environment, approvalTtlSec: config.world.approvalTtlSec },
      privateLookups: config.ens.rpcUrl,
    },
    privacy: {
      stored: Object.fromEntries(['calls', 'incidents', 'approvals', 'audit_log', 'versions', 'seals', 'public_events'].map((t) => [t, get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)?.n ?? 0])),
      dataDir: config.dataDir,
      sentOutside: [
        isEnsConfigured() ? `ENS (${config.ens.network}): verdict records for tool versions — never prompts, arguments, results or identities` : null,
        isHederaConfigured() ? `Hedera (${config.hedera.network}): verdicts, revocations, disputes, and Merkle roots of your audit log — never the events themselves` : null,
        config.sentinel.apiKeyPresent ? `AI provider (${providerName()}): public tool definitions for audit; Ask Zoro questions and the records it reads, when you use it` : null,
        isWorldConfigured() ? 'World ID: the action digest as the proof signal — never the action itself' : null,
        getSetting('remote_package_checks') !== 'off' ? 'npm registry, npm downloads API and OSV.dev: the name and version of packages being checked (installs, npx servers, known-vulnerability lookups) — switch off under Packages & skills' : null,
        getSetting('org_membership') && getSetting('org_membership') !== 'null' ? 'Your organization’s Zoro: your inventory (MCP servers, packages, skills, clients and their verdicts), plus incident titles if the organization chose that level — never prompts, arguments, results or files' : null,
      ].filter(Boolean),
    },
    team: { note: 'Each Zoro is one person’s gateway. Teams join an organization (Console → Organization) with World ID; approver groups use distinct World ID nullifiers per approval.' },
    scanPermitted: scanPermitted(),
  }),
);

consoleApi.put('/settings/notifications', async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  if (b.webhookUrl && typeof b.webhookUrl === 'string') {
    try {
      new URL(b.webhookUrl);
    } catch {
      return c.json({ error: 'Invalid webhook URL' }, 400);
    }
  }
  setSetting('notifications', JSON.stringify(b));
  return c.json({ ok: true });
});

consoleApi.put('/settings/auditor', async (c) => {
  const b = await c.req.json<{ publicSubmission?: boolean }>();
  if (typeof b.publicSubmission === 'boolean') setSetting('public_submission', b.publicSubmission ? 'on' : 'off');
  return c.json({ ok: true });
});

consoleApi.get('/outbox', (c) => c.json({ stats: outboxStats(), items: all('SELECT id, created_at, kind, ref, status, attempts, next_at, last_error, completed_at FROM outbox ORDER BY created_at DESC LIMIT 100') }));
consoleApi.post('/outbox/retry', (c) => {
  retryFailed();
  return c.json({ ok: true });
});
consoleApi.post('/republish', (c) => {
  const rows = all<{ fingerprint: string }>("SELECT fingerprint FROM seals WHERE private = 0 AND verdict != 'pending' AND (ledger_status IS NULL OR ledger_status IN ('not_configured','failed')) AND (ens_status IS NULL OR ens_status IN ('not_configured','failed'))");
  for (const r of rows) publishVerdict(r.fingerprint);
  return c.json({ queued: rows.length });
});

consoleApi.post('/danger/:op', async (c) => {
  const { phrase } = await c.req.json<{ phrase: string }>();
  try {
    return c.json(await requestDanger(c.req.param('op').replace(/-/g, '_'), phrase ?? ''));
  } catch (e) {
    return c.json(err(e), 400);
  }
});

// ---------- onboarding ----------

consoleApi.post('/onboarding/scan', async (c) => {
  const { grant } = await c.req.json<{ grant?: boolean }>().catch(() => ({ grant: false }));
  try {
    return c.json({ clients: scanClients(Boolean(grant)) });
  } catch (e) {
    return c.json(err(e), 403);
  }
});
consoleApi.post('/onboarding/route', async (c) => {
  const b = await c.req.json<{ clientId: string; servers: string[]; mode: 'enforce' | 'observe' }>();
  try {
    return c.json(routeClient(b.clientId, b.servers, b.mode === 'observe' ? 'observe' : 'enforce'));
  } catch (e) {
    return c.json(err(e), 400);
  }
});
consoleApi.post('/onboarding/restore', async (c) => {
  const { clientId } = await c.req.json<{ clientId?: string }>().catch(() => ({ clientId: undefined }));
  return c.json({ restored: restoreClients(clientId) });
});
consoleApi.get('/onboarding/state', (c) => c.json({ permitted: scanPermitted(), completed: getSetting('onboarding_completed') === '1', clients: all('SELECT id, client, path, routed, routed_at, backup_path FROM client_configs') }));
consoleApi.post('/onboarding/complete', (c) => {
  setSetting('onboarding_completed', '1');
  return c.json({ ok: true });
});

// ---------- Ask Zoro, corpus ----------

consoleApi.post('/ask', async (c) => {
  const { question, history } = await c.req.json<{ question: string; history?: { role: 'user' | 'assistant'; content: string }[] }>();
  if (!question?.trim()) return c.json({ error: 'Ask a question' }, 400);
  try {
    return c.json(await askZoro(question.trim().slice(0, 2000), history ?? []));
  } catch (e) {
    return c.json(err(e), 400);
  }
});

consoleApi.post('/corpus/run', (c) => c.json(measureDeterministic()));
consoleApi.post('/corpus/run-ai', async (c) => {
  try {
    return c.json(await measureWithAi());
  } catch (e) {
    return c.json(err(e), 400);
  }
});

// ---------- live stream ----------

consoleApi.get('/stream', (c) =>
  streamSSE(c, async (stream) => {
    const onEvent = (e: BusEvent) => void stream.writeSSE({ event: e.type, data: JSON.stringify({ ts: e.ts, data: e.data }) });
    bus.on('event', onEvent);
    const ping = setInterval(() => void stream.writeSSE({ event: 'ping', data: String(Date.now()) }), 15_000);
    await new Promise<void>((resolve) => stream.onAbort(() => resolve()));
    clearInterval(ping);
    bus.off('event', onEvent);
  }),
);
