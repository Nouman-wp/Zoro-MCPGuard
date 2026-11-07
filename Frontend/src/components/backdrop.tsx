'use client';

/**
 * A light animated background for a section: pastel isometric tiles that drift slowly and dotted "connection" paths
 * whose dashes flow between them. Kept to the section's edges (a radial mask clears the middle for text), drawn in one
 * SVG, animated with CSS only, paused while off screen and frozen under reduced motion (see .backdrop in globals.css).
 * Place inside a `relative isolate` section; it sits behind the content at z-index -1.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from './ui';

const TONES = ['var(--mint)', 'var(--lavender)', 'var(--peach)', 'var(--pink)'];

/** Small deterministic random generator, so each section always gets the same arrangement (no hydration drift). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Tile {
  x: number;
  y: number;
  s: number;
  tone: string;
  dur: number;
  delay: number;
  kind: 'tile' | 'ring' | 'cube';
}

function layout(seed: number, count: number) {
  const r = rng(seed);
  const tiles: Tile[] = [];
  for (let i = 0; i < count; i++) {
    const left = i % 2 === 0;
    const x = left ? 40 + r() * 200 : 960 + r() * 200;
    const y = 50 + ((i + r()) / count) * 700;
    tiles.push({ x, y, s: 16 + r() * 22, tone: TONES[Math.floor(r() * TONES.length)], dur: 7 + r() * 6, delay: -r() * 8, kind: r() < 0.18 ? 'ring' : r() < 0.45 ? 'cube' : 'tile' });
  }
  const paths: string[] = [];
  for (let i = 0; i + 2 < tiles.length; i += 3) {
    const a = tiles[i];
    const b = tiles[i + 2];
    const mx = (a.x + b.x) / 2 + (r() - 0.5) * 160;
    paths.push(`M${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`);
  }
  return { tiles, paths };
}

function TileShape({ t }: { t: Tile }) {
  const { x, y, s } = t;
  const ink = { stroke: 'var(--border-strong)', strokeWidth: 1.2, strokeLinejoin: 'round' as const, strokeOpacity: 0.55 };
  if (t.kind === 'ring') return <circle cx={x} cy={y} r={s * 0.55} style={{ fill: 'none', stroke: t.tone, strokeWidth: 3 }} />;
  const h = s / 2;
  const depth = t.kind === 'cube' ? s * 0.55 : s * 0.18;
  return (
    <g>
      <path d={`M${x - s} ${y} L${x} ${y + h} L${x} ${y + h + depth} L${x - s} ${y + depth} Z`} style={{ fill: 'var(--accent)', fillOpacity: 0.25, ...ink }} />
      <path d={`M${x + s} ${y} L${x} ${y + h} L${x} ${y + h + depth} L${x + s} ${y + depth} Z`} style={{ fill: 'var(--accent)', fillOpacity: 0.4, ...ink }} />
      <path d={`M${x} ${y - h} L${x + s} ${y} L${x} ${y + h} L${x - s} ${y} Z`} style={{ fill: t.tone, ...ink }} />
    </g>
  );
}

export function SectionBackdrop({ seed = 1, count = 10, className }: { seed?: number; count?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  const { tiles, paths } = useMemo(() => layout(seed, count), [seed, count]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={cx('backdrop pointer-events-none absolute inset-0 -z-10 overflow-hidden', !on && 'is-paused', className)} aria-hidden>
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        {paths.map((d, i) => (
          <path key={i} d={d} className="backdrop-path" style={{ fill: 'none', stroke: 'var(--text-faint)', strokeWidth: 1.5, animationDelay: `${-i * 1.3}s` }} />
        ))}
        {tiles.map((t, i) => (
          <g key={i} className="backdrop-tile" style={{ animationDuration: `${t.dur}s`, animationDelay: `${t.delay}s` }}>
            <TileShape t={t} />
          </g>
        ))}
      </svg>
    </div>
  );
}
