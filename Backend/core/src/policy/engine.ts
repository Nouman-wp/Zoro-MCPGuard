import { EMAIL_RE } from '../sentinel/patterns';
import { severityRank, type Decision } from '../types';
import type { ArgumentConstraint, CallContext, Evaluation, Policy, ReasonCategory, Rule, TraceEntry } from './types';

const RANK: Record<Decision, number> = { allow: 0, ask: 1, block: 2 };
const stricter = (a: Decision, b: Decision): Decision => (RANK[b] > RANK[a] ? b : a);

const matchName = (pattern: string, value: string) =>
  pattern === '*' || pattern === value || (pattern.endsWith('*') && value.startsWith(pattern.slice(0, -1)));

export function rulesOf<T extends Rule['type']>(policy: Policy, type: T): Extract<Rule, { type: T }>[] {
  return policy.rules.filter((r) => r.enabled && r.type === type) as Extract<Rule, { type: T }>[];
}

export function humanSealRequiredFor(policy: Policy, trigger: Extract<Rule, { type: 'human_seal' }>['for'][number]): boolean {
  // Overrides of a block always require a Human Seal (§4.9), regardless of profile.
  if (trigger === 'override') return true;
  return rulesOf(policy, 'human_seal').some((r) => r.for.includes(trigger));
}

/** Read an argument by dotted path; '*' returns every string leaf. */
export function argumentValues(args: Record<string, unknown>, path: string): string[] {
  const leaves = (v: unknown): string[] =>
    typeof v === 'string' ? [v] : typeof v === 'number' ? [String(v)] : Array.isArray(v) ? v.flatMap(leaves) : v && typeof v === 'object' ? Object.values(v).flatMap(leaves) : [];
  if (path === '*') return leaves(args);
  let cur: unknown = args;
  for (const p of path.split('.')) {
    if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[p];
    else return [];
  }
  return cur === undefined ? [] : leaves(cur);
}

export function checkConstraint(c: ArgumentConstraint, values: string[]): { ok: boolean; detail: string } {
  switch (c.kind) {
    case 'email_domain': {
      const emails = values.flatMap((v) => v.match(EMAIL_RE) ?? []);
      const bad = emails.filter((e) => !c.domains.some((d) => e.toLowerCase().endsWith('@' + d.toLowerCase().replace(/^@/, ''))));
      return bad.length ? { ok: false, detail: `recipient(s) outside allowed domains: ${bad.join(', ')}` } : { ok: true, detail: `${emails.length} address(es) within allowed domains` };
    }
    case 'allowlist': {
      const set = new Set(c.values.map((v) => v.toLowerCase()));
      const bad = values.filter((v) => !set.has(v.toLowerCase()));
      return bad.length ? { ok: false, detail: `value(s) not in allowlist: ${bad.join(', ')}` } : { ok: true, detail: 'all values in allowlist' };
    }
    case 'path_prefix': {
      const norm = (p: string) => p.replace(/\\/g, '/');
      const bad = values.filter((v) => {
        const n = norm(v);
        return n.includes('..') || !c.prefixes.some((pre) => n.startsWith(norm(pre)));
      });
      return bad.length ? { ok: false, detail: `path(s) outside allowed folders: ${bad.join(', ')}` } : { ok: true, detail: 'paths inside allowed folders' };
    }
    case 'max_number': {
      const nums = values.map(Number).filter((n) => !Number.isNaN(n));
      const bad = nums.filter((n) => n > c.max);
      return bad.length ? { ok: false, detail: `value ${bad[0]} exceeds threshold ${c.max}` } : { ok: true, detail: `within threshold ${c.max}` };
    }
    case 'deny_pattern': {
      let re: RegExp;
      try {
        re = new RegExp(c.pattern, 'i');
      } catch {
        return { ok: false, detail: 'invalid deny pattern (fails closed)' };
      }
      const bad = values.filter((v) => re.test(v));
      return bad.length ? { ok: false, detail: `value matches denied pattern /${c.pattern}/` } : { ok: true, detail: 'no denied pattern' };
    }
    case 'sql_read_only': {
      const bad = values.filter((v) => /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|replace|merge|attach|pragma|vacuum)\b/i.test(v) || /;\s*\S/.test(v.trim().replace(/;\s*$/, '')));
      return bad.length ? { ok: false, detail: 'statement is not read-only' } : { ok: true, detail: 'read-only statement' };
    }
  }
}

