'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity, Bell, Bot, ChevronDown, ClipboardCheck, Command, FileText, GitPullRequestArrow, Globe, Inbox, LayoutDashboard, LogOut, Menu, Scale, ScrollText, Search, Server, Settings, ShieldHalf, Siren, Sparkles, Stamp, Waypoints, X,
} from 'lucide-react';
import { Logo } from '../site';
import { Badge, Button, Notice, SeverityBadge, cx, inputCls } from '../ui';
import { AskZoroPanel } from './ask';
import { ThemeToggle } from '../theme';
import { api, useApi, useEvents } from '@/lib/api';
import { daemonDownHint } from '@/lib/backend';
import { timeAgo } from '@/lib/format';

export interface ConsoleStatus {
  state: 'protected' | 'attention' | 'degraded' | 'observe' | 'not_configured';
  headline: string;
  openCritical: number;
  pendingApprovals: number;
  dependencies: { id: string; label: string; state: 'ok' | 'degraded' | 'not_configured' | 'down'; detail: string; link?: string }[];
  environment: { ens: string; hedera: string; world: string; testIdentities: boolean; labActive: boolean; policyProfile: string; auditor: string; requireAi: boolean };
  performance: { samples: number; p50: number | null; p95: number | null };
  worldConfigured: boolean;
  testIdentities: boolean;
  askEnabled: boolean;
}

const NAV: { group: string; items: { href: string; label: string; icon: typeof Activity; badge?: 'approvals' | 'incidents' }[] }[] = [
  { group: '', items: [{ href: '/console', label: 'Overview', icon: LayoutDashboard }] },
  { group: 'Monitor', items: [{ href: '/console/traffic', label: 'Live traffic', icon: Activity }, { href: '/console/incidents', label: 'Incidents', icon: Siren, badge: 'incidents' }, { href: '/console/approvals', label: 'Approvals', icon: ClipboardCheck, badge: 'approvals' }, { href: '/console/quarantine', label: 'Quarantine', icon: ShieldHalf }] },
  { group: 'Inventory', items: [{ href: '/console/servers', label: 'Servers', icon: Server }, { href: '/console/agents', label: 'Agents', icon: Bot }, { href: '/console/flows', label: 'Data flows', icon: Waypoints }] },
  { group: 'Govern', items: [{ href: '/console/policies', label: 'Policies', icon: Scale }, { href: '/console/publisher', label: 'Publisher', icon: Stamp }, { href: '/console/disputes', label: 'Disputes', icon: GitPullRequestArrow }] },
  { group: 'Evidence', items: [{ href: '/console/log', label: 'Audit log', icon: ScrollText }, { href: '/console/reports', label: 'Reports', icon: FileText }] },
  { group: 'System', items: [{ href: '/console/onboarding', label: 'Onboarding', icon: Inbox }, { href: '/console/settings', label: 'Settings', icon: Settings }] },
];

const STATE_META: Record<ConsoleStatus['state'], { label: string; dot: string }> = {
  protected: { label: 'Protected', dot: 'bg-ok' },
  attention: { label: 'Attention needed', dot: 'bg-danger' },
  degraded: { label: 'Degraded', dot: 'bg-warn' },
  observe: { label: 'Observe mode', dot: 'bg-warn' },
  not_configured: { label: 'Not protecting yet', dot: 'bg-slate' },
};

