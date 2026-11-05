// Small text utilities shared by Sentinel, the diff viewer, the flow guard and masking.

export interface StringField {
  pointer: string;
  value: string;
  /** true when this string is a property name (key) rather than a value */
  isKey: boolean;
}

const escapePointer = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');

/** Every string (and every object key) in a JSON value, addressed by JSON pointer. */
export function walkStrings(value: unknown, pointer = ''): StringField[] {
  const out: StringField[] = [];
  const visit = (v: unknown, p: string) => {
    if (typeof v === 'string') out.push({ pointer: p, value: v, isKey: false });
    else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${p}/${i}`));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const kp = `${p}/${escapePointer(k)}`;
        out.push({ pointer: `${kp}#key`, value: k, isKey: true });
        visit(x, kp);
      }
    }
  };
  visit(value, pointer);
  return out;
}

/** Flatten any JSON value into pointer → primitive (as JSON text) for field-by-field diffing. */
export function flatten(value: unknown, pointer = ''): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (v: unknown, p: string) => {
    if (v && typeof v === 'object') {
      const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v as Record<string, unknown>);
      if (entries.length === 0) out.set(p || '/', Array.isArray(v) ? '[]' : '{}');
      for (const [k, x] of entries) visit(x, `${p}/${escapePointer(k)}`);
    } else out.set(p || '/', typeof v === 'string' ? v : JSON.stringify(v));
  };
  visit(value, pointer);
  return out;
}

export function getByPointer(value: unknown, pointer: string): unknown {
  if (!pointer || pointer === '/') return value;
  const parts = pointer
    .replace(/#key$/, '')
    .split('/')
    .slice(1)
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur: unknown = value;
  for (const p of parts) {
    if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[p];
    else return undefined;
  }
  return cur;
}

export function levenshtein(a: string, b: string, cap = 64): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export type DiffOp = { op: 'equal' | 'insert' | 'delete'; text: string };

const tokenize = (s: string) => s.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];

/** Word-level diff (LCS over tokens). Hidden characters are their own tokens, so they show up as edits. */
export function diffWords(a: string, b: string): DiffOp[] {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.length * B.length > 4_000_000) {
    return [
      ...(a ? [{ op: 'delete' as const, text: a }] : []),
      ...(b ? [{ op: 'insert' as const, text: b }] : []),
    ];
  }
  const n = A.length;
  const m = B.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: DiffOp[] = [];
  const push = (op: DiffOp['op'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.op === op) last.text += text;
    else ops.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push('equal', A[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push('delete', A[i++]);
    else push('insert', B[j++]);
  }
  while (i < n) push('delete', A[i++]);
  while (j < m) push('insert', B[j++]);
  return ops;
}

/** Text added in b relative to a, with offsets into b. */
export function insertedRanges(a: string, b: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  let pos = 0;
  for (const d of diffWords(a, b)) {
    if (d.op === 'insert') out.push({ start: pos, end: pos + d.text.length, text: d.text });
    if (d.op !== 'delete') pos += d.text.length;
  }
  return out;
}

// --- Masking of sensitive values for display (§8.5) ---

const SENSITIVE_KEY = /pass(word)?|secret|token|api[_-]?key|auth|credential|private[_-]?key|cookie|session|mnemonic|seed/i;

export function maskString(value: string): string {
  if (value.length <= 4) return '••••';
  const email = value.match(/^([^@\s]{1,64})@([^@\s]+)$/);
  if (email) return `${email[1].slice(0, 2)}•••@${email[2]}`;
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return `${value.slice(0, 6)}…${value.slice(-4)}`;
  if (value.length > 24 && /^[A-Za-z0-9+/=_\-.]+$/.test(value)) return `${value.slice(0, 4)}••••${value.slice(-2)}`;
  return value;
}

/** Mask sensitive values in call arguments: secrets by key name are fully masked, identifiers partly. */
export function maskArgs(args: unknown, keyHint = ''): unknown {
  if (typeof args === 'string') return SENSITIVE_KEY.test(keyHint) ? '•••••• (masked)' : maskString(args);
  if (Array.isArray(args)) return args.map((v) => maskArgs(v, keyHint));
  if (args && typeof args === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args as Record<string, unknown>)) out[k] = maskArgs(v, k);
    return out;
  }
  return args;
}

export const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** ENS-safe label: lowercase letters, digits and hyphens, max 63 chars. */
export function slugLabel(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return s || 'unnamed';
}
