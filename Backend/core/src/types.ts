// Shared vocabulary (ProjectGuide §3.1, Appendix A). Every package speaks these types.

export type DefinitionKind = 'tool' | 'prompt' | 'resource_template';

/** A model-visible definition exactly as an upstream server sent it. Every field is covered by the fingerprint. */
export type Definition = Record<string, unknown> & { name: string };

export type Verdict = 'sealed' | 'sealed_with_warnings' | 'unsafe' | 'pending';
export type SealStatus = 'active' | 'superseded' | 'revoked' | 'expired' | 'disputed';
export type Decision = 'allow' | 'ask' | 'block';
export type ServerMode = 'enforce' | 'observe' | 'disabled';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Confidence = 'high' | 'medium' | 'low';
export type AuditLayer = 'deterministic' | 'differential' | 'ai' | 'detonation';

export const SEVERITY_ORDER: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];
export const severityRank = (s: Severity) => SEVERITY_ORDER.indexOf(s);
export const maxSeverity = (list: Severity[]): Severity | null =>
  list.length === 0 ? null : list.reduce((a, b) => (severityRank(b) > severityRank(a) ? b : a));

export type FindingCategory =
  | 'hidden_instructions'
  | 'deceptive_characters'
  | 'encoded_payload'
  | 'cross_tool_manipulation'
  | 'exfiltration_channel'
  | 'capability_mismatch'
  | 'schema_smuggling'
  | 'identity_spoofing'
  | 'auditor_manipulation'
  | 'artifact_mismatch'
  | 'behavioral_anomaly'
  | 'output_injection'
  | 'encoded_instruction';

export const FINDING_CATEGORY_LABELS: Record<FindingCategory, string> = {
  hidden_instructions: 'Hidden instructions',
  deceptive_characters: 'Invisible or deceptive characters',
  encoded_payload: 'Encoded payload',
  cross_tool_manipulation: 'Cross-tool manipulation (shadowing)',
  exfiltration_channel: 'Exfiltration channel',
  capability_mismatch: 'Capability mismatch',
  schema_smuggling: 'Schema smuggling',
  identity_spoofing: 'Identity spoofing',
  auditor_manipulation: 'Auditor manipulation',
  artifact_mismatch: 'Artifact mismatch (code changed)',
  behavioral_anomaly: 'Behavioral anomaly',
  output_injection: 'Output injection',
  encoded_instruction: 'Encoded instruction (decoded)',
};

export type Capability =
  | 'read_local_files'
  | 'write_local_files'
  | 'network_egress'
  | 'send_communication'
  | 'financial_action'
  | 'transaction_signing'
  | 'code_execution'
  | 'credential_access'
  | 'database_read'
  | 'database_write'
  | 'external_content_ingestion'
  | 'irreversible_action';

export const CAPABILITY_LABELS: Record<Capability, string> = {
  read_local_files: 'Read local files',
  write_local_files: 'Write local files',
  network_egress: 'Network egress',
  send_communication: 'Send communication',
  financial_action: 'Financial action',
  transaction_signing: 'Transaction signing',
  code_execution: 'Code execution',
  credential_access: 'Credential access',
  database_read: 'Database read',
  database_write: 'Database write',
  external_content_ingestion: 'External content ingestion',
  irreversible_action: 'Irreversible action',
};

/** Capabilities that make a tool "high impact" (stricter thresholds, no silent auto-release). */
export const HIGH_IMPACT_CAPABILITIES: Capability[] = [
  'send_communication',
  'financial_action',
  'transaction_signing',
  'code_execution',
  'write_local_files',
  'credential_access',
  'database_write',
  'irreversible_action',
];

export type ChangeClass = 'new' | 'cosmetic' | 'documentation' | 'functional' | 'capability_expansion' | 'suspicious';

/** Exact evidence: a JSON pointer into the definition and a character range within that string. */
export interface EvidenceSpan {
  field: string;
  start: number;
  end: number;
  text: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  layer: AuditLayer;
  category: FindingCategory;
  severity: Severity;
  confidence: Confidence;
  title: string;
  explanation: string;
  recommendation: string;
  evidence: EvidenceSpan[];
}

export interface CapabilityEvidence {
  capability: Capability;
  signals: string[];
}

export interface RiskFactor {
  label: string;
  points: number;
}

export interface AuditorConfig {
  rulesetVersion: string;
  canonicalizationVersion: string;
  ai: null | {
    provider: string;
    configs: { id: string; model: string }[];
  };
  detonation: boolean;
}

export interface Attestation {
  scheme: 'eip191-keccak256';
  auditor: string;
  verdictHash: string;
  message: string;
  signature: string;
  signedAt: string;
  confidentialCompute: null | { provider: string; report: string };
}

/** Appendix A.1. The attestation signs everything except attestation/ledgerRef/badgeRef/status. */
export interface VerdictPackage {
  version: 1;
  kind: DefinitionKind;
  name: string;
  fingerprint: string;
  manifestRoot: string | null;
  canonicalizationVersion: string;
  serverIdentity: {
    namespace: string;
    declaredName: string | null;
    declaredVersion: string | null;
    artifactId: string | null;
    transport: string;
  };
  verdict: Verdict;
  riskScore: number;
  riskFactors: RiskFactor[];
  capabilityProfile: CapabilityEvidence[];
  changeClass: ChangeClass;
  previousFingerprint: string | null;
  findings: Finding[];
  auditorConfig: AuditorConfig;
  aiSummary: string | null;
  pendingReason: string | null;
  lab: boolean;
  auditedAt: string;
  expiresAt: string;
  attestation?: Attestation;
  ledgerRef?: string | null;
  badgeRef?: string | null;
  status?: SealStatus;
}

export type SourceLabel = 'untrusted_external' | 'private_sensitive' | 'neutral';
export type SinkType = 'external_communication' | 'external_network' | 'financial_action' | 'code_execution' | 'privileged_write';
