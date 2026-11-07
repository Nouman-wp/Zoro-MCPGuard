import {
  AUDITOR_PATTERNS,
  BASE64_RE,
  CROSS_TOOL_PATTERNS,
  HEX_RE,
  INSTRUCTION_PATTERNS,
  URLENC_RE,
  decodeBase64Printable,
  decodeHexPrintable,
  type PhrasePattern,
} from './sentinel/patterns';
import { decodeTagRuns } from './unicode';
import type { Severity } from './types';

/**
 * Secret-code decoder. Attackers hide instructions from people (and from naive filters) by encoding them: Morse,
 * base64, hex, percent-encoding, ROT13, reversed text, leetspeak or invisible Unicode tag characters. A model can often
 * read these; a reviewer cannot. Zoro decodes candidate spans (recursively, two levels by default) and re-runs its
 * instruction and exfiltration rules on the decoded text. Decoding alone never raises a finding: only decoded text that
 * says something dangerous does, which keeps real base64 data, hashes and Morse trivia from being flagged.
 */

export type Encoding = 'morse' | 'base64' | 'hex' | 'hex_bytes' | 'url' | 'rot13' | 'reversed' | 'leetspeak' | 'unicode_tags';

export const ENCODING_LABELS: Record<Encoding, string> = {
  morse: 'Morse code',
  base64: 'Base64',
  hex: 'Hex',
  hex_bytes: 'Hex bytes',
  url: 'URL encoding',
  rot13: 'ROT13',
  reversed: 'Reversed text',
  leetspeak: 'Leetspeak',
  unicode_tags: 'Invisible Unicode tags',
};

export interface DecodedSpan {
  encoding: Encoding;
  /** outermost first, e.g. ['base64', 'morse'] for Morse hidden inside base64 */
  chain: Encoding[];
  /** character range of the encoded text in the original input */
  start: number;
  end: number;
  original: string;
  decoded: string;
}

/** Actions worth catching once text is decoded, in addition to Sentinel's instruction patterns. */
export const DECODED_ACTION_PATTERNS: PhrasePattern[] = [
  { id: 'transfer-order', re: /\b(send|transfer|pay|wire|move|withdraw|approve|bridge)\b[^\n]{0,40}?\b\d[\d,.]*\s*(k|m)?\s*(eth|ether|btc|usdc|usdt|dai|sol|matic|bnb|hbar|tokens?|coins?|dollars?|usd)\b/i, severity: 'critical', label: 'Transfer order' },
  { id: 'send-to-destination', re: /\b(send|forward|upload|post|copy|email|transfer|leak|exfiltrate|pay)\b[^\n]{0,60}\b(to|into)\b\s*\S{0,12}?([\w.+-]+@[\w-]+\.[\w.-]+|https?:\/\/\S+|\b0x[0-9a-f]{40}\b|\b[\w-]+\.(eth|xyz|io|com|net|org|ru|top)\b)/i, severity: 'high', label: 'Sends data or funds to a destination' },
  { id: 'destructive-command', re: /\b(rm\s+-[a-z]*r[a-z]*f|rm\s+-[a-z]*f[a-z]*r|drop\s+(table|database|schema)|truncate\s+table|delete\s+(all|every|everything|the (database|volume|bucket|repo))|wipe (the |all )?(disk|database|volume|data))/i, severity: 'high', label: 'Destructive command' },
  { id: 'pipe-to-shell', re: /\b(curl|wget)\b[^\n|]{0,120}\|\s*(sudo\s+)?(ba|z)?sh\b/i, severity: 'high', label: 'Download-and-execute command' },
];

const ALL_PATTERNS: PhrasePattern[] = [...INSTRUCTION_PATTERNS, ...AUDITOR_PATTERNS, ...CROSS_TOOL_PATTERNS, ...DECODED_ACTION_PATTERNS];

// ---------- individual decoders ----------

const MORSE: Record<string, string> = {
  '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J', '-.-': 'K', '.-..': 'L', '--': 'M',
  '-.': 'N', '---': 'O', '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y', '--..': 'Z',
  '-----': '0', '.----': '1', '..---': '2', '...--': '3', '....-': '4', '.....': '5', '-....': '6', '--...': '7', '---..': '8', '----.': '9',
  '.-.-.-': '.', '--..--': ',', '..--..': '?', '-..-.': '/', '.--.-.': '@', '---...': ':', '-...-': '=', '-....-': '-', '.----.': "'", '-.--.': '(', '-.--.-': ')',
};

/** A run of Morse "letters" (dots and dashes) separated by spaces, with words split by "/", "|" or wider gaps. */
const MORSE_RUN = /(?<![A-Za-z0-9.-])(?:[.\-·•−–_]{1,7}(?:[ \t]+(?:[/|][ \t]+)?|[ \t]*[/|][ \t]*))+[.\-·•−–_]{1,7}/g;

export function decodeMorse(s: string): string | null {
  const norm = s.replace(/[·•]/g, '.').replace(/[−–_]/g, '-');
  const words = norm.trim().split(/\s*[/|]\s*|\s{3,}/).filter(Boolean);
  let letters = 0;
  let known = 0;
  const out = words.map((w) =>
    w.split(/\s+/).filter(Boolean).map((code) => {
      letters++;
      const ch = MORSE[code];
      if (ch) known++;
      return ch ?? '?';
    }).join(''),
  );
  if (letters < 4 || known / letters < 0.85) return null;
  const text = out.join(' ');
  return /[A-Z]{2}/.test(text) ? text : null;
}

