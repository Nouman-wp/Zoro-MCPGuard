import type { Decision, ServerMode } from '../types';
import { evaluateCall } from './engine';
import type { CallContext, Policy, Rule, ShieldAction } from './types';

const D: Record<Decision, number> = { allow: 0, ask: 1, block: 2 };
const SH: Record<ShieldAction, number> = { pass: 0, annotate: 1, redact: 2, block: 3 };
const PROFILE: Record<Policy['profile'], number> = { lab: 0, standard: 1, strict: 2 };
const AR = (v: 'auto' | 'ask') => (v === 'ask' ? 1 : 0);

export interface LooseningChange {
  ruleId: string;
  description: string;
}

/** Every change that makes protection weaker. Saving any of them is a protected action (§4.8, FR-P3). */
export function findLoosening(before: Policy, after: Policy): LooseningChange[] {
  const out: LooseningChange[] = [];
  if (PROFILE[after.profile] < PROFILE[before.profile]) out.push({ ruleId: 'profile', description: `Profile lowered from ${before.profile} to ${after.profile}` });
  const afterById = new Map(after.rules.map((r) => [r.id, r]));
  for (const old of before.rules) {
    const now = afterById.get(old.id);
    if (!old.enabled) continue;
    if (!now) {
      if (isProtective(old)) out.push({ ruleId: old.id, description: `Rule “${old.id}” (${old.type.replace(/_/g, ' ')}) removed` });
      continue;
    }
    if (!now.enabled) {
      if (isProtective(old)) out.push({ ruleId: old.id, description: `Rule “${old.id}” disabled` });
      continue;
    }
    if (now.type !== old.type) {
      out.push({ ruleId: old.id, description: `Rule “${old.id}” changed type` });
      continue;
    }
    out.push(...compareRule(old, now));
  }
  return out;
}

function isProtective(r: Rule): boolean {
  switch (r.type) {
    case 'tool_permission':
      return r.action !== 'allow';
    case 'output_shield':
      return r.action !== 'pass';
    default:
      return true;
  }
}

