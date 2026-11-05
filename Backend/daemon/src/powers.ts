import { CAPABILITY_LABELS, rulesOf, type Capability } from '@zoro/core';
import { appendLog } from './auditlog';
import { bus } from './bus';
import { all, run } from './db';
import { raiseIncident } from './incidents';
import { policyFor } from './policy';

/**
 * New-power alarm. Zoro remembers what each agent could do when it was last approved. When a tool update or a new
 * server gives the agent a high-impact ability it did not have (send money, send messages, delete, run code), the
 * ability is "pending power": an incident says so, and its first use goes through Approvals (World ID for money).
 */

export interface PowerRow {
  agent: string;
  capability: Capability;
  state: 'approved' | 'pending';
  baseline: number;
  first_seen: number;
  approved_at: number | null;
  approval_id: string | null;
  lab: number;
}

const watched = (lab: boolean): Set<Capability> => new Set(rulesOf(policyFor(lab), 'new_power_alarm').flatMap((r) => r.capabilities));

/**
 * Record the agent's current abilities. The first time an agent is seen, everything it can do is its approved
 * baseline. After that, any newly watched ability is pending until a person approves its first use.
 */
export function syncAgentPowers(agent: string, lab: boolean, caps: Capability[]): Capability[] {
  const w = watched(lab);
  const now = Date.now();
  const known = new Map(all<PowerRow>('SELECT * FROM agent_powers WHERE agent = ?', agent).map((r) => [r.capability, r]));
  if (known.size === 0) {
    for (const c of new Set(caps)) run('INSERT OR IGNORE INTO agent_powers(agent, capability, state, baseline, first_seen, approved_at, lab) VALUES(?,?,?,?,?,?,?)', agent, c, 'approved', 1, now, now, lab);
    // An agent with no high-impact abilities still gets a baseline row, so later additions are recognized as new.
    if (!caps.length) run('INSERT OR IGNORE INTO agent_powers(agent, capability, state, baseline, first_seen, approved_at, lab) VALUES(?,?,?,?,?,?,?)', agent, '_baseline', 'approved', 1, now, now, lab);
    return [];
  }
  const gained: Capability[] = [];
  for (const c of new Set(caps)) {
    if (known.has(c)) continue;
    const pending = w.has(c);
    run('INSERT OR IGNORE INTO agent_powers(agent, capability, state, baseline, first_seen, approved_at, lab) VALUES(?,?,?,?,?,?,?)', agent, c, pending ? 'pending' : 'approved', 0, now, pending ? null : now, lab);
    if (pending) gained.push(c);
  }
  if (gained.length) {
    const money = gained.some((c) => c === 'financial_action' || c === 'transaction_signing');
    raiseIncident({
      type: 'new_power',
      severity: money ? 'high' : 'medium',
      title: `New power: ${agent} gained ${gained.map((c) => CAPABILITY_LABELS[c].toLowerCase()).join(' and ')}`,
      summary: `Since it was last approved, “${agent}” gained ${gained.length} high-impact abilit${gained.length === 1 ? 'y' : 'ies'}. The first use of each needs a person’s approval${money ? ', with a World ID Human Seal for money' : ''}.`,
      groupKey: `power:${agent}:${gained.sort().join(',')}`,
      evidence: { agent, gained },
      lab,
    });
    appendLog('config_change', `New power for ${agent}: ${gained.join(', ')}`, { agent, gained }, agent, lab);
    bus.emitEvent('power', { agent, gained });
  }
  return gained;
}

export const pendingPowersFor = (agent: string, caps: Capability[]): Capability[] => {
  if (!caps.length) return [];
  const pending = new Set(all<{ capability: Capability }>("SELECT capability FROM agent_powers WHERE agent = ? AND state = 'pending'", agent).map((r) => r.capability));
  return caps.filter((c) => pending.has(c));
};

/** The first approved use of a pending power makes it part of the agent's approved abilities. */
export function approvePowers(agent: string, caps: Capability[], approvalId: string | null) {
  if (!caps.length) return;
  const now = Date.now();
  for (const c of caps) run("UPDATE agent_powers SET state = 'approved', approved_at = ?, approval_id = ? WHERE agent = ? AND capability = ? AND state = 'pending'", now, approvalId, agent, c);
  appendLog('approval', `New power approved for ${agent}: ${caps.join(', ')}`, { agent, caps, approvalId }, approvalId);
  bus.emitEvent('power', { agent, approved: caps });
}

export function agentPowers(agent: string) {
  return all<PowerRow>("SELECT * FROM agent_powers WHERE agent = ? AND capability != '_baseline' ORDER BY baseline DESC, first_seen", agent);
}

export const resetLabPowers = () => run("DELETE FROM agent_powers WHERE lab = 1 OR agent = 'lab-demo-agent'");
