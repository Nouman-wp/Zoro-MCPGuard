'use client';

import { useMemo, useState } from 'react';

/**
 * Decision colors for chart marks, validated with the dataviz validator against the dark card surface #0d172b
 * (lightness band, chroma, contrast pass; adjacent CVD ΔE 6.1 → secondary encoding required: 2px gaps, legend,
 * per-bar tooltip and a table view are all present). Text never uses these colors.
 */
export const DECISION_COLORS = { allow: '#147a4f', ask: '#c18512', block: '#e0484f' } as const;
const ORDER = ['allow', 'ask', 'block'] as const;
const LABEL = { allow: 'Allowed', ask: 'Asked', block: 'Blocked' } as const;

export interface DecisionBucket {
  bucket: number;
  decision: string;
  n: number;
}

export function DecisionBars({ series, bucketMs, from, to }: { series: DecisionBucket[]; bucketMs: number; from: number; to: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const buckets = useMemo(() => {
    const start = Math.floor(from / bucketMs) * bucketMs;
    const out: { t: number; allow: number; ask: number; block: number }[] = [];
    for (let t = start; t <= to; t += bucketMs) out.push({ t, allow: 0, ask: 0, block: 0 });
    for (const s of series) {
      const key = Math.floor(Number(s.bucket) / bucketMs) * bucketMs;
      const b = out.find((x) => x.t === key);
      if (b && (s.decision === 'allow' || s.decision === 'ask' || s.decision === 'block')) b[s.decision] += s.n;
    }
    return out;
  }, [series, bucketMs, from, to]);
  const totals = ORDER.map((k) => buckets.reduce((s, b) => s + b[k], 0));
  const max = Math.max(1, ...buckets.map((b) => b.allow + b.ask + b.block));
  const W = 640;
  const H = 160;
  const pad = { l: 28, r: 4, t: 8, b: 20 };
  const bw = (W - pad.l - pad.r) / buckets.length;
  const barW = Math.max(2, Math.min(18, bw - 3));
  const y = (v: number) => ((H - pad.t - pad.b) * v) / max;
  const fmt = (t: number) => new Date(t).toLocaleString(undefined, bucketMs >= 86_400_000 ? { month: 'short', day: 'numeric' } : { hour: '2-digit', minute: '2-digit' });
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4 text-[13px] text-mist" aria-label="Legend">
        {ORDER.map((k, i) => (
          <li key={k} className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-[2px]" style={{ background: DECISION_COLORS[k] }} aria-hidden />
            {LABEL[k]} <span className="text-ash">{totals[i]}</span>
          </li>
        ))}
      </ul>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[180px] w-full" role="img" aria-label={`Decisions over time: ${totals[0]} allowed, ${totals[1]} asked, ${totals[2]} blocked`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={H - pad.b - y(t)} y2={H - pad.b - y(t)} className="stroke-inkline" strokeWidth={1} />
              <text x={pad.l - 6} y={H - pad.b - y(t) + 3} textAnchor="end" fontSize={10} className="fill-ash">
                {t}
              </text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const x = pad.l + i * bw + (bw - barW) / 2;
            let acc = 0;
            const segs = ORDER.filter((k) => b[k] > 0);
            return (
              <g key={b.t} onMouseEnter={() => setHover(i)}>
                <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
                {segs.map((k, si) => {
                  const h = y(b[k]);
                  const top = H - pad.b - acc - h;
                  acc += h + 2; // 2px surface gap between stacked segments
                  const isTop = si === segs.length - 1;
                  const r = isTop ? Math.min(4, barW / 2, h) : 0;
                  return isTop && r > 0 ? (
                    <path key={k} d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`} fill={DECISION_COLORS[k]} opacity={hover === null || hover === i ? 1 : 0.55} />
                  ) : (
                    <rect key={k} x={x} y={top} width={barW} height={Math.max(0, h)} fill={DECISION_COLORS[k]} opacity={hover === null || hover === i ? 1 : 0.55} />
                  );
                })}
              </g>
            );
          })}
          {[0, Math.floor(buckets.length / 2), buckets.length - 1].filter((i, n, a) => a.indexOf(i) === n && buckets[i]).map((i) => (
            <text key={i} x={i === 0 ? pad.l : i === buckets.length - 1 ? W - pad.r : pad.l + i * bw + bw / 2} y={H - 4} textAnchor={i === 0 ? 'start' : i === buckets.length - 1 ? 'end' : 'middle'} fontSize={10} className="fill-ash">
              {fmt(buckets[i].t)}
            </text>
          ))}
        </svg>
        {hover !== null && buckets[hover] && (
          <div className="pointer-events-none absolute top-0 rounded-[8px] border border-obsidian bg-abyss px-3 py-2 text-[12px] shadow-[var(--shadow-md)]" style={{ left: `${Math.min(80, (hover / buckets.length) * 100)}%` }}>
            <p className="text-quartz">{fmt(buckets[hover].t)}</p>
            {ORDER.map((k) => (
              <p key={k} className="text-mist">
                <span className="mr-1.5 inline-block size-2 rounded-[2px]" style={{ background: DECISION_COLORS[k] }} />
                {LABEL[k]}: {buckets[hover][k]}
              </p>
            ))}
          </div>
        )}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[12px] text-ash">Show as table</summary>
        <table className="mt-2 w-full text-left text-[12px] text-mist">
          <thead className="text-ash">
            <tr>
              <th className="py-1">Period</th>
              <th>Allowed</th>
              <th>Asked</th>
              <th>Blocked</th>
            </tr>
          </thead>
          <tbody>
            {buckets.filter((b) => b.allow + b.ask + b.block > 0).map((b) => (
              <tr key={b.t} className="border-t border-inkline">
                <td className="py-1">{fmt(b.t)}</td>
                <td>{b.allow}</td>
                <td>{b.ask}</td>
                <td>{b.block}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
