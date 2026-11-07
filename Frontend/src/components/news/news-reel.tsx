'use client';

/**
 * The newspaper sequence: front pages of "The Daily Breach" (an invented masthead) spin in from the dark as you
 * scroll, land with a slight tilt, get stamped with the Zoro feature that answers them, and are knocked back into a
 * pile by the next page. Driven by any 0…1 progress value, so the intro and the home page share it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValueEvent, useTransform, type MotionValue } from 'motion/react';
import { cx } from '../ui';
import { STORIES, type Story } from './stories';

const TILT = [-3, 2.5, -1.5, 3.5, -2.5, 1.5, -3.5, 2];
const serif = { fontFamily: 'var(--font-news-serif), Georgia, serif' };
const mast = { fontFamily: 'var(--font-news-mast), var(--font-news-serif), serif' };

/** Paper grain: tiny dots in two sizes over the newsprint colour. */
const grain = {
  backgroundColor: 'var(--paper)',
  backgroundImage: 'radial-gradient(color-mix(in oklab, var(--paper-ink) 9%, transparent) 0.6px, transparent 0.8px), radial-gradient(color-mix(in oklab, var(--paper-shade) 80%, transparent) 1px, transparent 1.4px), linear-gradient(135deg, transparent 60%, color-mix(in oklab, var(--paper-shade) 60%, transparent))',
  backgroundSize: '5px 5px, 11px 11px, 100% 100%',
};

export function FrontPage({ s, n, total, stampOpacity, stampScale }: { s: Story; n: number; total: number; stampOpacity?: MotionValue<number>; stampScale?: MotionValue<number> }) {
  return (
    <article className="relative w-[min(94vw,780px)] overflow-hidden rounded-[3px] px-5 py-5 text-[color:var(--paper-ink)] shadow-2xl md:px-9 md:py-7" style={grain} aria-label={`${s.headline}. ${s.date}.`}>
      {/* masthead */}
      <div className="flex items-end justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--paper-muted)] md:text-[11px]" style={serif}>
        <span>
          Vol. II · No. {n} of {total}
        </span>
        <span className="hidden md:inline">Zoro edition</span>
        <span>{s.date}</span>
      </div>
      <p className="mt-1 text-center text-[40px] leading-none md:text-[64px]" style={mast}>
        The Daily Breach
      </p>
      <div className="mt-2 border-y-[3px] border-double border-[color:var(--paper-rule)] py-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] md:text-[11px]" style={serif}>
        All the news that agents trusted · Price: one agent’s trust
      </div>

      {/* headline */}
      <h3 className="mt-4 text-[28px] font-black leading-[1.02] tracking-[-0.01em] md:mt-5 md:text-[48px]" style={serif}>
        {s.headline}
      </h3>
      <p className="mt-2 text-[16px] italic leading-snug text-[color:var(--paper-muted)] md:text-[20px]" style={serif}>
        {s.deck}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-[color:var(--paper-rule)] pt-4 md:mt-5 md:grid-cols-[1.15fr_1fr] md:gap-7">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={serif}>
            The simple story
          </p>
          <p className="mt-2 text-[14px] leading-[1.55] md:text-[16px] md:first-letter:float-left md:first-letter:mr-1.5 md:first-letter:text-[48px] md:first-letter:font-black md:first-letter:leading-[0.85]" style={serif}>
            {s.story}
          </p>
        </div>
        <div className="relative md:border-l md:border-[color:var(--paper-rule)] md:pl-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={serif}>
            What Zoro does
          </p>
          <p className="mt-2 text-[15px] font-bold leading-snug md:text-[17px]" style={serif}>
            {s.feature}
          </p>
          <p className="mt-1.5 text-[14px] leading-[1.55] md:text-[15px]" style={serif}>
            {s.zoro}
          </p>
          {/* ink stamp */}
          <motion.div style={{ opacity: stampOpacity, scale: stampScale, rotate: -9, color: 'var(--stamp)', borderColor: 'var(--stamp)' }} className="pointer-events-none absolute -right-1 -top-3 rounded-[6px] border-[3px] px-3 py-1.5 text-center mix-blend-multiply md:-right-3 md:-top-5" aria-hidden>
            <span className="block text-[9px] font-bold uppercase tracking-[0.25em]" style={serif}>
              Handled by
            </span>
            <span className="block text-[18px] font-black uppercase leading-none tracking-[0.08em] md:text-[22px]" style={serif}>
              Zoro
            </span>
          </motion.div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1 border-t border-[color:var(--paper-rule)] pt-2 text-[11px] leading-snug text-[color:var(--paper-muted)] md:flex-row md:items-start md:justify-between md:gap-6 md:text-[12px]" style={serif}>
        {s.limit && <span className="italic">Honest limit: {s.limit}</span>}
        <span className="shrink-0">Source: {s.source}</span>
      </div>
    </article>
  );
}

