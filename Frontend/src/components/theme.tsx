'use client';

import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';
import { cx } from './ui';
import { THEME_KEY as KEY } from '@/lib/theme-script';

export type Theme = 'dark' | 'light';
const THEME_COLOR: Record<Theme, string> = { dark: '#0a0b0c', light: '#f6f7f9' };

const listeners = new Set<() => void>();
const read = (): Theme => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

function apply(next: Theme) {
  const root = document.documentElement;
  root.dataset.theme = next;
  root.style.colorScheme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[next]);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  listeners.forEach((l) => l());
}

export function setTheme(next: Theme) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !reduce) doc.startViewTransition(() => apply(next));
  else apply(next);
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    read,
    () => 'dark',
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={cx('relative inline-flex size-8 items-center justify-center overflow-hidden rounded-full border border-ink/10 text-mist transition-[color,border-color,background-color,transform] duration-200 hover:border-ink/25 hover:bg-ink/[0.04] hover:text-quartz active:scale-95', className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={theme} initial={{ y: 10, opacity: 0, rotate: -45 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={{ y: -10, opacity: 0, rotate: 45 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="flex">
          {theme === 'dark' ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
