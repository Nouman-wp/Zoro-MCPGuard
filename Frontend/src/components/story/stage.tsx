'use client';

import dynamic from 'next/dynamic';
import { createContext, useContext, type ReactNode } from 'react';
import { cx } from './ui';

// The WebGL code is its own chunk, fetched only on the client.
const GateView = dynamic(() => import('./three/scenes').then((m) => m.GateView), { ssr: false });
const SealView = dynamic(() => import('./three/scenes').then((m) => m.SealView), { ssr: false });

/** true when the 3D layer is running; false with reduced motion or without WebGL (then posters are shown). */
export const ThreeCtx = createContext(false);

export function Stage({ scene, className, label }: { scene: 'gate' | 'seal'; className?: string; label: string }) {
  const three = useContext(ThreeCtx);
  return (
    <div className={cx('relative', className)} role="img" aria-label={label}>
      {three ? scene === 'gate' ? <GateView className="absolute inset-0" /> : <SealView className="absolute inset-0" /> : scene === 'gate' ? <GatePoster /> : <SealPoster />}
    </div>
  );
}

/** Still versions of the scenes, in the same colours, for reduced motion and no-WebGL. */
function GatePoster() {
  const dots: ReactNode[] = [];
  for (let i = 0; i < 26; i++) {
    const x = 20 + i * 14;
    const y = 150 + Math.sin(i * 1.7) * 38 * (1 - Math.exp(-((x - 200) ** 2) / 9000));
    const fill = x < 180 ? 'var(--unknown)' : x < 222 ? 'var(--scan)' : i % 7 === 0 ? 'var(--block)' : 'var(--seal)';
    dots.push(<circle key={i} cx={x} cy={i % 7 === 0 && x > 222 ? y + 40 : y} r={x > 180 && x < 222 ? 5 : 3.5} fill={fill} />);
  }
  return (
    <svg viewBox="0 0 400 300" className="absolute inset-0 size-full" aria-hidden>
      <ellipse cx="200" cy="150" rx="34" ry="112" fill="none" stroke="var(--trust)" strokeWidth="5" />
      {[96, 84, 72, 60].map((r) => (
        <ellipse key={r} cx="200" cy="150" rx={r / 4} ry={r} fill="none" stroke="var(--scan)" strokeOpacity="0.45" strokeWidth="1.2" />
      ))}
      {dots}
    </svg>
  );
}

function SealPoster() {
  const colors = ['var(--scan)', 'var(--seal)', 'var(--unknown)', 'var(--trust)', 'var(--ledger)', 'var(--ledger)'];
  return (
    <svg viewBox="0 0 400 400" className="absolute inset-0 size-full" aria-hidden>
      {colors.map((c, i) => (
        <ellipse key={i} cx="200" cy={330 - i * 52} rx="130" ry="34" fill="#141e30" stroke={c} strokeWidth="2" />
      ))}
    </svg>
  );
}
