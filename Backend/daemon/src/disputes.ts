import { randomUUID } from 'node:crypto';
import { actionDigest, type Definition, type DefinitionKind, type VerdictPackage } from '@zoro/core';
import { appendLog } from './auditlog';
import { createApproval, registerApprovalExecutor } from './approvals';
import { bus } from './bus';
import { all, get, json, nextSeq, run } from './db';
import { gateway } from './gateway/gateway';
import { publishEvent } from './registry/outbox';
import { requestAudit, sentinelEvents } from './sentinel/runner';

export interface DisputeRow {
  id: string;
  seq: number;
  created_at: number;
  kind: 'challenge' | 'appeal';
  fingerprint: string;
  ens_name: string | null;
  submitter: string | null;
  evidence: string;
  status: 'awaiting_human_seal' | 'open' | 'reviewing' | 'resolved';
  outcome: 'upheld' | 'overturned' | 'revoked' | null;
  reasoning: string | null;
  review_audit_id: string | null;
  human_seal_id: string | null;
  ledger_open: string | null;
  ledger_resolve: string | null;
  resolved_at: number | null;
}

/** Opening a dispute requires a Human Seal, which protects the registry from flooding (§4.17). */
export function openDispute(input: { kind: 'challenge' | 'appeal'; fingerprint: string; evidence: string; submitter: string | null }) {
  const seal = get<{ fingerprint: string; verdict: string; ens_name: string | null; lab: number }>('SELECT fingerprint, verdict, ens_name, lab FROM seals WHERE fingerprint = ?', input.fingerprint);
  if (!seal) throw new Error('No verdict exists for this fingerprint');
  if (input.kind === 'challenge' && !['sealed', 'sealed_with_warnings'].includes(seal.verdict)) throw new Error('Only sealed versions can be challenged');
  if (input.kind === 'appeal' && !['unsafe', 'sealed_with_warnings'].includes(seal.verdict)) throw new Error('Only unsafe or sealed-with-warnings verdicts can be appealed');
  if (input.evidence.trim().length < 20) throw new Error('Please describe the evidence (at least 20 characters)');
  const id = randomUUID();
  const seq = nextSeq('dispute');
  run('INSERT INTO disputes(id, seq, created_at, kind, fingerprint, ens_name, submitter, evidence, status) VALUES(?,?,?,?,?,?,?,?,?)', id, seq, Date.now(), input.kind, input.fingerprint, seal.ens_name, input.submitter, input.evidence.slice(0, 8000), 'awaiting_human_seal');
  const approval = createApproval({
    kind: 'dispute',
    digest: actionDigest({ kind: 'dispute', requestId: id, fingerprint: input.fingerprint, detail: { kind: input.kind } }),
    action: { disputeId: id },
    summary: `Open ${input.kind} DSP-${seq} on ${seal.ens_name ?? input.fingerprint.slice(0, 12)}`,
    reason: 'Disputes are public and trigger a re-review, so opening one requires a Human Seal.',
    humanSeal: true,
    lab: Boolean(seal.lab),
    windowSec: 3600,
  });
  return { id, seq, approval };
}

