'use client';

/**
 * The intro's background, in the light pastel style of the rest of the site: a soft grey ground, large blurred
 * colour blobs that drift slowly, and a faint dot grid. Pure CSS (no WebGL), so it is cheap and never fails.
 * `tint` shifts the blob colours per act: calm blue at first, warmer pink while the attacks play, mint once the
 * guard arrives.
 */
import { cx } from '../ui';

export type Tint = 'calm' | 'alarm' | 'safe';

const BLOBS: Record<Tint, [string, string, string, string]> = {
  calm: ['var(--intro-sky)', 'var(--intro-mid)', 'var(--intro-mint)', 'var(--intro-pink)'],
  alarm: ['var(--intro-pink)', 'var(--peach)', 'var(--intro-mid)', 'var(--intro-butter)'],
  safe: ['var(--intro-mint)', 'var(--intro-sky)', 'var(--intro-mid)', 'var(--intro-butter)'],
};

export function IntroBackdrop({ tint = 'calm' }: { tint?: Tint }) {
  const c = BLOBS[tint];
  const blob = 'intro-blob transition-[background-color] duration-[2000ms]';
  return (
    <div className="absolute inset-0 overflow-hidden bg-[color:var(--intro-ink)]" aria-hidden>
      <span className={cx(blob)} style={{ background: c[0], width: '46vw', height: '46vw', left: '-10vw', top: '-14vw' }} />
      <span className={cx(blob)} style={{ background: c[1], width: '40vw', height: '40vw', right: '-8vw', top: '-6vw', animationDelay: '-6s', animationDuration: '26s' }} />
      <span className={cx(blob)} style={{ background: c[2], width: '42vw', height: '42vw', left: '8vw', bottom: '-18vw', animationDelay: '-11s', animationDuration: '24s' }} />
      <span className={cx(blob)} style={{ background: c[3], width: '34vw', height: '34vw', right: '6vw', bottom: '-10vw', animationDelay: '-3s', animationDuration: '20s' }} />
      <div className="intro-dots absolute inset-0" />
      {/* a white wash in the middle keeps text crisp over the colour */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 55% at 50% 50%, color-mix(in oklab, white 55%, transparent) 0%, transparent 100%)' }} />
    </div>
  );
}
