import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { CANONICALIZATION_VERSION, RULESET_VERSION, RULE_CATALOGUE, ensNamesFor, type VerdictPackage } from '@zoro/core';
import { approvalRef, decideApproval, getApproval } from '../approvals';
import { bus, type BusEvent } from '../bus';
import { VERSION, config, ensAppUrl, etherscanBase, hashscan, hcsMessageUrl, isEnsConfigured, isHederaConfigured, mirrorBase } from '../config';
import { latestCorpusRuns } from '../corpus';
import { all, get, json } from '../db';
import { abandonHumanSeal, completeHumanSeal, getHumanSeal, startHumanSeal } from '../humanseal';
import { auditorAccount, auditorKeySource } from '../keys';
import { lab } from '../lab/lab';
import { badgeSvg } from '../publisher';
import { REVIEW_CONFIGS } from '../sentinel/ai';
import { toolDossier } from '../reports';
import { resolverForNamespace } from '@zoro/blockchain/ens';
import { performanceStats, environment } from '../status';
import { aiConfigured } from '../sentinel/ai';
import { providerName } from '../llm';

export const publicApi = new Hono();

publicApi.get('/health', (c) => c.json({ ok: true, version: VERSION, environment: environment() }));

/** Live public statistics, computed from the real ledger (§10.2). If there are few records, they show few. */
publicApi.get('/stats', (c) => {
  const lab = c.req.query('lab') === '1';
  if (!isHederaConfigured()) {
    const local = all<{ verdict: string; n: number }>("SELECT verdict, COUNT(*) AS n FROM seals WHERE lab = ? AND private = 0 GROUP BY verdict", lab);
    return c.json({ source: 'local', ledgerConfigured: false, counts: Object.fromEntries(local.map((r) => [r.verdict, r.n])), revocations: get<{ n: number }>("SELECT COUNT(*) AS n FROM seals WHERE lab = ? AND status = 'revoked'", lab)?.n ?? 0 });
  }
  const rows = all<{ payload: string; type: string }>("SELECT payload, type FROM public_events WHERE lab = ? AND valid = 1 AND type IN ('verdict.issued','verdict.reissued','seal.revoked','dispute.opened','dispute.resolved')", lab);
  const latest = new Map<string, string>();
  let revocations = 0;
  let disputes = 0;
  for (const r of rows) {
    const p = json<{ fp?: string; verdict?: string }>(r.payload, {});
    if ((r.type === 'verdict.issued' || r.type === 'verdict.reissued') && p.fp && p.verdict) latest.set(p.fp, p.verdict);
    if (r.type === 'seal.revoked') revocations++;
    if (r.type === 'dispute.opened') disputes++;
  }
  const counts: Record<string, number> = {};
  for (const v of latest.values()) counts[v] = (counts[v] ?? 0) + 1;
  return c.json({ source: 'ledger', ledgerConfigured: true, topic: lab ? config.hedera.labTopic || config.hedera.registryTopic : config.hedera.registryTopic, counts, revocations, disputes, versions: latest.size, lastSync: Number(get<{ value: string }>("SELECT value FROM settings WHERE key = 'mirror:last_ok'")?.value ?? 0) || null });
});

publicApi.get('/feed', (c) => {
  const lab = c.req.query('lab') === '1';
  const limit = Math.min(100, Number(c.req.query('limit') ?? 30));
  const rows = all<{ topic: string; seq: number; consensus_ts: string; payload: string; type: string; valid: number }>('SELECT topic, seq, consensus_ts, payload, type, valid FROM public_events WHERE lab = ? ORDER BY consensus_ts DESC LIMIT ?', lab, limit);
  return c.json({ ledgerConfigured: isHederaConfigured(), events: rows.map((r) => ({ ...r, payload: json(r.payload, {}), url: hcsMessageUrl(r.topic, r.consensus_ts) })) });
});

interface SealListRow {
  fingerprint: string;
  kind: string;
  name: string;
  server_label: string;
  audit_id: string;
  verdict: string;
  status: string;
  risk: number;
  change_class: string;
  audited_at: number;
  expires_at: number;
  ens_name: string | null;
  ens_status: string | null;
  ens_tx: string | null;
  ledger_status: string | null;
  ledger_topic: string | null;
  ledger_seq: number | null;
  ledger_ts: string | null;
  badge_status: string | null;
  badge_token: string | null;
  badge_serial: number | null;
  lab: number;
  disputed: number;
  revoke_reason: string | null;
}

