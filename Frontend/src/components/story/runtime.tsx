'use client';

/**
 * Shared runtime for the story page: one GSAP instance, Lenis driven by gsap.ticker (so ScrollTrigger and Lenis
 * never disagree), the reduced-motion switch, the Simple / Engineer depth toggle and a tiny store the 3D scenes read.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { Flip } from 'gsap/Flip';
import { useGSAP } from '@gsap/react';
import Lenis from 'lenis';

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin, Flip, useGSAP);

export { gsap, ScrollTrigger, Flip, useGSAP };

/** Scroll progress the WebGL scenes read every frame (written by ScrollTrigger, read in useFrame). */
export const scrollStore = { gate: 0, seal: 0, pointerX: 0, pointerY: 0 };

export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

/** Smooth scroll only for a mouse or trackpad on a wide enough screen, and never with reduced motion. */
export function useSmoothScroll(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !window.matchMedia('(pointer: fine) and (min-width: 480px)').matches) return;
    const lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 0.9 });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    // In-page anchors go through Lenis so they glide instead of jumping.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href')!;
      if (id.length < 2 || !document.querySelector(id)) return;
      e.preventDefault();
      lenis.scrollTo(id, { offset: -72 });
    };
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('click', onClick);
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, [enabled]);
}

// ---------- Depth toggle ----------

export type DepthLevel = 'simple' | 'engineer';
const DepthCtx = createContext<{ depth: DepthLevel; setDepth: (d: DepthLevel) => void }>({ depth: 'simple', setDepth: () => {} });

export function DepthProvider({ children }: { children: ReactNode }) {
  const [depth, setDepthState] = useState<DepthLevel>('simple');
  useEffect(() => {
    const saved = localStorage.getItem('zoro-story-depth');
    if (saved === 'simple' || saved === 'engineer') setDepthState(saved);
  }, []);
  const setDepth = (d: DepthLevel) => {
    setDepthState(d);
    localStorage.setItem('zoro-story-depth', d);
    // Text height changes; let pinned and scrubbed sections re-measure.
    requestAnimationFrame(() => ScrollTrigger.refresh());
  };
  return <DepthCtx.Provider value={{ depth, setDepth }}>{children}</DepthCtx.Provider>;
}

export const useDepth = () => useContext(DepthCtx);

/** One explanation, two depths: an analogy anyone can follow, or the engineer's version. */
export function Depth({ simple, engineer, className }: { simple: ReactNode; engineer: ReactNode; className?: string }) {
  const { depth } = useDepth();
  return (
    <div className={className} aria-live="polite">
      {depth === 'simple' ? simple : engineer}
    </div>
  );
}

export function DepthToggle() {
  const { depth, setDepth } = useDepth();
  return (
    <div role="radiogroup" aria-label="Explanation depth" className="inline-flex rounded-full border border-(--line-strong) bg-(--surface)/90 p-1 text-[12.5px] backdrop-blur">
      {(['simple', 'engineer'] as const).map((d) => (
        <button
          key={d}
          role="radio"
          aria-checked={depth === d}
          onClick={() => setDepth(d)}
          className={`rounded-full px-3 py-1 transition-colors duration-150 ${depth === d ? 'bg-(--trust-fill) text-white' : 'text-(--text-2) hover:text-(--text)'}`}
        >
          {d === 'simple' ? 'Simple' : 'Engineer'}
        </button>
      ))}
    </div>
  );
}
