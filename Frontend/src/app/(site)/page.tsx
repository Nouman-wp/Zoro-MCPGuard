'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, BadgeCheck, Ban, Check, Eye, FileSearch, Fingerprint, Landmark, Lock, Radar, ScrollText, ShieldCheck, Sparkles, SquareTerminal, UserCheck, Waypoints } from 'lucide-react';
import { PROFILE_DESCRIPTIONS, defaultPolicy, describeRule, type ProfileId } from '@zoro/core';
import { LinkButton, cx } from '@/components/ui';
import { CountUp, EASE_EXPO, LoadIn, MaskLines, Reveal, Spotlight, Stagger } from '@/components/motion';
import { GatewayVisual, HeroStage, HumanSealVisual, IntegrationTile, LedgerVisual, PinningVisual, RegistryVisual, SentinelVisual, StoryVisual } from '@/components/home-visuals';
import { useApi } from '@/lib/api';

const WRAP = 'mx-auto w-full max-w-[1200px] px-4 sm:px-6';

/** Two-tone section heading: the first line in full ink, the second stepping back, as on agentql. */
function Heading({ a, b, className, center }: { a: ReactNode; b?: ReactNode; className?: string; center?: boolean }) {
  return (
    <Reveal>
      <h2 className={cx('font-display text-[34px] font-medium leading-[1.08] md:text-[52px]', center && 'text-center', className)}>
        {a}
        {b && (
          <>
            <br />
            <span className="ink-dim">{b}</span>
          </>
        )}
      </h2>
    </Reveal>
  );
}

// ---------- hero ----------

function Hero() {
  return (
    <section className="relative -mt-[60px] overflow-hidden bg-void pt-[60px]">
      <div className="aurora pointer-events-none absolute inset-0" aria-hidden />
      <div className="halftone fade-b pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-[0.18]" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-abyss" aria-hidden />
      <div className={cx(WRAP, 'relative grid items-center gap-14 pb-16 pt-16 md:pt-24 lg:grid-cols-[0.92fr_1.08fr] lg:pb-20')}>
        <div>
          <h1 className="font-display text-[48px] font-medium leading-[1.02] md:text-[68px]">
            <MaskLines lines={['Seal every tool', 'your AI uses']} lineClassName={(i) => (i === 1 ? 'ink-dim' : undefined)} />
          </h1>
          <LoadIn delay={0.42}>
            <p className="mt-6 max-w-[500px] text-[18.5px] font-light leading-relaxed text-mist">Zoro checks every MCP tool at the moment your agent uses it, against a public, tamper-evident record of what that tool is supposed to be.</p>
          </LoadIn>
          <LoadIn delay={0.5} className="mt-9 flex flex-wrap gap-3">
            <LinkButton href="/docs#quick-start" size="lg">
              Get started
            </LinkButton>
            <LinkButton href="/lab" variant="ghost" size="lg">
              Launch an attack
            </LinkButton>
          </LoadIn>
          <LoadIn delay={0.6}>
            <p className="mt-6 text-[13px] text-ash">Free, local, and you never need a token to be protected.</p>
          </LoadIn>
        </div>
        <HeroStage />
      </div>
    </section>
  );
}

// ---------- integrations ----------

const INTEGRATIONS = [
  { label: 'MCP', sub: 'clients and servers', icon: <Waypoints className="size-6" /> },
  { label: 'ENSv2', sub: 'public registry', icon: <Landmark className="size-6" /> },
  { label: 'Hedera', sub: 'verdict ledger', icon: <ScrollText className="size-6" /> },
  { label: 'World ID', sub: 'Human Seal', icon: <UserCheck className="size-6" /> },
  { label: 'Groq', sub: 'AI review', icon: <Sparkles className="size-6" /> },
  { label: 'HTS badges', sub: 'burned on revoke', icon: <BadgeCheck className="size-6" /> },
  { label: 'Claude Code', sub: 'config import', icon: <SquareTerminal className="size-6" /> },
  { label: 'Cursor', sub: 'config import', icon: <FileSearch className="size-6" /> },
  { label: 'VS Code', sub: 'config import', icon: <FileSearch className="size-6" /> },
];

