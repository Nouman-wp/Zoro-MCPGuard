export function timeAgo(ts: number | string | null | undefined): string {
  if (ts === null || ts === undefined || ts === '') return '—';
  const t = typeof ts === 'string' ? (/^\d+\.\d+$/.test(ts) ? Number(ts.split('.')[0]) * 1000 : Date.parse(ts)) : ts;
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 0) return `in ${fmtDuration(-s)}`;
  if (s < 5) return 'just now';
  return `${fmtDuration(s)} ago`;
}

export function fmtDuration(s: number) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export const fmtDate = (ts: number | string | null | undefined) => {
  if (ts === null || ts === undefined) return '—';
  const t = typeof ts === 'string' ? (/^\d+\.\d+$/.test(ts) ? Number(ts.split('.')[0]) * 1000 : Date.parse(ts)) : ts;
  return new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const shortHash = (h: string | null | undefined, head = 6, tail = 4) => (!h ? '—' : h.length <= head + tail + 3 ? h : `${h.slice(0, head + 2)}…${h.slice(-tail)}`);

export const human = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ') : '—');

/** "awaiting approval" is what the agent was told at call time; once a person has decided, say what became of the approval. */
export const outcomeLabel = (outcome: string, approval?: { seq: number; status: string } | null) =>
  outcome === 'awaiting_approval' && approval && approval.status !== 'pending' ? `approval APR-${approval.seq}: ${approval.status === 'executed' ? 'approved and used' : approval.status}` : outcome.replace(/_/g, ' ');

export const plural = (n: number, word: string, pluralWord = `${word}s`) => `${n} ${n === 1 ? word : pluralWord}`;

export const ms = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v < 1 ? `${v.toFixed(2)} ms` : v < 100 ? `${v.toFixed(1)} ms` : `${Math.round(v)} ms`);
