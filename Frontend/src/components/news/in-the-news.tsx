'use client';

/**
 * Home-page "In the news": the same front pages as the intro, pinned on the light pastel stage while the section scrolls past.
 * Under reduced motion the pages are listed one after another instead.
 */
import { useRef } from 'react';
import { useReducedMotion, useScroll } from 'motion/react';
import { NewsReel, FrontPage } from './news-reel';
import { STORIES } from './stories';

export function InTheNews() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const heading = (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
      <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-[color:var(--intro-light)]">In the news</p>
      <h2 className="font-display mt-2 text-[32px] leading-[1.05] text-[color:var(--intro-text)] md:text-[48px]">
        Real attacks, <span className="text-[color:var(--intro-light)]">simply told.</span>
      </h2>
      <p className="mt-2 max-w-[560px] text-[15px] leading-relaxed text-[color:var(--intro-text)]/75 md:text-[16px]">Eight incidents from 2019 to 2026, and what Zoro does about each kind. Where Zoro would not have helped, the page says so.</p>
    </div>
  );
  if (reduce)
    return (
      <section id="news" aria-label="In the news" className="bg-[color:var(--intro-ink)] py-20">
        {heading}
        <div className="mt-12 flex flex-col items-center gap-10 px-4">
          {STORIES.map((s, i) => (
            <FrontPage key={s.id} s={s} n={i + 1} total={STORIES.length} />
          ))}
        </div>
      </section>
    );
  return (
    <section ref={ref} id="news" aria-label="In the news" className="relative bg-[color:var(--intro-ink)]" style={{ height: `${STORIES.length * 75 + 100}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(80% 70% at 50% 110%, color-mix(in oklab, var(--intro-light) 22%, transparent), transparent 70%)' }} aria-hidden />
        <div className="relative z-[400] pt-20 md:pt-24">{heading}</div>
        <div className="absolute inset-x-0 bottom-3 top-[260px] md:top-[250px]">
          <NewsReel progress={scrollYProgress} from={0.04} to={0.96} />
        </div>
      </div>
    </section>
  );
}
