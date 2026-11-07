'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { Eyebrow, LinkButton, cx } from './ui';
import { LoadIn, MaskLines } from './motion';
import { ThemeToggle } from './theme';
import { ZMark } from './hardware';

export const GITHUB_URL = 'https://github.com/Nouman-wp/Zoro-MCPGuard';

/** Kept for existing imports: the angled Z mark. */
export function Mark({ className }: { className?: string }) {
  return <ZMark className={className} />;
}

export function Logo({ className, wordmark = true }: { className?: string; wordmark?: boolean }) {
  return (
    <Link href="/" className={cx('group inline-flex items-center gap-2', className)} aria-label="Zoro home">
      <span className="flex size-8 items-center justify-center rounded-[8px] border border-sapphire bg-lavender text-on-pastel transition-transform duration-300 group-hover:-rotate-6">
        <ZMark className="size-[18px]" />
      </span>
      {wordmark && <span className="text-[21px] font-bold tracking-[-0.02em] text-quartz">Zoro</span>}
    </Link>
  );
}

type NavItem = { href: string; label: string; spy?: string };
const NAV: NavItem[] = [
  { href: '/#how', label: 'How it works', spy: 'how' },
  { href: '/#tracks', label: 'Tracks', spy: 'tracks' },
  { href: '/lab', label: 'Attack Lab' },
  { href: '/verify', label: 'Verify' },
  { href: '/registry', label: 'Registry' },
  { href: '/docs', label: 'Docs' },
];
const MORE: NavItem[] = [
  { href: '/tracks/ens', label: 'ENS track' },
  { href: '/tracks/world-id', label: 'World ID track' },
  { href: '/tracks/hedera', label: 'Hedera track' },
  { href: '/auditor', label: 'Auditor' },
];

/** On the home page, the section in the middle of the screen lights its nav link. */
function useScrollSpy(enabled: boolean) {
  const [active, setActive] = useState<string>('top');
  useEffect(() => {
    if (!enabled) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>('main section[id]'));
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [enabled]);
  return enabled ? active : null;
}

export function SiteNav() {
  const path = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 8));
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => void (document.body.style.overflow = '');
  }, [open]);
  const home = path === '/';
  const spy = useScrollSpy(home);
  const isActive = (n: NavItem) => (n.spy ? home && spy === n.spy : path.startsWith(n.href));
  return (
    <header className={cx('sticky top-0 z-40 border-b transition-[background-color,border-color] duration-300', scrolled || open ? 'border-obsidian bg-elevated/95 backdrop-blur-md' : 'border-transparent bg-transparent')}>
      <div className="mx-auto grid h-[72px] max-w-[1240px] grid-cols-[auto_1fr_auto] items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center justify-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isActive(n) ? (n.spy ? 'location' : 'page') : undefined} className={cx('rounded-full px-3.5 py-2 text-[15.5px] font-medium transition-colors duration-200', isActive(n) ? 'bg-lavender text-on-pastel' : 'text-quartz hover:bg-ink/[0.05]')}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-end gap-3">
          <span className="hidden lg:inline-flex">
            <ThemeToggle />
          </span>
          <LinkButton href="/console" size="sm" className="hidden sm:inline-flex">
            Open Console
          </LinkButton>
          <button className="flex size-10 items-center justify-center rounded-full border border-obsidian text-quartz lg:hidden" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav key="m" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-x-0 bottom-0 top-[72px] z-40 overflow-y-auto bg-elevated lg:hidden" aria-label="Mobile">
            <ul className="px-6 pb-6 pt-4">
              {[...NAV, ...MORE].map((n, i) => (
                <motion.li key={n.href} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i, duration: 0.22 }}>
                  <Link href={n.href} onClick={() => setOpen(false)} className={cx('block border-b border-obsidian py-4 text-[22px] font-semibold', isActive(n) ? 'text-accent' : 'text-quartz')}>
                    {n.label}
                  </Link>
                </motion.li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-4 px-6 pb-10">
              <LinkButton href="/console">Open Console</LinkButton>
              <ThemeToggle />
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

const FOOTER: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  { title: 'Product', links: [{ href: '/console', label: 'Console' }, { href: '/lab', label: 'Attack Lab' }, { href: '/verify', label: 'Verify' }, { href: '/registry', label: 'Registry' }] },
  { title: 'Tracks', links: [{ href: '/tracks/ens', label: 'ENS' }, { href: '/tracks/world-id', label: 'World ID' }, { href: '/tracks/hedera', label: 'Hedera' }] },
  { title: 'Learn', links: [{ href: '/docs', label: 'Docs' }, { href: '/auditor', label: 'Auditor' }, { href: '/docs#privacy', label: 'Privacy' }, { href: GITHUB_URL, label: 'GitHub', external: true }] },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-sapphire bg-elevated">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-4 pb-10 pt-14 sm:px-6 md:grid-cols-[1.2fr_2fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-ash">The guard at the door between AI agents and the tools they use.</p>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {FOOTER.map((c) => (
            <div key={c.title}>
              <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-slate">{c.title}</p>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[15px] font-medium text-quartz hover:underline">
                        {l.label} <ArrowUpRight className="size-3.5" aria-hidden />
                      </a>
                    ) : (
                      <Link href={l.href} className="text-[15px] font-medium text-quartz hover:underline">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-2 border-t border-obsidian px-4 py-6 text-[13.5px] text-slate sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>Built at ETHGlobal Mumbai 2026</span>
        <span>Every number on this site is computed from real records or labelled as an illustration.</span>
      </div>
    </footer>
  );
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-abyss">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-[8px] focus:bg-ink-solid focus:px-3 focus:py-2 focus:text-[14px] focus:text-on-ink">
        Skip to content
      </a>
      <SiteNav />
      <main id="main" className="flex-1 overflow-x-clip">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

/** The opening of every public subpage: grey eyebrow, then a two-tone headline that rises from its baseline. */
export function PageIntro({ eyebrow, a, b, className }: { eyebrow?: React.ReactNode; a: React.ReactNode; b?: React.ReactNode; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      {eyebrow && (
        <LoadIn delay={0} y={6}>
          <Eyebrow className="relative">{eyebrow}</Eyebrow>
        </LoadIn>
      )}
      <h1 className="font-display relative mt-3 text-[40px] leading-[1.05] md:text-[60px]">
        <MaskLines lines={b ? [a, b] : [a]} lineClassName={(i) => (i === 1 ? 'tone-accent' : undefined)} />
      </h1>
    </div>
  );
}