interface Candidate {
  decision: Decision;
  ruleId: string;
  reason: string;
  category: ReasonCategory;
  humanSeal: boolean;
}

/**
 * Evaluate one call. Order (documented in docs/POLICY.md): server mode → seal and trust chain → verdict handling →
 * tool permissions → agent rules → high-impact asks → argument constraints → rate limits → time windows → data flows.
 * The strictest outcome wins; the first rule that produced it is the deciding rule.
 */
export function evaluateCall(policy: Policy, ctx: CallContext): Evaluation {
  const trace: TraceEntry[] = [];
  const candidates: Candidate[] = [];
  let step = 0;
  const note = (ruleId: string, ruleType: TraceEntry['ruleType'], outcome: TraceEntry['outcome'], detail: string) => trace.push({ step: ++step, ruleId, ruleType, outcome, detail });
  const propose = (c: Candidate, ruleType: TraceEntry['ruleType']) => {
    candidates.push(c);
    note(c.ruleId, ruleType, c.decision, c.reason);
  };
  const highRiskSeal = humanSealRequiredFor(policy, 'high_risk_ask');

  // 0. Lockdown (panic button): checked first, and neither approvals, overrides nor observe mode lift it.
  if (ctx.lockdown) {
    note('lockdown', 'lockdown', 'block', `lockdown by ${ctx.lockdown.by}`);
    const reason = `Zoro lockdown is active (frozen by ${ctx.lockdown.by} at ${new Date(ctx.lockdown.at).toISOString()}${ctx.lockdown.reason ? `: ${ctx.lockdown.reason}` : ''}). Every agent tool call is refused until it is lifted.`;
    return { decision: 'block', enforcedDecision: 'block', decidingRuleId: 'lockdown', reason, reasonCategory: 'lockdown', humanSeal: false, observe: false, trace };
  }

  // 1. Server mode
  if (ctx.serverMode === 'disabled') propose({ decision: 'block', ruleId: 'server-mode', reason: 'The server is disabled in Zoro.', category: 'server_disabled', humanSeal: false }, 'server_mode');
  else note('server-mode', 'server_mode', 'skip', `server mode: ${ctx.serverMode}`);

  // 2. Seal and trust chain
  const s = ctx.seal;
  const grace = rulesOf(policy, 'network_grace')[0];
  const sealBlock = (reason: string, category: ReasonCategory) => propose({ decision: 'block', ruleId: 'seal', reason, category, humanSeal: true }, 'seal');
  switch (s.state) {
    case 'unknown':
      sealBlock('This tool version has no seal yet; it is quarantined until audited.', 'not_sealed');
      break;
    case 'pending':
      sealBlock(`This tool version is pending audit${s.detail ? `: ${s.detail}` : ''}.`, s.changeClass && s.changeClass !== 'new' ? 'tool_changed' : 'not_sealed');
      break;
    case 'unsafe':
      sealBlock('Sentinel marked this tool version unsafe.', 'unsafe_verdict');
      break;
    case 'revoked':
      sealBlock('The seal for this tool version was revoked.', 'revoked');
      break;
    case 'contradiction':
      sealBlock(`The registry and the ledger disagree about this version${s.detail ? ` (${s.detail})` : ''}; treated as not sealed.`, 'trust_chain_contradiction');
      break;
    case 'artifact_mismatch':
      sealBlock('The code behind this server changed while its definitions stayed the same.', 'artifact_changed');
      break;
    case 'expired':
      propose({ decision: 'ask', ruleId: 'seal', reason: 'The seal expired; a re-audit is running.', category: 'expired', humanSeal: false }, 'seal');
      break;
    default:
      note('seal', 'seal', 'skip', `valid seal (${s.state.replace(/_/g, ' ')})`);
  }
  if (s.registry === 'unreachable_stale') {
    const mode = s.highImpact ? grace?.highImpactMode ?? 'strict' : grace?.mode ?? 'strict';
    if (mode === 'strict') propose({ decision: 'block', ruleId: grace?.id ?? 'network-grace', reason: 'The registry is unreachable and the cached seal has expired (strict network grace).', category: 'registry_unreachable', humanSeal: false }, 'network_grace');
    else note(grace?.id ?? 'network-grace', 'network_grace', 'allow', 'registry unreachable; grace policy allows with a persistent warning');
  }

  // 3. Verdict handling
  for (const r of rulesOf(policy, 'verdict_handling')) {
    if (s.state === 'sealed' || s.state === 'sealed_with_warnings') {
      const d = r[s.state];
      if (d !== 'allow') propose({ decision: d, ruleId: r.id, reason: `Policy ${d === 'ask' ? 'asks before using' : 'blocks'} tools ${s.state.replace(/_/g, ' ')}.`, category: 'approval_required', humanSeal: false }, r.type);
      else note(r.id, r.type, 'allow', `${s.state.replace(/_/g, ' ')} → allow`);
    }
  }

  // 4. Tool permissions
  for (const r of rulesOf(policy, 'tool_permission')) {
    if (!matchName(r.server, ctx.serverName) || !matchName(r.tool, ctx.tool)) continue;
    if (r.action === 'allow') note(r.id, r.type, 'allow', 'tool permission: allow');
    else propose({ decision: r.action, ruleId: r.id, reason: `Policy ${r.action === 'ask' ? 'requires approval for' : 'denies'} this tool.`, category: r.action === 'ask' ? 'approval_required' : 'policy_denied', humanSeal: false }, r.type);
  }

  // 5. Agent rules
  for (const r of rulesOf(policy, 'agent_rule')) {
    if (!matchName(r.agent, ctx.agent)) continue;
    const hit = ctx.capabilities.filter((c) => r.denyCapabilities.includes(c));
    if (hit.length) propose({ decision: r.action, ruleId: r.id, reason: `Agent “${ctx.agent}” may not use tools that can ${hit.join(', ').replace(/_/g, ' ')}.`, category: 'agent_restricted', humanSeal: false }, r.type);
    else note(r.id, r.type, 'skip', 'agent rule satisfied');
  }

  // 5b. New-power alarm: first use of a capability the agent gained since its last approval
  for (const r of rulesOf(policy, 'new_power_alarm')) {
    const hit = (ctx.pendingCapabilities ?? []).filter((c) => r.capabilities.includes(c));
    if (hit.length) propose({ decision: 'ask', ruleId: r.id, reason: `New power: “${ctx.agent}” gained new abilities since it was last approved (${hit.join(', ').replace(/_/g, ' ')}). Their first use needs a person’s approval.`, category: 'new_capability', humanSeal: hit.some((c) => r.humanSealFor.includes(c)) }, r.type);
  }

  // 5c. Transaction decoder: say what a sign/send call does, and ask when it is risky
  for (const r of rulesOf(policy, 'transaction_guard')) {
    const tx = ctx.transaction;
    if (!tx) continue;
    const allowlisted = tx.recipient ? r.knownRecipients.some((k) => k.toLowerCase() === tx.recipient!.toLowerCase()) : false;
    const large = tx.amountNumber !== null && tx.amountNumber > r.largeAmount;
    const risky = tx.unlimited || tx.kind === 'contract_call' || tx.kind === 'approval_for_all' || large || (!allowlisted && !tx.knownRecipient);
    if (risky) propose({ decision: r.action, ruleId: r.id, reason: `${tx.sentence}${tx.risks.length ? ` ${tx.risks.join(' ')}` : ''}`, category: 'transaction_risk', humanSeal: r.humanSeal }, r.type);
    else note(r.id, r.type, 'allow', tx.sentence);
  }

  // 5d. Undo-impossible brake
  let cooldownSeconds = 0;
  for (const r of rulesOf(policy, 'irreversible_brake')) {
    const sig = ctx.irreversible ?? [];
    if (!sig.length) continue;
    if (r.exempt.some((x) => { const [srv, tl] = x.split('/'); return matchName(srv ?? '*', ctx.serverName) && matchName(tl ?? '*', ctx.tool); })) {
      note(r.id, r.type, 'skip', 'tool exempted from the irreversible brake');
      continue;
    }
    cooldownSeconds = Math.max(cooldownSeconds, r.cooldownSeconds);
    const s0 = sig[0];
    propose({ decision: r.action, ruleId: r.id, reason: `Cannot be undone: ${s0.reason}${s0.blastRadius ? ` — ${s0.blastRadius}` : ''}. Exact action: ${s0.evidence.slice(0, 160)}`, category: 'irreversible', humanSeal: r.humanSeal }, r.type);
  }

  // 5e. Recall checker: known vulnerabilities in the server’s package
  for (const r of rulesOf(policy, 'known_vulnerability')) {
    const v = (ctx.vulnerabilities ?? []).filter((x) => severityRank(x.severity) >= severityRank(r.minSeverity));
    if (v.length) propose({ decision: r.action, ruleId: r.id, reason: `The server’s package has ${v.length} known ${r.minSeverity}+ vulnerabilit${v.length === 1 ? 'y' : 'ies'} (${v.slice(0, 3).map((x) => x.id).join(', ')})${v[0].fixed ? `; fixed in ${v[0].fixed}` : ''}.`, category: 'known_vulnerability', humanSeal: false }, r.type);
  }

  // 6. High-impact capabilities always ask
  for (const r of rulesOf(policy, 'high_impact_ask')) {
    const hit = ctx.capabilities.filter((c) => r.capabilities.includes(c));
    if (hit.length) propose({ decision: 'ask', ruleId: r.id, reason: `High-impact action (${hit.join(', ').replace(/_/g, ' ')}) requires approval.`, category: 'approval_required', humanSeal: r.humanSeal && highRiskSeal }, r.type);
  }

  // 7. Argument constraints
  for (const r of rulesOf(policy, 'argument_constraint')) {
    if (!matchName(r.server, ctx.serverName) || !matchName(r.tool, ctx.tool)) continue;
    const values = argumentValues(ctx.args, r.argument);
    if (values.length === 0) {
      note(r.id, r.type, 'skip', `argument “${r.argument}” not present`);
      continue;
    }
    const res = checkConstraint(r.constraint, values);
    if (res.ok) note(r.id, r.type, 'allow', res.detail);
    else propose({ decision: r.action, ruleId: r.id, reason: `Argument “${r.argument}”: ${res.detail}.`, category: 'argument_constraint', humanSeal: r.humanSeal }, r.type);
  }

  // 8. Rate limits
  for (const r of rulesOf(policy, 'rate_limit')) {
    if (!matchName(r.server, ctx.serverName) || !matchName(r.tool, ctx.tool)) continue;
    const since = ctx.timestamp - r.windowSeconds * 1000;
    const n = ctx.recentCalls.filter((c) => c.ts >= since && matchName(r.server, ctx.serverName) && (r.tool === '*' ? c.serverId === ctx.serverId : c.tool === ctx.tool)).length;
    if (n >= r.maxCalls) propose({ decision: r.action, ruleId: r.id, reason: `Rate limit: ${n} calls in the last ${r.windowSeconds}s (limit ${r.maxCalls}).`, category: 'rate_limited', humanSeal: false }, r.type);
    else note(r.id, r.type, 'allow', `${n}/${r.maxCalls} calls in window`);
  }

  // 9. Time windows
  for (const r of rulesOf(policy, 'time_window')) {
    if (!ctx.capabilities.some((c) => r.capabilities.includes(c))) continue;
    const d = new Date(ctx.timestamp);
    const inside = r.days.includes(d.getDay()) && d.getHours() >= r.startHour && d.getHours() < r.endHour;
    if (inside) note(r.id, r.type, 'allow', 'inside allowed time window');
    else propose({ decision: r.outsideAction, ruleId: r.id, reason: `Outside the allowed time window for high-impact tools (${r.startHour}:00–${r.endHour}:00).`, category: 'time_window', humanSeal: false }, r.type);
  }

  // 10. Data flows
  for (const r of rulesOf(policy, 'data_flow')) {
    const hits = ctx.flows.filter((f) => f.sourceLabel === r.from && f.sinkTypes.some((t) => r.to.includes(t)));
    if (hits.length) {
      const h = hits[0];
      propose({ decision: r.action, ruleId: r.id, reason: `Content from ${r.from.replace(/_/g, ' ')} source “${h.sourceTool}” appears in argument “${h.argument}” of a ${h.sinkTypes.join('/').replace(/_/g, ' ')} call.`, category: 'data_flow', humanSeal: r.humanSeal }, r.type);
    }
  }

  // Combine
  let decision: Decision = 'allow';
  for (const c of candidates) decision = stricter(decision, c.decision);
  const deciding = candidates.find((c) => c.decision === decision) ?? null;
  let humanSeal = candidates.filter((c) => c.decision === decision).some((c) => c.humanSeal);
  let final = decision;
  let reason = deciding?.reason ?? 'Valid seal, fingerprint matches, and no rule objected.';
  let category: ReasonCategory = deciding?.category ?? 'allowed';

  if (final === 'ask' && ctx.approvalGranted) {
    note('approval', 'seal', 'allow', 'approved by a person for this exact action (single use)');
    final = 'allow';
  }
  if (final === 'block' && ctx.overrideGranted) {
    note('override', 'seal', 'allow', 'block overridden with a Human Seal for this exact action (single use)');
    final = 'allow';
  }
  const enforced = final;
  const observe = ctx.serverMode === 'observe';
  if (observe && final !== 'allow') {
    note('server-mode', 'server_mode', 'allow', `observe mode: would have decided “${final}”, allowed instead`);
    final = 'allow';
  }
  if (final === 'allow' && enforced === 'allow') humanSeal = false;
  if (enforced === 'allow' && (ctx.approvalGranted || ctx.overrideGranted)) {
    reason = ctx.overrideGranted ? `Override approved with a Human Seal. Original reason: ${reason}` : `Approved by a person. Original reason: ${reason}`;
  }
  if (observe && enforced !== 'allow') reason = `Observe mode — would have ${enforced === 'block' ? 'blocked' : 'asked'}: ${reason}`;
  const cooling = enforced === 'allow' && (ctx.approvalGranted || ctx.overrideGranted) && cooldownSeconds > 0 && candidates.some((c) => c.category === 'irreversible');
  return { decision: final, enforcedDecision: enforced, decidingRuleId: deciding?.ruleId ?? null, reason, reasonCategory: category, humanSeal, observe, cooldownSeconds: cooling ? cooldownSeconds : 0, trace };
}

