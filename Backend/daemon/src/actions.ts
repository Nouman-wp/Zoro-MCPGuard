import { randomUUID } from 'node:crypto';
import { actionDigest, humanSealRequiredFor, isModeLoosening, type Policy, type ServerMode } from '@zoro/core';
import { appendLog } from './auditlog';
import { createApproval, registerApprovalExecutor, type ApprovalRow } from './approvals';
import { isWorldConfigured } from './config';
import { all, json, run } from './db';
import { gateway } from './gateway/gateway';
import { restoreClients } from './onboarding';
import { getPolicy, loosenings, savePolicy, validatePolicy } from './policy';

const sealOf = (a: ApprovalRow) => json<{ humanSeals?: string[] }>(a.evidence, {}).humanSeals?.[0] ?? null;

registerApprovalExecutor('policy_change', (a) => {
  const { policy, note } = json<{ policy: Policy; note: string | null }>(a.action, { policy: getPolicy(), note: null });
  savePolicy(validatePolicy(policy), a.decided_by ?? 'console', sealOf(a), note);
  return 'policy saved';
});

registerApprovalExecutor('mode_change', async (a) => {
  const { serverId, mode } = json<{ serverId: string; mode: ServerMode }>(a.action, { serverId: '', mode: 'enforce' });
  await gateway.setMode(serverId, mode);
  return `mode set to ${mode}`;
});

registerApprovalExecutor('danger_zone', async (a) => {
  const { op } = json<{ op: string }>(a.action, { op: '' });
  return runDanger(op);
});

async function runDanger(op: string) {
  if (op === 'disable_protection') {
    for (const s of all<{ id: string }>("SELECT id FROM servers WHERE lab = 0 AND mode = 'enforce'")) await gateway.setMode(s.id, 'observe');
    appendLog('danger_zone', 'Protection disabled: every server switched to observe mode');
    return 'protection disabled (observe mode)';
  }
  if (op === 'remove_zoro') {
    const restored = restoreClients();
    for (const s of all<{ id: string }>('SELECT id FROM servers WHERE lab = 0')) await gateway.setMode(s.id, 'disabled');
    appendLog('danger_zone', `Zoro removed from ${restored.length} client(s); protection has ended`);
    return `restored ${restored.length} client configuration(s); protection has ended`;
  }
  if (op === 'delete_local_data') {
    for (const t of ['calls', 'incident_events', 'incidents', 'notifications', 'approvals', 'human_seals', 'baselines']) run(`DELETE FROM ${t}`);
    appendLog('danger_zone', 'Local activity data deleted (calls, incidents, approvals, notifications)');
    return 'local activity data deleted';
  }
  throw new Error('unknown danger-zone action');
}

export type Protected<T> = { status: 'done'; result: T } | { status: 'needs_confirmation'; changes: string[] } | { status: 'approval_required'; approvalId: string; humanSeal: boolean };

/** Save a policy through the protection flow (FR-P3): loosening needs confirmation, and a Human Seal where policy says so. */
export function requestPolicySave(next: Policy, note: string | null, confirmed: boolean): Protected<string> {
  const policy = validatePolicy(next);
  const loose = loosenings(policy);
  if (!loose.length) {
    savePolicy(policy, 'console', null, note);
    return { status: 'done', result: 'saved' };
  }
  if (!confirmed) return { status: 'needs_confirmation', changes: loose.map((l) => l.description) };
  const needsSeal = humanSealRequiredFor(getPolicy(), 'policy_weakening');
  if (!needsSeal) {
    savePolicy(policy, 'console', null, note);
    return { status: 'done', result: 'saved (loosening confirmed)' };
  }
  const a = createApproval({
    kind: 'policy_change',
    digest: actionDigest({ kind: 'policy_change', requestId: randomUUID(), detail: policy }),
    action: { policy, note },
    summary: `Weaken policy (${loose.length} change(s))`,
    reason: loose.map((l) => l.description).join('; '),
    humanSeal: true,
    windowSec: 3600,
  });
  return { status: 'approval_required', approvalId: a.id, humanSeal: true };
}

export async function requestModeChange(serverId: string, mode: ServerMode, confirmed: boolean): Promise<Protected<string>> {
  const row = gateway.serverRow(serverId);
  if (!row) throw new Error('server not found');
  if (!isModeLoosening(row.mode, mode)) {
    await gateway.setMode(serverId, mode);
    return { status: 'done', result: `mode set to ${mode}` };
  }
  if (!confirmed) return { status: 'needs_confirmation', changes: [`${row.name}: enforce → observe. Zoro will record but never block calls to this server.`] };
  if (!humanSealRequiredFor(getPolicy(), 'policy_weakening')) {
    await gateway.setMode(serverId, mode);
    return { status: 'done', result: `mode set to ${mode}` };
  }
  const a = createApproval({ kind: 'mode_change', digest: actionDigest({ kind: 'policy_change', requestId: randomUUID(), server: row.label, detail: { mode } }), action: { serverId, mode }, summary: `Switch ${row.name} to observe mode`, reason: 'Observe mode gives no protection for this server.', humanSeal: true, serverId, windowSec: 3600 });
  return { status: 'approval_required', approvalId: a.id, humanSeal: true };
}

const DANGER_PHRASES: Record<string, string> = { disable_protection: 'disable protection', remove_zoro: 'remove zoro', delete_local_data: 'delete local data' };

export async function requestDanger(op: string, phrase: string): Promise<Protected<string>> {
  if (!DANGER_PHRASES[op]) throw new Error('unknown action');
  if (phrase.trim().toLowerCase() !== DANGER_PHRASES[op]) return { status: 'needs_confirmation', changes: [`Type “${DANGER_PHRASES[op]}” to confirm.`] };
  if (!isWorldConfigured()) return { status: 'done', result: await runDanger(op) };
  const a = createApproval({ kind: 'danger_zone', digest: actionDigest({ kind: 'danger_zone', requestId: randomUUID(), detail: { op } }), action: { op }, summary: `Danger zone: ${DANGER_PHRASES[op]}`, reason: 'Danger-zone actions require a Human Seal when World ID is configured.', humanSeal: true, windowSec: 900 });
  return { status: 'approval_required', approvalId: a.id, humanSeal: true };
}

/** Offer a one-time override of a blocked call, bound to that exact action; always requires a Human Seal (§4.9). */
export function requestOverride(input: { incidentId: string; digest: string; action: unknown; summary: string; serverId: string | null; tool: string | null; fingerprint: string | null; lab: boolean }) {
  return createApproval({
    kind: 'override',
    digest: input.digest,
    action: input.action,
    summary: `Override block: ${input.summary}`,
    reason: 'Overriding a block lets this exact call run once. It requires a fresh Human Seal and is recorded.',
    humanSeal: true,
    serverId: input.serverId,
    tool: input.tool,
    fingerprint: input.fingerprint,
    incidentId: input.incidentId,
    lab: input.lab,
  });
}
