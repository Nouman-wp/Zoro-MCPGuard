'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import {
  ArrowRight, ArrowUpRight, Bot, CheckCheck, Check, Copy, EyeOff, FileCode, Fingerprint, Layers, Link2, Mail, Package, Play, ScrollText, Send, ShieldAlert, SlidersHorizontal, Sparkles, Type, Undo2, UserCheck, Wallet,
} from 'lucide-react';
import { LinkButton, StatusPill, cx, type SecurityState } from '@/components/ui';
import { CountUp, LoadIn, MaskLines, Reveal, Stagger } from '@/components/motion';
import { CTAPanel, Chip, DeviceFrame, FeatureRow, IconRow, SectionHeading, TabCard, Terminal, WireframeShield, type TermLine, type Tone } from '@/components/hardware';
import { GITHUB_URL } from '@/components/site';
import { HeroShield3D, HowItWorks3D } from '@/components/three';
import { SectionBackdrop } from '@/components/backdrop';
import { SCENARIO_ART, TRACK_ART } from '@/components/illustrations';
import { IntroOnce } from '@/components/intro';
import { InTheNews } from '@/components/news/in-the-news';
import { useApi } from '@/lib/api';

const WRAP = 'mx-auto w-full max-w-[1240px] px-4 sm:px-6';
const SECTION = 'scroll-mt-20 py-20 md:py-28';

// ---------- 1 · Hero ----------

function Hero() {
  return (
    <section id="top" className={cx(WRAP, 'relative isolate grid grid-cols-1 items-center gap-12 pb-16 pt-10 md:pt-16 lg:grid-cols-[1fr_1fr] lg:pb-24')}>
      <SectionBackdrop seed={11} count={8} className="[mask-image:linear-gradient(90deg,transparent_50%,black_75%)]!" />
      <div>
        <LoadIn delay={0} y={6}>
          <Chip tone="lavender">Built at ETHGlobal Mumbai 2026</Chip>
        </LoadIn>
        <h1 className="font-display mt-6 text-[44px] leading-[1.02] md:text-[64px]">
          <MaskLines lines={['Your AI agents can be', 'tricked in seconds.', <span key="z" className="tone-accent">Zoro guards the door.</span>]} />
        </h1>
        <LoadIn delay={0.35}>
          <p className="mt-6 max-w-[520px] text-[18px] leading-[1.6] text-ash">Zoro sits between AI agents and the tools they use. It seals every tool, stops risky actions until a real person approves with World ID, and publishes every verdict on ENS and Hedera so anyone can check it.</p>
        </LoadIn>
        <LoadIn delay={0.45} className="mt-8 flex flex-wrap gap-3">
          <LinkButton href="/lab" size="lg">
            Launch Attack Lab
          </LinkButton>
          <LinkButton href="/verify" variant="secondary" size="lg">
            Verify a tool
          </LinkButton>
        </LoadIn>
        <LoadIn delay={0.55} className="mt-5">
          <Link href="/intro" className="group inline-flex items-center gap-2 text-[15px] font-semibold text-accent hover:underline">
            <span className="flex size-7 items-center justify-center rounded-full border border-sapphire bg-lavender text-on-pastel transition-transform group-hover:scale-110">
              <Play className="size-3.5" aria-hidden />
            </span>
            Watch the intro
          </Link>
        </LoadIn>
      </div>
      <LoadIn delay={0.2} className="mx-auto w-full max-w-[560px]">
        <HeroShield3D />
      </LoadIn>
    </section>
  );
}

// ---------- 2 · Live stats ----------

interface Stats {
  source: string;
  counts: Record<string, number>;
  revocations: number;
}