function compareRule(a: Rule, b: Rule): LooseningChange[] {
  const out: LooseningChange[] = [];
  const push = (d: string) => out.push({ ruleId: a.id, description: d });
  const relaxed = (x: Decision, y: Decision) => D[y] < D[x];
  switch (a.type) {
    case 'verdict_handling': {
      const n = b as typeof a;
      if (relaxed(a.sealed, n.sealed)) push('Sealed tools handled more permissively');
      if (relaxed(a.sealed_with_warnings, n.sealed_with_warnings)) push(`Sealed-with-warnings tools: ${a.sealed_with_warnings} → ${n.sealed_with_warnings}`);
      break;
    }
    case 'auto_release': {
      const n = b as typeof a;
      for (const k of ['cosmetic', 'documentation', 'functional'] as const) if (AR(n[k]) < AR(a[k])) push(`${k} changes now auto-release`);
      break;
    }
    case 'tool_permission':
    case 'rate_limit':
    case 'argument_constraint':
    case 'output_shield': {
      const n = b as typeof a;
      if ('server' in a && 'server' in n && (a.server !== n.server || a.tool !== n.tool)) push(`Scope of “${a.id}” changed`);
      if (a.type === 'tool_permission' && relaxed(a.action, (n as typeof a).action)) push(`Tool permission relaxed: ${a.action} → ${(n as typeof a).action}`);
      if (a.type === 'rate_limit') {
        const m = n as typeof a;
        if (m.maxCalls > a.maxCalls || m.windowSeconds < a.windowSeconds) push('Rate limit raised');
        if (relaxed(a.action, m.action)) push('Rate limit action relaxed');
      }
      if (a.type === 'output_shield' && SH[(n as typeof a).action] < SH[a.action]) push(`Output Shield relaxed: ${a.action} → ${(n as typeof a).action}`);
      if (a.type === 'argument_constraint') {
        const m = n as typeof a;
        if (relaxed(a.action, m.action)) push('Constraint action relaxed');
        if (a.humanSeal && !m.humanSeal) push('Human Seal no longer required');
        if (a.argument !== m.argument) push('Constrained argument changed');
        const c1 = a.constraint;
        const c2 = m.constraint;
        if (c1.kind !== c2.kind) push('Constraint kind changed');
        else if (c1.kind === 'email_domain' && c2.kind === 'email_domain' && c2.domains.some((d) => !c1.domains.includes(d))) push(`Allowed domains expanded: +${c2.domains.filter((d) => !c1.domains.includes(d)).join(', ')}`);
        else if (c1.kind === 'allowlist' && c2.kind === 'allowlist' && c2.values.some((v) => !c1.values.includes(v))) push(`Allowlist expanded by ${c2.values.filter((v) => !c1.values.includes(v)).length} value(s)`);
        else if (c1.kind === 'path_prefix' && c2.kind === 'path_prefix' && c2.prefixes.some((v) => !c1.prefixes.includes(v))) push('Allowed folders expanded');
        else if (c1.kind === 'max_number' && c2.kind === 'max_number' && c2.max > c1.max) push(`Threshold raised from ${c1.max} to ${c2.max}`);
        else if (c1.kind === 'deny_pattern' && c2.kind === 'deny_pattern' && c1.pattern !== c2.pattern) push('Deny pattern changed');
      }
      break;
    }
    case 'agent_rule': {
      const n = b as typeof a;
      if (a.agent !== n.agent) push('Agent scope changed');
      if (a.denyCapabilities.some((c) => !n.denyCapabilities.includes(c))) push('Fewer capabilities denied to the agent');
      if (relaxed(a.action, n.action)) push('Agent rule action relaxed');
      break;
    }
    case 'data_flow': {
      const n = b as typeof a;
      if (relaxed(a.action, n.action)) push(`Data-flow action relaxed: ${a.action} → ${n.action}`);
      if (a.humanSeal && !n.humanSeal) push('Human Seal no longer required for this flow');
      if (a.to.some((t) => !n.to.includes(t))) push('Fewer sinks covered');
      if (a.from !== n.from) push('Flow source changed');
      break;
    }
    case 'time_window': {
      const n = b as typeof a;
      if (n.startHour < a.startHour || n.endHour > a.endHour || n.days.some((d) => !a.days.includes(d))) push('Time window widened');
      if (relaxed(a.outsideAction, n.outsideAction)) push('Outside-window action relaxed');
      if (a.capabilities.some((c) => !n.capabilities.includes(c))) push('Fewer capabilities covered');
      break;
    }
    case 'network_grace': {
      const n = b as typeof a;
      if (a.mode === 'strict' && n.mode === 'grace') push('Registry outage handling: strict → grace');
      if (a.highImpactMode === 'strict' && n.highImpactMode === 'grace') push('High-impact outage handling: strict → grace');
      if (n.graceMinutes > a.graceMinutes) push(`Grace period raised to ${n.graceMinutes} min`);
      break;
    }
    case 'human_seal': {
      const n = b as typeof a;
      const removed = a.for.filter((t) => !n.for.includes(t));
      if (removed.length) push(`Human Seal no longer required for: ${removed.join(', ').replace(/_/g, ' ')}`);
      break;
    }
    case 'high_impact_ask': {
      const n = b as typeof a;
      if (a.capabilities.some((c) => !n.capabilities.includes(c))) push('Fewer high-impact capabilities ask first');
      if (a.humanSeal && !n.humanSeal) push('Human Seal no longer required for high-impact calls');
      break;
    }
    case 'irreversible_brake': {
      const n = b as typeof a;
      if (relaxed(a.action, n.action)) push(`Irreversible actions: ${a.action} → ${n.action}`);
      if (a.humanSeal && !n.humanSeal) push('Human Seal no longer required for irreversible actions');
      if (n.cooldownSeconds < a.cooldownSeconds) push(`Irreversible-action cooldown shortened (${a.cooldownSeconds}s → ${n.cooldownSeconds}s)`);
      const added = n.exempt.filter((x) => !a.exempt.includes(x));
      if (added.length) push(`Exempted from the irreversible brake: ${added.join(', ')}`);
      break;
    }
    case 'transaction_guard': {
      const n = b as typeof a;
      if (relaxed(a.action, n.action)) push(`Risky transactions: ${a.action} → ${n.action}`);
      if (a.humanSeal && !n.humanSeal) push('Human Seal no longer required for risky transactions');
      if (n.largeAmount > a.largeAmount) push(`Large-transfer threshold raised (${a.largeAmount} → ${n.largeAmount})`);
      const before = a.knownRecipients.map((y) => y.toLowerCase());
      const added = n.knownRecipients.filter((x) => !before.includes(x.toLowerCase()));
      if (added.length) push(`New trusted recipient(s): ${added.join(', ')}`);
      break;
    }
    case 'new_power_alarm': {
      const n = b as typeof a;
      if (a.capabilities.some((c) => !n.capabilities.includes(c))) push('Fewer capabilities trigger the new-power alarm');
      if (a.humanSealFor.some((c) => !n.humanSealFor.includes(c))) push('Human Seal no longer required for some new powers');
      break;
    }
    case 'known_vulnerability': {
      const n = b as typeof a;
      const R = ['low', 'medium', 'high', 'critical'];
      if (R.indexOf(n.minSeverity) > R.indexOf(a.minSeverity)) push(`Vulnerability gate only for ${n.minSeverity}+ (was ${a.minSeverity}+)`);
      if (relaxed(a.action, n.action)) push(`Known vulnerabilities: ${a.action} → ${n.action}`);
      break;
    }
  }
  return out;
}

