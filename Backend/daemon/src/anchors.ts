import { randomUUID } from 'node:crypto';
import { leafHash, merkleProof, merkleRoot, verifyMerkleProof, type LedgerMessage } from '@zoro/core';
import { appendLog, type LogRow } from './auditlog';
import { config } from './config';
import { all, get, run } from './db';
import { publishEvent } from './registry/outbox';

export interface AnchorRow {
  id: string;
  ts: number;
  from_seq: number;
  to_seq: number;
  count: number;
  root: string;
  status: string;
  topic: string | null;
  seq: number | null;
  consensus_ts: string | null;
  tx: string | null;
  error: string | null;
}

/** Leaves are the entries' chain hashes, so a proof also proves the entry's position in the hash chain. */
const leavesFor = (from: number, to: number) => all<{ seq: number; hash: string }>('SELECT seq, hash FROM audit_log WHERE seq >= ? AND seq <= ? ORDER BY seq', from, to).map((r) => ({ seq: r.seq, leaf: leafHash(r.hash) }));

/**
 * Commit every unanchored log entry as one Merkle root on the organization topic. Only the root is published —
 * never the events — so the anchor proves integrity without leaking activity (FR-R10).
 */
export function createAnchor(): AnchorRow | null {
  const last = get<{ to_seq: number }>('SELECT to_seq FROM anchors ORDER BY to_seq DESC LIMIT 1')?.to_seq ?? 0;
  const max = get<{ seq: number }>('SELECT MAX(seq) AS seq FROM audit_log WHERE lab = 0')?.seq ?? 0;
  if (max <= last) return null;
  const leaves = leavesFor(last + 1, max);
  if (!leaves.length) return null;
  const root = merkleRoot(leaves.map((l) => l.leaf));
  const id = randomUUID();
  const status = config.hedera.orgTopic ? 'pending' : 'local_only';
  run('INSERT INTO anchors(id, ts, from_seq, to_seq, count, root, status) VALUES(?,?,?,?,?,?,?)', id, Date.now(), last + 1, max, leaves.length, root, status);
  run('UPDATE audit_log SET anchor_id = ? WHERE seq >= ? AND seq <= ?', id, last + 1, max);
  if (config.hedera.orgTopic) {
    const msg: LedgerMessage = { v: 1, type: 'commitment.batch', root, count: leaves.length, fromSeq: last + 1, toSeq: max, ts: new Date().toISOString() };
    publishEvent('org', msg, { kind: 'anchor', id });
  }
  appendLog('anchor', `Committed log entries ${last + 1}–${max} (${leaves.length}) as Merkle root ${root.slice(0, 12)}…`, { id, root, status });
  return get<AnchorRow>('SELECT * FROM anchors WHERE id = ?', id)!;
}

export function inclusionProof(seq: number) {
  const entry = get<LogRow>('SELECT * FROM audit_log WHERE seq = ?', seq);
  if (!entry?.anchor_id) return null;
  const anchor = get<AnchorRow>('SELECT * FROM anchors WHERE id = ?', entry.anchor_id)!;
  const leaves = leavesFor(anchor.from_seq, anchor.to_seq);
  const idx = leaves.findIndex((l) => l.seq === seq);
  const proof = merkleProof(leaves.map((l) => l.leaf), idx);
  const leaf = leafHash(entry.hash);
  return { seq, entryHash: entry.hash, leaf, proof, root: anchor.root, verified: verifyMerkleProof(leaf, proof, anchor.root), anchor };
}

export function startAnchoring() {
  setInterval(() => {
    try {
      createAnchor();
    } catch {
      /* retried next interval */
    }
  }, config.anchorIntervalSec * 1000).unref();
}
