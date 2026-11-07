/**
 * The intro's sound: one looping music bed per act, crossfaded, plus short effects on cues (a whoosh as each card or
 * newspaper arrives, glass breaking on "one changed line", a rising tone as the guard arrives, clicks as the features
 * drop in). Everything is placed on the same timeline as the picture (timeline.ts). Files live in
 * public/audio/intro. Plain <audio> elements: started from the Begin click, so browsers allow playback.
 */
import { FEATURES_RANGE, GUARD_AT, HACKS_RANGE, PROBLEM, TRACKS_RANGE, beat } from './timeline';

const SRC = (name: string) => `/audio/intro/${name}.mp3`;

type Bed = 'amb_stage1' | 'amb_stage2-3' | 'amb_stage4-5' | 'amb_stage5';
const BEDS: Bed[] = ['amb_stage1', 'amb_stage2-3', 'amb_stage4-5', 'amb_stage5'];
const BED_VOLUME = 0.55;
const FADE_MS = 900;

/** Which music bed belongs at progress v. */
function bedAt(v: number): Bed {
  if (v < HACKS_RANGE.start) return 'amb_stage1';
  if (v < GUARD_AT) return 'amb_stage2-3';
  if (v < FEATURES_RANGE.start) return 'amb_stage4-5';
  return 'amb_stage5';
}

/** Effects and the moment (progress) each one fires. */
const CUES: { at: number; fx: string; volume: number }[] = [
  ...[0, 1, 2].map((i) => ({ at: beat(PROBLEM, i), fx: i === 2 ? 'fx_glass-shatter' : 'fx_whoosh', volume: i === 2 ? 0.5 : 0.6 })),
  ...Array.from({ length: HACKS_RANGE.count }, (_, i) => ({ at: beat(HACKS_RANGE, i), fx: 'fx_whoosh', volume: 0.55 })),
  { at: GUARD_AT - 0.03, fx: 'fx_tunnel', volume: 0.6 },
  { at: GUARD_AT, fx: 'fx_xp-topup', volume: 0.7 },
  ...[0, 1, 2].map((i) => ({ at: beat(TRACKS_RANGE, i), fx: 'fx_whoosh', volume: 0.55 })),
  ...Array.from({ length: FEATURES_RANGE.count }, (_, i) => ({ at: beat(FEATURES_RANGE, i), fx: 'fx_click', volume: 0.8 })),
  { at: FEATURES_RANGE.end, fx: 'fx_hold-button', volume: 0.45 },
];

export class IntroSound {
  private beds = new Map<Bed, HTMLAudioElement>();
  private fx = new Map<string, HTMLAudioElement>();
  private current: Bed | null = null;
  private fades = new Map<HTMLAudioElement, number>();
  private last = 0;
  private muted = false;
  private playing = false;

  constructor() {
    for (const b of BEDS) {
      const a = new Audio(SRC(b));
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      this.beds.set(b, a);
    }
    for (const c of new Set(CUES.map((c) => c.fx))) {
      const a = new Audio(SRC(c));
      a.preload = 'auto';
      this.fx.set(c, a);
    }
  }

  private fade(a: HTMLAudioElement, to: number, after?: () => void) {
    cancelAnimationFrame(this.fades.get(a) ?? 0);
    const from = a.volume;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / FADE_MS);
      a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k < 1) this.fades.set(a, requestAnimationFrame(step));
      else after?.();
    };
    this.fades.set(a, requestAnimationFrame(step));
  }

  private switchBed(next: Bed) {
    if (this.current === next) return;
    const prev = this.current ? this.beds.get(this.current) : null;
    if (prev) this.fade(prev, 0, () => prev.pause());
    this.current = next;
    const a = this.beds.get(next)!;
    if (this.playing && !this.muted) {
      void a.play().catch(() => {});
      this.fade(a, BED_VOLUME);
    }
  }

  /** Start or resume from progress v (call from a click so the browser allows sound). */
  play(v: number) {
    this.playing = true;
    this.last = v;
    this.current = null;
    this.switchBed(bedAt(v));
  }

  /** Pause everything (keeps the position). */
  pause() {
    this.playing = false;
    for (const a of this.beds.values()) this.fade(a, 0, () => a.pause());
  }

  /** Called on every frame of the timeline. Fires cues crossed since the last call; a jump (seek) fires none. */
  update(v: number) {
    const prev = this.last;
    this.last = v;
    if (!this.playing) return;
    this.switchBed(bedAt(v));
    if (this.muted || v < prev || v - prev > 0.02) return;
    for (const c of CUES) if (c.at > prev && c.at <= v) this.hit(c.fx, c.volume);
  }

  private hit(name: string, volume: number) {
    const src = this.fx.get(name);
    if (!src) return;
    const a = src.cloneNode(true) as HTMLAudioElement;
    a.volume = volume;
    void a.play().catch(() => {});
  }

  setMuted(m: boolean) {
    this.muted = m;
    const a = this.current ? this.beds.get(this.current) : null;
    if (!a) return;
    if (m) this.fade(a, 0, () => a.pause());
    else if (this.playing) {
      void a.play().catch(() => {});
      this.fade(a, BED_VOLUME);
    }
  }

  /** Short fade, then silence and release everything. */
  stop() {
    this.playing = false;
    for (const a of this.beds.values()) this.fade(a, 0, () => a.pause());
  }
}