/** Where page i sits at local time t (0 = starts spinning in, 1 = next page arrives). */
function pose(t: number, tilt: number) {
  if (t < 0) return { rotate: 540 + tilt, scale: 0.06, y: 0, opacity: 0, shade: 0 };
  if (t < 0.35) {
    const k = t / 0.35;
    const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
    return { rotate: (540 + tilt) * (1 - e) + tilt * e, scale: 0.06 + 0.94 * e, y: 0, opacity: Math.min(1, k * 2.5), shade: 0 };
  }
  if (t < 1) return { rotate: tilt, scale: 1, y: 0, opacity: 1, shade: 0 };
  // knocked back into the pile, then gone after two more pages
  const k = Math.min(1, (t - 1) / 0.35);
  const depth = Math.min(2, t - 1);
  return { rotate: tilt - 2 * k, scale: 1 - 0.06 * depth, y: 26 * depth, opacity: t > 3 ? Math.max(0, 1 - (t - 3) * 3) : 1, shade: 0.28 * Math.min(1, depth) };
}

function ReelPage({ i, s, progress, from, span }: { i: number; s: Story; progress: MotionValue<number>; from: number; span: number }) {
  const t = useTransform(progress, (p) => (p - (from + i * span)) / span);
  const tilt = TILT[i % TILT.length];
  const rotate = useTransform(t, (v) => pose(v, tilt).rotate);
  const scale = useTransform(t, (v) => pose(v, tilt).scale);
  const y = useTransform(t, (v) => pose(v, tilt).y);
  const opacity = useTransform(t, (v) => pose(v, tilt).opacity);
  const shade = useTransform(t, (v) => pose(v, tilt).shade);
  const stampOpacity = useTransform(t, [0.42, 0.5], [0, 1]);
  const stampScale = useTransform(t, [0.42, 0.52], [2.6, 1]);
  // scale the page down to fit the stage, so it never runs under the top bar on short screens
  const stage = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const measure = () => {
      if (!stage.current || !page.current) return;
      const h = page.current.offsetHeight;
      const w = page.current.offsetWidth;
      setFit(Math.min(1, (stage.current.clientHeight - 24) / h, (stage.current.clientWidth - 8) / w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (stage.current) ro.observe(stage.current);
    if (page.current) ro.observe(page.current);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div ref={stage} className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 100 + i }}>
      <div ref={page} style={{ transform: `scale(${fit})` }}>
      <motion.div style={{ rotate, scale, y, opacity }} className="relative">
        <FrontPage s={s} n={i + 1} total={STORIES.length} stampOpacity={stampOpacity} stampScale={stampScale} />
        <motion.div className="pointer-events-none absolute inset-0 rounded-[3px] bg-black" style={{ opacity: shade }} aria-hidden />
      </motion.div>
      </div>
    </motion.div>
  );
}

/**
 * All front pages on one stage. Only the pages near the current one are mounted. `kicker` renders above the stage
 * (e.g. "Act II · The headlines · 03/08").
 */
export function NewsReel({ progress, from, to, kicker, className }: { progress: MotionValue<number>; from: number; to: number; kicker?: (i: number, n: number) => ReactNode; className?: string }) {
  const n = STORIES.length;
  const span = (to - from) / n;
  const [cur, setCur] = useState(-1);
  useMotionValueEvent(progress, 'change', (p) => setCur(p < from - span * 0.2 || p > to + span * 3 ? -99 : Math.floor((p - from) / span)));
  if (cur === -99) return null;
  return (
    <div className={cx('absolute inset-0 flex flex-col', className)}>
      {kicker && <div className="relative z-[300] h-9 shrink-0 text-center">{cur >= 0 && cur < n && kicker(cur, n)}</div>}
      <div className="relative flex-1">{STORIES.map((s, i) => (i >= cur - 2 && i <= cur + 1 ? <ReelPage key={s.id} i={i} s={s} progress={progress} from={from} span={span} /> : null))}</div>
    </div>
  );
}