function StatusIndicator({ status, down }: { status: ConsoleStatus | null; down: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = down ? { label: 'Not protecting', dot: 'bg-danger' } : status ? STATE_META[status.state] : null;
  if (!meta) return <span className="h-8 w-40 animate-pulse rounded-full bg-ink/[0.05]" />;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-[13px] text-mist transition-colors hover:bg-ink/[0.05] hover:text-quartz" aria-expanded={open} aria-haspopup="dialog">
        <span className={cx('size-2 rounded-full', meta.dot, status?.state !== 'protected' && 'pulse-dot')} aria-hidden />
        {meta.label}
        <ChevronDown className={cx('size-3.5 text-ash transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="slide-in absolute left-0 top-10 z-50 w-[360px] rounded-[14px] border border-ink/[0.08] bg-sunken p-4 shadow-[var(--shadow-xl)]" role="dialog" aria-label="Protection status">
          <p className="text-[14px] font-medium text-quartz">{down ? 'The Zoro daemon is not reachable' : status?.headline}</p>
          {down ? (
            <p className="mt-2 text-[13px] text-ash">While the daemon is stopped, clients routed through Zoro get errors instead of falling back to unprotected connections. {daemonDownHint()}</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {status?.dependencies.map((d, i) => (
                <li key={`${d.id}-${i}`} className="flex items-start gap-2 text-[13px]">
                  <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', d.state === 'ok' ? 'bg-ok' : d.state === 'not_configured' ? 'bg-slate' : 'bg-warn')} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-quartz">
                      {d.label} <span className="text-ash">· {d.state.replace(/_/g, ' ')}</span>
                    </p>
                    <p className="text-ash">{d.detail}</p>
                    {d.link && (
                      <a className="text-frosted" href={d.link} target="_blank" rel="noreferrer">
                        open ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ type: string; label: string; detail: string; href: string }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => {
      void api<{ results: typeof results }>(`/api/console/search?q=${encodeURIComponent(q)}`).then((r) => setResults(r.results)).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative hidden w-56 lg:block 2xl:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate" aria-hidden />
      <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Search…" className={cx(inputCls, 'h-9 border-transparent bg-ink/[0.04] pl-9 pr-12 text-[13px] hover:border-transparent')} aria-label="Search servers, tools, fingerprints and incidents" />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[5px] border border-ink/10 px-1.5 py-px font-sans text-[11px] text-ash" aria-hidden>
        Ctrl K
      </kbd>
      {open && results.length > 0 && (
        <ul className="slide-in absolute right-0 top-11 z-50 max-h-96 w-[420px] overflow-y-auto rounded-[14px] border border-ink/[0.08] bg-sunken py-1 shadow-[var(--shadow-xl)]">
          {results.map((r, i) => (
            <li key={i}>
              <a href={r.href} className="flex items-center gap-3 px-3 py-2 hover:bg-ink/[0.04]" target={r.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                <Badge tone="neutral">{r.type}</Badge>
                <span className="truncate text-[13px] text-quartz">{r.label}</span>
                <span className="ml-auto truncate text-[12px] text-ash">{r.detail}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Notification {
  id: string;
  ts: number;
  severity: string;
  title: string;
  body: string | null;
  incident_id: string | null;
  read: number;
}

function NotificationCenter() {
  const n = useApi<Notification[]>('/api/console/notifications', { on: ['notification'] });
  const [open, setOpen] = useState(false);
  const unread = (n.data ?? []).filter((x) => !x.read).length;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-full p-2 text-mist hover:bg-ink/[0.05] hover:text-quartz" aria-label={`Notifications (${unread} unread)`} aria-expanded={open}>
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-semibold text-quartz">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[380px] rounded-[12px] border border-obsidian bg-abyss shadow-[var(--shadow-xl)]">
          <div className="flex items-center justify-between border-b border-inkline px-4 py-2.5">
            <span className="text-[14px] font-medium">Notifications</span>
            <button className="text-[12px] text-frosted" onClick={() => void api('/api/console/notifications/read', { json: {} }).then(n.reload)}>
              Mark all read
            </button>
          </div>
          <ul className="max-h-[420px] divide-y divide-inkline overflow-y-auto">
            {(n.data ?? []).length === 0 && <li className="px-4 py-6 text-center text-[13px] text-ash">No notifications.</li>}
            {(n.data ?? []).map((x) => (
              <li key={x.id} className={cx('px-4 py-3', !x.read && 'bg-ink/[0.02]')}>
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={x.severity} />
                  <span className="text-[11px] text-ash">{timeAgo(x.ts)}</span>
                </div>
                {x.incident_id ? (
                  <Link href={`/console/incidents/${x.incident_id}`} onClick={() => setOpen(false)} className="mt-1 block text-[13px] text-quartz hover:underline">
                    {x.title}
                  </Link>
                ) : (
                  <p className="mt-1 text-[13px] text-quartz">{x.title}</p>
                )}
                {x.body && <p className="mt-0.5 line-clamp-2 text-[12px] text-ash">{x.body}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const commands = useMemo(
    () => [
      ...NAV.flatMap((g) => g.items.map((i) => ({ label: `Go to ${i.label}`, run: () => router.push(i.href) }))),
      { label: 'Add a server', run: () => router.push('/console/servers?add=1') },
      { label: 'Import servers from my AI clients', run: () => router.push('/console/onboarding') },
      { label: 'Switch policy profile', run: () => router.push('/console/policies') },
      { label: 'Generate posture report', run: () => router.push('/console/reports') },
      { label: 'Start an Attack Lab scenario', run: () => router.push('/lab') },
      { label: 'Verify an ENS name or fingerprint', run: () => router.push('/verify') },
      { label: 'Open an incident by number (type INC-…)', run: () => router.push('/console/incidents') },
    ],
    [router],
  );
  useEffect(() => {
    if (open) setTimeout(() => ref.current?.focus(), 10);
    else setQ('');
  }, [open]);
  const filtered = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
  const verifyLike = /^(0x[0-9a-f]{8,}|[\w-]+(\.[\w-]+)+)$/i.test(q.trim());
  return (
    <AnimatePresence>
      {open && (
    <motion.div key="palette" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.14 } }} transition={{ duration: 0.18 }} className="fixed inset-0 z-[60] flex items-start justify-center bg-black/65 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.99, transition: { duration: 0.14 } }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-xl overflow-hidden rounded-[16px] border border-ink/[0.08] bg-sunken shadow-[var(--shadow-xl)]" role="dialog" aria-label="Command palette">
        <div className="flex items-center gap-2 border-b border-inkline px-4">
          <Command className="size-4 text-slate" aria-hidden />
          <input
            ref={ref}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter') {
                const inc = q.match(/^inc-?(\d+)$/i);
                if (verifyLike) router.push(`/verify?q=${encodeURIComponent(q.trim())}`);
                else if (inc) router.push(`/console/incidents?seq=${inc[1]}`);
                else filtered[0]?.run();
                onClose();
              }
            }}
            placeholder="Type a command, a page, an ENS name or a fingerprint…"
            className="h-12 w-full bg-transparent text-[15px] text-quartz placeholder:text-slate focus:outline-none"
            aria-label="Command"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {verifyLike && (
            <li>
              <button className="w-full px-4 py-2 text-left text-[14px] text-frosted hover:bg-ink/[0.04]" onClick={() => (router.push(`/verify?q=${encodeURIComponent(q.trim())}`), onClose())}>
                Verify “{q.trim()}”
              </button>
            </li>
          )}
          {filtered.map((c) => (
            <li key={c.label}>
              <button className="w-full px-4 py-2 text-left text-[14px] text-mist hover:bg-ink/[0.04] hover:text-quartz" onClick={() => (c.run(), onClose())}>
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}

function Toasts() {
  const [toasts, setToasts] = useState<{ id: string; severity: string; title: string; incidentId: string | null }[]>([]);
  useEvents('console', (type, data) => {
    if (type !== 'notification') return;
    const n = (data as { data: { id: string; severity: string; title: string; incidentId: string | null; lab: boolean } }).data;
    if (!n || n.lab || (n.severity !== 'critical' && n.severity !== 'high')) return;
    setToasts((t) => [...t.slice(-3), n]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), n.severity === 'critical' ? 15000 : 8000);
  });
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[360px] flex-col gap-2" aria-live="assertive" role="status">
      <AnimatePresence initial={false}>
      {toasts.map((t) => (
        <motion.div key={t.id} layout initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} className="pointer-events-auto rounded-[14px] border border-danger/40 bg-panel p-4 shadow-[var(--shadow-xl)]">
          <div className="flex items-center justify-between">
            <SeverityBadge severity={t.severity} />
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss" className="text-ash hover:text-quartz">
              <X className="size-4" />
            </button>
          </div>
          {t.incidentId ? (
            <Link href={`/console/incidents/${t.incidentId}`} className="mt-2 block text-[14px] text-quartz hover:underline">
              {t.title}
            </Link>
          ) : (
            <p className="mt-2 text-[14px] text-quartz">{t.title}</p>
          )}
        </motion.div>
      ))}
      </AnimatePresence>
    </div>
  );
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const status = useApi<ConsoleStatus>('/api/console/status', { on: ['incident', 'approval', 'server', 'outbox', 'policy', 'seal'], interval: 20_000 });
  const [palette, setPalette] = useState(false);
  const [ask, setAsk] = useState(false);
  const [mobile, setMobile] = useState(false);
  const down = status.error?.status === 0 || (status.error?.status ?? 0) >= 500;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => setMobile(false), [path]);
  const s = status.data;
  const counts = { approvals: s?.pendingApprovals ?? 0, incidents: s?.openCritical ?? 0 };

  const nav = (
    <nav className="flex flex-col gap-5 px-3 py-4" aria-label="Console">
      {NAV.map((g) => (
        <div key={g.group || 'root'}>
          {g.group && <p className="mb-1.5 px-2 text-[12px] text-faint">{g.group}</p>}
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const active = i.href === '/console' ? path === '/console' : path?.startsWith(i.href);
              const badge = i.badge ? counts[i.badge] : 0;
              return (
                <li key={i.href}>
                  <Link href={i.href} className={cx('relative flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[14px] transition-colors duration-[180ms]', active ? 'text-quartz' : 'text-ash hover:bg-ink/[0.025] hover:text-quartz')} aria-current={active ? 'page' : undefined}>
                    {active && <motion.span layoutId="console-nav-active" className="absolute inset-0 -z-10 rounded-[8px] border border-ink/[0.06] bg-ink/[0.06]" transition={{ type: 'spring', stiffness: 500, damping: 42 }} />}
                    <i.icon className="size-4" strokeWidth={1.75} aria-hidden />
                    {i.label}
                    {badge > 0 && <span className={cx('ml-auto rounded-full px-1.5 text-[11px] font-medium', i.badge === 'incidents' ? 'bg-danger-bg text-danger' : 'bg-warn-bg text-warn')}>{badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="mt-2 space-y-0.5 border-t border-ink/[0.06] pt-4">
        <Link href="/" className="flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[14px] text-ash transition-colors hover:bg-ink/[0.025] hover:text-quartz">
          <Globe className="size-4" strokeWidth={1.75} aria-hidden /> Public site
        </Link>
        <button onClick={() => void fetch('/auth/logout', { method: 'POST' }).then(() => (window.location.href = '/console/login'))} className="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[14px] text-ash transition-colors hover:bg-ink/[0.025] hover:text-quartz">
          <LogOut className="size-4" strokeWidth={1.75} aria-hidden /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-abyss">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r border-ink/[0.06] bg-abyss lg:block">
        <div className="flex h-14 items-center px-5">
          <Logo />
        </div>
        {nav}
      </aside>
      <AnimatePresence>
        {mobile && (
          <motion.div key="drawer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-50 overscroll-contain bg-black/60 lg:hidden" onClick={() => setMobile(false)}>
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280, transition: { duration: 0.2 } }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} className="h-full w-64 overflow-y-auto border-r border-ink/[0.06] bg-abyss" onClick={(e) => e.stopPropagation()}>
              <div className="flex h-14 items-center px-5">
                <Logo />
              </div>
              {nav}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-ink/[0.06] bg-abyss/90 px-4 backdrop-blur-md">
          <button className="rounded-md p-1.5 text-mist lg:hidden" onClick={() => setMobile(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <StatusIndicator status={s} down={down} />
          <div className="ml-auto flex items-center gap-1.5">
            <GlobalSearch />
            <NotificationCenter />
            <ThemeToggle />
            <Button size="sm" variant="subtle" icon={<Sparkles className="size-3.5" />} onClick={() => setAsk(true)}>
              Ask Zoro
            </Button>
          </div>
        </header>
        {down && (
          <div className="px-4 pt-4 md:px-8">
            <Notice tone="danger" title="Not protecting: the Zoro daemon is not reachable">
              Clients routed through Zoro will get errors instead of silently connecting to tools directly. {daemonDownHint()}
            </Notice>
          </div>
        )}
        {s?.state === 'observe' && (
          <div className="px-4 pt-4 md:px-8">
            <Notice tone="warn" title="Observe mode is active">
              {s.headline}. Zoro records what it would have blocked but does not block calls to those servers.
            </Notice>
          </div>
        )}
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <AskZoroPanel open={ask} onClose={() => setAsk(false)} enabled={s?.askEnabled ?? false} />
      <Toasts />
    </div>
  );
}
