'use client';

/**
 * Shared components for the public site and the Console, in the ETHGlobal-inspired style: white cards with an ink
 * border and a pastel footer strip, outlined chips, black and yellow buttons. Colours come only from the CSS
 * variables in globals.css; SVG fills read them through `style` so both themes work.
 */
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { Button, Eyebrow, LinkButton, cx } from './ui';
import { Reveal } from './motion';

export { StatusPill } from './ui';
/** Kept names from the previous system; they are the shared Button and LinkButton. */
export const ChamferButton = Button;
export const ChamferLink = LinkButton;

/** The pastel each sponsor track (and other card groups) owns. */
export type Tone = 'mint' | 'lavender' | 'peach' | 'pink' | 'plain';
export const TONE_BG: Record<Tone, string> = { mint: 'bg-mint', lavender: 'bg-lavender', peach: 'bg-peach', pink: 'bg-pink', plain: 'bg-panel' };
export const TONE_SOFT: Record<Tone, string> = { mint: 'bg-mint-soft', lavender: 'bg-lavender-soft', peach: 'bg-peach-soft', pink: 'bg-pink-soft', plain: 'bg-panel' };

// ---------- Brand ----------

/** Zoro's mark: a bold angled Z, two parallel slanted strokes with cut ends. Reads at 16px. */
export function ZMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M6 4h22.5L15 22h10.5L22 28H3.5L17 10H2.5Z" style={{ fill: 'currentColor' }} />
    </svg>
  );
}

// ---------- Headings ----------