export const rot13 = (s: string) => s.replace(/[a-z]/gi, (c) => String.fromCharCode(((c.charCodeAt(0) - (c <= 'Z' ? 65 : 97) + 13) % 26) + (c <= 'Z' ? 65 : 97)));
export const reverseText = (s: string) => [...s].reverse().join('');
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'l', '+': 't' };
export const unleet = (s: string) => s.replace(/[0134578@$!|+]/g, (c) => LEET[c] ?? c);

/** Ordinary English words; a transform that produces many more of them than the original is a decode, not noise. */
const COMMON = /\b(the|to|and|of|all|you|your|send|transfer|forward|copy|user|tell|ignore|previous|instructions?|secret|key|keys|file|files|password|wallet|funds|delete|this|that|with|from|every|never|now|must|do|not|before|after|email|address|token|tokens)\b/gi;
const wordScore = (s: string) => (s.match(COMMON) ?? []).length;

const HEX_BYTES_RE = /\b(?:[0-9a-fA-F]{2}[ :]){7,}[0-9a-fA-F]{2}\b/g;

function decodeSpans(text: string): Omit<DecodedSpan, 'chain'>[] {
  const out: Omit<DecodedSpan, 'chain'>[] = [];
  const push = (encoding: Encoding, start: number, original: string, decoded: string | null) => {
    if (decoded && decoded.trim() && decoded !== original) out.push({ encoding, start, end: start + original.length, original, decoded });
  };
  for (const m of text.matchAll(MORSE_RUN)) push('morse', m.index!, m[0], decodeMorse(m[0]));
  for (const m of text.matchAll(BASE64_RE)) push('base64', m.index!, m[0], decodeBase64Printable(m[0]));
  for (const m of text.matchAll(HEX_RE)) push('hex', m.index!, m[0], decodeHexPrintable(m[0]));
  for (const m of text.matchAll(HEX_BYTES_RE)) push('hex_bytes', m.index!, m[0], decodeHexPrintable(m[0].replace(/[ :]/g, '')));
  for (const m of text.matchAll(URLENC_RE)) {
    let d: string | null = null;
    try {
      d = decodeURIComponent(m[0]);
    } catch {
      d = null;
    }
    push('url', m.index!, m[0], d);
  }
  for (const run of decodeTagRuns(text)) push('unicode_tags', run.index, text.slice(run.index, run.end), run.decoded);
  // Whole-line transforms: only kept when they turn a line into noticeably more ordinary English.
  let pos = 0;
  for (const line of text.split('\n')) {
    const start = pos;
    pos += line.length + 1;
    if (line.trim().length < 12) continue;
    const base = wordScore(line);
    const r = rot13(line);
    if (wordScore(r) >= base + 3) push('rot13', start, line, r);
    const v = reverseText(line);
    if (wordScore(v) >= base + 3) push('reversed', start, line, v);
    if (/[a-z][0134578@$][a-z]|[0134578@$][a-z]{2}/i.test(line)) {
      const l = unleet(line);
      if (wordScore(l) >= base + 2) push('leetspeak', start, line, l);
    }
  }
  return out;
}

/** Decode every candidate span, recursing into decoded text up to `maxDepth` levels (Morse inside base64, …). */
export function decodeHidden(text: string, maxDepth = 2): DecodedSpan[] {
  const walk = (input: string, depth: number, chain: Encoding[], outer: { start: number; end: number; original: string } | null): DecodedSpan[] => {
    if (depth > maxDepth || !input) return [];
    const spans: DecodedSpan[] = [];
    for (const s of decodeSpans(input)) {
      const span: DecodedSpan = {
        encoding: s.encoding,
        chain: [...chain, s.encoding],
        start: outer ? outer.start : s.start,
        end: outer ? outer.end : s.end,
        original: outer ? outer.original : s.original,
        decoded: s.decoded,
      };
      spans.push(span);
      spans.push(...walk(s.decoded, depth + 1, span.chain, { start: span.start, end: span.end, original: span.original }));
    }
    return spans;
  };
  return walk(text, 1, [], null);
}

export interface EncodedInstruction {
  span: DecodedSpan;
  matches: { id: string; label: string; severity: Severity; text: string }[];
  severity: Severity;
}

/**
 * Decoded spans whose decoded text matches an instruction, auditor-manipulation, shadowing or dangerous-action
 * pattern that the original text did not. Severity is at least high (an instruction someone took the trouble to hide).
 */
export function findEncodedInstructions(text: string, maxDepth = 2): EncodedInstruction[] {
  const hits: EncodedInstruction[] = [];
  const seen = new Set<string>();
  for (const span of decodeHidden(text, maxDepth)) {
    const matches: EncodedInstruction['matches'] = [];
    for (const p of ALL_PATTERNS) {
      const m = span.decoded.match(p.re);
      if (m && !p.re.test(span.original)) matches.push({ id: p.id, label: p.label, severity: p.severity, text: m[0] });
    }
    if (!matches.length) continue;
    const key = `${span.start}:${span.end}:${span.chain.join('>')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ span, matches, severity: matches.some((m) => m.severity === 'critical') ? 'critical' : 'high' });
  }
  return hits;
}

/** One-line explanation used by findings, Output Shield labels and incident evidence. */
export const describeEncoded = (e: EncodedInstruction) =>
  `${e.span.chain.map((c) => ENCODING_LABELS[c]).join(' → ')} decodes to “${e.span.decoded.trim().slice(0, 160)}” (${e.matches.map((m) => m.label.toLowerCase()).join('; ')})`;
