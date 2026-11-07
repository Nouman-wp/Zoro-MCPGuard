'use client';

/**
 * Beginner tooltips. `Tip` wraps any element and shows a small explanation card on hover, keyboard focus or tap.
 * `InfoTip` is the same thing on a round “?” button. The card is portalled to <body> with fixed positioning, so
 * panels with overflow-hidden never clip it, and it flips below/above and stays inside the viewport.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import { cx } from './ui';

export interface TipContent {
  title?: ReactNode;
  body: ReactNode;
  /** Optional "for example" line, shown in a softer box. */
  example?: ReactNode;
}

function Card({ c }: { c: TipContent }) {
  return (
    <>
      {c.title && <p className="text-[13.5px] font-semibold text-quartz">{c.title}</p>}
      <div className={cx('text-[13px] leading-[1.55] text-mist', c.title ? 'mt-1' : undefined)}>{c.body}</div>
      {c.example && <div className="mt-2 rounded-[8px] bg-lavender-soft px-2.5 py-1.5 text-[12.5px] leading-[1.5] text-on-pastel">{c.example}</div>}
    </>
  );
}

export function Tip({ content, children, className, block }: { content: TipContent; children: ReactNode; className?: string; block?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 120);
  }, []);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const place = () => {
      const r = ref.current!.getBoundingClientRect();
      const w = card.current?.offsetWidth ?? 300;
      const h = card.current?.offsetHeight ?? 120;
      const below = r.top < h + 16;
      const left = Math.min(window.innerWidth - w - 12, Math.max(12, r.left + r.width / 2 - w / 2));
      setPos({ left, top: below ? r.bottom + 10 : r.top - h - 10, below });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !card.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <span ref={ref} className={cx(block ? 'block' : 'inline-flex', className)} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onClick={() => setOpen(true)} aria-describedby={open ? id : undefined}>
      {children}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={card}
            id={id}
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={hide}
            className="fixed z-[1000] w-[min(320px,calc(100vw-24px))] rounded-[12px] border border-sapphire bg-panel p-3.5 shadow-[0_16px_40px_-12px_rgba(10,10,10,0.35)]"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
          >
            <Card c={content} />
          </div>,
          document.body,
        )}
    </span>
  );
}

/** A small round “?” that explains the thing next to it. */
export function InfoTip({ content, label = 'What is this?', className }: { content: TipContent; label?: string; className?: string }) {
  return (
    <Tip content={content} className={className}>
      <button type="button" aria-label={label} className="inline-flex size-[18px] items-center justify-center rounded-full text-slate transition-colors hover:bg-ink/[0.06] hover:text-quartz focus-visible:outline-2 focus-visible:outline-accent">
        <HelpCircle className="size-4" aria-hidden />
      </button>
    </Tip>
  );
}
