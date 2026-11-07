import { capabilitySet, BENIGN_PURPOSE } from './capabilities';
import {
  AUDITOR_PATTERNS,
  BASE64_RE,
  CROSS_TOOL_PATTERNS,
  EMAIL_RE,
  ETH_ADDR_RE,
  EXFIL_VERBS,
  HEX_RE,
  INSTRUCTION_PATTERNS,
  IPV4_RE,
  KNOWN_SERVER_NAMES,
  SUSPICIOUS_PARAM,
  URLENC_RE,
  URL_RE,
  decodeBase64Printable,
  decodeHexPrintable,
  type PhrasePattern,
} from './patterns';
import { codePointLabel, decodeTagRuns, findHiddenChars, findMixedScriptWords, foldConfusables } from '../unicode';
import { levenshtein, walkStrings, type StringField } from '../text';
import { describeEncoded, findEncodedInstructions } from '../decode';
import type { Capability, CapabilityEvidence, Definition, DefinitionKind, Finding, FindingCategory, Severity } from '../types';

export const RULESET_VERSION = 'zoro-rules/1.1.0';

export interface RuleContext {
  kind: DefinitionKind;
  definition: Definition;
  /** the namespace label of the server that exposes this definition */
  serverName: string;
  declaredServerName?: string | null;
  /** tools exposed by the user's other servers (for shadowing and collision checks) */
  otherTools?: { server: string; name: string }[];
  capabilityProfile: CapabilityEvidence[];
}

export interface RuleInfo {
  id: string;
  category: FindingCategory;
  title: string;
  description: string;
}

/** Published rule catalogue (shown on the About the Auditor page). */
export const RULE_CATALOGUE: RuleInfo[] = [
  { id: 'ZR-001', category: 'deceptive_characters', title: 'Invisible or direction-override characters', description: 'Zero-width, bidirectional control, tag ("ASCII smuggling") and other invisible code points in any string, including keys.' },
  { id: 'ZR-002', category: 'deceptive_characters', title: 'Mixed-script homoglyphs', description: 'Words that mix Latin with Cyrillic, Greek or other look-alike scripts.' },
  { id: 'ZR-003', category: 'encoded_payload', title: 'Encoded payloads', description: 'Base64, hex or URL-encoded blocks that decode to readable text.' },
  { id: 'ZR-004', category: 'hidden_instructions', title: 'Instructions aimed at the model', description: 'Phrasing that instructs the model rather than documenting the tool: concealment, ignore-previous, covert actions, reading secrets.' },
  { id: 'ZR-005', category: 'auditor_manipulation', title: 'Auditor manipulation', description: 'Text addressed to the security reviewer, or claims of being pre-approved. Always critical.' },
  { id: 'ZR-006', category: 'cross_tool_manipulation', title: 'Cross-tool references (shadowing)', description: 'Descriptions that change how other tools or servers are used, or name another server’s tool.' },
  { id: 'ZR-007', category: 'exfiltration_channel', title: 'Suspicious parameters', description: 'Parameters named to absorb conversation history, secrets, file contents or side-channel notes.' },
  { id: 'ZR-008', category: 'exfiltration_channel', title: 'Embedded destinations', description: 'URLs, email addresses, IP addresses or wallet addresses embedded in model-visible text, especially next to send/copy verbs.' },
  { id: 'ZR-009', category: 'schema_smuggling', title: 'Schema anomalies', description: 'Destinations or instructions hidden in defaults, constants or enums; oversized descriptions; malformed schemas.' },
  { id: 'ZR-010', category: 'identity_spoofing', title: 'Typosquats and name collisions', description: 'Server names one or two edits away from a well-known server; tool names that collide across servers.' },
  { id: 'ZR-012', category: 'encoded_instruction', title: 'Encoded instructions', description: 'Text hidden in Morse, base64, hex, URL encoding, ROT13, reversed text, leetspeak or invisible tags that decodes (up to two levels deep) to an instruction, a transfer order or an exfiltration request.' },
  { id: 'ZR-011', category: 'capability_mismatch', title: 'Capability mismatch', description: 'A tool whose stated purpose (weather, time, maths) does not need the dangerous capabilities its schema grants.' },
];