export function isModeLoosening(from: ServerMode, to: ServerMode) {
  return from === 'enforce' && to === 'observe';
}

export interface SimulationRecord {
  callId: string;
  ts: number;
  agent: string;
  serverName: string;
  tool: string;
  originalDecision: Decision;
  context: CallContext;
}

export interface SimulationDiff {
  callId: string;
  ts: number;
  agent: string;
  serverName: string;
  tool: string;
  before: Decision;
  after: Decision;
  ruleBefore: string | null;
  ruleAfter: string | null;
  reasonAfter: string;
}

/** Replay recorded calls against two policies and report every call whose decision would change (§5.6). */
export function simulatePolicy(records: SimulationRecord[], current: Policy, proposed: Policy) {
  const diffs: SimulationDiff[] = [];
  for (const rec of records) {
    const ctx = { ...rec.context, approvalGranted: false, overrideGranted: false };
    const a = evaluateCall(current, ctx);
    const b = evaluateCall(proposed, ctx);
    if (a.enforcedDecision !== b.enforcedDecision)
      diffs.push({ callId: rec.callId, ts: rec.ts, agent: rec.agent, serverName: rec.serverName, tool: rec.tool, before: a.enforcedDecision, after: b.enforcedDecision, ruleBefore: a.decidingRuleId, ruleAfter: b.decidingRuleId, reasonAfter: b.reason });
  }
  const group = (key: (d: SimulationDiff) => string) => {
    const m = new Map<string, number>();
    for (const d of diffs) m.set(key(d), (m.get(key(d)) ?? 0) + 1);
    return [...m.entries()].map(([k, n]) => ({ key: k, count: n })).sort((x, y) => y.count - x.count);
  };
  return {
    replayed: records.length,
    changed: diffs.length,
    diffs,
    byRule: group((d) => d.ruleAfter ?? d.ruleBefore ?? 'none'),
    byAgent: group((d) => d.agent),
    byTool: group((d) => `${d.serverName}/${d.tool}`),
  };
}
