'use client';

/**
 * The Zoro Intro: a one-minute film that plays on its own after Begin. No scrolling: a clock runs from 0 to DURATION
 * seconds, and its 0…1 progress drives the countdown, the background tint, every act and the music (sound.ts).
 * The speaker button mutes and unmutes. The viewer can
 * pause (button or Space), jump back or forward five seconds (← / →), jump to an act from the progress bar, or skip
 * (button or Esc). The last card stays on screen until the viewer enters the site.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, type AnimationPlaybackControls, type MotionValue } from 'motion/react';
import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { ZMark } from '../hardware';
import { cx } from '../ui';
import { IntroBackdrop, type Tint } from './backdrop';
import { IntroSound } from './sound';
import { ACTS, DURATION, GUARD_AT, HACKS_RANGE } from './timeline';

export { ACTS, GUARD_AT };

export interface IntroControls {
  progress: MotionValue<number>;
  finish: () => void;
}

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export function Intro({ onDone, children }: { onDone: () => void; children?: (c: IntroControls) => ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  const progress = useMotionValue(0);
  const player = useRef<AnimationPlaybackControls | null>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [tint, setTint] = useState<Tint>('calm');
  const [sound, setSound] = useState(true);
  const audio = useRef<IntroSound | null>(null);
  const getAudio = () => (audio.current ??= new IntroSound());
  const count = useRef<HTMLSpanElement>(null);
  const caption = useRef<HTMLSpanElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const displace = useRef<SVGFEDisplacementMapElement>(null);

  const finish = useCallback(() => {
    if (leaving) return;
    player.current?.stop();
    audio.current?.stop();
    setLeaving(true);
    setTimeout(onDone, 650);
  }, [leaving, onDone]);

  /** Play from the current position to the end, at real-time speed. */
  const play = useCallback(() => {
    player.current?.stop();
    const from = progress.get() >= 1 ? 0 : progress.get();
    if (from === 0) progress.set(0);
    setEnded(false);
    setPlaying(true);
    getAudio().play(progress.get());
    player.current = animate(progress, 1, {
      duration: (1 - from) * DURATION,
      ease: 'linear',
      onComplete: () => {
        setPlaying(false);
        setEnded(true);
      },
    });
  }, [progress]);

  const pause = useCallback(() => {
    player.current?.stop();
    audio.current?.pause();
    setPlaying(false);
  }, []);

  const seek = useCallback(
    (v: number) => {
      const was = playing;
      player.current?.stop();
      progress.set(Math.min(1, Math.max(0, v)));
      setEnded(progress.get() >= 1);
      if (was && progress.get() < 1) play();
    },
    [playing, play, progress],
  );

  const begin = () => {
    getAudio().setMuted(!sound);
    setStarted(true);
    play();
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    getAudio().setMuted(!next);
  };

  useMotionValueEvent(progress, 'change', (v) => {
    audio.current?.update(v);
    const guarded = v >= GUARD_AT;
    const n = Math.round(100 * (1 - Math.min(v, GUARD_AT) / GUARD_AT));
    if (count.current) count.current.textContent = String(n).padStart(2, '0');
    if (caption.current) caption.current.textContent = guarded ? 'Stopped. Zoro is watching every call' : 'Until your agent is tricked';
    if (clock.current) clock.current.textContent = `${fmt(v * DURATION)} / ${fmt(DURATION)}`;
    if (displace.current && !reduce) displace.current.setAttribute('scale', String(guarded ? 0 : (1 - n / 100) * 26));
    setTint(v >= GUARD_AT ? 'safe' : v >= HACKS_RANGE.start ? 'alarm' : 'calm');
  });

  // lock the page behind; keys: Space pauses, arrows step 5 s, Esc skips
  useEffect(() => {
    const prev = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      player.current?.stop();
      audio.current?.stop();
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return finish();
      if (!started) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('button, a, input, textarea')) return;
      const step = 5 / DURATION;
      if (e.key === ' ' || e.key === 'k') playing ? pause() : play();
      else if (e.key === 'm') toggleSound();
      else if (e.key === 'ArrowRight') seek(progress.get() + step);
      else if (e.key === 'ArrowLeft') seek(progress.get() - step);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish, started, playing, pause, play, seek, progress, sound]);

  const barWidth = useTransform(progress, (v) => `${v * 100}%`);
  const onBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!started) setStarted(true);
    seek((e.clientX - r.left) / r.width);
  };

  const ghost = 'flex items-center justify-center rounded-full border border-[color:var(--intro-text)]/25 bg-white/60 backdrop-blur-md transition-colors hover:bg-white';

  return (
    <AnimatePresence>
      {!leaving && (
        <motion.div key="intro" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} className="fixed inset-0 z-[200] overflow-hidden text-[color:var(--intro-text)]" role="dialog" aria-modal="true" aria-label="Zoro intro">
          <svg className="absolute size-0" aria-hidden>
            <filter id="intro-distort">
              <feTurbulence type="fractalNoise" baseFrequency="0.035 0.09" numOctaves="2" seed="7" />
              <feDisplacementMap ref={displace} in="SourceGraphic" scale="0" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </svg>

          <IntroBackdrop tint={tint} />

          {/* acts */}
          {started && children?.({ progress, finish })}

          {/* title card */}
          <AnimatePresence>
            {!started && (
              <motion.div key="gate" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.6 }} className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <span className="flex size-16 items-center justify-center rounded-[16px] border-2 border-[color:var(--intro-text)] bg-white text-[color:var(--intro-text)] shadow-[4px_4px_0_var(--intro-text)]">
                  <ZMark className="size-9" />
                </span>
                <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.3em] text-[color:var(--intro-light)]">Zoro presents</p>
                <h1 className="font-display mt-3 max-w-[760px] text-[38px] leading-[1.05] md:text-[64px]">A story about trust, in five acts.</h1>
                <p className="mt-4 text-[15px] text-[color:var(--intro-text)]/70">One minute. It plays by itself; turn your sound on and watch.</p>
                <div className="mt-9 flex items-center gap-3">
                <button type="button" onClick={begin} autoFocus className="inline-flex h-14 items-center gap-2.5 rounded-full bg-[color:var(--intro-text)] px-9 text-[17px] font-semibold text-white shadow-[0_10px_30px_-10px_var(--intro-text)] transition-transform hover:scale-[1.03]">
                  <Play className="size-5 fill-current" aria-hidden /> Begin
                </button>
                <button type="button" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Sound on. Mute' : 'Muted. Turn sound on'} title={sound ? 'Sound on' : 'Muted'} className={cx(ghost, 'size-14')}>
                  {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
                </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* countdown */}
          {started && (
            <div className="pointer-events-none absolute bottom-14 left-5 md:bottom-16 md:left-8">
              <span ref={count} className="font-display block leading-[0.8] tracking-[-0.04em] text-[color:var(--intro-text)]/90" style={{ fontSize: 'clamp(48px, 11vw, 120px)', filter: reduce ? undefined : 'url(#intro-distort)' }} aria-hidden>
                100
              </span>
              <span ref={caption} className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--intro-light)] md:text-[12px]">
                Until your agent is tricked
              </span>
            </div>
          )}

          {/* top bar: brand, skip */}
          <div className="absolute inset-x-0 top-0 z-[500] flex items-center justify-between gap-4 px-5 py-4 md:px-8">
            <span className="flex items-center gap-2 text-[15px] font-bold">
              <ZMark className="size-5" /> Zoro
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Mute' : 'Unmute'} title={sound ? 'Mute (M)' : 'Unmute (M)'} className={cx(ghost, 'size-10')}>
                {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </button>
              <button type="button" onClick={finish} className={cx(ghost, 'h-10 gap-1.5 px-4 text-[14px] font-semibold')}>
                Skip intro <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          {/* player controls */}
          {started && (
            <div className="absolute inset-x-0 bottom-0 z-[500] flex items-center gap-3 px-5 pb-4 md:px-8">
              <button type="button" onClick={ended ? () => { progress.set(0); play(); } : playing ? pause : play} aria-label={ended ? 'Replay' : playing ? 'Pause' : 'Play'} title={ended ? 'Replay' : playing ? 'Pause (Space)' : 'Play (Space)'} className={cx(ghost, 'size-9 shrink-0')}>
                {ended ? <RotateCcw className="size-4" /> : playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
              </button>
              <div className="group relative h-6 flex-1 cursor-pointer" onClick={onBar} role="slider" aria-label="Intro position" aria-valuemin={0} aria-valuemax={DURATION} aria-valuenow={0} tabIndex={-1}>
                <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-[color:var(--intro-text)]/15 transition-[height] group-hover:h-[6px]">
                  <motion.div className="h-full rounded-full bg-[color:var(--intro-light)]" style={{ width: barWidth }} />
                </div>
                {ACTS.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      seek(a.at);
                    }}
                    className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--intro-text)] bg-white transition-transform hover:scale-150"
                    style={{ left: `${a.at * 100}%` }}
                    title={`Jump to: ${a.label}`}
                    aria-label={`Jump to ${a.label}`}
                  />
                ))}
              </div>
              <span ref={clock} className="hidden w-[92px] shrink-0 text-right font-mono text-[12px] tabular-nums text-[color:var(--intro-text)]/70 sm:block">
                0:00 / {fmt(DURATION)}
              </span>
            </div>
          )}
          <p className="sr-only" aria-live="polite">
            The intro plays by itself. Press Space to pause, M to mute, the arrow keys to move five seconds, Escape to skip.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