/** Small grey eyebrow + big two-tone heading (black, then navy) + optional lead. */
export function SectionHeading({ eyebrow, a, b, lead, center, className, as: H = 'h2' }: { eyebrow?: ReactNode; a: ReactNode; b?: ReactNode; lead?: ReactNode; center?: boolean; className?: string; as?: 'h1' | 'h2' }) {
  return (
    <Reveal className={cx(center && 'mx-auto text-center', className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <H className={cx('font-display mt-3 text-[36px] leading-[1.06] text-quartz md:text-[52px] lg:text-[60px]', center && 'mx-auto max-w-[900px]')}>
        {a}
        {b && <span className="tone-accent"> {b}</span>}
      </H>
      {lead && <p className={cx('mt-5 max-w-[620px] text-[17px] leading-[1.6] text-ash md:text-[18px]', center && 'mx-auto')}>{lead}</p>}
    </Reveal>
  );
}

/** Outlined pill tag (event-type style). */
export function Chip({ children, tone = 'plain', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-sapphire px-2.5 py-[3px] text-[12px] font-semibold uppercase tracking-[0.03em] text-on-pastel', TONE_BG[tone], tone === 'plain' && 'text-quartz', className)}>{children}</span>;
}

// ---------- Cards and rows ----------

/**
 * White card with an ink border; an optional pastel footer strip holds its link label and an arrow.
 * `footer` replaces the strip's content; `cta` sets the strip's label when the card links somewhere.
 */
export function TabCard({ icon, art, title, children, footer, href, cta, tone = 'peach', className, compact, top }: { icon?: ReactNode; art?: ReactNode; title: ReactNode; children?: ReactNode; footer?: ReactNode; href?: string; cta?: ReactNode; tone?: Tone; className?: string; compact?: boolean; top?: ReactNode }) {
  const strip = footer ?? (href ? (
    <span className="flex items-center justify-between font-semibold">
      {cta ?? 'Learn more'}
      <ArrowUpRight className="size-4" aria-hidden />
    </span>
  ) : null);
  const body = (
    <div className={cx('chamfer-frame is-tab tabcard flex h-full flex-col overflow-hidden', className)}>
      {art && <div className={cx('border-b border-sapphire px-4 pt-3', TONE_SOFT[tone])}>{art}</div>}
      <div className={cx('flex flex-1 flex-col p-6', art ? '' : compact ? 'min-h-[200px]' : 'min-h-[240px]')}>
        {top}
        {icon && <div className="tabcard-icon text-quartz [&_svg]:size-7 [&_svg]:stroke-[1.6]">{icon}</div>}
        <h3 className={cx('text-[19px] font-semibold leading-snug text-quartz md:text-[21px]', icon ? 'mt-6' : top ? 'mt-1' : undefined)}>{title}</h3>
        {children && <div className="mt-2.5 text-[15px] leading-[1.55] text-ash">{children}</div>}
      </div>
      {strip && <div className={cx('card-foot px-6 py-3 text-[14.5px]', TONE_BG[tone])}>{strip}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-[12px] focus-visible:outline-offset-4">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Outlined chip holding a two-digit number. */
export function NumberBadge({ n, className, tone = 'plain' }: { n: number; className?: string; tone?: Tone }) {
  return <span className={cx('inline-flex h-9 min-w-11 shrink-0 items-center justify-center rounded-[8px] border border-sapphire px-2 text-[15px] font-bold text-on-pastel', TONE_BG[tone], tone === 'plain' && 'text-quartz', className)}>{String(n).padStart(2, '0')}</span>;
}

export function FeatureRow({ n, title, children, align = 'left', tone }: { n: number; title: ReactNode; children: ReactNode; align?: 'left' | 'right'; tone?: Tone }) {
  return (
    <div className={cx('flex items-start gap-4', align === 'right' && 'lg:flex-row-reverse lg:text-right')}>
      <NumberBadge n={n} tone={tone} />
      <div className="min-w-0">
        <h3 className="text-[17px] font-semibold text-quartz">{title}</h3>
        <p className="mt-1 text-[15px] leading-[1.5] text-ash">{children}</p>
      </div>
    </div>
  );
}

export function IconRow({ icon, title, children }: { icon: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <div className="group flex items-start gap-4 border-b border-obsidian py-5 last:border-b-0">
      <span className="icon-wiggle mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-sapphire bg-panel group-hover:bg-lavender group-hover:text-on-pastel text-quartz [&_svg]:size-5 [&_svg]:stroke-[1.6]">{icon}</span>
      <div className="min-w-0">
        <h3 className="text-[17px] font-semibold text-quartz">{title}</h3>
        <p className="mt-1 text-[15px] leading-[1.5] text-ash">{children}</p>
      </div>
    </div>
  );
}

/** A label with a 1px leader line pointing back at part of a graphic. */
export function CalloutLabel({ label, detail, side = 'right', className, tone }: { label: ReactNode; detail?: ReactNode; side?: 'left' | 'right'; className?: string; tone?: Tone }) {
  return (
    <div className={cx('flex items-center gap-3', side === 'left' && 'flex-row-reverse text-right', className)}>
      <span className="relative h-px w-10 shrink-0 bg-sapphire sm:w-14" aria-hidden>
        <span className={cx('absolute top-1/2 size-2 -translate-y-1/2 rounded-full border border-sapphire', tone ? TONE_BG[tone] : 'bg-panel', side === 'right' ? '-left-1' : '-right-1')} />
      </span>
      <div className="min-w-0">
        <p className="text-[16px] font-semibold text-quartz">{label}</p>
        {detail && <p className="mt-0.5 max-w-[340px] text-[14.5px] leading-snug text-ash">{detail}</p>}
      </div>
    </div>
  );
}

// ---------- Terminal ----------

export type TermLine = { text: string; tone?: 'default' | 'dim' | 'accent' | 'blocked' | 'ask' | 'sealed' };
const TERM_TONE: Record<NonNullable<TermLine['tone']>, string> = { default: 'text-code-text', dim: 'text-code-gutter', accent: 'text-code-key', blocked: 'text-[color:var(--pink)]', ask: 'text-code-num', sealed: 'text-code-str' };

/** A dark code card that types its lines once it scrolls into view (35ms a character), with a blinking cursor. */
export function Terminal({ lines, title = 'zoro — gateway', className }: { lines: TermLine[]; title?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduce = useReducedMotion();
  const total = lines.reduce((n, l) => n + l.text.length, 0);
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (!inView || reduce) return;
    if (typed >= total) return;
    const t = setTimeout(() => setTyped((n) => n + 1), 35);
    return () => clearTimeout(t);
  }, [inView, reduce, typed, total]);
  const shown = reduce ? total : typed;
  let left = shown;
  return (
    <div ref={ref} className={cx('overflow-hidden rounded-[12px] border border-sapphire bg-code shadow-[var(--shadow-float)]', className)}>
      <div className="flex items-center gap-2 border-b border-code-edge px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-pink" />
          <span className="size-2.5 rounded-full bg-peach" />
          <span className="size-2.5 rounded-full bg-mint" />
        </span>
        <span className="ml-2 font-mono text-[12px] text-code-gutter">{title}</span>
      </div>
      <pre className="sr-only">{lines.map((l) => l.text).join('\n')}</pre>
      <div className="min-h-[220px] px-5 py-4 font-mono text-[13px] leading-[1.75] md:text-[14px]" aria-hidden>
        {lines.map((l, i) => {
          const n = Math.max(0, Math.min(l.text.length, left));
          left -= l.text.length;
          const active = n < l.text.length || (i === lines.length - 1 && n === l.text.length);
          if (n === 0 && !(i === 0 && shown === 0)) return null;
          return (
            <div key={i} className={cx('whitespace-pre-wrap break-words', TERM_TONE[l.tone ?? 'default'])}>
              {l.text.slice(0, n)}
              {active && <span className="cursor-blink text-code-text">█</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Frames and panels ----------

/** Rounded frame with a title bar that holds a Console screen or a live mini-UI. */
export function DeviceFrame({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div className={cx('overflow-hidden rounded-[12px] border border-sapphire bg-panel shadow-[var(--shadow-float)]', className)}>
      <div className="flex items-center gap-2 border-b border-sapphire bg-lavender px-4 py-2.5 text-on-pastel">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full border border-sapphire bg-panel" />
          <span className="size-2.5 rounded-full border border-sapphire bg-panel" />
          <span className="size-2.5 rounded-full border border-sapphire bg-panel" />
        </span>
        <span className="ml-1 text-[13px] font-semibold">{label ?? 'Zoro Console'}</span>
      </div>
      <div className="bg-abyss">{children}</div>
    </div>
  );
}

/** Pastel call-to-action block with an ink border and dark text. */
export function CTAPanel({ eyebrow, title, children, graphic, className }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; graphic?: ReactNode; className?: string }) {
  return (
    <div className={cx('cta-panel relative overflow-hidden px-6 py-12 md:px-14 md:py-16', className)}>
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          {eyebrow && <p className="text-[13px] font-semibold uppercase tracking-[0.06em] md:text-[14px]">{eyebrow}</p>}
          <h2 className="font-display mt-3 text-[36px] leading-[1.05] md:text-[56px]">{title}</h2>
          {children && <div className="mt-8">{children}</div>}
        </div>
        {graphic && <div className="relative mx-auto w-full max-w-[340px]">{graphic}</div>}
      </div>
    </div>
  );
}

// ---------- Graphics (original, drawn in SVG) ----------

const SHIELD = 'M200 26 L332 74 V176 C332 262 276 330 200 360 C124 330 68 262 68 176 V74 Z';

/**
 * Hero graphic: a flat-shaded isometric Zoro shield in pastel blocks with ink outlines, floating slowly and leaning
 * toward the pointer (both off under reduced motion). An original drawing in the pastel-illustration manner.
 */
export function HeroShield({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(my, { stiffness: 60, damping: 18 });
  const ry = useSpring(mx, { stiffness: 60, damping: 18 });
  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      mx.set((e.clientX / window.innerWidth - 0.5) * 12);
      my.set((e.clientY / window.innerHeight - 0.5) * -8);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [reduce, mx, my]);
  const ink = { stroke: 'var(--border-strong)', strokeWidth: 2, strokeLinejoin: 'round' as const };
  return (
    <motion.div className={cx('relative [perspective:1000px]', className)} style={reduce ? undefined : { rotateX: rx, rotateY: ry }}>
      <div className="float-y relative">
        <svg viewBox="0 0 420 440" className="relative h-auto w-full" role="img" aria-label="The Zoro gateway: a shield standing between an agent and its tools">
          <defs>
            <linearGradient id="hs-face" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--lavender)' }} />
              <stop offset="0.5" style={{ stopColor: 'var(--pink)' }} />
              <stop offset="1" style={{ stopColor: 'var(--peach)' }} />
            </linearGradient>
            <linearGradient id="hs-panel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--mint)' }} />
              <stop offset="1" style={{ stopColor: 'var(--lavender)' }} />
            </linearGradient>
          </defs>
          {/* base platform */}
          <path d="M210 360 L390 300 L210 240 L30 300 Z" style={{ fill: 'var(--peach)', ...ink }} />
          <path d="M30 300 V318 L210 378 V360 Z M390 300 V318 L210 378 V360 Z" style={{ fill: 'var(--pink)', ...ink }} />
          {[[120, 300], [210, 270], [300, 300], [210, 330]].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y - 9} L${x + 26} ${y} L${x} ${y + 9} L${x - 26} ${y} Z`} style={{ fill: i % 2 ? 'var(--mint)' : 'var(--lavender)', ...ink, strokeWidth: 1.5 }} />
          ))}
          {/* shield, extruded */}
          <g transform="translate(5 -6)">
            <path d={SHIELD} transform="translate(16 18)" style={{ fill: 'var(--accent)', ...ink }} />
            <path d={SHIELD} style={{ fill: 'url(#hs-face)', ...ink }} />
            <path d="M200 58 L304 96 V178 C304 246 262 300 200 326 C138 300 96 246 96 178 V96 Z" style={{ fill: 'url(#hs-panel)', ...ink, strokeWidth: 1.5 }} />
            <g transform="translate(144 124) scale(3.5)">
              <path d="M6 4h22.5L15 22h10.5L22 28H3.5L17 10H2.5Z" style={{ fill: 'var(--accent)', stroke: 'var(--border-strong)', strokeWidth: 0.5 }} />
            </g>
          </g>
          {/* small floating tiles */}
          <path d="M360 120 L392 108 L404 132 L372 144 Z" style={{ fill: 'var(--mint)', ...ink, strokeWidth: 1.5 }} />
          <path d="M28 150 L58 140 L68 162 L38 172 Z" style={{ fill: 'var(--peach)', ...ink, strokeWidth: 1.5 }} />
          <circle cx="372" cy="210" r="10" style={{ fill: 'var(--lavender)', ...ink, strokeWidth: 1.5 }} />
        </svg>
      </div>
    </motion.div>
  );
}

/** One flat isometric plate of the layer stack. */
function Plate({ tone }: { tone: Tone }) {
  const ink = { stroke: 'var(--border-strong)', strokeWidth: 1.5, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 260 104" className="h-auto w-full" aria-hidden>
      <path d="M10 52 V64 L130 102 V90 Z M250 52 V64 L130 102 V90 Z" style={{ fill: 'var(--accent)', ...ink }} />
      <path d="M130 14 L250 52 L130 90 L10 52 Z" style={{ fill: `var(--${tone === 'plain' ? 'surface' : tone})`, ...ink }} />
      <path d="M130 32 L196 52 L130 72 L64 52 Z" style={{ fill: 'none', stroke: 'var(--border-strong)', strokeOpacity: 0.35, strokeWidth: 1 }} />
    </svg>
  );
}

/** Exploded isometric stack of the security pipeline, each layer called out with a leader line. */
export function LayerStack({ layers }: { layers: { label: string; detail: string; tone?: Tone }[] }) {
  return (
    <div className="relative mx-auto max-w-[880px]">
      {layers.map((l, i) => (
        <Reveal key={l.label} delay={i * 0.06} className={cx('relative grid grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(200px,280px)_1fr]', i > 0 && '-mt-4 sm:-mt-3')}>
          <div className="relative w-[70%] max-w-[280px] sm:w-full" style={{ zIndex: layers.length - i }}>
            <Plate tone={l.tone ?? 'plain'} />
          </div>
          <CalloutLabel label={`${String(i + 1).padStart(2, '0')} · ${l.label}`} detail={l.detail} tone={l.tone} className="-mt-2 pb-4 sm:mt-0 sm:pb-0" />
        </Reveal>
      ))}
    </div>
  );
}

/** Ink line drawing of the shield module for the call-to-action panel. */
export function WireframeShield({ className }: { className?: string }) {
  const line = { stroke: 'var(--on-pastel)', fill: 'none' };
  return (
    <svg viewBox="0 0 400 420" className={cx('h-auto w-full', className)} aria-hidden>
      <defs>
        <pattern id="wf-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" style={{ stroke: 'var(--on-pastel)', strokeWidth: 0.8, strokeOpacity: 0.5 }} />
        </pattern>
      </defs>
      <path d={SHIELD} transform="translate(14 22)" style={{ ...line, fill: 'url(#wf-hatch)', strokeWidth: 1.4 }} />
      <path d={SHIELD} style={{ ...line, fill: 'var(--surface)', strokeWidth: 2 }} />
      <path d="M200 58 L304 96 V178 C304 246 262 300 200 326 C138 300 96 246 96 178 V96 Z" style={{ ...line, strokeWidth: 1.2, strokeDasharray: '4 4' }} />
      <g transform="translate(144 128) scale(3.5)">
        <path d="M6 4h22.5L15 22h10.5L22 28H3.5L17 10H2.5Z" style={{ fill: 'var(--on-pastel)' }} />
      </g>
    </svg>
  );
}