const decorate = (s: SealListRow) => {
  const pkg = json<VerdictPackage | null>(get<{ package: string }>('SELECT package FROM audits WHERE id = ?', s.audit_id)?.package, null);
  const ns = get<{ status: string }>('SELECT status FROM namespaces WHERE label = ?', s.server_label);
  return {
    ...s,
    capabilities: pkg?.capabilityProfile.map((c) => c.capability) ?? [],
    findings: pkg?.findings.length ?? 0,
    publisherVerified: ns?.status === 'verified',
    contested: ns?.status === 'contested',
    links: {
      ens: s.ens_name && s.ens_status === 'written' ? ensAppUrl(s.ens_name) : null,
      ensTx: s.ens_tx ? `${etherscanBase()}/tx/${s.ens_tx}` : null,
      ledger: s.ledger_topic && s.ledger_seq ? hcsMessageUrl(s.ledger_topic, s.ledger_ts) : null,
      badge: s.badge_token && s.badge_serial ? `${hashscan('token', s.badge_token)}/${s.badge_serial}` : null,
    },
    disputes: get<{ n: number }>('SELECT COUNT(*) AS n FROM disputes WHERE fingerprint = ?', s.fingerprint)?.n ?? 0,
  };
};

/** Registry explorer: every non-private verdict this auditor has issued, with its publication state. */
publicApi.get('/registry', (c) => {
  const q = (c.req.query('q') ?? '').toLowerCase();
  const verdict = c.req.query('verdict');
  const cap = c.req.query('capability');
  const lab = c.req.query('lab') === '1';
  const rows = all<SealListRow>('SELECT * FROM seals WHERE private = 0 AND lab = ? ORDER BY audited_at DESC LIMIT 1000', lab).map(decorate);
  const filtered = rows.filter((r) =>
    (!q || r.name.toLowerCase().includes(q) || r.server_label.includes(q) || r.fingerprint.includes(q) || (r.ens_name ?? '').includes(q)) &&
    (!verdict || (verdict === 'revoked' ? r.status === 'revoked' : r.verdict === verdict)) &&
    (!cap || r.capabilities.includes(cap as never)) &&
    (c.req.query('verified') !== '1' || r.publisherVerified) &&
    (c.req.query('recent') !== '1' || r.audited_at > Date.now() - 7 * 86_400_000),
  );
  return c.json({ registryConfigured: isEnsConfigured(), ledgerConfigured: isHederaConfigured(), root: config.ens.root || null, network: config.ens.network, total: rows.length, items: filtered.slice(0, 300) });
});

publicApi.get('/dossier/:label/:name', (c) => c.json(toolDossier(c.req.param('label'), c.req.param('name'))));

/** Everything Zoro Verify needs to check a version from first principles in the browser. */
publicApi.get('/verdict/:fp', (c) => {
  const fp = c.req.param('fp').toLowerCase();
  const seal = get<SealListRow & { verdict_hash: string; signature: string; auditor: string }>('SELECT * FROM seals WHERE fingerprint = ? AND private = 0', fp);
  const audit = seal ? get<{ package: string; definition: string }>('SELECT package, definition FROM audits WHERE id = ?', seal.audit_id) : get<{ package: string; definition: string }>("SELECT package, definition FROM audits WHERE fingerprint = ? AND status = 'done' AND source != 'artifact' ORDER BY created_at DESC LIMIT 1", fp);
  if (!audit) return c.json({ found: false }, 404);
  const events = all<{ topic: string; seq: number; consensus_ts: string; payload: string; type: string; valid: number }>('SELECT topic, seq, consensus_ts, payload, type, valid FROM public_events WHERE fp = ? ORDER BY consensus_ts', fp);
  return c.json({
    found: true,
    seal: seal ? decorate(seal) : null,
    package: json(audit.package, null),
    definition: json(audit.definition, null),
    ledger: events.map((e) => ({ ...e, payload: json(e.payload, {}), url: hcsMessageUrl(e.topic, e.consensus_ts) })),
  });
});