registerApprovalExecutor('dispute', (a) => {
  const { disputeId } = json<{ disputeId: string }>(a.action, { disputeId: '' });
  const d = get<DisputeRow>('SELECT * FROM disputes WHERE id = ?', disputeId);
  if (!d || d.status !== 'awaiting_human_seal') return 'dispute no longer pending';
  const audit = get<{ definition: string; kind: DefinitionKind; server_label: string; lab: number }>("SELECT definition, kind, server_label, lab FROM audits WHERE fingerprint = ? AND definition IS NOT NULL ORDER BY created_at DESC LIMIT 1", d.fingerprint);
  const definition = json<Definition | null>(audit?.definition, null);
  if (!audit || !definition) throw new Error('The original definition for this fingerprint is not available on this auditor');
  run("UPDATE disputes SET status = 'reviewing', human_seal_id = ? WHERE id = ?", json<{ humanSeals?: string[] }>(a.evidence, {}).humanSeals?.[0] ?? null, d.id);
  run('UPDATE seals SET disputed = 1 WHERE fingerprint = ?', d.fingerprint);
  publishEvent(audit.lab ? 'lab' : 'registry', { v: 1, type: 'dispute.opened', fp: d.fingerprint, ens: d.ens_name ?? undefined, ref: `DSP-${d.seq}`, outcome: d.kind, lab: audit.lab ? true : undefined, ts: new Date().toISOString() }, { kind: 'dispute_open', id: d.id });
  appendLog('dispute', `DSP-${d.seq} opened (${d.kind})`, { fingerprint: d.fingerprint }, d.id, Boolean(audit.lab));
  // Re-review by a different auditor configuration (the dispute and red-team reviewers).
  const auditId = requestAudit({
    kind: audit.kind, definition, previous: null, serverName: audit.server_label, declaredServerName: null, declaredServerVersion: null,
    artifactId: null, transport: 'dispute', manifestRoot: null, otherTools: [], lab: Boolean(audit.lab), serverId: null,
    trigger: `dispute DSP-${d.seq}`, source: 'dispute', force: true, disputeEvidence: d.evidence,
  });
  run('UPDATE disputes SET review_audit_id = ? WHERE id = ?', auditId, d.id);
  bus.emitEvent('approval', { dispute: d.id, status: 'reviewing' });
  return 'dispute opened; re-review running';
});

sentinelEvents.on('verdict', (_fp: string, pkg: VerdictPackage, auditId: string) => {
  const d = get<DisputeRow>("SELECT * FROM disputes WHERE review_audit_id = ? AND status = 'reviewing'", auditId);
  if (!d) return;
  const before = get<{ verdict: string }>("SELECT verdict FROM audits WHERE fingerprint = ? AND id != ? AND status = 'done' AND source != 'dispute' ORDER BY created_at DESC LIMIT 1", d.fingerprint, auditId)?.verdict ?? null;
  let outcome: DisputeRow['outcome'];
  if (d.kind === 'challenge') outcome = pkg.verdict === 'unsafe' ? 'revoked' : 'upheld';
  else outcome = before === 'unsafe' && pkg.verdict !== 'unsafe' && pkg.verdict !== 'pending' ? 'overturned' : before === 'sealed_with_warnings' && pkg.verdict === 'sealed' ? 'overturned' : 'upheld';
  const reasoning = `${pkg.aiSummary ?? 'Re-review completed.'} Re-review verdict: ${pkg.verdict.replace(/_/g, ' ')} (risk ${pkg.riskScore}); original verdict: ${before?.replace(/_/g, ' ') ?? 'unknown'}.`.slice(0, 1500);
  run("UPDATE disputes SET status = 'resolved', outcome = ?, reasoning = ?, resolved_at = ? WHERE id = ?", outcome, reasoning, Date.now(), d.id);
  run('UPDATE seals SET disputed = 0 WHERE fingerprint = ?', d.fingerprint);
  if (outcome === 'revoked') gateway.revoke(d.fingerprint, `Challenge DSP-${d.seq} confirmed on re-review.`, 'dispute');
  publishEvent(pkg.lab ? 'lab' : 'registry', { v: 1, type: 'dispute.resolved', fp: d.fingerprint, ref: `DSP-${d.seq}`, outcome: outcome ?? undefined, reason: reasoning.slice(0, 280), lab: pkg.lab ? true : undefined, ts: new Date().toISOString() }, { kind: 'dispute_resolve', id: d.id });
  appendLog('dispute', `DSP-${d.seq} resolved: ${outcome}`, { reasoning }, d.id, pkg.lab);
});

export const listDisputes = () => all<DisputeRow>('SELECT * FROM disputes ORDER BY created_at DESC LIMIT 200');
export const getDispute = (id: string) => get<DisputeRow>('SELECT * FROM disputes WHERE id = ?', id);
