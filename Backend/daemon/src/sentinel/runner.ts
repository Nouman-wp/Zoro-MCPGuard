import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  CANONICALIZATION_VERSION,
  RULESET_VERSION,
  assembleVerdictPackage,
  ensNamesFor,
  runStaticLayers,
  type AuditInput,
  type AuditorConfig,
  type Definition,
  type Finding,
  type VerdictPackage,
} from '@zoro/core';
import { appendLog } from '../auditlog';
import { bus } from '../bus';
import { config } from '../config';
import { all, get, json, run } from '../db';
import { attest } from '../keys';
import { publishVerdict } from '../registry/outbox';
import { aiConfigured, aiReview, REVIEW_CONFIGS } from './ai';
import { providerName } from '../llm';

export interface LayerState {
  layer: 'deterministic' | 'differential' | 'ai' | 'detonation' | 'attestation';
  status: 'waiting' | 'running' | 'done' | 'skipped' | 'failed';
  detail: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export type Detonator = (definition: Definition) => Promise<{ findings: Finding[]; observations: string[] }>;

export interface AuditRequest extends AuditInput {
  serverId: string | null;
  trigger: string;
  source: 'gateway' | 'publisher' | 'dispute' | 'reaudit' | 'artifact';
  force?: boolean;
  disputeEvidence?: string | null;
  detonate?: Detonator | null;
  privateSeal?: boolean;
}

export const sentinelEvents = new EventEmitter();
const queue: { id: string; req: AuditRequest }[] = [];
let active = 0;
const MAX_CONCURRENT = 2;

const initialLayers = (): LayerState[] =>
  (['deterministic', 'differential', 'ai', 'detonation', 'attestation'] as const).map((layer) => ({ layer, status: 'waiting', detail: null, startedAt: null, finishedAt: null }));

export function auditorConfig(withDetonation: boolean, mode: 'standard' | 'dispute' = 'standard', highImpact = false): AuditorConfig {
  const cfgs = !aiConfigured() ? null : mode === 'dispute' ? ['dispute', 'adversarial'] : highImpact && config.sentinel.dualReviewHighImpact ? ['primary', 'adversarial'] : ['primary'];
  return {
    rulesetVersion: RULESET_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    ai: cfgs ? { provider: providerName(), configs: cfgs.map((c) => ({ id: REVIEW_CONFIGS[c as keyof typeof REVIEW_CONFIGS].id, model: config.sentinel.model })) } : null,
    detonation: withDetonation,
  };
}

/** Queue an audit; deduplicates against queued, running and completed audits of the same fingerprint. */
export function requestAudit(req: AuditRequest): string {
  const fp = runStaticLayers(req).fingerprint;
  if (!req.force) {
    const inflight = get<{ id: string }>("SELECT id FROM audits WHERE fingerprint = ? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1", fp);
    if (inflight) return inflight.id;
    const done = get<{ id: string; verdict: string }>("SELECT id, verdict FROM audits WHERE fingerprint = ? AND status = 'done' ORDER BY created_at DESC LIMIT 1", fp);
    if (done && done.verdict !== 'pending') return done.id;
  }
  const id = randomUUID();
  run('INSERT INTO audits(id, fingerprint, server_id, server_label, kind, name, status, layers, definition, trigger, source, lab, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', id, fp, req.serverId, req.serverName, req.kind, req.definition.name, 'queued', JSON.stringify(initialLayers()), JSON.stringify(req.definition), req.trigger, req.source, req.lab, Date.now());
  queue.push({ id, req });
  bus.emitEvent('audit', { id, fingerprint: fp, status: 'queued' });
  pump();
  return id;
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const item = queue.shift()!;
    active++;
    void runAudit(item.id, item.req).finally(() => {
      active--;
      pump();
    });
  }
}

function setLayer(id: string, layers: LayerState[], layer: LayerState['layer'], patch: Partial<LayerState>) {
  const l = layers.find((x) => x.layer === layer)!;
  Object.assign(l, patch);
  if (patch.status === 'running') l.startedAt = Date.now();
  if (patch.status && patch.status !== 'running' && patch.status !== 'waiting') l.finishedAt = Date.now();
  run('UPDATE audits SET layers = ? WHERE id = ?', JSON.stringify(layers), id);
  bus.emitEvent('audit', { id, layers, status: 'running' });
}