publicApi.get('/lookup', (c) => {
  // Resolve an ENS name, a fingerprint (or prefix), or a Hedera reference to a fingerprint.
  const q = (c.req.query('q') ?? '').trim().toLowerCase();
  if (/^0x[0-9a-f]{64}$/.test(q)) return c.json({ fingerprint: q });
  const fpPrefix = q.match(/^(?:fp-)?([0-9a-f]{8,})/);
  if (fpPrefix && !q.includes('.')) {
    const s = get<{ fingerprint: string }>("SELECT fingerprint FROM seals WHERE fingerprint LIKE ? AND private = 0", `0x${fpPrefix[1]}%`);
    return c.json({ fingerprint: s?.fingerprint ?? null });
  }
  const hcs = q.match(/^(?:hedera:\w+:)?(\d+\.\d+\.\d+)[:#/](\d+)$/);
  if (hcs) {
    const e = get<{ fp: string | null }>('SELECT fp FROM public_events WHERE topic = ? AND seq = ?', hcs[1], Number(hcs[2]));
    return c.json({ fingerprint: e?.fp ?? null, ledger: { topic: hcs[1], seq: Number(hcs[2]) } });
  }
  const badge = q.match(/^(\d+\.\d+\.\d+)[/#](\d+)$/);
  if (badge) {
    const s = get<{ fingerprint: string }>('SELECT fingerprint FROM seals WHERE badge_token = ? AND badge_serial = ?', badge[1], Number(badge[2]));
    return c.json({ fingerprint: s?.fingerprint ?? null });
  }
  const byName = get<{ fingerprint: string }>('SELECT fingerprint FROM seals WHERE ens_name = ? AND private = 0', q);
  if (byName) return c.json({ fingerprint: byName.fingerprint, ens: q });
  return c.json({ fingerprint: null, ens: q.includes('.') ? q : null });
});

publicApi.get('/verify-context', (c) =>
  c.json({
    auditor: auditorAccount.address,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    ens: isEnsConfigured() ? { network: config.ens.network, root: config.ens.root, rootResolver: config.ens.resolver, labResolver: resolverForNamespace('lab'), rpcUrl: config.ens.rpcUrl, explorer: etherscanBase() } : null,
    hedera: isHederaConfigured() ? { network: config.hedera.network, registryTopic: config.hedera.registryTopic, labTopic: config.hedera.labTopic || null, badgeToken: config.hedera.badgeToken || null, mirror: mirrorBase() } : null,
    sampleNames: config.ens.root ? { pattern: ensNamesFor(config.ens.root, '<server>', '<tool>', '0x00000000').version } : null,
  }),
);

publicApi.get('/badge/:label/:tool', (c) => {
  const tool = c.req.param('tool').replace(/\.svg$/, '');
  return c.body(badgeSvg(c.req.param('label'), tool), 200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-cache, max-age=0' });
});

publicApi.get('/auditor', (c) =>
  c.json({
    address: auditorAccount.address,
    keySource: auditorKeySource,
    rulesetVersion: RULESET_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    rules: RULE_CATALOGUE,
    ai: aiConfigured() ? { provider: providerName(), model: config.sentinel.model, configs: Object.values(REVIEW_CONFIGS).map((r) => ({ id: r.id, system: r.system })), dualReviewHighImpact: config.sentinel.dualReviewHighImpact } : null,
    requireAi: config.sentinel.requireAi,
    sealLifetimeDays: config.sentinel.sealLifetimeDays,
    detonation: 'Available for Attack Lab servers (in-process sandbox with an instrumented network). Not available for arbitrary local servers on this platform.',
    corpus: latestCorpusRuns(),
    performance: performanceStats(24),
    totals: {
      audits: get<{ n: number }>("SELECT COUNT(*) AS n FROM audits WHERE status = 'done' AND lab = 0")?.n ?? 0,
      byVerdict: all<{ verdict: string; n: number }>("SELECT verdict, COUNT(*) AS n FROM audits WHERE status = 'done' AND lab = 0 GROUP BY verdict"),
    },
  }),
);

// --- Attack Lab (usable without an account; only ever touches lab-labelled records) ---

publicApi.get('/lab', (c) => {
  const incidents = all('SELECT id, seq, created_at, type, severity, status, title, summary, tool, fingerprint, count FROM incidents WHERE lab = 1 ORDER BY created_at DESC LIMIT 50');
  const approvals = all<{ id: string; seq: number; status: string; summary: string; reason: string; human_seal: number; expires_at: number; kind: string; digest: string }>("SELECT id, seq, status, summary, reason, human_seal, expires_at, kind, digest FROM approvals WHERE lab = 1 ORDER BY created_at DESC LIMIT 20");
  const seals = all<SealListRow>('SELECT * FROM seals WHERE lab = 1 ORDER BY audited_at DESC LIMIT 50').map(decorate);
  const audits = all<{ id: string; name: string; status: string; verdict: string | null; layers: string; created_at: number; server_label: string; source: string }>('SELECT id, name, status, verdict, layers, created_at, server_label, source FROM audits WHERE lab = 1 ORDER BY created_at DESC LIMIT 20').map((a) => ({ ...a, layers: json(a.layers, []) }));
  return c.json({ ...lab.status(), incidents, approvals: approvals.map((a) => ({ ...a, ref: approvalRef(a.seq) })), seals, audits, aiConfigured: aiConfigured(), requireAi: config.sentinel.requireAi, publishLab: config.ens.publishLab });
});

publicApi.post('/lab/start', async (c) => {
  const { scenario } = await c.req.json<{ scenario: string }>();
  try {
    return c.json(await lab.start(scenario));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

publicApi.post('/lab/reset', async (c) => {
  const { mode } = await c.req.json<{ mode?: 'soft' | 'full' }>().catch(() => ({ mode: 'soft' as const }));
  try {
    await lab.reset(mode === 'full' ? 'full' : 'soft');
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

const labApproval = (id: string) => {
  const a = getApproval(id);
  return a && a.lab ? a : null;
};

publicApi.post('/lab/approvals/:id/deny', async (c) => {
  const a = labApproval(c.req.param('id'));
  if (!a) return c.json({ error: 'not a lab approval' }, 404);
  try {
    return c.json(await decideApproval(a.id, 'deny', 'lab-visitor', null));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

publicApi.post('/lab/approvals/:id/human-seal', async (c) => {
  const a = labApproval(c.req.param('id'));
  if (!a) return c.json({ error: 'not a lab approval' }, 404);
  return c.json(startHumanSeal(a.digest, a.id, a.expires_at));
});

/** A lab Human Seal, only together with the lab approval it was started for. */
const labSeal = (sid: string, approvalId: string) => {
  const a = labApproval(approvalId);
  const s = a ? getHumanSeal(sid) : null;
  return a && s?.approval_id === a.id ? { a, s } : null;
};

publicApi.post('/lab/human-seal/:sid/complete', async (c) => {
  const body = await c.req.json<{ approvalId: string; result: Record<string, unknown> }>();
  const found = labSeal(c.req.param('sid'), String(body.approvalId ?? ''));
  if (!found) return c.json({ error: 'not a lab approval' }, 404);
  const { a } = found;
  const r = await completeHumanSeal(c.req.param('sid'), body.result);
  if (r.status !== 'verified') return c.json(r, 400);
  try {
    return c.json({ ...r, approval: await decideApproval(a.id, 'approve', 'lab-visitor (verified human)', c.req.param('sid')) });
  } catch (e) {
    return c.json({ ...r, error: (e as Error).message }, 400);
  }
});

publicApi.post('/lab/human-seal/:sid/cancel', async (c) => {
  const body = await c.req.json<{ approvalId?: string; code?: string }>().catch(() => ({} as { approvalId?: string; code?: string }));
  if (!labSeal(c.req.param('sid'), String(body.approvalId ?? ''))) return c.json({ error: 'not a lab approval' }, 404);
  return c.json({ ok: true, status: abandonHumanSeal(c.req.param('sid'), body.code ?? 'cancelled') });
});

const LAB_STREAM_TYPES = new Set(['lab', 'audit', 'incident', 'approval', 'ledger', 'seal', 'human_seal', 'outbox']);

publicApi.get('/lab/stream', (c) =>
  streamSSE(c, async (stream) => {
    const onEvent = (e: BusEvent) => {
      if (!LAB_STREAM_TYPES.has(e.type)) return;
      void stream.writeSSE({ event: e.type, data: JSON.stringify({ ts: e.ts }) });
      if (e.type === 'lab') void stream.writeSSE({ event: 'lab_event', data: JSON.stringify(e.data) });
    };
    bus.on('event', onEvent);
    const ping = setInterval(() => void stream.writeSSE({ event: 'ping', data: String(Date.now()) }), 15_000);
    await new Promise<void>((resolve) => stream.onAbort(() => resolve()));
    clearInterval(ping);
    bus.off('event', onEvent);
  }),
);
