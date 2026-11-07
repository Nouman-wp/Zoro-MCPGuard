'use client';

/**
 * Documentation navigation: a sticky sidebar on wide screens and a sticky chip row on small ones. The section in view
 * is highlighted (scroll-spy), so readers always know where they are.
 */
import { useEffect, useState } from 'react';
import { cx } from './ui';

export function DocsNav({ items }: { items: readonly (readonly [string, string])[] }) {
  const [active, setActive] = useState(items[0]?.[0]);
  useEffect(() => {
    const els = items.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => Boolean(e));
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-90px 0px -65% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  return (
    <>
      {/* wide screens */}
      <aside className="hidden lg:block">
        <nav className="sticky top-24 rounded-[12px] border border-sapphire bg-panel p-2 text-[14px]" aria-label="Documentation sections">
          <p className="px-2.5 pb-2 pt-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-slate">On this page</p>
          {items.map(([id, label], i) => (
            <a key={id} href={`#${id}`} aria-current={active === id ? 'true' : undefined} className={cx('flex items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 transition-colors', active === id ? 'bg-lavender font-semibold text-on-pastel' : 'text-ash hover:bg-ink/[0.04] hover:text-quartz')}>
              <span className={cx('font-mono text-[11px]', active === id ? 'text-on-pastel' : 'text-slate')}>{String(i + 1).padStart(2, '0')}</span>
              {label}
            </a>
          ))}
        </nav>
      </aside>
      {/* small screens */}
      <nav className="no-scrollbar sticky top-16 z-20 -mx-4 flex gap-2 overflow-x-auto border-b border-obsidian bg-[color:var(--bg)]/90 px-4 py-2.5 backdrop-blur lg:hidden" aria-label="Documentation sections">
        {items.map(([id, label]) => (
          <a key={id} href={`#${id}`} className={cx('shrink-0 rounded-full border px-3 py-1 text-[13px] font-medium', active === id ? 'border-sapphire bg-lavender text-on-pastel' : 'border-obsidian bg-panel text-ash')}>
            {label}
          </a>
        ))}
      </nav>
    </>
  );
}
