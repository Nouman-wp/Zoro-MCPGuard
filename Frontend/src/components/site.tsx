'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { Eyebrow, LinkButton, cx } from './ui';
import { LoadIn, MaskLines } from './motion';
import { ThemeToggle } from './theme';

/** Zoro's mark: a seal outline with the Z cut through it. Drawn in one ink so it reads at 16px. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <path d="M16 2.8 5 7.1v8.1c0 6.6 4.5 12 11 14 6.5-2 11-7.4 11-14V7.1L16 2.8Z" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M11 11.2h10l-10 9.6h10" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cx('group inline-flex items-center gap-2.5', className)} aria-label="Zoro home">
      <Mark className="size-7 text-quartz transition-transform duration-300 ease-out group-hover:-rotate-6" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[20px] font-semibold tracking-[-0.03em]">Zoro</span>
        <span className="mt-0.5 text-[8.5px] font-semibold tracking-[0.14em] text-ash">BY MCPGUARD</span>
      </span>
    </Link>
  );
}

const NAV = [
  { href: '/docs', label: 'Docs' },
  { href: '/lab', label: 'Attack Lab' },
  { href: '/verify', label: 'Verify' },
  { href: '/registry', label: 'Registry' },
  { href: '/auditor', label: 'Auditor' },
];

export function SiteNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 8));
  useEffect(() => setOpen(false), [path]);
  return (
    <header className={cx('sticky top-0 z-40 border-b transition-[background-color,border-color] duration-300', scrolled || open ? 'border-ink/[0.06] bg-void/90 backdrop-blur-md' : 'border-transparent bg-transparent')}>
      <div className="mx-auto flex h-[60px] max-w-[1400px] items-center justify-between gap-6 px-4 sm:px-8 lg:px-12">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => {
            const active = path?.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={cx('relative rounded-full px-3.5 py-1.5 text-[14.5px] transition-colors duration-[180ms]', active ? 'text-quartz' : 'text-ash hover:text-quartz')}>
                {active && <motion.span layoutId="nav-active" className="absolute inset-0 -z-10 rounded-full bg-ink/[0.07]" transition={{ type: 'spring', stiffness: 480, damping: 40 }} />}
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden items-center gap-4 md:flex">
          <ThemeToggle />
          <LinkButton href="/console" size="sm">
            Open Console
          </LinkButton>
        </div>
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button className="rounded-md p-2 text-mist" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.nav key="m" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden border-t border-ink/[0.06] md:hidden" aria-label="Mobile">
            <div className="px-4 pb-5 pt-2">
              {NAV.map((n, i) => (
                <motion.div key={n.href} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i, duration: 0.25 }}>
                  <Link href={n.href} className="block border-b border-ink/[0.05] py-3.5 text-[17px] text-mist">
                    {n.label}
                  </Link>
                </motion.div>
              ))}
              <div className="mt-4 flex gap-2">
                <LinkButton href="/console">Open Console</LinkButton>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

export function SiteFooter() {
  const cols: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
    { title: 'Product', links: [{ href: '/console', label: 'Console' }, { href: '/lab', label: 'Attack Lab' }, { href: '/verify', label: 'Zoro Verify' }, { href: '/registry', label: 'Registry Explorer' }] },
    { title: 'Learn', links: [{ href: '/docs', label: 'Documentation' }, { href: '/docs#quick-start', label: 'Quick start' }, { href: '/auditor', label: 'About the auditor' }, { href: '/docs#canonicalization', label: 'Canonicalization' }] },
    { title: 'Built on', links: [{ href: 'https://modelcontextprotocol.io', label: 'Model Context Protocol', external: true }, { href: 'https://docs.ens.domains/ensv2/overview', label: 'ENSv2', external: true }, { href: 'https://docs.hedera.com', label: 'Hedera', external: true }, { href: 'https://docs.world.org', label: 'World ID', external: true }] },
    { title: 'Trust', links: [{ href: '/docs#invariants', label: 'Product invariants' }, { href: '/docs#threat-model', label: 'Threat model' }, { href: '/docs#limits', label: 'Honest limits' }, { href: '/docs#privacy', label: 'What leaves your machine' }] },
  ];
  return (
    <footer className="relative overflow-hidden border-t border-ink/[0.06] bg-void">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 pb-10 pt-16 sm:px-8 md:grid-cols-[1fr_auto] lg:px-12">
        <div>
          <Logo />
          <p className="mt-5 max-w-xs text-[14px] font-light leading-relaxed text-ash">The guard at the door between AI agents and their tools.</p>
        </div>
        <div className="grid grid-cols-2 gap-x-14 gap-y-10 sm:grid-cols-4">
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-[14px] font-medium text-quartz">{c.title}</p>
              <ul className="mt-4 space-y-3">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1 text-[14px] text-ash transition-colors hover:text-quartz">
                        {l.label}
                        <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                      </a>
                    ) : (
                      <Link href={l.href} className="text-[14px] text-ash transition-colors hover:text-quartz">
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
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-4 pb-6 text-[12.5px] text-ash sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <span>© 2026 Zoro</span>
        <span>Every number on this site is computed from real records or labelled as a simulation.</span>
      </div>
      <p aria-hidden className="ink-fade pointer-events-none -mb-[0.22em] select-none text-center font-display text-[clamp(120px,24vw,360px)] font-semibold leading-[0.8] tracking-[-0.06em] opacity-[0.07]">
        Zoro
      </p>
    </footer>
  );
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-abyss">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-quartz focus:px-3 focus:py-2 focus:text-[14px] focus:text-black">
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

/** The opening of every public subpage: a two-tone headline that rises from its baseline, lit from behind. */
export function PageIntro({ eyebrow, a, b, className }: { eyebrow?: React.ReactNode; a: React.ReactNode; b?: React.ReactNode; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <div className="glow glow-blue -top-56 right-[-12%] h-[440px] w-[680px] opacity-30" aria-hidden />
      <div className="glow glow-violet -top-40 left-[-18%] h-[320px] w-[420px] opacity-[0.18]" aria-hidden />
      {eyebrow && (
        <LoadIn delay={0} y={6}>
          <Eyebrow className="relative">{eyebrow}</Eyebrow>
        </LoadIn>
      )}
      <h1 className="font-display relative mt-3 text-[40px] font-medium leading-[1.04] md:text-[58px]">
        <MaskLines lines={b ? [a, b] : [a]} lineClassName={(i) => (i === 1 ? 'ink-dim' : undefined)} />
      </h1>
    </div>
  );
}
