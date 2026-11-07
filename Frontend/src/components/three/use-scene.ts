'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Reads design tokens (CSS custom properties on <html>) so 3D materials use the same colours as the rest of the
 * site, and re-reads them when the theme switch changes data-theme. No colour values live in the 3D code.
 */
export function useCssColors<K extends string>(names: readonly K[]): Record<K, string> | null {
  const [colors, setColors] = useState<Record<K, string> | null>(null);
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      setColors(Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(`--${n}`).trim()])) as Record<K, string>);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names.join(',')]);
  return colors;
}

/** True while the element is on screen; scenes stop rendering frames when it is false. */
export function useOnScreen(ref: RefObject<Element | null>, margin = '100px') {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return on;
}

/** WebGL availability, checked once on the client. */
export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
