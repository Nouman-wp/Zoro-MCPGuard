// Detection and visible rendering of characters that a human reviewer cannot see but a model can read.

export type HiddenKind = 'zero_width' | 'bidi_control' | 'tag' | 'variation_selector' | 'unusual_space' | 'control' | 'other_format';

export interface HiddenChar {
  index: number;
  length: number;
  codePoint: number;
  kind: HiddenKind;
  name: string;
}

const NAMED: Record<number, string> = {
  0x00ad: 'SOFT HYPHEN',
  0x034f: 'COMBINING GRAPHEME JOINER',
  0x061c: 'ARABIC LETTER MARK',
  0x115f: 'HANGUL CHOSEONG FILLER',
  0x1160: 'HANGUL JUNGSEONG FILLER',
  0x17b4: 'KHMER VOWEL INHERENT AQ',
  0x17b5: 'KHMER VOWEL INHERENT AA',
  0x180e: 'MONGOLIAN VOWEL SEPARATOR',
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x200e: 'LEFT-TO-RIGHT MARK',
  0x200f: 'RIGHT-TO-LEFT MARK',
  0x2028: 'LINE SEPARATOR',
  0x2029: 'PARAGRAPH SEPARATOR',
  0x202a: 'LEFT-TO-RIGHT EMBEDDING',
  0x202b: 'RIGHT-TO-LEFT EMBEDDING',
  0x202c: 'POP DIRECTIONAL FORMATTING',
  0x202d: 'LEFT-TO-RIGHT OVERRIDE',
  0x202e: 'RIGHT-TO-LEFT OVERRIDE',
  0x2060: 'WORD JOINER',
  0x2061: 'FUNCTION APPLICATION',
  0x2062: 'INVISIBLE TIMES',
  0x2063: 'INVISIBLE SEPARATOR',
  0x2064: 'INVISIBLE PLUS',
  0x2066: 'LEFT-TO-RIGHT ISOLATE',
  0x2067: 'RIGHT-TO-LEFT ISOLATE',
  0x2068: 'FIRST STRONG ISOLATE',
  0x2069: 'POP DIRECTIONAL ISOLATE',
  0x3164: 'HANGUL FILLER',
  0xfeff: 'ZERO WIDTH NO-BREAK SPACE (BOM)',
  0xffa0: 'HALFWIDTH HANGUL FILLER',
  0x00a0: 'NO-BREAK SPACE',
  0x202f: 'NARROW NO-BREAK SPACE',
  0x205f: 'MEDIUM MATHEMATICAL SPACE',
  0x3000: 'IDEOGRAPHIC SPACE',
};

export function classifyCodePoint(cp: number): HiddenKind | null {
  if (cp >= 0xe0000 && cp <= 0xe007f) return 'tag';
  if ((cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef)) return 'variation_selector';
  if ((cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069) || cp === 0x200e || cp === 0x200f || cp === 0x061c)
    return 'bidi_control';
  if (cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0x2060 || cp === 0xfeff || (cp >= 0x2061 && cp <= 0x2064))
    return 'zero_width';
  if (cp === 0x00a0 || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x202f || cp === 0x205f || cp === 0x3000 || cp === 0x2028 || cp === 0x2029)
    return 'unusual_space';
  if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || (cp >= 0x7f && cp <= 0x9f)) return 'control';
  if ([0x00ad, 0x034f, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x180e, 0x3164, 0xffa0].includes(cp)) return 'other_format';
  return null;
}

export function nameOf(cp: number): string {
  if (NAMED[cp]) return NAMED[cp];
  if (cp >= 0xe0000 && cp <= 0xe007f) {
    const ascii = cp - 0xe0000;
    return ascii >= 0x20 && ascii < 0x7f ? `TAG ${JSON.stringify(String.fromCharCode(ascii))}` : `TAG U+${cp.toString(16).toUpperCase()}`;
  }
  if (cp >= 0x2000 && cp <= 0x200a) return 'TYPOGRAPHIC SPACE';
  if ((cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef)) return 'VARIATION SELECTOR';
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return 'CONTROL CHARACTER';
  return 'FORMAT CHARACTER';
}

