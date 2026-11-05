import { CANONICALIZATION_VERSION, fingerprintDefinition } from '../canonical';
import { HIGH_IMPACT_CAPABILITIES, type AuditorConfig, type CapabilityEvidence, type Definition, type DefinitionKind, type Finding, type VerdictPackage } from '../types';
import { inferCapabilities } from './capabilities';
import { differentialAnalysis, type DifferentialResult } from './diff';
import { runDeterministicRules } from './rules';
import { combineVerdict, riskScore, type AiReviewOutcome } from './verdict';

export interface AuditInput {
  kind: DefinitionKind;
  definition: Definition;
  previous: { definition: Definition; fingerprint: string } | null;
  serverName: string;
  declaredServerName: string | null;
  declaredServerVersion: string | null;
  artifactId: string | null;
  transport: string;
  manifestRoot: string | null;
  otherTools: { server: string; name: string }[];
  lab: boolean;
}

export interface StaticLayers {
  fingerprint: string;
  capabilityProfile: CapabilityEvidence[];
  deterministic: Finding[];
  differential: DifferentialResult;
  highImpact: boolean;
}

const findingKey = (f: Finding) => `${f.ruleId}|${f.title}|${f.evidence.map((e) => e.text).join('|')}`;

/** Layers 1 and 2: deterministic and differential. Pure and reproducible by any third party (FR-A8). */
export function runStaticLayers(input: AuditInput): StaticLayers {
  const capabilityProfile = inferCapabilities(input.definition);
  const ctx = { kind: input.kind, serverName: input.serverName, declaredServerName: input.declaredServerName, otherTools: input.otherTools };
  const deterministic = runDeterministicRules({ ...ctx, definition: input.definition, capabilityProfile });
  let introduced = deterministic;
  let prevCaps: CapabilityEvidence[] | null = null;
  if (input.previous) {
    prevCaps = inferCapabilities(input.previous.definition);
    const prevKeys = new Set(runDeterministicRules({ ...ctx, definition: input.previous.definition, capabilityProfile: prevCaps }).map(findingKey));
    introduced = deterministic.filter((f) => !prevKeys.has(findingKey(f)));
  }
  const differential = differentialAnalysis(input.previous?.definition ?? null, input.definition, prevCaps, capabilityProfile, introduced);
  return {
    fingerprint: fingerprintDefinition(input.kind, input.definition),
    capabilityProfile,
    deterministic,
    differential,
    highImpact: capabilityProfile.some((c) => HIGH_IMPACT_CAPABILITIES.includes(c.capability)),
  };
}

export interface AssembleOptions {
  ai: AiReviewOutcome;
  detonation: Finding[];
  auditorConfig: AuditorConfig;
  requireAi: boolean;
  sealLifetimeDays: number;
  now?: Date;
}

/** Combine every layer into an unsigned verdict package (attestation is added by the auditor). */
export function assembleVerdictPackage(input: AuditInput, layers: StaticLayers, opts: AssembleOptions): VerdictPackage {
  const { verdict, pendingReason } = combineVerdict({
    deterministic: layers.deterministic,
    differential: layers.differential.findings,
    ai: opts.ai,
    detonation: opts.detonation,
    requireAi: opts.requireAi,
  });
  const findings = [...layers.deterministic, ...layers.differential.findings, ...opts.ai.findings, ...opts.detonation];
  const risk = riskScore(findings, layers.capabilityProfile, verdict);
  const now = opts.now ?? new Date();
  // High-impact tools get a shorter seal lifetime (Appendix D).
  const days = layers.highImpact ? Math.max(1, Math.round(opts.sealLifetimeDays / 2)) : opts.sealLifetimeDays;
  return {
    version: 1,
    kind: input.kind,
    name: input.definition.name,
    fingerprint: layers.fingerprint,
    manifestRoot: input.manifestRoot,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    serverIdentity: {
      namespace: input.serverName,
      declaredName: input.declaredServerName,
      declaredVersion: input.declaredServerVersion,
      artifactId: input.artifactId,
      transport: input.transport,
    },
    verdict,
    riskScore: risk.score,
    riskFactors: risk.factors,
    capabilityProfile: layers.capabilityProfile,
    changeClass: layers.differential.changeClass,
    previousFingerprint: input.previous?.fingerprint ?? null,
    findings,
    auditorConfig: opts.auditorConfig,
    aiSummary: opts.ai.summary,
    pendingReason,
    lab: input.lab,
    auditedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
  };
}
