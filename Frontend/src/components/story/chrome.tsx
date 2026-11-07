'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap, ScrollTrigger } from './runtime';
import { complete, onProgress } from './three/loading';
import { cx } from './ui';

// ---------- Preloader ----------

const HEX = '0123456789abcdef';
const SEEN_KEY = 'zoro-story-seen';
/** Never hold the page hostage: past this, the preloader leaves even if a task is still running. */
const MAX_WAIT_MS = 6000;

/**
 * Shows real progress (fonts, WebGL code, first frame) while a digest "settles". Shown once per session, skipped with
 * reduced motion or when WebGL is off, and dismissible at any time.
 */
export function Preloader({ enabled }: { enabled: boolean }) {
  const [show, setShow] = useState(false);
  const [pct, setPct] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const hash = useRef<HTMLSpanElement>(null);
  const leaveRef = useRef<() => void>(() => {});

  useEffect(() => {
    void document.fonts.ready.then(() => complete('fonts'));
  }, []);

  useEffect(() => {
    if (!enabled || sessionStorage.getItem(SEEN_KEY)) return;
    sessionStorage.setItem(SEEN_KEY, '1');
    setShow(true);
  }, [enabled]);

  useEffect(() => {
    if (!show) return;
    document.documentElement.style.overflow = 'hidden';
    let finished = false;
    const leave = () => {
      if (finished) return;
      finished = true;
      gsap.to(root.current, {
        yPercent: -100,
        duration: 0.9,
        ease: 'expo.inOut',
        delay: 0.25,
        onComplete: () => {
          document.documentElement.style.overflow = '';
          setShow(false);
          ScrollTrigger.refresh();
        },
      });
    };
    leaveRef.current = leave;
    const scramble = setInterval(() => {
      if (!hash.current) return;
      hash.current.textContent = '0x' + Array.from({ length: 24 }, () => HEX[(Math.random() * 16) | 0]).join('');
    }, 60);
    const off = onProgress((p) => {
      setPct(Math.round(p * 100));
      if (p >= 1) {
        clearInterval(scramble);
        leave();
      }
    });
    const timeout = setTimeout(leave, MAX_WAIT_MS);
    const skip = (e: KeyboardEvent) => e.key === 'Escape' && leave();
    window.addEventListener('keydown', skip);
    return () => {
      off();
      clearInterval(scramble);
      clearTimeout(timeout);
      window.removeEventListener('keydown', skip);
      document.documentElement.style.overflow = '';
    };
  }, [show]);

  if (!show) return null;
  return createPortal(
    <div ref={root} className="story fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6" role="status" aria-label={`Loading, ${pct} percent`}>
      <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-(--text-3)">fingerprinting the page</p>
      <span ref={hash} className="font-mono text-[15px] text-(--scan) md:text-[18px]" aria-hidden>
        0x
      </span>
      <div className="h-px w-56 overflow-hidden bg-(--line)">
        <div className="h-full bg-(--scan) transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="font-mono text-[28px] font-light tabular-nums text-(--text)">{pct}%</p>
      <button onClick={() => leaveRef.current()} className="mt-4 text-[13px] text-(--text-3) underline-offset-4 hover:text-(--text) hover:underline">
        Skip
      </button>
    </div>,
    document.body,
  );
}

// ---------- Journey spine ----------

export const STAGES = [
  { id: 'arrive', label: 'Arrive' },
  { id: 'risk', label: 'The risk' },
  { id: 'fingerprint', label: 'Fingerprint' },
  { id: 'sentinel', label: 'Sentinel' },
  { id: 'quarantine', label: 'Quarantine' },
  { id: 'policy', label: 'Policy' },
  { id: 'shield', label: 'Output Shield' },
  { id: 'human', label: 'Human Seal' },
  { id: 'seal', label: 'The Seal' },
  { id: 'chain', label: 'Audit log' },
  { id: 'live', label: 'Live' },
  { id: 'verify', label: 'Verify' },
] as const;

/** Where the tool call is in its journey. Desktop only; each dot is a real link to its section. */
export function Spine() {
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const triggers = STAGES.map((s, i) =>
      ScrollTrigger.create({ trigger: `#${s.id}`, start: 'top 55%', end: 'bottom 55%', onToggle: (self) => self.isActive && setActive(i) }),
    );
    return () => triggers.forEach((t) => t.kill());
  }, []);
  if (!mounted) return null;
  return createPortal(
    <nav aria-label="Journey of a tool call" className="story pointer-events-none fixed left-5 top-1/2 z-30 hidden -translate-y-1/2 !bg-transparent xl:block">
      <ol className="pointer-events-auto relative flex flex-col gap-3.5">
        <span className="absolute bottom-1 left-[4.5px] top-1 w-px bg-(--line-strong)" aria-hidden />
        <span className="absolute left-[4.5px] top-1 w-px bg-(--scan) transition-[height] duration-500" style={{ height: `calc(${(active / (STAGES.length - 1)) * 100}% - 4px)` }} aria-hidden />
        {STAGES.map((s, i) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="group relative flex items-center gap-3" aria-current={i === active ? 'step' : undefined}>
              <span className={cx('relative size-2.5 rounded-full border transition-colors duration-300', i < active ? 'border-(--scan) bg-(--scan)' : i === active ? 'border-(--scan) bg-(--night) ring-4 ring-(--scan)/20' : 'border-(--line-strong) bg-(--night)')} />
              <span className={cx('font-mono text-[11px] transition-[opacity,color] duration-300', i === active ? 'text-(--text) opacity-100' : 'text-(--text-3) opacity-0 group-hover:opacity-100')}>{s.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>,
    document.body,
  );
}
