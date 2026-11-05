import { randomUUID } from 'node:crypto';
import { appendLog } from './auditlog';
import { bus } from './bus';
import { config } from './config';
import { all, get, json, nextSeq, run } from './db';
import { addIncidentEvent, notify } from './incidents';
import { getHumanSeal, markExecuted } from './humanseal';

export type ApprovalKind = 'tool_call' | 'override' | 'policy_change' | 'release' | 'namespace_claim' | 'dispute' | 'danger_zone' | 'mode_change' | 'artifact_release';
export type ApprovalStatus = 'pending' | 'approved' | 'executed' | 'denied' | 'cancelled' | 'expired' | 'invalid';

export interface ApprovalRow {
  id: string;
  seq: number;
  created_at: number;
  expires_at: number;
  status: ApprovalStatus;
  kind: ApprovalKind;
  digest: string;
  action: string;
  summary: string | null;
  reason: string | null;
  rule: string | null;
  human_seal: number;
  approvers_required: number;
  approvals_received: number;
  session_id: string | null;
  agent: string | null;
  server_id: string | null;
  tool: string | null;
  fingerprint: string | null;
  evidence: string | null;
  decided_at: number | null;
  decided_by: string | null;
  consumed_at: number | null;
  outcome: string | null;
  incident_id: string | null;
  lab: number;
}

export const approvalRef = (seq: number) => `APR-${seq}`;

type Executor = (a: ApprovalRow) => Promise<string | void> | string | void;
const executors = new Map<ApprovalKind, Executor>();
/** Non-call approvals (policy changes, releases, claims…) run their action as soon as they are approved. */
export const registerApprovalExecutor = (kind: ApprovalKind, fn: Executor) => executors.set(kind, fn);

export interface CreateApproval {
  kind: ApprovalKind;
  digest: string;
  action: unknown;
  summary: string;
  reason: string;
  rule?: string | null;
  humanSeal: boolean;
  approversRequired?: number;
  sessionId?: string | null;
  agent?: string | null;
  serverId?: string | null;
  tool?: string | null;
  fingerprint?: string | null;
  evidence?: unknown;
  incidentId?: string | null;
  lab?: boolean;
  windowSec?: number;
}

