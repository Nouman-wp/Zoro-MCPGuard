import { actionDigest } from '@zoro/core';
import { createApproval, registerApprovalExecutor } from './approvals';
import { appendLog } from './auditlog';
import { bus } from './bus';
import { isWorldConfigured } from './config';
import { all, getSetting, json, run, setSetting } from './db';
import { raiseIncident, setIncidentStatus } from './incidents';

/**
 * Panic button. One action freezes every agent: the gateway refuses every tool call, the Claude Code hook denies every
 * built-in tool, and pending approvals are denied. Lifting it needs a Human Seal when World ID is configured (typed
 * confirmation otherwise). An organization admin can freeze every member device at once; members cannot lift that.
 */

export interface Lockdown {
  by: string;
  at: number;
  reason: string | null;
  source: 'local' | 'org';
  orgName?: string | null;
  incidentId?: string | null;
}

let cached: Lockdown | null | undefined;

export function getLockdown(): Lockdown | null {
  if (cached === undefined) cached = json<Lockdown | null>(getSetting('lockdown'), null);
  return cached;
}

export function activateLockdown(by: string, reason: string | null, source: Lockdown['source'] = 'local', orgName: string | null = null): Lockdown {
  const current = getLockdown();
  if (current) return current;
  const at = Date.now();
  const pending = all<{ id: string }>("SELECT id FROM approvals WHERE status IN ('pending','approved')");
  run("UPDATE approvals SET status = 'denied', outcome = 'lockdown', decided_at = ?, decided_by = 'lockdown' WHERE status IN ('pending','approved')", at);
  for (const p of pending) bus.emitEvent('approval', { id: p.id, status: 'denied' });
  const incident = raiseIncident({
    type: 'lockdown',
    severity: 'critical',
    title: source === 'org' ? `Organization lockdown${orgName ? ` (${orgName})` : ''}: every agent is frozen` : 'Lockdown: every agent is frozen',
    summary: `${by} pressed the panic button at ${new Date(at).toLocaleString()}${reason ? ` — “${reason}”` : ''}. Every agent tool call and built-in tool is refused, and ${pending.length} pending approval(s) were denied.`,
    groupKey: `lockdown:${at}`,
    evidence: { by, at, reason, source, deniedApprovals: pending.map((p) => p.id) },
  });
  cached = { by, at, reason, source, orgName, incidentId: incident.id };
  setSetting('lockdown', JSON.stringify(cached));
  appendLog('lockdown', `Lockdown activated by ${by}${reason ? `: ${reason}` : ''}`, cached, incident.id);
  bus.emitEvent('lockdown', { active: true, ...cached });
  bus.emitEvent('status', { lockdown: true });
  return cached;
}

export function liftLockdown(by: string, humanSealId: string | null) {
  const current = getLockdown();
  if (!current) return null;
  cached = null;
  setSetting('lockdown', 'null');
  appendLog('lockdown', `Lockdown lifted by ${by}${humanSealId ? ' with a Human Seal' : ''}`, { by, humanSealId, since: current.at });
  if (current.incidentId) setIncidentStatus(current.incidentId, 'resolved', `Lockdown lifted by ${by}${humanSealId ? ' (Human Seal)' : ''}.`);
  bus.emitEvent('lockdown', { active: false });
  bus.emitEvent('status', { lockdown: false });
  return current;
}

export type LiftResult = { status: 'done' } | { status: 'needs_confirmation'; phrase: string } | { status: 'approval_required'; approvalId: string; humanSeal: true } | { status: 'forbidden'; error: string };

/** Lifting is protected: a Human Seal when World ID is configured, otherwise the typed phrase UNFREEZE. */
export function requestLift(by: string, phrase: string | null): LiftResult {
  const current = getLockdown();
  if (!current) return { status: 'done' };
  if (current.source === 'org') return { status: 'forbidden', error: 'This lockdown comes from your organization. Only an organization admin can lift it.' };
  if (isWorldConfigured()) {
    const a = createApproval({
      kind: 'lockdown_release',
      digest: actionDigest({ kind: 'lockdown_release', requestId: `lockdown:${current.at}`, detail: { by: current.by, at: current.at } }),
      action: { at: current.at, by: current.by },
      summary: 'Lift the lockdown and let agents use their tools again',
      reason: 'Unfreezing every agent is a protected action and needs a verified human.',
      humanSeal: true,
      windowSec: 600,
    });
    return { status: 'approval_required', approvalId: a.id, humanSeal: true };
  }
  if (phrase?.trim().toUpperCase() !== 'UNFREEZE') return { status: 'needs_confirmation', phrase: 'UNFREEZE' };
  liftLockdown(by, null);
  return { status: 'done' };
}

registerApprovalExecutor('lockdown_release', (a) => {
  liftLockdown(a.decided_by ?? 'console', null);
  return Promise.resolve('Lockdown lifted');
});
