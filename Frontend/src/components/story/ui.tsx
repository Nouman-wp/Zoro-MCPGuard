'use client';

import Link from 'next/link';
import { useRef, type ReactNode } from 'react';
import { gsap, useGSAP } from './runtime';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const WRAP = 'mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12';

export type Tone = 'trust' | 'scan' | 'unknown' | 'seal' | 'ask' | 'block' | 'human' | 'ledger';
export const TONE_VAR: Record<Tone, string> = {
  trust: 'var(--trust)',
  scan: 'var(--scan)',
  unknown: 'var(--unknown)',
  seal: 'var(--seal)',
  ask: 'var(--ask)',
  block: 'var(--block)',
  human: 'var(--human)',
  ledger: 'var(--ledger)',
};

/** Status always travels with a word, never colour alone. */
export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  const c = TONE_VAR[tone];
  return (
    <span
      className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11.5px] leading-5', className)}
      style={{ color: c, borderColor: `color-mix(in srgb, ${c} 38%, transparent)`, background: `color-mix(in srgb, ${c} 11%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c }} aria-hidden />
      {children}
    </span>
  );
}

export function Eyebrow({ n, children, tone = 'scan' }: { n?: string; children: ReactNode; tone?: Tone }) {
  return (
    <p className="flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.14em]" style={{ color: TONE_VAR[tone] }}>
      {n && <span className="text-(--text-3)">{n}</span>}
      <span className="h-px w-8" style={{ background: TONE_VAR[tone] }} aria-hidden />
      {children}
    </p>
  );
}

/** Section heading that rises line by line when it scrolls in. */
export function Heading({ children, className, as: As = 'h2' }: { children: ReactNode; className?: string; as?: 'h1' | 'h2' }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from(ref.current, { y: 36, opacity: 0, duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: ref.current, start: 'top 88%', once: true } });
      });
    },
    { scope: ref },
  );
  return (
    <As ref={ref} className={cx('font-display font-medium tracking-[-0.025em] text-balance', As === 'h1' ? 'text-[44px] leading-[1.02] md:text-[72px]' : 'text-[34px] leading-[1.06] md:text-[52px]', className)}>
      {children}
    </As>
  );
}

/** Fades a block up as it enters; nothing moves with reduced motion. */
export function Rise({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(ref.current, { y: 28, opacity: 0, duration: 0.8, delay, ease: 'power3.out', scrollTrigger: { trigger: ref.current, start: 'top 90%', once: true } });
    });
  });
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export function Panel({ children, className, tone, title, right }: { children: ReactNode; className?: string; tone?: Tone; title?: ReactNode; right?: ReactNode }) {
  return (
    <div
      className={cx('overflow-hidden rounded-[14px] border bg-(--surface)', className)}
      style={{ borderColor: tone ? `color-mix(in srgb, ${TONE_VAR[tone]} 34%, var(--line))` : 'var(--line)' }}
    >
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-(--line) px-4 py-2.5 font-mono text-[12px] text-(--text-2)">
          <span className="truncate">{title}</span>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Btn({ href, children, variant = 'primary', className }: { href: string; children: ReactNode; variant?: 'primary' | 'ghost'; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        'inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-5 text-[15px] font-medium transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--trust)',
        variant === 'primary' ? 'bg-(--trust-fill) text-white hover:bg-(--trust)' : 'border border-(--line-strong) text-(--text) hover:border-(--text-3) hover:bg-(--surface)',
        className,
      )}
    >
      {children}
    </Link>
  );
}

export const short = (h: string, head = 10, tail = 6) => (h.length > head + tail + 1 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h);