function StatsRow() {
  const stats = useApi<Stats>('/api/public/stats');
  const reg = useApi<{ registryConfigured: boolean; total: number }>('/api/public/registry?limit=1');
  const s = stats.data;
  const ledger = s?.source === 'ledger';
  const all = s ? Object.values(s.counts).reduce((a, b) => a + b, 0) : 0;
  const cells: { label: string; value: number | null; note: string; tone: Tone }[] = [
    { label: 'Tools sealed', value: s ? (s.counts.sealed ?? 0) + (s.counts.sealed_with_warnings ?? 0) : null, note: ledger ? 'from the Hedera topic' : 'from local records', tone: 'plain' },
    { label: 'Unsafe versions blocked', value: s ? (s.counts.unsafe ?? 0) : null, note: ledger ? 'from the Hedera topic' : 'from local records', tone: 'plain' },
    { label: 'Verdicts on Hedera', value: s && ledger ? all : null, note: s && !ledger ? 'ledger not configured' : 'live', tone: 'peach' },
    { label: 'Seals on ENS', value: reg.data?.registryConfigured ? reg.data.total : null, note: reg.data && !reg.data.registryConfigured ? 'registry not configured' : 'live', tone: 'mint' },
  ];
  return (
    <section aria-label="Live numbers" className={WRAP}>
      <Reveal>
        <dl className="grid grid-cols-2 overflow-hidden rounded-[12px] border border-sapphire bg-panel lg:grid-cols-4">
          {cells.map((c, i) => (
            <div key={c.label} className={cx('p-5 md:p-7', i % 2 === 1 && 'border-l border-sapphire', i >= 2 && 'border-t border-sapphire lg:border-t-0', i === 2 && 'lg:border-l')}>
              <dt className="flex items-center gap-2 text-[14px] font-medium text-ash">
                {c.tone !== 'plain' && <span className={cx('size-2.5 rounded-full border border-sapphire', c.tone === 'peach' ? 'bg-peach' : 'bg-mint')} aria-hidden />}
                {c.label}
              </dt>
              <dd className="font-display mt-2 text-[40px] leading-none md:text-[48px]">{c.value !== null ? <CountUp value={c.value} /> : <span className="text-slate">{stats.loading ? '…' : '—'}</span>}</dd>
              <p className="mt-2 text-[13px] text-slate">{stats.error ? 'daemon unreachable' : c.note}</p>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}

// ---------- 3 · Sponsor tracks ----------

interface VerifyContext {
  ens: { network: string; root: string } | null;
  hedera: { network: string; registryTopic: string } | null;
}

function Tracks() {
  const ctx = useApi<VerifyContext>('/api/public/verify-context');
  const c = ctx.data;
  const live = (on: boolean, label: string) => (!c ? <StatusPill state="pending">{ctx.error ? 'Daemon unreachable' : 'Checking…'}</StatusPill> : on ? <StatusPill state="sealed">{label}</StatusPill> : <StatusPill state="pending">Not configured here</StatusPill>);
  const tracks: { tone: Tone; name: string; href: string; art: ReactNode; role: string; body: string; status: ReactNode }[] = [
    { tone: 'mint', name: 'ENS', href: '/tracks/ens', art: TRACK_ART.ens, role: 'Public registry', body: 'Every server, tool and version gets an ENS name. Each verdict is written as zoro.* text records (fingerprint, verdict, risk, attestation, ledger pointer); revoking a version flips zoro.status.', status: live(!!c?.ens, `Live · ${c?.ens?.network ?? ''}`) },
    { tone: 'lavender', name: 'World ID', href: '/tracks/world-id', art: TRACK_ART['world-id'], role: 'Human Seal', body: 'Risky actions and policy overrides need a fresh World ID proof bound to that exact action. The nullifier is recorded once, so a proof can never be replayed.', status: <StatusPill state="pending">Status in the Console</StatusPill> },
    { tone: 'peach', name: 'Hedera', href: '/tracks/hedera', art: TRACK_ART.hedera, role: 'Verdict ledger', body: 'Verdicts, revocations and disputes go to a Hedera consensus topic with independent timestamps. Sealed versions get a badge token that is burned on revoke.', status: live(!!c?.hedera, `Live · ${c?.hedera?.network ?? ''}`) },
  ];
  return (
    <section id="tracks" className={cx('relative isolate overflow-hidden border-y border-sapphire bg-elevated', SECTION)}>
      <SectionBackdrop seed={23} />
      <div className={WRAP}>
        <SectionHeading eyebrow="Sponsor tracks" a="Three tracks," b="one guard." lead="ENS, World ID and Hedera each do a job inside Zoro that no other layer can do. Here is exactly what each one is used for." center />
        <Stagger className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3" gap={0.08} itemClassName="h-full">
          {tracks.map((t) => (
            <TabCard key={t.name} href={t.href} tone={t.tone} cta={`See how Zoro uses ${t.name}`} art={t.art} top={<div className="mb-4 flex flex-wrap items-center justify-between gap-2"><Chip tone={t.tone}>{t.role}</Chip>{t.status}</div>} title={t.name}>
              {t.body}
            </TabCard>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

// ---------- 4 · How it works ----------

const LAYERS: { label: string; detail: string; tone?: Tone }[] = [
  { label: 'AI Agent', detail: 'Claude, Cursor or VS Code connects to Zoro instead of to each server.' },
  { label: 'Zoro Gateway', detail: 'Fingerprints every definition. Only sealed versions reach the agent; every call is allowed, asked or blocked.', tone: 'pink' },
  { label: 'Sentinel Auditor', detail: 'Re-runnable rules, a diff against the last seal and an AI review that must quote its evidence.' },
  { label: 'ENS Registry', detail: 'Every server, tool and version has a name. Only the Auditor role writes a verdict.', tone: 'mint' },
  { label: 'Hedera Ledger', detail: 'Verdicts, revocations and disputes with independent consensus timestamps.', tone: 'peach' },
  { label: 'World ID Human Seal', detail: 'Overrides need a fresh proof from a real person, bound to one action and usable once.', tone: 'lavender' },
];

function HowItWorks() {
  return (
    <section id="how" className={cx(WRAP, SECTION)}>
      <SectionHeading eyebrow="How it works" a="Six layers between your agent" b="and a bad tool." lead="Each call passes down the stack. Any layer can stop it, and every decision leaves a public trace." center />
      <div className="mt-16">
        <HowItWorks3D layers={LAYERS} />
      </div>
    </section>
  );
}

// ---------- 5 · About ----------

const TERMINAL: TermLine[] = [
  { text: '$ zoro lab run rug-pull', tone: 'dim' },
  { text: 'zoro ▸ SEALED   lab-postmail.send_email   v1 · fingerprint pinned', tone: 'sealed' },
  { text: 'zoro ▸ CHANGED  lab-postmail.send_email   new version held back', tone: 'ask' },
  { text: 'zoro ▸ SENTINEL unsafe · added text: "always BCC archive@…"', tone: 'default' },
  { text: 'zoro ▸ BLOCKED  email.send   rug-pull: hidden BCC added', tone: 'blocked' },
  { text: 'zoro ▸ agent only ever saw the sealed v1 text', tone: 'accent' },
];

function About() {
  return (
    <section id="about" className={cx('border-y border-sapphire bg-elevated', SECTION)}>
      <div className={cx(WRAP, 'grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]')}>
        <Reveal className="order-2 lg:order-1">
          <Terminal lines={TERMINAL} title="zoro — attack lab replay" />
        </Reveal>
        <div className="order-1 lg:order-2">
          <SectionHeading eyebrow="What is Zoro" a="A security gateway between AI agents" b="and everything they touch." />
          <Reveal delay={0.08}>
            <p className="mt-6 text-[17px] leading-[1.6] text-ash md:text-[18px]">Zoro sits between your agents (Claude, Cursor, VS Code) and the tools they call: email, files, databases, wallets. It fingerprints and seals every tool, holds back tools that change behind your back, stops risky actions until a real person approves, and publishes every verdict so anyone can check it.</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------- 6 · Features ----------

const FEATURES: { title: string; body: string }[] = [
  { title: 'Tool Seals', body: 'Every tool definition is fingerprinted and sealed. The agent only ever reads sealed text.' },
  { title: 'Rug-Pull Quarantine', body: 'A tool that changes after install is held back and diffed before it can be called.' },
  { title: 'Secret-Code Decoder', body: 'Invisible Unicode and hidden characters are decoded and labelled in the diff.' },
  { title: 'New-Power Alarm', body: 'A new version that gains a capability, like sending mail or moving money, is flagged.' },
  { title: 'Data-Flow Guard', body: 'Untrusted input heading to an outside destination stops and asks a person.' },
  { title: 'Output Shield', body: 'Tool responses are scanned, and injected instructions are redacted before the model reads them.' },
  { title: 'Code-Swap Detection', body: 'The code changes but the description does not: artifact identity catches it.' },
  { title: 'Shadowing Detector', body: 'A tool whose description tries to steer another server’s tool is flagged.' },
  { title: 'Auditor-Injection Guard', body: 'Text that tries to talk the auditor into approving is a critical finding.' },
  { title: 'Typosquat Check', body: 'Server names that imitate popular ones are never released to the agent.' },
  { title: 'Wallet Recipient Limits', body: 'Argument constraints block payments to unknown recipients, even on sealed tools.' },
  { title: 'Revocation & Exposure', body: 'Revoke a version and every gateway blocks it, with a report of the calls it touched.' },
];

/** A small Console overview drawn with the real components. Illustrative numbers, labelled as such. */
function ConsoleMini() {
  const bars = [6, 9, 4, 11, 7, 13, 8, 10, 5, 12, 9, 14];
  return (
    <div className="p-4 text-left">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-quartz">Overview</p>
        <StatusPill state="sealed">Protected</StatusPill>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-[8px] border border-obsidian bg-obsidian">
        {[['Servers', '6'], ['Incidents', '2'], ['Waiting', '1']].map(([k, v]) => (
          <div key={k} className="bg-panel px-3 py-2.5">
            <p className="text-[11.5px] font-medium text-ash">{k}</p>
            <p className="font-display mt-0.5 text-[22px]">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-[8px] border border-obsidian bg-panel p-3">
        <p className="text-[11.5px] font-medium text-ash">Decisions · 24h</p>
        <div className="mt-3 flex h-20 items-end gap-1.5" aria-hidden>
          {bars.map((h, i) => (
            <div key={i} className="flex flex-1 flex-col justify-end gap-[2px]">
              {i % 5 === 3 && <span className="h-1.5 rounded-[1px] bg-danger" />}
              {i % 4 === 1 && <span className="h-1.5 rounded-[1px] bg-warn" />}
              <span className="rounded-[2px] bg-accent" style={{ height: `${h * 4}px` }} />
            </div>
          ))}
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {[
          { s: 'blocked' as SecurityState, t: 'lab-postmail/send_email changed' },
          { s: 'ask' as SecurityState, t: 'files → postmail: forward report.pdf' },
          { s: 'sealed' as SecurityState, t: 'lab-notes/search · typo fix released' },
        ].map((r) => (
          <li key={r.t} className="flex items-center gap-2 rounded-[8px] border border-obsidian bg-panel px-2.5 py-2">
            <StatusPill state={r.s} />
            <span className="truncate font-mono text-[11px] text-mist">{r.t}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] text-slate">Illustration · numbers are examples</p>
    </div>
  );
}

function Features() {
  return (
    <section id="features" className={cx(WRAP, 'relative isolate', SECTION)}>
      <SectionBackdrop seed={37} count={12} className="!left-1/2 !right-auto w-screen -translate-x-1/2 [mask-image:linear-gradient(90deg,black_6%,transparent_13%,transparent_87%,black_94%)]!" />
      <SectionHeading eyebrow="Features" a="Every way an agent can be tricked," b="covered." center />
      <div className="mt-16 grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_minmax(300px,380px)_1fr] lg:gap-12">
        <Stagger className="space-y-8" gap={0.06}>
          {FEATURES.slice(0, 6).map((f, i) => (
            <FeatureRow key={f.title} n={i + 1} title={f.title} align="right">
              {f.body}
            </FeatureRow>
          ))}
        </Stagger>
        <Reveal className="order-first min-w-0 lg:order-none">
          <DeviceFrame label="Zoro Console · Overview" className="mx-auto max-w-[380px]">
            <ConsoleMini />
          </DeviceFrame>
        </Reveal>
        <Stagger className="space-y-8" gap={0.06}>
          {FEATURES.slice(6).map((f, i) => (
            <FeatureRow key={f.title} n={i + 7} title={f.title}>
              {f.body}
            </FeatureRow>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

// ---------- 7 · Defence layers ----------

const PROTECTIONS = [
  { icon: <UserCheck />, title: 'World ID Approvals', body: 'Risky actions need a fresh proof from a real person, bound to that exact action and usable once.' },
  { icon: <Link2 />, title: 'Hash-Chained Audit Log', body: 'Every decision is chained to the one before it and anchored as Merkle roots on Hedera.' },
  { icon: <SlidersHorizontal />, title: 'Policies & Profiles', body: 'Standard, Strict and Lab profiles. On Strict, every loosening change needs a Human Seal.' },
  { icon: <Package />, title: 'Package Pinning', body: 'The server’s code identity is pinned too, so a swapped artifact is quarantined.' },
  { icon: <Sparkles />, title: 'Sentinel AI Review', body: 'Must quote the text it objects to. Uncertain means pending, never sealed.' },
  { icon: <ScrollText />, title: 'Public Ledger', body: 'Verdicts, revocations and disputes on a Hedera topic anyone can read.' },
];

const FEED: { s: SecurityState; who: string; what: string }[] = [
  { s: 'sealed', who: 'claude-code', what: 'notes.search' },
  { s: 'blocked', who: 'cursor', what: 'email.send · rug-pull' },
  { s: 'sealed', who: 'vscode', what: 'files.read' },
  { s: 'ask', who: 'claude-code', what: 'files → email · forward' },
  { s: 'sealed', who: 'cursor', what: 'weather.forecast' },
  { s: 'blocked', who: 'claude-code', what: 'wallet.send · unknown recipient' },
];

/** A looping decision feed; it holds still under reduced motion. */
function DecisionFeed() {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setTick((n) => n + 1), 1600);
    return () => clearInterval(t);
  }, [reduce]);
  const rows = Array.from({ length: 5 }, (_, i) => FEED[(tick + i) % FEED.length]);
  return (
    <div className="p-4">
      <p className="mb-3 text-[13px] font-semibold text-quartz">Live traffic</p>
      <ul className="space-y-1.5" aria-hidden>
        {rows.map((r, i) => (
          <li key={`${tick}-${i}`} className={cx('grid grid-cols-[92px_1fr] items-center gap-3 rounded-[8px] border border-obsidian bg-panel px-3 py-2.5', i === 0 && !reduce && 'slide-in')}>
            <StatusPill state={r.s} className="justify-center" />
            <span className="truncate font-mono text-[11.5px] text-mist">
              <span className="text-ash">{r.who} ▸ </span>
              {r.what}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] text-slate">Illustration · example traffic</p>
    </div>
  );
}

function Protections() {
  return (
    <section id="protections" className={cx('border-y border-sapphire bg-elevated', SECTION)}>
      <div className={cx(WRAP, 'grid grid-cols-1 items-start gap-14 lg:grid-cols-[1fr_1fr]')}>
        <div>
          <SectionHeading eyebrow="Defence layers" a="Guards behind the guard," b="for when it really matters." />
          <Stagger className="mt-8" gap={0.06}>
            {PROTECTIONS.map((p) => (
              <IconRow key={p.title} icon={p.icon} title={p.title}>
                {p.body}
              </IconRow>
            ))}
          </Stagger>
        </div>
        <Reveal className="lg:sticky lg:top-28">
          <DeviceFrame label="Zoro Console · Live traffic">
            <DecisionFeed />
          </DeviceFrame>
        </Reveal>
      </div>
    </section>
  );
}

// ---------- 8 · Attack Lab ----------

const SCENARIO: Record<string, { icon: ReactNode; state: SecurityState; result: string }> = {
  'rug-pull': { icon: <Mail />, state: 'blocked', result: 'Blocked' },
  'invisible-ink': { icon: <EyeOff />, state: 'blocked', result: 'Blocked' },
  shadowing: { icon: <Layers />, state: 'blocked', result: 'Flagged' },
  exfiltration: { icon: <Send />, state: 'ask', result: 'Asked' },
  'code-swap': { icon: <FileCode />, state: 'blocked', result: 'Quarantined' },
  'auditor-injection': { icon: <Bot />, state: 'blocked', result: 'Critical' },
  typosquat: { icon: <Type />, state: 'blocked', result: 'Never released' },
  'honest-update': { icon: <CheckCheck />, state: 'sealed', result: 'Sealed' },
  revocation: { icon: <Undo2 />, state: 'blocked', result: 'Blocked' },
  'wallet-swap': { icon: <Wallet />, state: 'blocked', result: 'Blocked' },
};

function LabTeaser() {
  const lab = useApi<{ scenarios: { id: string; title: string; attack: string }[] }>('/api/public/lab');
  const scenarios = lab.data?.scenarios ?? [];
  return (
    <section id="lab" className={cx(WRAP, 'relative isolate', SECTION)}>
      <SectionBackdrop seed={41} count={8} className="!left-1/2 !right-auto w-screen -translate-x-1/2 [mask-image:linear-gradient(90deg,black_6%,transparent_13%,transparent_87%,black_94%)]!" />
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <SectionHeading eyebrow="Attack Lab" a={`${scenarios.length || 'Real'} attacks you can launch,`} b="and watch fail live." />
        <Reveal>
          <LinkButton href="/lab" variant="secondary">
            Open the Lab <ArrowRight className="size-4" />
          </LinkButton>
        </Reveal>
      </div>
      {lab.error ? (
        <p className="mt-12 text-[15px] text-ash">The Attack Lab needs the Zoro daemon, which is not reachable from this page right now.</p>
      ) : (
        <Stagger className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" gap={0.05} itemClassName="h-full">
          {(scenarios.length ? scenarios : Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, title: '', attack: '' }))).map((sc) => {
            const meta = SCENARIO[sc.id] ?? { icon: <ShieldAlert />, state: 'pending' as SecurityState, result: 'Pending' };
            return sc.title ? (
              <TabCard key={sc.id} href="/lab" compact tone="peach" art={SCENARIO_ART[sc.id]} icon={SCENARIO_ART[sc.id] ? undefined : meta.icon} title={sc.title} footer={<span className="flex items-center justify-between gap-2"><StatusPill state={meta.state}>{meta.result}</StatusPill><span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold">Launch <ArrowUpRight className="size-4" aria-hidden /></span></span>}>
                <span className="line-clamp-4">{sc.attack}</span>
              </TabCard>
            ) : (
              <div key={sc.id} className="chamfer-frame is-tab min-h-[260px] animate-pulse" aria-hidden />
            );
          })}
        </Stagger>
      )}
    </section>
  );
}

// ---------- 9 · Public proof ----------

function VerifyMini() {
  const rows: [string, ReactNode][] = [
    ['Fingerprint', <span key="f" className="font-mono text-mist">sha256:7c1e…a94d</span>],
    ['ENS name', <span key="e" className="font-mono text-accent">send-email.lab-postmail.zoro.eth</span>],
    ['Signature', <span key="s" className="inline-flex items-center gap-1.5 text-ok"><Check className="size-3.5" /> auditor signature valid</span>],
    ['Hedera', <span key="h" className="font-mono text-mist">topic 0.0.xxxx · seq 42</span>],
  ];
  return (
    <div className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-quartz">Zoro Verify</p>
        <StatusPill state="sealed" />
      </div>
      <dl className="mt-4 divide-y divide-obsidian rounded-[8px] border border-obsidian bg-panel">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[96px_1fr] gap-3 px-3 py-2.5 text-[12.5px]">
            <dt className="font-medium text-ash">{k}</dt>
            <dd className="min-w-0 truncate">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11.5px] text-slate">Illustration · values are examples</p>
    </div>
  );
}

function PublicProof() {
  const links = [
    { href: 'https://sepolia.etherscan.io', label: 'Etherscan' },
    { href: 'https://hashscan.io', label: 'HashScan' },
  ];
  return (
    <section id="proof" className={cx('relative isolate overflow-hidden border-y border-sapphire bg-elevated', SECTION)}>
      <SectionBackdrop seed={53} />
      <div className={cx(WRAP, 'grid grid-cols-1 items-center gap-14 lg:grid-cols-[0.95fr_1.05fr]')}>
        <Reveal>
          <DeviceFrame label="Zoro Verify">
            <VerifyMini />
          </DeviceFrame>
        </Reveal>
        <div>
          <SectionHeading eyebrow="Public proof" a="You don’t have to trust Zoro." b="Check it yourself." lead="Recompute the fingerprint, check the auditor’s signature, and read the verdict on ENS and the Hedera ledger. Public records describe tools, never your prompts, files or identity." />
          <Reveal delay={0.1} className="mt-8 flex flex-wrap items-center gap-3">
            <LinkButton href="/verify">
              <Fingerprint className="size-4" /> Verify a tool
            </LinkButton>
            <LinkButton href="/registry" variant="secondary">
              Open the registry
            </LinkButton>
          </Reveal>
          <Reveal delay={0.14} className="mt-6 flex flex-wrap gap-6">
            {links.map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[15px] font-semibold text-accent hover:underline">
                {l.label} <ArrowUpRight className="size-4" aria-hidden />
              </a>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------- 10 · Call to action ----------

const INSTALL = `git clone ${GITHUB_URL}.git && cd Zoro-MCPGuard && pnpm install && pnpm dev`;

function CommandBox() {
  const [done, setDone] = useState(false);
  return (
    <div className="flex max-w-[620px] items-stretch overflow-hidden rounded-[8px] border border-sapphire bg-code">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-4 py-3.5 font-mono text-[12.5px] text-code-text md:text-[13.5px]">
        <span className="select-none text-code-str">$ </span>
        {INSTALL}
      </code>
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(INSTALL).then(() => (setDone(true), setTimeout(() => setDone(false), 1400)))}
        className="flex w-12 shrink-0 items-center justify-center border-l border-code-edge text-code-text transition-colors hover:text-code-str"
        aria-label={done ? 'Copied' : 'Copy install command'}
      >
        {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

function CallToAction() {
  return (
    <section className={cx(WRAP, 'py-20 md:py-28')}>
      <Reveal>
        <CTAPanel eyebrow="Protect your agent" title="Put Zoro in front of your AI" graphic={<WireframeShield />}>
          <CommandBox />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <LinkButton href="/console" variant="cta" size="lg">
              Open the Console
            </LinkButton>
            <LinkButton href={GITHUB_URL} external variant="secondary" size="lg">
              GitHub <ArrowUpRight className="size-4" />
            </LinkButton>
            <Link href="/docs#quick-start" className="ml-1 text-[15px] font-semibold underline underline-offset-4 hover:no-underline">
              Quick start
            </Link>
          </div>
        </CTAPanel>
      </Reveal>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <IntroOnce />
      <Hero />
      <StatsRow />
      <div className="h-16 md:h-24" aria-hidden />
      <InTheNews />
      <Tracks />
      <HowItWorks />
      <About />
      <Features />
      <Protections />
      <LabTeaser />
      <PublicProof />
      <CallToAction />
    </>
  );
}