function Integrations() {
  return (
    <section className={cx(WRAP, 'py-16 md:py-24')}>
      <Reveal>
        <div className="relative overflow-hidden rounded-[20px] border border-ink/[0.08] card-ember shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="glow glow-ember -left-24 -top-24 h-[380px] w-[380px] opacity-60" aria-hidden />
          <div className="glow glow-pink -left-10 top-1/2 h-[260px] w-[200px] opacity-25" aria-hidden />
          <div className="halftone fade-l pointer-events-none absolute inset-y-0 left-0 w-1/3 opacity-25" aria-hidden />
          <div className="relative grid items-center gap-10 p-8 md:p-14 lg:grid-cols-[1fr_1.05fr]">
            <div>
              <p className="text-[13px] font-medium tracking-[0.06em] text-ember-ink">INTEGRATIONS</p>
              <h2 className="font-display mt-3 text-[38px] font-medium leading-[1.05] md:text-[56px]">Plays well with others</h2>
              <p className="mt-5 max-w-md text-[17px] font-light leading-relaxed text-mist">Zoro sits between the clients you already use and the servers you already installed. Onboarding reads your configurations, routes them through the gateway, and one action restores the originals.</p>
              <LinkButton href="/docs#quick-start" className="mt-8">
                Add Zoro to your workflow
              </LinkButton>
            </div>
            <div className="relative">
              <div className="grid grid-cols-3 gap-3 [mask-image:linear-gradient(90deg,black_70%,transparent)] sm:gap-4">
                {INTEGRATIONS.map((t, i) => (
                  <IntegrationTile key={t.label} i={i} {...t} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ---------- bento ----------

function BentoCard({ title, body, visual, className, glow, visualClass = 'h-[230px]' }: { title: string; body: ReactNode; visual: ReactNode; className?: string; glow?: string; visualClass?: string }) {
  return (
    <Spotlight className={cx('group relative flex flex-col overflow-hidden rounded-[18px] border border-ink/[0.07] card-grad shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[border-color] duration-300 hover:border-ink/[0.13]', className)}>
      {glow && <div className={cx('glow h-[260px] w-[300px] opacity-30', glow)} aria-hidden />}
      <div className={cx('relative overflow-hidden', visualClass)}>{visual}</div>
      <div className="relative mt-auto px-6 pb-6 pt-2">
        <h3 className="text-[20px] font-medium tracking-[-0.01em]">{title}</h3>
        <p className="mt-2 max-w-[520px] text-[15.5px] font-light leading-relaxed text-mist">{body}</p>
      </div>
    </Spotlight>
  );
}

function Bento() {
  return (
    <section className={cx(WRAP, 'py-16 md:py-24')}>
      <Heading center a="Zoro is one product" b="with parts that each do one job" />
      <Reveal delay={0.1}>
        <p className="mx-auto mt-5 max-w-2xl text-center text-[18px] font-light leading-relaxed text-ash">A gateway in the path of every call, an auditor that shows its evidence, and public records nobody can quietly rewrite, including Zoro.</p>
      </Reveal>
      <Stagger className="mt-14 grid gap-4 md:grid-cols-2" gap={0.08} itemClassName="h-full">
        <BentoCard title="Gateway" body="Your clients connect to Zoro instead of each server. Every definition is fingerprinted, only sealed versions reach the agent, and every call is allowed, asked about or blocked." visual={<GatewayVisual />} className="h-full" />
        <BentoCard title="Sentinel auditor" body="Rules anyone can re-run, a diff against the last sealed version, and an AI review that must quote the text it objects to. Uncertain means pending, never sealed." visual={<SentinelVisual />} className="h-full" />
      </Stagger>
      <Reveal className="mt-4">
        <Spotlight className="relative overflow-hidden rounded-[18px] border border-ink/[0.07] card-teal shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="glow glow-teal -bottom-24 right-10 h-[300px] w-[520px] opacity-45" aria-hidden />
          <div className="halftone fade-r pointer-events-none absolute inset-y-0 right-0 w-2/5 opacity-30" aria-hidden />
          <div className="relative grid gap-10 p-6 md:p-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <h3 className="text-[22px] font-medium tracking-[-0.01em]">Definition pinning</h3>
              <p className="mt-2 text-[15.5px] font-light leading-relaxed text-mist">
                The agent only ever reads text that was sealed. When a server changes a tool, the new version is held back and checked; it is never forwarded “just this once”, not even inside an error.{' '}
                <Link href="/lab" className="text-quartz underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white">
                  Watch it happen in the Lab.
                </Link>
              </p>
            </div>
            <PinningVisual />
          </div>
        </Spotlight>
      </Reveal>
      <Stagger className="mt-4 grid gap-4 md:grid-cols-3" gap={0.08} itemClassName="h-full">
        <BentoCard title="Registry on ENSv2" body="Every server, tool and version has a name. Only the Auditor role can write a verdict; publishers never seal themselves." visual={<RegistryVisual />} visualClass="h-[200px]" className="h-full" />
        <BentoCard title="Ledger on Hedera" body="Verdicts, revocations and disputes on a consensus topic with independent timestamps. Your own calls are only ever anchored as Merkle roots." visual={<LedgerVisual />} visualClass="h-[200px]" className="h-full" />
        <BentoCard title="Human Seal with World ID" body="Overrides and risky actions need a fresh proof from a real person, bound to that exact action and usable once." visual={<HumanSealVisual />} visualClass="h-[200px]" className="h-full" />
      </Stagger>
    </section>
  );
}

// ---------- the guard, in four lines ----------

function Pillars() {
  const items = [
    { icon: Radar, t: 'Checks every call', b: 'Not once at install time: every call, against the live fingerprint.' },
    { icon: Ban, t: 'Prevents, not reports', b: 'Poisoned descriptions never reach the model in the first place.' },
    { icon: Fingerprint, t: 'Shared, verifiable trust', b: 'The first gateway to meet a bad version protects everyone else.' },
    { icon: FileSearch, t: 'Explains everything', b: 'Every block shows the rule, the diff and the evidence behind it.' },
  ];
  return (
    <section className={cx(WRAP, 'py-16 md:py-24')}>
      <Heading center a="Your guard at the moment of use" b="not just at install time" />
      <Stagger className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4" gap={0.08}>
        {items.map((c) => (
          <div key={c.t} className="group">
            <c.icon className="size-7 text-mist transition-colors duration-300 group-hover:text-quartz" strokeWidth={1.4} aria-hidden />
            <p className="mt-5 text-[18px] font-medium">{c.t}</p>
            <p className="mt-2 text-[15.5px] font-light leading-relaxed text-ash">{c.b}</p>
          </div>
        ))}
      </Stagger>
    </section>
  );
}

// ---------- scroll story ----------

const STORY = [
  { t: 'Exact identity, down to invisible characters', b: 'A canonical fingerprint covers every field the model can read. Change one character, even a hidden one, and it changes completely.' },
  { t: 'The agent is only shown sealed text', b: 'A changed tool is unavailable, not disguised as the old one. You see the exact difference and why it matters.' },
  { t: 'Honest updates flow without friction', b: 'Cosmetic and documentation changes are sealed and released automatically. The agent never notices.' },
  { t: 'Revocations reach every gateway', b: 'If a trusted version turns bad, it is blocked everywhere, and you get a report of every call it touched.' },
];

const STORY_MS = 5200;

/** agentql's list beside a changing picture: one item is lit, its bar fills, then the next takes over. */
function Story() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { margin: '-20% 0px -20% 0px' });
  const reduce = useReducedMotion();
  const running = inView && !paused && !reduce;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % STORY.length), STORY_MS);
    return () => clearTimeout(t);
  }, [running, step]);
  return (
    <section ref={ref} className={cx(WRAP, 'py-16 md:py-24')} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
      <Heading a="Stop trusting a tool forever" b="because it looked fine once" />
      <div className="mt-14 grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
        <div role="tablist" aria-label="How pinning works" className="space-y-1">
          {STORY.map((s, i) => {
            const on = step === i;
            return (
              <button key={s.t} role="tab" aria-selected={on} type="button" onClick={() => setStep(i)} className="group relative block w-full py-4 pl-6 text-left">
                <span className="absolute inset-y-2 left-0 w-[2px] overflow-hidden rounded-full bg-ink/[0.1]" aria-hidden>
                  {on && <motion.span key={`${step}-${running}`} className="absolute inset-x-0 top-0 block bg-quartz" initial={{ height: running ? '0%' : '100%' }} animate={{ height: '100%' }} transition={{ duration: running ? STORY_MS / 1000 : 0, ease: 'linear' }} />}
                </span>
                <span className={cx('block text-[18px] font-medium transition-colors duration-300', on ? 'text-quartz' : 'text-ash group-hover:text-mist')}>{s.t}</span>
                <motion.span initial={false} animate={{ height: on ? 'auto' : 0, opacity: on ? 1 : 0 }} transition={{ duration: 0.4, ease: EASE_EXPO }} className="block overflow-hidden">
                  <span className="block pt-1.5 text-[15.5px] font-light leading-relaxed text-mist">{s.b}</span>
                </motion.span>
              </button>
            );
          })}
        </div>
        <StoryVisual step={step} />
      </div>
    </section>
  );
}

