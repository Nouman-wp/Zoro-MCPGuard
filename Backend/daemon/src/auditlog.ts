import { canonicalJson, keccakHex } from '@zoro/core';
import { bus } from './bus';
import { all, get, run } from './db';

export type LogKind =
  | 'call'
  | 'approval'
  | 'human_seal'
  | 'policy_change'
  | 'config_change'
  | 'server_change'
  | 'tool_change'
  | 'incident'
  | 'verdict'
  | 'revocation'
  | 'onboarding'
  | 'dispute'
  | 'namespace'
  | 'anchor'
  | 'danger_zone'
  | 'lab';

export const GENESIS_HASH = '0x' + '0'.repeat(64);

export interface LogRow {
  seq: number;
  ts: number;
  kind: string;
  ref: string | null;
  summary: string;
  data: string | null;
  prev_hash: string;
  hash: string;
  anchor_id: string | null;
  lab: number;
}

export const entryBody = (r: Pick<LogRow, 'ts' | 'kind' | 'ref' | 'summary'> & { data: unknown; prev: string }) =>
  canonicalJson({ ts: r.ts, kind: r.kind, ref: r.ref, summary: r.summary, data: r.data ?? null, prev: r.prev });

/**
 * Append-only, hash-chained local audit log (§4.12, §10.17). Each entry commits to the previous entry's hash, so
 * editing or deleting any entry breaks every later hash. Batches of entries are anchored to the organization topic.
 */
export function appendLog(kind: LogKind, summary: string, data: unknown = null, ref: string | null = null, lab = false) {
  const prev = get<{ hash: string }>('SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1')?.hash ?? GENESIS_HASH;
  const ts = Date.now();
  const hash = keccakHex(entryBody({ ts, kind, ref, summary, data, prev }));
  const r = run('INSERT INTO audit_log(ts, kind, ref, summary, data, prev_hash, hash, lab) VALUES(?,?,?,?,?,?,?,?)', ts, kind, ref, summary, JSON.stringify(data ?? null), prev, hash, lab);
  const seq = Number(r.lastInsertRowid);
  bus.emitEvent('log', { seq, kind, summary, ref });
  return { seq, hash };
}

/** Recompute the chain and report the first broken link, if any. */
export function verifyLogChain(fromSeq = 1, toSeq = Number.MAX_SAFE_INTEGER) {
  let prev = fromSeq > 1 ? get<{ hash: string }>('SELECT hash FROM audit_log WHERE seq = ?', fromSeq - 1)?.hash ?? GENESIS_HASH : GENESIS_HASH;
  let checked = 0;
  for (const r of all<LogRow>('SELECT * FROM audit_log WHERE seq >= ? AND seq <= ? ORDER BY seq', fromSeq, toSeq)) {
    const expected = keccakHex(entryBody({ ...r, data: JSON.parse(r.data ?? 'null'), prev: r.prev_hash }));
    if (r.prev_hash !== prev || expected !== r.hash) return { ok: false, brokenAt: r.seq, checked };
    prev = r.hash;
    checked++;
  }
  return { ok: true, brokenAt: null as number | null, checked };
}
