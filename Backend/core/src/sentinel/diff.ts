import { capabilitySet } from './capabilities';
import { diffWords, flatten, levenshtein, type DiffOp } from '../text';
import { findHiddenChars } from '../unicode';
import { HIGH_IMPACT_CAPABILITIES, severityRank, type CapabilityEvidence, type ChangeClass, type Definition, type Finding } from '../types';

export interface FieldDiff {
  pointer: string;
  op: 'added' | 'removed' | 'changed';
  before: string | null;
  after: string | null;
  words?: DiffOp[];
}

export function diffDefinitions(before: Definition | null, after: Definition | null): FieldDiff[] {
  const a = before ? flatten(before) : new Map<string, string>();
  const b = after ? flatten(after) : new Map<string, string>();
  const out: FieldDiff[] = [];
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  const order = (p: string) => (p === '/name' ? 0 : p === '/title' ? 1 : p === '/description' ? 2 : p.startsWith('/inputSchema') ? 3 : p.startsWith('/outputSchema') ? 4 : 5);
  keys.sort((x, y) => order(x) - order(y) || (x < y ? -1 : 1));
  for (const k of keys) {
    const va = a.get(k);
    const vb = b.get(k);
    if (va === vb) continue;
    if (va === undefined) out.push({ pointer: k, op: 'added', before: null, after: vb! });
    else if (vb === undefined) out.push({ pointer: k, op: 'removed', before: va, after: null });
    else out.push({ pointer: k, op: 'changed', before: va, after: vb, words: diffWords(va, vb) });
  }
  return out;
}

const normalizeCosmetic = (s: string) => s.toLowerCase().replace(/[\s\p{P}]+/gu, '');

export interface DifferentialResult {
  changeClass: ChangeClass;
  fields: FieldDiff[];
  addedCapabilities: string[];
  removedCapabilities: string[];
  findings: Finding[];
  summary: string;
}

/**
 * Layer 2: compare a new version with the previous sealed one. Classifies the change and raises findings
 * for capability expansion and new parameters. Deterministic findings that only exist in the new version
 * are passed in so a change that introduces a high-severity issue is classified as suspicious.
 */
export function differentialAnalysis(
  previous: Definition | null,
  next: Definition,
  prevCaps: CapabilityEvidence[] | null,
  nextCaps: CapabilityEvidence[],
  introducedFindings: Finding[],
): DifferentialResult {
  if (!previous) {
    return { changeClass: 'new', fields: diffDefinitions(null, next), addedCapabilities: nextCaps.map((c) => c.capability), removedCapabilities: [], findings: [], summary: 'First version seen of this definition; there is no earlier sealed version to compare with.' };
  }
  const fields = diffDefinitions(previous, next);
  const before = capabilitySet(prevCaps ?? []);
  const after = capabilitySet(nextCaps);
  const added = [...after].filter((c) => !before.has(c));
  const removed = [...before].filter((c) => !after.has(c));
  const findings: Finding[] = [];
  let n = 0;

  for (const c of added) {
    const high = HIGH_IMPACT_CAPABILITIES.includes(c);
    const ev = nextCaps.find((x) => x.capability === c)!;
    findings.push({
      id: `ZD-001:${c}:${n++}`,
      ruleId: 'ZD-001',
      layer: 'differential',
      category: 'capability_mismatch',
      severity: high ? 'medium' : 'low',
      confidence: 'medium',
      title: `New capability: ${c.replace(/_/g, ' ')}`,
      explanation: `The previous sealed version did not show this capability. Signals in the new version: ${ev.signals.join('; ')}.`,
      recommendation: high ? 'Capability expansions of high-impact tools are never auto-released; confirm the change is intended.' : 'Confirm the change is intended.',
      evidence: [{ field: '/', start: 0, end: 0, text: ev.signals.join('; ') }],
    });
  }

  const newParams = fields.filter((f) => f.op === 'added' && /^\/inputSchema(\/properties\/[^/]+)+\/type$/.test(f.pointer));
  for (const p of newParams) {
    const name = p.pointer.split('/').slice(-2)[0];
    findings.push({
      id: `ZD-002:${name}:${n++}`,
      ruleId: 'ZD-002',
      layer: 'differential',
      category: 'schema_smuggling',
      severity: 'low',
      confidence: 'high',
      title: `New parameter “${name}”`,
      explanation: `The input schema gained the parameter “${name}”.`,
      recommendation: 'Check that the new parameter fits the tool’s stated purpose.',
      evidence: [{ field: p.pointer.replace(/\/type$/, ''), start: 0, end: name.length, text: name }],
    });
  }

  const hiddenIntroduced = fields.some((f) => f.after && findHiddenChars(f.after).length > (f.before ? findHiddenChars(f.before).length : 0));
  const textOnly = fields.every((f) => /^\/(title|description)$/.test(f.pointer) || /\/description$/.test(f.pointer));
  const significantIntroduced = introducedFindings.some((f) => severityRank(f.severity) >= severityRank('high'));

  let changeClass: ChangeClass;
  if (significantIntroduced || hiddenIntroduced) changeClass = 'suspicious';
  else if (added.length > 0) changeClass = 'capability_expansion';
  else if (textOnly) {
    const cosmetic = fields.every((f) => {
      if (!f.before || !f.after) return false;
      const a = normalizeCosmetic(f.before);
      const b = normalizeCosmetic(f.after);
      return a === b || levenshtein(a, b, 8) <= Math.max(2, Math.floor(Math.min(a.length, b.length) * 0.02));
    });
    changeClass = cosmetic ? 'cosmetic' : 'documentation';
  } else changeClass = 'functional';

  const summaryBits: string[] = [];
  summaryBits.push(`${fields.length} field change(s)`);
  if (added.length) summaryBits.push(`new capabilities: ${added.join(', ').replace(/_/g, ' ')}`);
  if (removed.length) summaryBits.push(`removed capabilities: ${removed.join(', ').replace(/_/g, ' ')}`);
  if (newParams.length) summaryBits.push(`${newParams.length} new parameter(s)`);
  if (hiddenIntroduced) summaryBits.push('hidden characters introduced');
  return { changeClass, fields, addedCapabilities: added, removedCapabilities: removed, findings, summary: `Change classified as ${changeClass.replace(/_/g, ' ')}: ${summaryBits.join('; ')}.` };
}

export const CHANGE_CLASS_LABELS: Record<ChangeClass, string> = {
  new: 'New',
  cosmetic: 'Cosmetic',
  documentation: 'Documentation',
  functional: 'Functional',
  capability_expansion: 'Capability expansion',
  suspicious: 'Suspicious',
};