export function shieldActionFor(policy: Policy, serverName: string, tool: string) {
  const rules = rulesOf(policy, 'output_shield').filter((r) => matchName(r.server, serverName) && matchName(r.tool, tool));
  const specific = rules.find((r) => r.tool !== '*') ?? rules.find((r) => r.server !== '*') ?? rules[0];
  return specific?.action ?? 'annotate';
}

export function autoReleaseFor(policy: Policy, changeClass: string): 'auto' | 'ask' {
  const r = rulesOf(policy, 'auto_release')[0];
  if (!r) return 'ask';
  if (changeClass === 'cosmetic') return r.cosmetic;
  if (changeClass === 'documentation') return r.documentation;
  if (changeClass === 'functional') return r.functional;
  return 'ask';
}

/** Explain a rule in plain language (shown next to every rule in the editor). */
export function describeRule(rule: Rule): string {
  const scope = (s: string, t: string) => (s === '*' && t === '*' ? 'every tool' : t === '*' ? `every tool on ${s}` : s === '*' ? `“${t}” on any server` : `“${t}” on ${s}`);
  switch (rule.type) {
    case 'verdict_handling':
      return `Sealed tools: ${rule.sealed}. Sealed-with-warnings tools: ${rule.sealed_with_warnings}. Pending, unsafe, revoked or contradicted versions are always blocked.`;
    case 'auto_release':
      return `When a quarantined version is sealed — cosmetic change: ${rule.cosmetic === 'auto' ? 'release automatically' : 'ask'}; documentation: ${rule.documentation === 'auto' ? 'release automatically' : 'ask'}; functional: ${rule.functional === 'auto' ? 'release automatically' : 'ask'}; capability expansion: always ask.`;
    case 'tool_permission':
      return `${rule.action === 'allow' ? 'Allow' : rule.action === 'ask' ? 'Ask before running' : 'Deny'} ${scope(rule.server, rule.tool)}, regardless of seal.`;
    case 'argument_constraint': {
      const c = rule.constraint;
      const what =
        c.kind === 'email_domain' ? `email addresses must be in ${c.domains.join(', ')}` :
        c.kind === 'allowlist' ? `must be one of ${c.values.length} allowlisted value(s)` :
        c.kind === 'path_prefix' ? `paths must be inside ${c.prefixes.join(', ')}` :
        c.kind === 'max_number' ? `must not exceed ${c.max}` :
        c.kind === 'deny_pattern' ? `must not match /${c.pattern}/` : 'SQL must be read-only';
      return `For ${scope(rule.server, rule.tool)}, argument “${rule.argument}”: ${what}. Otherwise ${rule.action}${rule.humanSeal ? ' (Human Seal required)' : ''}.`;
    }
    case 'rate_limit':
      return `At most ${rule.maxCalls} calls per ${rule.windowSeconds}s to ${scope(rule.server, rule.tool)}; beyond that, ${rule.action}.`;
    case 'agent_rule':
      return `Agent “${rule.agent}” may not use tools that can ${rule.denyCapabilities.join(', ').replace(/_/g, ' ')}; otherwise ${rule.action}.`;
    case 'data_flow':
      return `If content from a ${rule.from.replace(/_/g, ' ')} source reaches a ${rule.to.join(' / ').replace(/_/g, ' ')} call: ${rule.action}${rule.humanSeal ? ' with a Human Seal' : ''}.`;
    case 'time_window':
      return `Tools that can ${rule.capabilities.join(', ').replace(/_/g, ' ')} run without asking only ${rule.startHour}:00–${rule.endHour}:00 on days ${rule.days.join(',')}; otherwise ${rule.outsideAction}.`;
    case 'network_grace':
      return `If the registry is unreachable after the cache expires: ${rule.mode === 'strict' ? 'block' : `allow with a warning for up to ${rule.graceMinutes} min`}; high-impact tools: ${rule.highImpactMode === 'strict' ? 'block' : 'allow with warning'}.`;
    case 'human_seal':
      return `A Human Seal (World ID) is required for: ${rule.for.join(', ').replace(/_/g, ' ')}.`;
    case 'output_shield':
      return `Output Shield for ${scope(rule.server, rule.tool)}: ${rule.action} suspicious content in results.`;
    case 'high_impact_ask':
      return `Calls to tools that can ${rule.capabilities.join(', ').replace(/_/g, ' ')} always ask first${rule.humanSeal ? ', with a Human Seal' : ''}.`;
    case 'irreversible_brake':
      return `Actions that cannot be undone (deletes, drops, wipes, force-pushes, transfers) ${rule.action === 'block' ? 'are blocked' : 'always ask first'}${rule.humanSeal ? ', with a Human Seal' : ''}${rule.cooldownSeconds ? `, then wait ${rule.cooldownSeconds}s before running` : ''}.${rule.exempt.length ? ` Exempt: ${rule.exempt.join(', ')}.` : ''}`;
    case 'transaction_guard':
      return `Sign/send calls are decoded into plain words; unlimited approvals, unknown contracts, unknown recipients and amounts over ${rule.largeAmount}: ${rule.action}${rule.humanSeal ? ' with a Human Seal' : ''}.${rule.knownRecipients.length ? ` ${rule.knownRecipients.length} trusted recipient(s).` : ''}`;
    case 'new_power_alarm':
      return `When an agent gains a new ability (${rule.capabilities.join(', ').replace(/_/g, ' ')}), its first use asks${rule.humanSealFor.length ? `; ${rule.humanSealFor.join(', ').replace(/_/g, ' ')} need a Human Seal` : ''}.`;
    case 'known_vulnerability':
      return `Servers whose package has a known ${rule.minSeverity}+ vulnerability: ${rule.action}.`;
  }
}