export function findHiddenChars(text: string): HiddenChar[] {
  const out: HiddenChar[] = [];
  let i = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const kind = classifyCodePoint(cp);
    if (kind) out.push({ index: i, length: ch.length, codePoint: cp, kind, name: nameOf(cp) });
    i += ch.length;
  }
  return out;
}

/** Decode "ASCII smuggling": runs of Unicode tag characters that spell out hidden text. */
export function decodeTagRuns(text: string): { index: number; end: number; decoded: string }[] {
  const runs: { index: number; end: number; decoded: string }[] = [];
  let i = 0;
  let cur: { index: number; end: number; decoded: string } | null = null;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0xe0000 && cp <= 0xe007f) {
      const ascii = cp - 0xe0000;
      if (!cur) cur = { index: i, end: i, decoded: '' };
      if (ascii >= 0x20 && ascii < 0x7f) cur.decoded += String.fromCharCode(ascii);
      cur.end = i + ch.length;
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
    i += ch.length;
  }
  if (cur) runs.push(cur);
  return runs.filter((r) => r.decoded.length > 0);
}

export interface RevealSegment {
  text: string;
  hidden?: { kind: HiddenKind; name: string; codePoint: number; decoded?: string };
}

/** Split text into visible text and labelled hidden characters (tag runs collapse into one decoded segment). */
export function revealHidden(text: string): RevealSegment[] {
  const segs: RevealSegment[] = [];
  let buf = '';
  let tagRun: { cps: number[]; raw: string } | null = null;
  const flushBuf = () => {
    if (buf) segs.push({ text: buf });
    buf = '';
  };
  const flushTag = () => {
    if (!tagRun) return;
    const decoded = tagRun.cps
      .map((c) => c - 0xe0000)
      .filter((a) => a >= 0x20 && a < 0x7f)
      .map((a) => String.fromCharCode(a))
      .join('');
    segs.push({ text: tagRun.raw, hidden: { kind: 'tag', name: `${tagRun.cps.length} TAG CHARACTERS`, codePoint: tagRun.cps[0], decoded } });
    tagRun = null;
  };
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const kind = classifyCodePoint(cp);
    if (kind === 'tag') {
      flushBuf();
      if (!tagRun) tagRun = { cps: [], raw: '' };
      tagRun.cps.push(cp);
      tagRun.raw += ch;
      continue;
    }
    flushTag();
    if (kind) {
      flushBuf();
      segs.push({ text: ch, hidden: { kind, name: nameOf(cp), codePoint: cp } });
    } else buf += ch;
  }
  flushTag();
  flushBuf();
  return segs;
}

export const codePointLabel = (cp: number) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

// --- Homoglyphs: words that mix scripts (e.g. Latin "pаypal" with a Cyrillic "а") ---

const SCRIPT_TESTS: [string, RegExp][] = [
  ['Latin', /\p{Script=Latin}/u],
  ['Cyrillic', /\p{Script=Cyrillic}/u],
  ['Greek', /\p{Script=Greek}/u],
  ['Armenian', /\p{Script=Armenian}/u],
  ['Cherokee', /\p{Script=Cherokee}/u],
];

export interface MixedScriptWord {
  index: number;
  word: string;
  scripts: string[];
}

export function findMixedScriptWords(text: string): MixedScriptWord[] {
  const out: MixedScriptWord[] = [];
  const re = /[\p{L}\p{M}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const scripts = new Set<string>();
    for (const ch of m[0]) for (const [name, test] of SCRIPT_TESTS) if (test.test(ch)) scripts.add(name);
    if (scripts.size > 1) out.push({ index: m.index, word: m[0], scripts: [...scripts] });
  }
  return out;
}

/** Fold common confusables to ASCII for typosquat comparison (not used for fingerprints). */
const CONFUSABLES: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', һ: 'h', ӏ: 'l', ո: 'n',
  α: 'a', ο: 'o', ρ: 'p', ν: 'v', τ: 't', κ: 'k', ι: 'i', '0': 'o', '1': 'l', '3': 'e', '5': 's', '@': 'a',
};
export const foldConfusables = (s: string) =>
  [...s.normalize('NFKC').toLowerCase()].map((c) => CONFUSABLES[c] ?? c).join('').replace(/[_\-\s.]+/g, '');