async function runAudit(id: string, req: AuditRequest) {
  const layers = initialLayers();
  run("UPDATE audits SET status = 'running' WHERE id = ?", id);
  try {
    setLayer(id, layers, 'deterministic', { status: 'running' });
    const staticLayers = runStaticLayers(req);
    setLayer(id, layers, 'deterministic', { status: 'done', detail: `${staticLayers.deterministic.length} finding(s) · ${RULESET_VERSION}` });
    setLayer(id, layers, 'differential', { status: 'done', detail: staticLayers.differential.summary });

    const mode = req.source === 'dispute' ? 'dispute' : 'standard';
    setLayer(id, layers, 'ai', { status: 'running', detail: aiConfigured() ? `reviewing with ${config.sentinel.model}` : null });
    const ai = await aiReview({
      serverName: req.serverName,
      kind: req.kind,
      definition: req.definition,
      previous: req.previous?.definition ?? null,
      fields: staticLayers.differential.fields,
      highImpact: staticLayers.highImpact,
      mode,
      extraEvidence: req.disputeEvidence ?? null,
    });
    setLayer(id, layers, 'ai', {
      status: ai.status === 'ok' ? 'done' : ai.status === 'not_configured' ? 'skipped' : 'failed',
      detail: ai.status === 'ok' ? `${ai.findings.length} finding(s) from ${ai.configs.map((c) => `${c.id} (${c.model})`).join(' + ')}` : ai.status === 'not_configured' ? 'AI review not configured (ANTHROPIC_API_KEY)' : `${ai.status}${ai.reason ? `: ${ai.reason}` : ''}`,
    });

    let detonation: Finding[] = [];
    if (req.detonate) {
      setLayer(id, layers, 'detonation', { status: 'running', detail: 'exercising tool in an isolated Lab sandbox' });
      try {
        const d = await req.detonate(req.definition);
        detonation = d.findings;
        setLayer(id, layers, 'detonation', { status: 'done', detail: d.observations.join(' · ') || 'no observations' });
      } catch (e) {
        setLayer(id, layers, 'detonation', { status: 'failed', detail: (e as Error).message });
      }
    } else setLayer(id, layers, 'detonation', { status: 'skipped', detail: req.lab ? 'not runnable' : 'Dynamic detonation is only available for Lab servers on this platform' });

    const cfg = auditorConfig(Boolean(req.detonate), mode, staticLayers.highImpact);
    // Record the model that actually answered (a server-side fallback may have served the request).
    if (cfg.ai && ai.configs.length) cfg.ai.configs = ai.configs;
    const pkg: VerdictPackage = assembleVerdictPackage(req, staticLayers, {
      ai: { ...ai, summary: [ai.summary, ai.changeExplanation].filter(Boolean).join(' ') || null },
      detonation,
      auditorConfig: cfg,
      requireAi: config.sentinel.requireAi,
      sealLifetimeDays: config.sentinel.sealLifetimeDays,
    });
    setLayer(id, layers, 'attestation', { status: 'running' });
    pkg.attestation = await attest(pkg);
    setLayer(id, layers, 'attestation', { status: 'done', detail: `signed by ${pkg.attestation.auditor}` });

    run("UPDATE audits SET status = 'done', package = ?, verdict = ?, verdict_hash = ?, completed_at = ? WHERE id = ?", JSON.stringify(pkg), pkg.verdict, pkg.attestation.verdictHash, Date.now(), id);
    if (req.source === 'artifact') {
      // A code-change audit judges the new code, not the definition; it never rewrites the definition's seal.
      appendLog('verdict', `Sentinel (code change): ${req.definition.name} on ${req.serverName} → ${pkg.verdict}`, { fingerprint: pkg.fingerprint, audit: id }, pkg.fingerprint, req.lab);
      bus.emitEvent('audit', { id, fingerprint: pkg.fingerprint, status: 'done', verdict: pkg.verdict, layers });
      sentinelEvents.emit('artifact_verdict', req.serverId, pkg, id);
      return;
    }
    recordSeal(id, req, pkg);
    appendLog('verdict', `Sentinel: ${req.definition.name} on ${req.serverName} → ${pkg.verdict} (risk ${pkg.riskScore})`, { fingerprint: pkg.fingerprint, verdict: pkg.verdict, changeClass: pkg.changeClass, audit: id }, pkg.fingerprint, req.lab);
    bus.emitEvent('audit', { id, fingerprint: pkg.fingerprint, status: 'done', verdict: pkg.verdict, layers });
    sentinelEvents.emit('verdict', pkg.fingerprint, pkg, id);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    run("UPDATE audits SET status = 'failed', error = ?, completed_at = ? WHERE id = ?", msg, Date.now(), id);
    bus.emitEvent('audit', { id, status: 'failed', error: msg });
    sentinelEvents.emit('failed', id, msg);
  }
}

