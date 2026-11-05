import { findEncodedInstructions, describeEncoded } from './decode';
import { sha256Hex } from './hash';
import { analyzeShellCommand } from './irreversible';
import { inferCapabilities } from './sentinel/capabilities';
import { runDeterministicRules } from './sentinel/rules';
import type { Finding, Severity } from './types';

/**
 * Skills, plugins, custom agents and slash commands are instructions the agent will follow. Adding one is like
 * installing a tool, so Zoro scans it first. Skill text is *meant* to instruct the model, so ordinary imperatives are
 * fine; what is never fine is concealment, covert copying, reading secrets, addressing the reviewer, hidden characters,
 * encoded instructions and download-and-execute commands.
 */

export const SKILL_PATH = /(^|[\\/])\.claude[\\/](skills|agents|commands|plugins|output-styles)([\\/]|$)|(^|[\\/])\.cursor[\\/]rules([\\/]|$)|(^|[\\/])\.agents?[\\/]skills([\\/]|$)/i;

export const isSkillPath = (p: string) => SKILL_PATH.test(p.replace(/\\/g, '/'));

/** The skill's name: the folder under skills/ (or the file name for commands and agents). */
export function skillNameFromPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  const i = parts.findIndex((x) => /^(skills|agents|commands|plugins|rules|output-styles)$/i.test(x));
  const next = i >= 0 ? parts[i + 1] : parts[parts.length - 1];
  return (next ?? parts[parts.length - 1]).replace(/\.(md|mdc|json)$/i, '');
}

export interface SkillFinding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  evidence: string;
}

export interface SkillScan {
  name: string;
  fingerprint: string;
  verdict: 'clean' | 'warning' | 'unsafe';
  findings: SkillFinding[];
}

/** Instruction patterns that are dangerous even in text that is meant to instruct the model. */
const DANGEROUS_INSTRUCTION = /hide something|covert|copy or forward|fixed destination|secrets or credentials|routes data|ignore its instructions/i;

export function scanSkill(name: string, content: string): SkillScan {
  const findings: SkillFinding[] = [];
  const def = { name: name.replace(/[^\w.-]+/g, '_') || 'skill', description: content };
  const raw: Finding[] = runDeterministicRules({ kind: 'prompt', definition: def, serverName: 'skill', capabilityProfile: inferCapabilities(def) });
  for (const f of raw) {
    const keep =
      f.ruleId === 'ZR-001' && f.severity !== 'low' ||
      f.ruleId === 'ZR-002' ||
      f.ruleId === 'ZR-005' ||
      (f.ruleId === 'ZR-003' && f.severity === 'critical') ||
      (f.ruleId === 'ZR-004' && f.severity === 'critical' && DANGEROUS_INSTRUCTION.test(f.title)) ||
      (f.ruleId === 'ZR-008' && f.severity === 'high');
    if (keep) findings.push({ id: f.ruleId, severity: f.severity, title: f.title, detail: f.explanation, evidence: f.evidence[0]?.text ?? '' });
  }
  for (const e of findEncodedInstructions(content))
    findings.push({ id: 'ZR-012', severity: e.severity, title: 'Encoded instruction', detail: describeEncoded(e), evidence: e.span.original.slice(0, 200) });
  const sh = analyzeShellCommand(content);
  for (const p of sh.pipeToShell) findings.push({ id: 'SK-001', severity: 'high', title: 'Downloads and runs code', detail: 'The skill pipes a download straight into a shell. Whatever the server returns at that moment will run on this machine.', evidence: p });
  for (const s of sh.irreversible) findings.push({ id: 'SK-002', severity: 'medium', title: `Destructive command: ${s.reason}`, detail: 'The skill contains a command that cannot be undone. Zoro will still ask before it runs.', evidence: s.evidence.slice(0, 200) });
  const verdict = findings.some((f) => f.severity === 'critical' || f.severity === 'high') ? 'unsafe' : findings.some((f) => f.severity === 'medium') ? 'warning' : 'clean';
  return { name, fingerprint: sha256Hex(content), verdict, findings };
}
