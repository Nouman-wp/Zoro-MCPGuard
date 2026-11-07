import type { Capability, ChangeClass, Decision, ServerMode, Severity, SinkType, SourceLabel } from '../types';
import type { IrreversibleSignal } from '../irreversible';
import type { DecodedTransaction } from '../tx';

export type ProfileId = 'standard' | 'strict' | 'lab';

interface RuleBase {
  id: string;
  enabled: boolean;
  note?: string;
}

export type ArgumentConstraint =
  | { kind: 'email_domain'; domains: string[] }
  | { kind: 'allowlist'; values: string[] }
  | { kind: 'path_prefix'; prefixes: string[] }
  | { kind: 'max_number'; max: number }
  | { kind: 'deny_pattern'; pattern: string }
  | { kind: 'sql_read_only' };

export type ShieldAction = 'pass' | 'annotate' | 'redact' | 'block';
export type HumanSealTrigger = 'override' | 'high_risk_ask' | 'policy_weakening' | 'capability_expansion_release' | 'namespace_claim' | 'dispute';

export type Rule =
  | (RuleBase & { type: 'verdict_handling'; sealed: Decision; sealed_with_warnings: Decision })
  | (RuleBase & { type: 'auto_release'; cosmetic: 'auto' | 'ask'; documentation: 'auto' | 'ask'; functional: 'auto' | 'ask'; capability_expansion: 'ask' })
  | (RuleBase & { type: 'tool_permission'; server: string | '*'; tool: string | '*'; action: Decision })
  | (RuleBase & { type: 'argument_constraint'; server: string | '*'; tool: string | '*'; argument: string; constraint: ArgumentConstraint; action: 'ask' | 'block'; humanSeal: boolean })
  | (RuleBase & { type: 'rate_limit'; server: string | '*'; tool: string | '*'; maxCalls: number; windowSeconds: number; action: 'ask' | 'block' })
  | (RuleBase & { type: 'agent_rule'; agent: string; denyCapabilities: Capability[]; action: 'ask' | 'block' })
  | (RuleBase & { type: 'data_flow'; from: Exclude<SourceLabel, 'neutral'>; to: SinkType[]; action: 'ask' | 'block'; humanSeal: boolean })
  | (RuleBase & { type: 'time_window'; capabilities: Capability[]; days: number[]; startHour: number; endHour: number; outsideAction: 'ask' | 'block' })
  | (RuleBase & { type: 'network_grace'; mode: 'strict' | 'grace'; highImpactMode: 'strict' | 'grace'; graceMinutes: number })
  | (RuleBase & { type: 'human_seal'; for: HumanSealTrigger[] })
  | (RuleBase & { type: 'output_shield'; server: string | '*'; tool: string | '*'; action: ShieldAction })
  | (RuleBase & { type: 'high_impact_ask'; capabilities: Capability[]; humanSeal: boolean })
  /** Undo-impossible brake: irreversible actions always need a person’s yes. `exempt` holds "server/tool" (or "server/*"). */
  | (RuleBase & { type: 'irreversible_brake'; action: 'ask' | 'block'; humanSeal: boolean; cooldownSeconds: number; exempt: string[] })
  /** Transaction decoder: risky sign/send calls (unlimited approvals, unknown recipients, large amounts) ask first. */
  | (RuleBase & { type: 'transaction_guard'; largeAmount: number; knownRecipients: string[]; action: 'ask' | 'block'; humanSeal: boolean })
  /** New-power alarm: the first use of a capability an agent did not have when last approved needs approval. */
  | (RuleBase & { type: 'new_power_alarm'; capabilities: Capability[]; humanSealFor: Capability[] })
  /** Recall checker: servers whose package has a known vulnerability at or above minSeverity. */
  | (RuleBase & { type: 'known_vulnerability'; minSeverity: Exclude<Severity, 'info'>; action: 'ask' | 'block' });

export type RuleType = Rule['type'];

export interface Policy {
  version: 1;
  profile: ProfileId;
  rules: Rule[];
}

export type SealState =
  | 'sealed'
  | 'sealed_with_warnings'
  | 'pending'
  | 'unsafe'
  | 'revoked'
  | 'expired'
  | 'contradiction'
  | 'unknown'
  | 'artifact_mismatch';

export type RegistryState = 'confirmed' | 'pending' | 'not_configured' | 'unreachable_cached' | 'unreachable_stale';

export interface FlowMatch {
  sourceCallId: string;
  sourceTool: string;
  sourceServer: string;
  sourceLabel: SourceLabel;
  sinkTypes: SinkType[];
  matched: string;
  matchKind: 'exact' | 'identifier' | 'fuzzy';
  argument: string;
}

export interface CallContext {
  agent: string;
  serverId: string;
  serverName: string;
  serverMode: ServerMode;
  tool: string;
  fingerprint: string | null;
  seal: { state: SealState; changeClass?: ChangeClass | null; registry: RegistryState; detail?: string; highImpact: boolean };
  capabilities: Capability[];
  args: Record<string, unknown>;
  timestamp: number;
  recentCalls: { serverId: string; tool: string; ts: number }[];
  flows: FlowMatch[];
  approvalGranted?: boolean;
  overrideGranted?: boolean;
  /** irreversible-action signals for this exact call (definition and arguments) */
  irreversible?: IrreversibleSignal[];
  /** the decoded transaction, when this is a sign/send call */
  transaction?: DecodedTransaction | null;
  /** capabilities of this tool that the agent gained since its last approval */
  pendingCapabilities?: Capability[];
  /** known vulnerabilities in the server’s package */
  vulnerabilities?: { id: string; severity: Severity; fixed?: string | null }[];
  /** global lockdown (panic button) */
  lockdown?: { by: string; at: number; reason: string | null } | null;
}

export type ReasonCategory =
  | 'allowed'
  | 'server_disabled'
  | 'not_sealed'
  | 'tool_changed'
  | 'unsafe_verdict'
  | 'revoked'
  | 'expired'
  | 'trust_chain_contradiction'
  | 'artifact_changed'
  | 'registry_unreachable'
  | 'policy_denied'
  | 'approval_required'
  | 'argument_constraint'
  | 'rate_limited'
  | 'agent_restricted'
  | 'data_flow'
  | 'time_window'
  | 'irreversible'
  | 'transaction_risk'
  | 'new_capability'
  | 'known_vulnerability'
  | 'lockdown';

export interface TraceEntry {
  step: number;
  ruleId: string;
  ruleType: RuleType | 'server_mode' | 'seal' | 'lockdown';
  outcome: Decision | 'skip';
  detail: string;
}

export interface Evaluation {
  decision: Decision;
  /** what Enforce mode would have decided (equals decision except in observe mode) */
  enforcedDecision: Decision;
  decidingRuleId: string | null;
  reason: string;
  reasonCategory: ReasonCategory;
  humanSeal: boolean;
  observe: boolean;
  /** seconds to wait, visibly, after approval before an irreversible action runs */
  cooldownSeconds?: number;
  trace: TraceEntry[];
}