function recordSeal(auditId: string, req: AuditRequest, pkg: VerdictPackage) {
  const ensName = config.ens.root ? ensNamesFor(config.ens.root, req.serverName, pkg.name, pkg.fingerprint, req.lab).version : null;
  const existing = get<{ status: string }>('SELECT status FROM seals WHERE fingerprint = ?', pkg.fingerprint);
  const status = existing?.status === 'revoked' && req.source !== 'dispute' ? 'revoked' : 'active';
  run(
    `INSERT INTO seals(fingerprint, kind, name, server_label, audit_id, verdict, status, risk, change_class, verdict_hash, signature, auditor, audited_at, expires_at, ens_name, lab, private)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(fingerprint) DO UPDATE SET audit_id = excluded.audit_id, verdict = excluded.verdict, status = ?, risk = excluded.risk, change_class = excluded.change_class,
       verdict_hash = excluded.verdict_hash, signature = excluded.signature, auditor = excluded.auditor, audited_at = excluded.audited_at, expires_at = excluded.expires_at,
       ens_name = excluded.ens_name, revoked_at = CASE WHEN ? = 'active' THEN NULL ELSE revoked_at END, disputed = 0`,
    pkg.fingerprint, pkg.kind, pkg.name, req.serverName, auditId, pkg.verdict, status, pkg.riskScore, pkg.changeClass, pkg.attestation!.verdictHash, pkg.attestation!.signature, pkg.attestation!.auditor,
    Date.parse(pkg.auditedAt), Date.parse(pkg.expiresAt), ensName, req.lab, Boolean(req.privateSeal), status, status,
  );
  if ((pkg.verdict === 'sealed' || pkg.verdict === 'sealed_with_warnings') && status === 'active') {
    // A newer sealed version supersedes older ones (they stay valid unless revoked).
    run("UPDATE seals SET status = 'superseded' WHERE server_label = ? AND name = ? AND kind = ? AND fingerprint != ? AND status = 'active' AND verdict IN ('sealed','sealed_with_warnings') AND lab = ?", req.serverName, pkg.name, pkg.kind, pkg.fingerprint, req.lab);
  }
  bus.emitEvent('seal', { fingerprint: pkg.fingerprint, verdict: pkg.verdict, status });
  if (pkg.verdict !== 'pending') publishVerdict(pkg.fingerprint, Boolean(existing));
}

export function getAudit(id: string) {
  const row = get<{ id: string; fingerprint: string; status: string; layers: string; package: string | null; verdict: string | null; error: string | null; created_at: number; completed_at: number | null; trigger: string; source: string; server_id: string | null; name: string; kind: string; lab: number }>('SELECT * FROM audits WHERE id = ?', id);
  if (!row) return null;
  return { ...row, layers: json<LayerState[]>(row.layers, []), package: json<VerdictPackage | null>(row.package, null) };
}

export function latestPackage(fingerprint: string): VerdictPackage | null {
  const seal = get<{ audit_id: string }>('SELECT audit_id FROM seals WHERE fingerprint = ?', fingerprint);
  const row = seal
    ? get<{ package: string }>('SELECT package FROM audits WHERE id = ?', seal.audit_id)
    : get<{ package: string }>("SELECT package FROM audits WHERE fingerprint = ? AND status = 'done' ORDER BY created_at DESC LIMIT 1", fingerprint);
  return json<VerdictPackage | null>(row?.package, null);
}

/** Seal lifetime: expired seals are re-audited (§3.2, FR-F5). */
export function expireSeals(onExpired: (fingerprint: string) => void) {
  const rows = all<{ fingerprint: string }>("SELECT fingerprint FROM seals WHERE status = 'active' AND expires_at < ?", Date.now());
  for (const r of rows) {
    run("UPDATE seals SET status = 'expired' WHERE fingerprint = ?", r.fingerprint);
    appendLog('verdict', 'Seal expired; re-audit scheduled', null, r.fingerprint);
    onExpired(r.fingerprint);
  }
}

export function queueDepth() {
  return { queued: queue.length, running: active };
}
