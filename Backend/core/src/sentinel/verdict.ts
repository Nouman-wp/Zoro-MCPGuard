import { canonicalJson } from '../canonical';
import { keccakHex } from '../hash';
import { getByPointer } from '../text';
import {
  HIGH_IMPACT_CAPABILITIES,
  severityRank,
  type CapabilityEvidence,
  type Definition,
  type Finding,
  type RiskFactor,
  type Verdict,
  type VerdictPackage,
} from '../types';

export interface AiReviewOutcome {
  status: 'ok' | 'not_configured' | 'unavailable' | 'malformed' | 'uncertain' | 'refused' | 'disagreement';
  findings: Finding[];
  summary: string | null;
  configs: { id: string; model: string }[];
  reason: string | null;
}

/**
 * "Evidence or it did not happen" (§6.2): an AI finding must quote text that exists in the definition.
 * Findings whose quote cannot be located are kept for transparency but downgraded to low confidence,
 * and low-confidence findings never change a verdict.
 */
export function verifyAiEvidence(def: Definition, findings: Finding[]): Finding[] {
  return findings.map((f) => {
    const verified = f.evidence.length > 0 && f.evidence.every((e) => {
      const target = getByPointer(def, e.field);
      const hay = typeof target === 'string' ? target : JSON.stringify(def);
      const idx = e.text ? hay.indexOf(e.text) : -1;
      if (idx >= 0) {
        e.start = idx;
        e.end = idx + e.text.length;
        if (typeof target !== 'string') e.field = '/';
        return true;
      }
      return false;
    });
    return verified ? f : { ...f, confidence: 'low' as const, explanation: `${f.explanation} (Evidence could not be located in the definition; shown for transparency, not counted.)` };
  });
}

const counts = (f: Finding) => f.confidence !== 'low';

export function combineVerdict(input: {
  deterministic: Finding[];
  differential: Finding[];
  ai: AiReviewOutcome;
  detonation: Finding[];
  requireAi: boolean;
}): { verdict: Verdict; pendingReason: string | null } {
  const all = [...input.deterministic, ...input.differential, ...input.ai.findings, ...input.detonation].filter(counts);
  // FR-A2: any critical deterministic finding is unsafe, whatever the AI layer says.
  if (input.deterministic.some((f) => f.severity === 'critical')) return { verdict: 'unsafe', pendingReason: null };
  // Each layer can only make the verdict stricter.
  if (all.some((f) => severityRank(f.severity) >= severityRank('high'))) return { verdict: 'unsafe', pendingReason: null };
  // FR-A3: uncertain, malformed or unavailable AI output means pending, never sealed.
  if (input.ai.status !== 'ok' && input.requireAi) {
    const reasons: Record<AiReviewOutcome['status'], string> = {
      ok: '',
      not_configured: 'The AI semantic review layer is not configured on this auditor, so the version cannot be sealed. Configure an AI provider, or a human may approve with a Human Seal.',
      unavailable: 'The AI semantic review layer was unavailable. The audit will be retried; until then the version stays pending.',
      malformed: 'The AI review returned malformed output. Sentinel never guesses “sealed”; the version stays pending.',
      uncertain: 'The AI reviewer was not confident. The version stays pending for a human decision.',
      refused: 'The AI reviewer declined to review this definition. The version stays pending.',
      disagreement: 'Two independent review configurations disagreed on this high-impact tool. The version stays pending for a human decision.',
    };
    return { verdict: 'pending', pendingReason: `${reasons[input.ai.status]}${input.ai.reason ? ` (${input.ai.reason})` : ''}` };
  }
  if (all.some((f) => f.severity === 'medium' || f.severity === 'low')) return { verdict: 'sealed_with_warnings', pendingReason: null };
  return { verdict: 'sealed', pendingReason: null };
}

const POINTS = { critical: 45, high: 28, medium: 10, low: 3, info: 0 } as const;

export function riskScore(findings: Finding[], caps: CapabilityEvidence[], verdict: Verdict): { score: number; factors: RiskFactor[] } {
  const factors: RiskFactor[] = [];
  const high = caps.filter((c) => HIGH_IMPACT_CAPABILITIES.includes(c.capability));
  if (high.length) factors.push({ label: `High-impact capabilities: ${high.map((c) => c.capability.replace(/_/g, ' ')).join(', ')}`, points: Math.min(32, high.length * 8) });
  const other = caps.length - high.length;
  if (other > 0) factors.push({ label: `Other capabilities (${other})`, points: Math.min(10, other * 2) });
  const bySev = new Map<string, number>();
  for (const f of findings.filter(counts)) bySev.set(f.severity, (bySev.get(f.severity) ?? 0) + 1);
  for (const sev of ['critical', 'high', 'medium', 'low'] as const) {
    const n = bySev.get(sev);
    if (n) factors.push({ label: `${n} ${sev} finding(s)`, points: Math.min(90, n * POINTS[sev]) });
  }
  let score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  if (verdict === 'unsafe' && score < 70) {
    factors.push({ label: 'Unsafe verdict floor', points: 70 - score });
    score = 70;
  }
  return { score, factors };
}

/** The attested part of a verdict package: everything except mutable references and status. */
export function attestedBody(pkg: VerdictPackage): Omit<VerdictPackage, 'attestation' | 'ledgerRef' | 'badgeRef' | 'status'> {
  const { attestation: _a, ledgerRef: _l, badgeRef: _b, status: _s, ...body } = pkg;
  return body;
}

export const verdictHash = (pkg: VerdictPackage) => keccakHex(canonicalJson(attestedBody(pkg)));
export const attestationMessage = (hash: string) => `zoro-attestation/1:${hash}`;

export const VERDICT_LABELS: Record<Verdict, string> = {
  sealed: 'Sealed',
  sealed_with_warnings: 'Sealed with warnings',
  unsafe: 'Unsafe',
  pending: 'Pending',
};
