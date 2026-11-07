'use client';

/**
 * Motion primitives. Rules (taste-skill motion.md §10): transform and opacity only; reveals fire once when the
 * element is ~88% down the viewport; staggers of 60–90ms; strong ease-outs, no overshoot; and under
 * prefers-reduced-motion everything renders in its finished state (MotionConfig reducedMotion="user").
 */
import { MotionConfig, animate, motion, useInView, useReducedMotion, type HTMLMotionProps, type Variants } from 'motion/react';
import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.76, 0, 0.24, 1] as const;

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

const VIEWPORT = { once: true, margin: '0px 0px -12% 0px' } as const;

/** One element that rises into place the first time it scrolls into view. */
export function Reveal({ children, delay = 0, y = 16, className, as = 'div', ...rest }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'section' | 'li' | 'p' | 'span' } & Omit<HTMLMotionProps<'div'>, 'children'>) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={VIEWPORT} transition={{ duration: 0.5, ease: EASE_OUT, delay }} {...rest}>
      {children}
    </Comp>
  );
}

const staggerParent = (gap: number, delay: number): Variants => ({ hidden: {}, shown: { transition: { staggerChildren: gap, delayChildren: delay } } });
const staggerChild = (y: number): Variants => ({ hidden: { opacity: 0, y }, shown: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_EXPO } } });

/** Children arrive in reading order, 70ms apart, once. Each direct child is wrapped so callers stay plain. */
export function Stagger({ children, className, itemClassName, gap = 0.07, delay = 0, y = 20, as = 'div' }: { children: ReactNode; className?: string; itemClassName?: string; gap?: number; delay?: number; y?: number; as?: 'div' | 'ul' | 'ol' }) {
  const Parent = motion[as] as typeof motion.div;
  const Item = (as === 'div' ? motion.div : motion.li) as typeof motion.div;
  return (
    <Parent className={className} initial="hidden" whileInView="shown" viewport={VIEWPORT} variants={staggerParent(gap, delay)}>
      {Children.map(children, (child, i) =>
        isValidElement(child) || typeof child === 'string' ? (
          <Item key={i} className={itemClassName} variants={staggerChild(y)}>
            {child}
          </Item>
        ) : null,
      )}
    </Parent>
  );
}

/** Headline lines that rise from behind their own baseline on load (the masked line reveal). */
export function MaskLines({ lines, className, lineClassName, delay = 0.1 }: { lines: ReactNode[]; className?: string; lineClassName?: (i: number) => string | undefined; delay?: number }) {
  return (
    <span className={className}>
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden pb-[0.1em] -mb-[0.1em]">
          <motion.span className={['block', lineClassName?.(i)].filter(Boolean).join(' ')} initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ duration: 0.9, ease: EASE_EXPO, delay: delay + i * 0.11 }}>
            {line}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** Arrives shortly after load (for the sentence and actions under a headline). */
export function LoadIn({ children, delay = 0.42, className, y = 12 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE_OUT, delay }}>
      {children}
    </motion.div>
  );
}

/** A number that counts up to its value once when it enters the view. The real value stays readable to assistive tech. */
export function CountUp({ value, className, duration = 1.1, format = (n: number) => Math.round(n).toLocaleString() }: { value: number; className?: string; duration?: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) return setShown(value);
    const c = animate(0, value, { duration, ease: EASE_EXPO, onUpdate: setShown });
    return () => c.stop();
  }, [inView, value, duration, reduce]);
  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden className="tabular">
        {format(inView || reduce ? shown : 0)}
      </span>
    </span>
  );
}

/** A card that lights where the pointer is (CSS in .spotlight; this only feeds the coordinates). */
export function Spotlight({ children, className, as = 'div', ...rest }: { children: ReactNode; className?: string; as?: 'div' | 'article' | 'li' } & React.HTMLAttributes<HTMLElement>) {
  const Tag = as;
  return (
    <Tag
      {...rest}
      className={['spotlight', className].filter(Boolean).join(' ')}
      onPointerMove={(e: React.PointerEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </Tag>
  );
}

/** Page entrance used by route templates: a short rise, quicker than any section reveal. */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, ease: EASE_OUT }}>
      {children}
    </motion.div>
  );
}