export function createApproval(input: CreateApproval): ApprovalRow {
  const pending = get<ApprovalRow>("SELECT * FROM approvals WHERE digest = ? AND kind = ? AND status IN ('pending','approved') AND expires_at > ? ORDER BY created_at DESC LIMIT 1", input.digest, input.kind, Date.now());
  if (pending) return pending;
  const id = randomUUID();
  const seq = nextSeq('approval');
  const now = Date.now();
  run(
    `INSERT INTO approvals(id, seq, created_at, expires_at, status, kind, digest, action, summary, reason, rule, human_seal, approvers_required, session_id, agent, server_id, tool, fingerprint, evidence, incident_id, lab)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, seq, now, now + (input.windowSec ?? config.approvalWindowSec) * 1000, 'pending', input.kind, input.digest, JSON.stringify(input.action), input.summary, input.reason, input.rule ?? null,
    input.humanSeal, input.approversRequired ?? 1, input.sessionId ?? null, input.agent ?? null, input.serverId ?? null, input.tool ?? null, input.fingerprint ?? null, JSON.stringify(input.evidence ?? null), input.incidentId ?? null, Boolean(input.lab),
  );
  appendLog('approval', `${approvalRef(seq)} requested: ${input.summary}`, { kind: input.kind, digest: input.digest, humanSeal: input.humanSeal }, id, input.lab);
  notify(input.humanSeal ? 'high' : 'medium', `Approval needed: ${input.summary}`, input.reason, input.incidentId ?? null, Boolean(input.lab));
  bus.emitEvent('approval', { id, status: 'pending' });
  if (input.incidentId) addIncidentEvent(input.incidentId, 'approval_requested', `${approvalRef(seq)} requested${input.humanSeal ? ' (Human Seal required)' : ''}`);
  return get<ApprovalRow>('SELECT * FROM approvals WHERE id = ?', id)!;
}

export const getApproval = (id: string) => get<ApprovalRow>('SELECT * FROM approvals WHERE id = ?', id);

type ApprovalEvidence = Record<string, unknown> & { approverNullifiers?: (string | null)[]; humanSeals?: string[] };
const evidenceOf = (a: ApprovalRow): ApprovalEvidence => json<ApprovalEvidence | null>(a.evidence, null) ?? {};

/**
 * Approve or deny. When a Human Seal is required, each approval must carry a verified seal for this exact digest;
 * multiple approvers are counted by distinct World ID nullifiers, so one person cannot approve twice.
 */
export async function decideApproval(id: string, decision: 'approve' | 'deny', actor: string, humanSealId: string | null): Promise<ApprovalRow> {
  const a = getApproval(id);
  if (!a) throw new Error('approval not found');
  if (a.status !== 'pending') throw new Error(`approval is already ${a.status}`);
  if (Date.now() > a.expires_at) {
    run("UPDATE approvals SET status = 'expired', outcome = 'expired' WHERE id = ?", id);
    throw new Error('approval window has closed');
  }
  if (decision === 'deny') {
    run("UPDATE approvals SET status = 'denied', outcome = 'denied', decided_at = ?, decided_by = ? WHERE id = ?", Date.now(), actor, id);
    appendLog('approval', `${approvalRef(a.seq)} denied`, { actor }, id, Boolean(a.lab));
    if (a.incident_id) addIncidentEvent(a.incident_id, 'approval_denied', `${approvalRef(a.seq)} denied by ${actor}`);
    bus.emitEvent('approval', { id, status: 'denied' });
    return getApproval(id)!;
  }
  if (a.human_seal) {
    const seal = humanSealId ? getHumanSeal(humanSealId) : null;
    if (!seal || seal.status !== 'verified' || seal.digest !== a.digest) throw new Error('A verified Human Seal bound to this exact action is required');
    const ev = evidenceOf(a);
    const prior = ev.approverNullifiers ?? [];
    if (seal.nullifier && prior.includes(seal.nullifier)) throw new Error('This verified person has already approved this action');
    const next = { ...ev, approverNullifiers: [...prior, seal.nullifier], humanSeals: [...(ev.humanSeals ?? []), seal.id] };
    run('UPDATE approvals SET evidence = ?, approvals_received = approvals_received + 1 WHERE id = ?', JSON.stringify(next), id);
  } else run('UPDATE approvals SET approvals_received = approvals_received + 1 WHERE id = ?', id);
  const updated = getApproval(id)!;
  if (updated.approvals_received < updated.approvers_required) {
    appendLog('approval', `${approvalRef(a.seq)}: ${updated.approvals_received}/${updated.approvers_required} approvals`, { actor }, id, Boolean(a.lab));
    bus.emitEvent('approval', { id, status: 'pending', received: updated.approvals_received });
    return updated;
  }
  run("UPDATE approvals SET status = 'approved', decided_at = ?, decided_by = ? WHERE id = ?", Date.now(), actor, id);
  appendLog('approval', `${approvalRef(a.seq)} approved${a.human_seal ? ' with Human Seal' : ''}`, { actor, humanSealId }, id, Boolean(a.lab));
  if (a.incident_id) addIncidentEvent(a.incident_id, 'approval_granted', `${approvalRef(a.seq)} approved by ${actor}${a.human_seal ? ' with a verified Human Seal' : ''}`);
  bus.emitEvent('approval', { id, status: 'approved' });
  const exec = executors.get(a.kind);
  if (exec) {
    try {
      const outcome = await exec(getApproval(id)!);
      consumeApproval(id, typeof outcome === 'string' ? outcome : 'executed');
    } catch (e) {
      run("UPDATE approvals SET outcome = ? WHERE id = ?", `execution failed: ${(e as Error).message}`, id);
      throw e;
    }
  }
  return getApproval(id)!;
}

/** Find an approved, unconsumed, unexpired approval for exactly this action. */
export function findGranted(digest: string, kinds: ApprovalKind[]): ApprovalRow | null {
  const rows = all<ApprovalRow>("SELECT * FROM approvals WHERE digest = ? AND status = 'approved' AND consumed_at IS NULL AND expires_at > ? ORDER BY decided_at", digest, Date.now());
  return rows.find((r) => kinds.includes(r.kind)) ?? null;
}

/** Approvals are single use (FR-H1): consumption is atomic and recorded. */
export function consumeApproval(id: string, outcome = 'executed'): boolean {
  const r = run("UPDATE approvals SET status = 'executed', consumed_at = ?, outcome = ? WHERE id = ? AND status = 'approved' AND consumed_at IS NULL", Date.now(), outcome, id);
  if (r.changes === 0) return false;
  const a = getApproval(id)!;
  for (const sid of evidenceOf(a).humanSeals ?? []) markExecuted(sid);
  appendLog('approval', `${approvalRef(a.seq)} executed`, { outcome }, id, Boolean(a.lab));
  if (a.incident_id) addIncidentEvent(a.incident_id, 'action_executed', `${approvalRef(a.seq)}: ${outcome}`);
  bus.emitEvent('approval', { id, status: 'executed' });
  return true;
}

export function cancelApproval(id: string, actor: string) {
  const r = run("UPDATE approvals SET status = 'cancelled', outcome = 'cancelled', decided_at = ?, decided_by = ? WHERE id = ? AND status = 'pending'", Date.now(), actor, id);
  if (r.changes) bus.emitEvent('approval', { id, status: 'cancelled' });
}

export function expireApprovals() {
  const rows = all<ApprovalRow>("SELECT * FROM approvals WHERE status IN ('pending','approved') AND expires_at < ?", Date.now());
  for (const a of rows) {
    run("UPDATE approvals SET status = 'expired', outcome = COALESCE(outcome, 'expired') WHERE id = ?", a.id);
    appendLog('approval', `${approvalRef(a.seq)} expired without ${a.status === 'approved' ? 'being used' : 'a decision'}`, null, a.id, Boolean(a.lab));
    if (a.incident_id) addIncidentEvent(a.incident_id, 'approval_expired', `${approvalRef(a.seq)} expired`);
    bus.emitEvent('approval', { id: a.id, status: 'expired' });
  }
}