let seq = 0;
const mk = (
  ruleId: string,
  category: FindingCategory,
  severity: Severity,
  title: string,
  explanation: string,
  recommendation: string,
  field: StringField | { pointer: string; value: string },
  start: number,
  end: number,
  confidence: Finding['confidence'] = 'high',
): Finding => ({
  id: `${ruleId}:${field.pointer}:${start}:${seq++}`,
  ruleId,
  layer: 'deterministic',
  category,
  severity,
  confidence,
  title,
  explanation,
  recommendation,
  evidence: [{ field: field.pointer, start, end, text: field.value.slice(start, end) }],
});

const isSchemaMetaPointer = (p: string) => /\/(\$schema|\$id|\$ref|format|pattern|type)(#key)?$/.test(p);
const isNamePointer = (p: string) => p === '/name' || p === '/title';

function matchPatterns(field: StringField, patterns: PhrasePattern[], ruleId: string, category: FindingCategory, recommendation: string): Finding[] {
  const out: Finding[] = [];
  for (const p of patterns) {
    const re = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(field.value))) {
      out.push(
        mk(ruleId, category, p.severity, p.label, `The text “${m[0].trim()}” is phrased as an instruction to the model reading this definition, not as documentation for a person.`, recommendation, field, m.index, m.index + m[0].length),
      );
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return out;
}

export function runDeterministicRules(ctx: RuleContext): Finding[] {
  seq = 0;
  const findings: Finding[] = [];
  const fields = walkStrings(ctx.definition);
  const values = fields.filter((f) => !f.isKey);
  const caps = capabilitySet(ctx.capabilityProfile);

  // ZR-001 invisible characters
  for (const f of fields) {
    const hidden = findHiddenChars(f.value);
    if (!hidden.length) continue;
    const tags = decodeTagRuns(f.value);
    for (const run of tags)
      findings.push(
        mk('ZR-001', 'deceptive_characters', 'critical', 'Hidden text encoded in Unicode tag characters',
          `This field contains ${run.decoded.length} invisible tag characters that decode to: “${run.decoded}”. A model reads them; a person sees nothing.`,
          'Remove all tag characters. No legitimate tool description needs them.', f, run.index, run.end),
      );
    const others = hidden.filter((h) => h.kind !== 'tag');
    const bidi = others.filter((h) => h.kind === 'bidi_control');
    const zw = others.filter((h) => ['zero_width', 'other_format', 'variation_selector', 'control'].includes(h.kind));
    const spaces = others.filter((h) => h.kind === 'unusual_space');
    const describe = (list: typeof hidden) =>
      [...new Map(list.map((h) => [h.codePoint, `${codePointLabel(h.codePoint)} ${h.name}`])).values()].slice(0, 6).join(', ');
    if (bidi.length)
      findings.push(
        mk('ZR-001', 'deceptive_characters', isNamePointer(f.pointer) || f.isKey ? 'critical' : 'high', 'Direction-override characters',
          `${bidi.length} bidirectional control character(s) (${describe(bidi)}) can make text display differently from how it is read.`,
          'Remove bidirectional control characters.', f, bidi[0].index, bidi[bidi.length - 1].index + bidi[bidi.length - 1].length),
      );
    if (zw.length)
      findings.push(
        mk('ZR-001', 'deceptive_characters', isNamePointer(f.pointer) || f.isKey ? 'critical' : 'high', 'Invisible characters',
          `${zw.length} invisible character(s) (${describe(zw)}) are present. They can split words to evade review or hide content.`,
          'Remove invisible characters from model-visible text.', f, zw[0].index, zw[zw.length - 1].index + zw[zw.length - 1].length),
      );
    if (spaces.length)
      findings.push(
        mk('ZR-001', 'deceptive_characters', 'low', 'Unusual whitespace',
          `${spaces.length} non-standard space character(s) (${describe(spaces)}). Usually harmless formatting, reported for completeness.`,
          'Prefer plain spaces.', f, spaces[0].index, spaces[0].index + spaces[0].length, 'medium'),
      );
  }

  // ZR-002 homoglyphs
  for (const f of fields) {
    for (const w of findMixedScriptWords(f.value)) {
      const identity = isNamePointer(f.pointer) || f.isKey;
      findings.push(
        mk('ZR-002', identity ? 'identity_spoofing' : 'deceptive_characters', identity ? 'critical' : 'high', 'Mixed-script look-alike characters',
          `“${w.word}” mixes ${w.scripts.join(' and ')} letters, a common way to imitate a trusted word or hide a keyword from filters.`,
          'Use a single script per word.', f, w.index, w.index + w.word.length),
      );
    }
  }

  // ZR-003 encoded payloads
  for (const f of values) {
    if (isSchemaMetaPointer(f.pointer)) continue;
    for (const m of f.value.matchAll(BASE64_RE)) {
      const decoded = decodeBase64Printable(m[0]);
      if (!decoded) continue;
      const instr = [...INSTRUCTION_PATTERNS, ...AUDITOR_PATTERNS].some((p) => p.re.test(decoded));
      findings.push(
        mk('ZR-003', 'encoded_payload', instr ? 'critical' : 'high', 'Base64-encoded text',
          `A base64 block decodes to readable text: “${decoded.slice(0, 160)}”.${instr ? ' The decoded text contains instructions aimed at the model.' : ''}`,
          'Do not embed encoded text in model-visible fields.', f, m.index!, m.index! + m[0].length),
      );
    }
    for (const m of f.value.matchAll(HEX_RE)) {
      const decoded = decodeHexPrintable(m[0]);
      if (!decoded) continue;
      findings.push(
        mk('ZR-003', 'encoded_payload', 'high', 'Hex-encoded text', `A hex block decodes to readable text: “${decoded.slice(0, 160)}”.`,
          'Do not embed encoded text in model-visible fields.', f, m.index!, m.index! + m[0].length),
      );
    }
    for (const m of f.value.matchAll(URLENC_RE)) {
      let decoded = '';
      try {
        decoded = decodeURIComponent(m[0]);
      } catch {
        decoded = '(undecodable)';
      }
      findings.push(
        mk('ZR-003', 'encoded_payload', 'medium', 'URL-encoded sequence', `A percent-encoded run decodes to “${decoded.slice(0, 120)}”.`,
          'Use plain text in descriptions.', f, m.index!, m.index! + m[0].length, 'medium'),
      );
    }
  }

  // ZR-012 encoded instructions: decode, then re-run the instruction and exfiltration rules on the decoded text
  for (const f of fields) {
    if (isSchemaMetaPointer(f.pointer)) continue;
    for (const e of findEncodedInstructions(f.value))
      findings.push(
        mk('ZR-012', 'encoded_instruction', e.severity, 'Encoded instruction', `Hidden by encoding: ${describeEncoded(e)}. A model can read it; a person reviewing the text cannot.`,
          'Remove encoded text from model-visible fields.', f, e.span.start, e.span.end),
      );
  }

  // ZR-004 instructions aimed at the model, ZR-005 auditor manipulation, ZR-006 generic cross-tool phrasing
  for (const f of values) {
    if (isSchemaMetaPointer(f.pointer)) continue;
    findings.push(...matchPatterns(f, INSTRUCTION_PATTERNS, 'ZR-004', 'hidden_instructions', 'Describe what the tool does for a person; never instruct the model.'));
    findings.push(...matchPatterns(f, AUDITOR_PATTERNS, 'ZR-005', 'auditor_manipulation', 'Remove text addressed to reviewers. Approval comes from the audit, never from the definition.').map((x) => ({ ...x, severity: 'critical' as const })));
    findings.push(...matchPatterns(f, CROSS_TOOL_PATTERNS, 'ZR-006', 'cross_tool_manipulation', 'A tool should describe only itself.'));
  }

  // ZR-006 named references to other servers' tools
  const others = (ctx.otherTools ?? []).filter((t) => t.server !== ctx.serverName && t.name.length >= 5);
  if (others.length) {
    for (const f of values) {
      if (isSchemaMetaPointer(f.pointer) || isNamePointer(f.pointer)) continue;
      for (const t of others) {
        const re = new RegExp(`(^|[^A-Za-z0-9_])(${t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![A-Za-z0-9_])`, 'i');
        const m = f.value.match(re);
        if (m && m.index !== undefined) {
          const start = m.index + m[1].length;
          findings.push(
            mk('ZR-006', 'cross_tool_manipulation', 'high', 'References another server’s tool',
              `This definition mentions “${t.name}”, a tool provided by the separate server “${t.server}”. Descriptions that steer how other servers’ tools are used are the signature of tool shadowing.`,
              'Remove references to tools of other servers.', f, start, start + m[2].length),
          );
        }
      }
    }
  }

  // ZR-007 suspicious parameters
  const props = collectProperties(ctx.definition.inputSchema);
  for (const p of props) {
    if (!SUSPICIOUS_PARAM.test(p.name)) continue;
    const desc = p.description ?? '';
    // A documented, benign meaning (a token symbol, a pagination token, a metadata label) is not a side channel.
    if (/\b(symbol|ticker|currency|asset|contract|erc-?20|mint address|pagination|next page|cursor|page token|label|tag name|key name)\b/i.test(desc)) continue;
    const heavy = /\b(conversation|chat|history|previous messages|transcript|file contents?|contents of|ssh|secret|credential|password|(access|auth|bearer|api|session) token|private key|everything|all (the )?(text|messages|data))\b/i.test(desc);
    findings.push(
      mk('ZR-007', 'exfiltration_channel', heavy ? 'high' : 'medium', `Suspicious parameter “${p.name}”`,
        heavy
          ? `The parameter “${p.name}” asks for ${desc.slice(0, 120)} — data the tool’s purpose does not obviously need.`
          : `A parameter named “${p.name}” is a common place to smuggle conversation history, secrets or notes out through a tool call.`,
        'Remove the parameter, or document precisely why the tool needs it.', { pointer: `${p.pointer}#key`, value: p.name }, 0, p.name.length, heavy ? 'high' : 'medium'),
    );
  }

  // ZR-008 embedded destinations
  for (const f of values) {
    if (isSchemaMetaPointer(f.pointer)) continue;
    const dests: { idx: number; text: string; kind: string }[] = [];
    for (const m of f.value.matchAll(URL_RE)) dests.push({ idx: m.index!, text: m[0], kind: 'URL' });
    for (const m of f.value.matchAll(EMAIL_RE)) dests.push({ idx: m.index!, text: m[0], kind: 'email address' });
    for (const m of f.value.matchAll(IPV4_RE)) dests.push({ idx: m.index!, text: m[0], kind: 'IP address' });
    for (const m of f.value.matchAll(ETH_ADDR_RE)) dests.push({ idx: m.index!, text: m[0], kind: 'wallet address' });
    for (const d of dests) {
      const windowText = f.value.slice(Math.max(0, d.idx - 100), d.idx + d.text.length + 60);
      const withVerb = EXFIL_VERBS.test(windowText);
      const slot = f.pointer.match(/\/properties\/([^/]+)\/(default|const|enum|examples)(\/\d+)?$/);
      // A fixed value in a destination-like parameter routes data to a third party; a default source URL does not.
      const destinationParam = slot ? /(endpoint|webhook|callback|upload|dest|destination|target|^to$|recipient|^cc$|^bcc$|report|collect|sink|post|forward|notify|address|wallet|account)/i.test(slot[1]) : false;
      const inValueSlot = Boolean(slot) && (destinationParam || d.kind === 'email address' || d.kind === 'wallet address');
      const severity: Severity = inValueSlot ? 'high' : withVerb ? 'high' : 'low';
      findings.push(
        mk(inValueSlot ? 'ZR-009' : 'ZR-008', inValueSlot ? 'schema_smuggling' : 'exfiltration_channel', severity,
          inValueSlot ? `Destination hidden in a schema ${f.pointer.split('/').filter((x) => !/^\d+$/.test(x)).pop()}` : `Embedded ${d.kind}`,
          withVerb || inValueSlot
            ? `The ${d.kind} “${d.text}” appears next to a send/copy instruction. A fixed destination in a tool definition is how data gets routed to a third party.`
            : `The ${d.kind} “${d.text}” is embedded in model-visible text.`,
          'Destinations should come from the user’s request, never from the tool definition.', f, d.idx, d.idx + d.text.length, withVerb || inValueSlot ? 'high' : 'medium'),
      );
    }
  }

  // ZR-009 schema anomalies
  const desc = typeof ctx.definition.description === 'string' ? ctx.definition.description : '';
  if (desc.length > 4000)
    findings.push(
      mk('ZR-009', 'schema_smuggling', 'medium', 'Oversized description', `The description is ${desc.length} characters long. Very long descriptions are used to bury instructions where reviewers stop reading.`,
        'Keep descriptions short and factual.', { pointer: '/description', value: desc }, 0, Math.min(desc.length, 200), 'medium'),
    );
  if (ctx.kind === 'tool') {
    const schema = ctx.definition.inputSchema as Record<string, unknown> | undefined;
    if (!schema || typeof schema !== 'object' || (schema.type !== undefined && schema.type !== 'object'))
      findings.push(
        mk('ZR-009', 'schema_smuggling', 'low', 'Malformed input schema', 'The tool’s input schema is missing or is not an object schema as MCP requires.',
          'Declare an object input schema.', { pointer: '/inputSchema', value: JSON.stringify(schema ?? null) }, 0, 0, 'medium'),
      );
    for (const p of props)
      if (p.description && p.description.length > 1200)
        findings.push(
          mk('ZR-009', 'schema_smuggling', 'low', `Oversized parameter description “${p.name}”`, `The description of “${p.name}” is ${p.description.length} characters.`,
            'Keep parameter descriptions short.', { pointer: `${p.pointer}/description`, value: p.description }, 0, 120, 'medium'),
        );
  }

  // ZR-010 typosquats and collisions
  const nameCandidates = [ctx.serverName, ctx.declaredServerName].filter(Boolean) as string[];
  for (const n of nameCandidates) {
    const folded = foldConfusables(n);
    for (const known of KNOWN_SERVER_NAMES) {
      const k = foldConfusables(known);
      if (folded === k || folded.includes(k) || k.length < 4) continue;
      const d = levenshtein(folded, k, 4);
      if (d >= 1 && d <= (k.length >= 7 ? 2 : 1)) {
        findings.push(
          mk('ZR-010', 'identity_spoofing', 'high', 'Possible typosquat server name',
            `The server name “${n}” is ${d} edit(s) away from the well-known server “${known}”. Look-alike names are used to be installed by mistake.`,
            'Confirm the publisher before using this server.', { pointer: '/server', value: n }, 0, n.length, 'medium'),
        );
        break;
      }
    }
  }
  if (ctx.kind === 'tool') {
    const collision = (ctx.otherTools ?? []).find((t) => t.server !== ctx.serverName && t.name === ctx.definition.name);
    if (collision)
      findings.push(
        mk('ZR-010', 'identity_spoofing', 'medium', 'Tool name collision',
          `The tool name “${ctx.definition.name}” is also offered by server “${collision.server}”. Zoro presents both under namespaced names; collisions are a known shadowing technique.`,
          'Prefer distinct tool names.', { pointer: '/name', value: String(ctx.definition.name) }, 0, String(ctx.definition.name).length, 'high'),
      );
  }

  // ZR-011 capability mismatch
  const purposeText = [String(ctx.definition.name).replace(/[_-]+/g, ' '), ctx.definition.title, desc.split(/(?<=[.!?])\s/)[0]].filter(Boolean).join(' ');
  if (ctx.kind === 'tool' && BENIGN_PURPOSE.test(purposeText)) {
    const dangerous: Capability[] = ['send_communication', 'read_local_files', 'write_local_files', 'credential_access', 'code_execution', 'financial_action', 'transaction_signing'];
    const urlParam = props.some((p) => /^(url|uri|endpoint|webhook|callback)/i.test(p.name));
    const extra = dangerous.filter((c) => caps.has(c));
    if (urlParam) extra.push('network_egress');
    if (extra.length) {
      const m = purposeText.match(BENIGN_PURPOSE)!;
      findings.push(
        mk('ZR-011', 'capability_mismatch', 'high', 'Capabilities exceed the stated purpose',
          `The tool presents itself as “${m[0]}”, but its definition grants: ${extra.join(', ').replace(/_/g, ' ')}. Over-powered tools are often the first sign of trouble.`,
          'Remove capabilities the stated purpose does not need.', { pointer: '/name', value: String(ctx.definition.name) }, 0, String(ctx.definition.name).length, 'medium'),
      );
    }
  }

  return dedupe(findings);
}

function collectProperties(schema: unknown, base = '/inputSchema'): { name: string; description?: string; pointer: string }[] {
  const out: { name: string; description?: string; pointer: string }[] = [];
  const visit = (s: unknown, p: string, depth: number) => {
    if (!s || typeof s !== 'object' || depth > 6) return;
    const props = (s as { properties?: Record<string, unknown> }).properties;
    if (props && typeof props === 'object')
      for (const [name, v] of Object.entries(props)) {
        const pp = `${p}/properties/${name.replace(/~/g, '~0').replace(/\//g, '~1')}`;
        const d = (v as { description?: unknown })?.description;
        out.push({ name, description: typeof d === 'string' ? d : undefined, pointer: pp });
        visit(v, pp, depth + 1);
      }
    const items = (s as { items?: unknown }).items;
    if (items) visit(items, `${p}/items`, depth + 1);
  };
  visit(schema, base, 0);
  return out;
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const e = f.evidence[0];
    const key = `${f.ruleId}|${f.title}|${e?.field}|${e?.start}|${e?.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