// ---------- profiles (in place of pricing: protection is free, you choose how strict) ----------

const PROFILE_STYLE: Record<ProfileId, { name: string; glow: string; badge?: string; ring: string }> = {
  standard: { name: 'Standard', glow: 'glow-teal', badge: 'Default', ring: 'border-[#2fd4c4]/25 card-teal-strong' },
  strict: { name: 'Strict', glow: 'glow-violet', ring: 'border-ink/[0.08] card-violet' },
  lab: { name: 'Lab', glow: 'glow-ember', ring: 'border-ink/[0.08] card-warm' },
};

function Profiles() {
  const stats = useApi<{ source: string; counts: Record<string, number>; revocations: number; disputes?: number; topic?: string }>('/api/public/stats');
  const s = stats.data;
  const cells = [
    { label: 'Sealed versions', value: (s?.counts.sealed ?? 0) + (s?.counts.sealed_with_warnings ?? 0) },
    { label: 'Unsafe versions', value: s?.counts.unsafe ?? 0 },
    { label: 'Revocations', value: s?.revocations ?? 0 },
    { label: 'Disputes', value: s?.disputes ?? 0 },
  ];
  return (
    <section className={cx(WRAP, 'py-16 md:py-24')}>
      <Heading center a="Protection is free" b="you choose how strict" />
      <Reveal className="mt-14">
        <div className="relative overflow-hidden rounded-[20px] border border-ink/[0.08] card-blue shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="halftone-blue fade-l pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-30" aria-hidden />
          <div className="glow glow-blue -right-10 -top-20 h-[260px] w-[420px] opacity-30" aria-hidden />
          <div className="relative grid items-center gap-10 p-8 md:p-12 lg:grid-cols-2">
            <div>
              <h3 className="font-display text-[28px] font-medium leading-[1.15] md:text-[34px]">
                Counted from real records,
                <br />
                <span className="ink-dim">not from a pitch deck</span>
              </h3>
              <p className="mt-4 max-w-md text-[15.5px] font-light leading-relaxed text-mist">{stats.error ? 'The Zoro daemon is not reachable from this page right now, so there is nothing to count.' : s?.source === 'ledger' ? `Computed from messages on Hedera topic ${s.topic}, each checked against its auditor signature.` : 'This instance has no public ledger configured yet, so the counts come from this auditor’s local records.'}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <LinkButton href="/registry" size="md">
                  Open the registry
                </LinkButton>
                <LinkButton href="/verify" variant="ghost" size="md">
                  Verify a tool
                </LinkButton>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-ink/[0.07] bg-ink/[0.06]">
              {cells.map((c) => (
                <div key={c.label} className="bg-panel p-6">
                  <dt className="text-[13px] text-ash">{c.label}</dt>
                  <dd className="font-display mt-2 text-[40px] font-medium leading-none">{stats.loading ? '…' : stats.error ? '—' : <CountUp value={c.value} />}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Reveal>
      <Reveal className="mt-20">
        <p className="text-center font-display text-[28px] font-medium">Three protection profiles</p>
      </Reveal>
      <Stagger className="mt-8 grid gap-4 lg:grid-cols-3" gap={0.08} itemClassName="h-full">
        {(['standard', 'strict', 'lab'] as ProfileId[]).map((p) => {
          const st = PROFILE_STYLE[p];
          const rules = defaultPolicy(p).rules.filter((r) => r.enabled).slice(0, 5);
          return (
            <Spotlight key={p} className={cx('relative flex h-full flex-col overflow-hidden rounded-[18px] border p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]', st.ring)}>
              <div className={cx('glow -bottom-24 left-1/2 h-[200px] w-[320px] -translate-x-1/2 opacity-30', st.glow)} aria-hidden />
              <div className="halftone fade-b pointer-events-none absolute inset-x-0 top-0 h-24 opacity-20" aria-hidden />
              <div className="relative flex items-center justify-between">
                <h3 className="text-[21px] font-medium">{st.name}</h3>
                {st.badge && <span className="rounded-full border border-[#2fd4c4]/35 bg-[#2fd4c4]/10 px-2.5 py-0.5 text-[12px] text-teal-ink">{st.badge}</span>}
              </div>
              <p className="relative mt-3 min-h-[72px] text-[15px] font-light leading-relaxed text-mist">{PROFILE_DESCRIPTIONS[p]}</p>
              <LinkButton href={p === 'lab' ? '/lab' : '/console/policies'} className="relative mt-6 w-full">
                {p === 'lab' ? 'Try it in the Attack Lab' : `Use ${st.name}`}
              </LinkButton>
              <ul className="relative mt-7 space-y-3">
                {rules.map((r) => (
                  <li key={r.id} className="flex gap-2.5 text-[13.5px] leading-snug text-ash">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-steel" aria-hidden />
                    <span>{describeRule(r)}</span>
                  </li>
                ))}
              </ul>
            </Spotlight>
          );
        })}
      </Stagger>
    </section>
  );
}

// ---------- attack lab row (in place of testimonials: things you can try, not quotes) ----------

const WASHES = ['wash-1', 'wash-2', 'wash-3', 'wash-4'];

function LabRow() {
  const lab = useApi<{ scenarios: { id: string; title: string; attack: string; shows: string }[] }>('/api/public/lab');
  const track = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => track.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  return (
    <section className="py-16 md:py-24">
      <div className={WRAP}>
        <Heading center a="Ten attacks you can launch" b="and watch fail, live" />
      </div>
      {lab.error ? (
        <p className={cx(WRAP, 'mt-10 text-center text-[15px] text-ash')}>The Attack Lab needs the Zoro daemon, which is not reachable from this page right now.</p>
      ) : (
        <div className="relative mx-auto mt-14 max-w-[1240px]">
          <div ref={track} className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4 pb-4 sm:px-10 sm:[mask-image:linear-gradient(90deg,transparent,black_4%,black_96%,transparent)]">
            {(lab.data?.scenarios ?? Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, title: '', attack: '', shows: '' }))).map((sc, i) => (
              <motion.article
                key={sc.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '0px 0px -10% 0px' }}
                transition={{ duration: 0.7, ease: EASE_EXPO, delay: Math.min(i, 4) * 0.07 }}
                className={cx('group relative flex min-h-[300px] w-[270px] shrink-0 snap-start flex-col overflow-hidden rounded-[16px] border border-ink/[0.09] p-6 sm:w-[290px]', WASHES[i % WASHES.length])}
              >
                <div className="halftone fade-t pointer-events-none absolute inset-x-0 bottom-0 h-28 opacity-25" aria-hidden />
                {sc.title ? (
                  <>
                    <p className="relative text-[18px] font-medium">{sc.title}</p>
                    <p className="relative mt-3 text-[14.5px] font-light leading-relaxed text-mist">{sc.attack}</p>
                    <p className="relative mt-auto pt-6 text-[13px] leading-snug text-ash">
                      <span className="text-quartz">Zoro:</span> {sc.shows}
                    </p>
                    <Link href="/lab" className="relative mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-quartz">
                      Launch it
                      <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                    </Link>
                  </>
                ) : (
                  <div className="space-y-3" aria-hidden>
                    <div className="h-5 w-2/3 rounded bg-ink/[0.07]" />
                    <div className="h-3 w-full rounded bg-ink/[0.05]" />
                    <div className="h-3 w-5/6 rounded bg-ink/[0.05]" />
                  </div>
                )}
              </motion.article>
            ))}
          </div>
          <div className="mt-6 flex justify-end gap-2 px-4 sm:px-10">
            <button type="button" onClick={() => scroll(-1)} aria-label="Previous scenarios" className="flex size-10 items-center justify-center rounded-full border border-ink/15 bg-panel text-mist transition-[color,border-color,transform] duration-200 hover:border-ink/30 hover:text-quartz active:scale-95">
              <ArrowLeft className="size-4" />
            </button>
            <button type="button" onClick={() => scroll(1)} aria-label="Next scenarios" className="flex size-10 items-center justify-center rounded-full border border-ink/15 bg-panel text-mist transition-[color,border-color,transform] duration-200 hover:border-ink/30 hover:text-quartz active:scale-95">
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- promises ----------

const PROMISES = [
  { icon: Eye, title: 'No unverified tool text reaches the model', body: 'Changed descriptions are held back, never forwarded “just this once”.' },
  { icon: Ban, title: 'No call runs against an unsealed version', body: 'Unless a verified person overrides that exact action, and it is recorded.' },
  { icon: Fingerprint, title: 'Every verdict can be checked independently', body: 'Recompute the fingerprint, check the signature, read the ledger.' },
  { icon: Lock, title: 'Your data stays with you', body: 'Public records describe tools, never your prompts, files or identity.' },
  { icon: Radar, title: 'Fail closed, never fail silent', body: 'When Zoro cannot decide, the call does not quietly go through.' },
  { icon: ShieldCheck, title: 'No overclaiming', body: 'Zoro says what was checked and how sure it is. It never calls a tool simply “safe”.' },
];

function Promises() {
  return (
    <section className={cx(WRAP, 'py-16 md:py-24')}>
      <Heading center a="What Zoro will never do" b="tested, not just stated" />
      <Stagger className="mt-14 grid gap-px overflow-hidden rounded-[18px] border border-ink/[0.07] bg-ink/[0.06] sm:grid-cols-2 lg:grid-cols-3" gap={0.06} itemClassName="h-full">
        {PROMISES.map((p) => (
          <div key={p.title} className="h-full bg-deep-sea p-7 transition-colors duration-300 hover:bg-raised">
            <p.icon className="size-5 text-mist" strokeWidth={1.5} aria-hidden />
            <p className="mt-5 text-[16.5px] font-medium">{p.title}</p>
            <p className="mt-2 text-[14.5px] font-light leading-relaxed text-ash">{p.body}</p>
          </div>
        ))}
      </Stagger>
    </section>
  );
}

// ---------- closing ----------

function Closing() {
  return (
    <section className="relative overflow-hidden">
      <div className="aurora-top pointer-events-none absolute inset-0" aria-hidden />
      <div className="halftone-blue fade-t pointer-events-none absolute inset-x-0 bottom-0 h-56 opacity-50" aria-hidden />
      <div className={cx(WRAP, 'relative py-28 text-center md:py-36')}>
        <Reveal>
          <h2 className="font-display ink-fade text-[48px] font-medium leading-[1.02] md:text-[72px]">Get started</h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mx-auto mt-5 max-w-xl text-[18px] font-light text-ash">Run Zoro on your machine, import the clients you already use, and watch every call get checked. Or attack it first.</p>
        </Reveal>
        <Reveal delay={0.16} className="mt-10 flex flex-wrap justify-center gap-3">
          <LinkButton href="/console" size="lg">
            Open the Console
          </LinkButton>
          <LinkButton href="/docs#quick-start" variant="ghost" size="lg">
            Read the docs
          </LinkButton>
        </Reveal>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <Integrations />
      <Bento />
      <Pillars />
      <Story />
      <Profiles />
      <LabRow />
      <Promises />
      <Closing />
    </>
  );
}
