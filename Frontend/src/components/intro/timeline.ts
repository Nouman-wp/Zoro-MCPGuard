/**
 * The intro's timeline. It plays like a video: a clock runs from 0 to DURATION seconds after Begin, and every scene
 * and sound cue reads the same 0…1 progress value (time / DURATION). Times are written in seconds below so they are
 * easy to tune; picture (acts.tsx) and sound (sound.ts) both read them, so they can never drift apart.
 */

/** Total length of the intro, in seconds. */
export const DURATION = 60;

const at = (sec: number) => sec / DURATION;
const range = (from: number, to: number, count: number) => ({ start: at(from), end: at(to), count });

/** Act I: three short statements, 2.5 s each. */
export const PROBLEM = range(0.5, 8, 3);
/** Act II: one newspaper front page per beat (see components/news/stories.ts), about 3.4 s each. */
export const HACKS_RANGE = range(8.5, 35.5, 8);
/** Act III: the guard arrives; the countdown stops. */
export const GUARD_AT = at(36);
export const GUARD_END = at(41.5);
/** Act IV: the three sponsor tracks, about 2.8 s each. */
export const TRACKS_RANGE = range(42, 50.5, 3);
/** Act V: twelve features, half a second each, then the closing card that stays on screen. */
export const FEATURES_RANGE = range(51, 57, 12);
export const END_AT = FEATURES_RANGE.end;

/** Where each act starts (ticks on the progress bar; clicking one jumps there). */
export const ACTS = [
  { at: PROBLEM.start, label: 'The problem' },
  { at: HACKS_RANGE.start, label: 'The headlines' },
  { at: GUARD_AT, label: 'The guard' },
  { at: TRACKS_RANGE.start, label: 'The tracks' },
  { at: FEATURES_RANGE.start, label: 'Features' },
] as const;

/** Start of the i-th beat of a range. */
export const beat = (r: { start: number; end: number; count: number }, i: number) => r.start + (i * (r.end - r.start)) / r.count;
