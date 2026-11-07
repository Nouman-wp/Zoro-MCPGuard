'use client';

/**
 * Entry points for the home page's 3D scenes. Each loads its three.js code only on the client, shows the 2D drawing
 * while loading, and keeps the 2D drawing when WebGL is unavailable or the visitor prefers reduced motion.
 */
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { HeroShield, LayerStack, NumberBadge, type Tone } from '../hardware';
import { cx } from '../ui';
import { hasWebGL } from './use-scene';
import type { PlateTone } from './layer-stack-3d';

const Shield3D = dynamic(() => import('./hero-shield-3d'), { ssr: false, loading: () => <HeroShield /> });
const Stack3D = dynamic(() => import('./layer-stack-3d'), { ssr: false });

function use3D() {
  const reduce = useReducedMotion();
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(hasWebGL()), []);
  return ok && !reduce;
}

export function HeroShield3D() {
  const ok = use3D();
  return ok ? <Shield3D className="aspect-[420/440] w-full" /> : <HeroShield />;
}

type Layer = { label: string; detail: string; tone?: Tone };

/**
 * The How-it-works stack: a sticky 3D scene beside the six layer labels. Scrolling through the section pulls the
 * plates apart; the label in the middle of the screen lifts its plate.
 */
export function HowItWorks3D({ layers }: { layers: Layer[] }) {
  const ok = use3D();
  const host = useRef<HTMLDivElement>(null);
  const explode = useRef(0);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: host, offset: ['start 85%', 'start 15%'] });
  useMotionValueEvent(scrollYProgress, 'change', (v) => (explode.current = Math.min(1, Math.max(0, v))));
  useEffect(() => {
    explode.current = Math.min(1, Math.max(0, scrollYProgress.get()));
  }, [scrollYProgress]);
  useEffect(() => {
    if (!ok) return;
    const items = Array.from(host.current?.querySelectorAll<HTMLElement>('[data-layer]') ?? []);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) {
          const i = Number((e.target as HTMLElement).dataset.layer);
          activeRef.current = i;
          setActive(i);
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ok]);
  const select = (i: number) => {
    activeRef.current = i;
    setActive(i);
  };
  return (
    <div ref={host}>
      {!ok ? (
        <LayerStack layers={layers} />
      ) : (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
      <div className="relative h-[56vh] min-h-[380px] lg:sticky lg:top-20 lg:h-[80vh]">
        <Stack3D tones={layers.map((l) => (l.tone ?? 'plain') as PlateTone)} explode={explode} active={activeRef} className="absolute inset-0" />
      </div>
      <ol className="lg:py-[18vh]">
        {layers.map((l, i) => (
          <li key={l.label} data-layer={i} className="flex lg:min-h-[34vh] lg:items-center">
            <button type="button" onClick={() => select(i)} onFocus={() => select(i)} className={cx('flex w-full items-start gap-4 rounded-[12px] border p-5 text-left transition-[opacity,border-color,background-color] duration-300', active === i ? 'border-sapphire bg-panel opacity-100 shadow-[var(--shadow-md)]' : 'border-transparent opacity-50 hover:opacity-80')} aria-current={active === i ? 'step' : undefined}>
              <NumberBadge n={i + 1} tone={l.tone ?? 'plain'} />
              <span className="min-w-0">
                <span className="block text-[20px] font-semibold text-quartz">{l.label}</span>
                <span className="mt-1.5 block text-[15.5px] leading-[1.55] text-ash">{l.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
      )}
    </div>
  );
}
