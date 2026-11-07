'use client';

/**
 * Sentinel, the Attack Lab's 2D assistant: a round lens-eyed character that reacts to the real Lab run and says, in
 * plain words, what just happened. Original drawing; colours from tokens (green/amber/red only for security moods).
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cx } from '../ui';

export type Mood = 'asleep' | 'watching' | 'alarmed' | 'relieved' | 'happy';

const RING: Record<Mood, string> = {
  asleep: 'var(--border)',
  watching: 'var(--accent)',
  alarmed: 'var(--warn)',
  relieved: 'var(--ok)',
  happy: 'var(--ok)',
};

function Character({ mood }: { mood: Mood }) {
  const reduce = useReducedMotion();
  const ink = { stroke: 'var(--border-strong)', strokeWidth: 2.2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const shaking = mood === 'alarmed' && !reduce;
  return (
    <motion.svg
      viewBox="0 0 120 120"
      className="h-auto w-full overflow-visible"
      aria-hidden
      animate={shaking ? { x: [0, -2, 2, -2, 0] } : reduce ? undefined : { y: [0, -3, 0] }}
      transition={shaking ? { duration: 0.4, repeat: Infinity, repeatDelay: 1.2 } : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* mood ring */}
      <circle cx="60" cy="62" r="54" style={{ fill: 'none', stroke: RING[mood], strokeWidth: 3, strokeDasharray: mood === 'watching' ? '6 8' : undefined }} className={mood === 'watching' && !reduce ? 'buddy-spin' : undefined} />
      {/* antenna */}
      <path d="M60 18 V8" style={ink} />
      <circle cx="60" cy="7" r="4.5" style={{ ...ink, fill: mood === 'alarmed' ? 'var(--warn)' : 'var(--pink)' }} className={mood === 'alarmed' && !reduce ? 'pulse-dot' : undefined} />
      {/* body */}
      <rect x="22" y="18" width="76" height="72" rx="30" style={{ ...ink, fill: 'var(--lavender)' }} />
      <rect x="30" y="26" width="60" height="18" rx="9" style={{ fill: 'var(--surface)', opacity: 0.35 }} />
      {/* arms */}
      <path d={mood === 'happy' || mood === 'relieved' ? 'M24 64 q-12 -14 -6 -26' : 'M24 62 q-10 6 -8 16'} style={{ ...ink, fill: 'none' }} />
      <path d={mood === 'happy' ? 'M96 64 q12 -14 6 -26' : 'M96 62 q10 6 8 16'} style={{ ...ink, fill: 'none' }} />
      {/* lens eye */}
      <circle cx="60" cy="56" r="22" style={{ ...ink, fill: 'var(--surface)' }} />
      {mood === 'asleep' ? (
        <path d="M46 58 q14 8 28 0" style={{ ...ink, fill: 'none' }} />
      ) : mood === 'happy' || mood === 'relieved' ? (
        <path d="M46 60 q14 -14 28 0" style={{ ...ink, fill: 'none', strokeWidth: 3.2 }} />
      ) : (
        <g className={cx(!reduce && (mood === 'watching' ? 'buddy-look' : 'buddy-jitter'))}>
          <circle cx="60" cy="56" r={mood === 'alarmed' ? 12 : 10} style={{ fill: 'var(--accent)' }} />
          <circle cx="60" cy="56" r={mood === 'alarmed' ? 4 : 5} style={{ fill: 'var(--border-strong)' }} />
          <circle cx="64" cy="51" r="3" style={{ fill: 'var(--surface)' }} />
        </g>
      )}
      {/* blink lid */}
      {mood !== 'asleep' && mood !== 'happy' && mood !== 'relieved' && !reduce && <rect x="36" y="33" width="48" height="46" rx="23" className="buddy-blink" style={{ fill: 'var(--lavender)' }} />}
      {/* feet */}
      <path d="M44 90 v8 h10 M76 90 v8 h-10" style={{ ...ink, fill: 'none' }} />
      {mood === 'asleep' && (
        <text x="92" y="24" style={{ fill: 'var(--text-dim)', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
          z
        </text>
      )}
    </motion.svg>
  );
}

export function SentinelBuddy({ mood, say, label, className }: { mood: Mood; say: string; label?: string; className?: string }) {
  return (
    <div className={cx('flex items-start gap-4', className)}>
      <div className="w-20 shrink-0 md:w-24">
        <Character mood={mood} />
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate">{label ?? 'Sentinel says'}</p>
        <AnimatePresence mode="wait">
          <motion.p key={say} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className="relative mt-1.5 rounded-[14px] rounded-tl-[4px] border border-sapphire bg-panel px-4 py-3 text-[15.5px] leading-[1.5] text-quartz shadow-[var(--shadow-md)]" aria-live="polite">
            {say}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
