'use client';

/**
 * Product fragments for the home page, built the way agentql.com builds its hero: real interface pieces in navy
 * panels, stacked with depth, joined by dotted connectors, lit by one glow. Every value shown is computed in the
 * browser from the Attack Lab fixtures by the same @zoro/core code the gateway runs.
 */
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, CircleSlash, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { ensNamesFor, fingerprintDefinition } from '@zoro/core';
import { Revealed } from './security';
import { Mark } from './site';
import { cx } from './ui';
import { EASE_EXPO, EASE_OUT } from './motion';
import { EXAMPLES, analyze, type Example } from '@/lib/examples';
import { shortHash } from '@/lib/format';

// ---------- small building blocks ----------

export function Panel({ title, icon, children, className, right }: { title: ReactNode; icon?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <div className={cx('code-surface overflow-hidden rounded-[12px]', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-[#1d2b4d] px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] font-medium text-[#dbe4ff]">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}

type Tok = { t: string; c?: 'key' | 'str' | 'num' | 'hl' | 'dim' | 'bad' };
/** Code lines with quiet line numbers; a token may carry agentql's blue selection highlight. */
export function Lines({ lines, className }: { lines: Tok[][]; className?: string }) {
  const cls = { key: 'text-[#e6ecff]', str: 'text-[#5cc8ff]', num: 'text-[#9db6ff]', hl: 'rounded-[3px] bg-[#2d5bd9] px-0.5 text-white', dim: 'text-[#5a6788]', bad: 'rounded-[3px] bg-[#7a1f2b]/70 px-0.5 text-[#ffd5d8]' } as const;
  return (
    <pre className={cx('overflow-hidden py-3 font-mono text-[12.5px] leading-[1.75] text-[#aab6d3]', className)}>
      {lines.map((ln, i) => (
        <div key={i} className="flex">
          <span className="w-9 shrink-0 select-none pr-3 text-right text-[#34416a]" aria-hidden>
            {i + 1}
          </span>
          <span className="min-w-0 whitespace-pre-wrap break-words pr-4">
            {ln.map((tk, j) => (
              <span key={j} className={tk.c ? cls[tk.c] : undefined}>
                {tk.t}
              </span>
            ))}
          </span>
        </div>
      ))}
    </pre>
  );
}

/** A dotted line with a dot that travels along it (static under reduced motion). */
export function Connector({ className, length = 120, delay = 0 }: { className?: string; length?: number; delay?: number }) {
  return (
    <span className={cx('connector pointer-events-none absolute', className)} style={{ width: length }} aria-hidden>
      <span className="travel-dot absolute -top-[2px] left-0 size-[5px] rounded-full bg-[#b9ccff] shadow-[0_0_10px_2px_rgba(120,160,255,0.7)]" style={{ ['--travel' as string]: `${length - 5}px`, animationDelay: `${delay}s` }} />
    </span>
  );
}

const addedPart = (before: string, after: string) => (after.startsWith(before) ? { kept: before, added: after.slice(before.length) } : { kept: '', added: after });

// ---------- hero ----------

export function HeroStage() {
  const [tab, setTab] = useState(EXAMPLES[0].id);
  const ex = EXAMPLES.find((e) => e.id === tab)!;
  const r = useMemo(() => analyze(ex), [ex]);
  const desc = addedPart(String(ex.before.description ?? ''), String(ex.after.description ?? ''));
  const ranked = [...r.findings].sort((a, b) => SEV.indexOf(b.severity) - SEV.indexOf(a.severity));
  const verdictLines: Tok[][] = [
    [{ t: '{' }],
    [{ t: '  "tool": ' }, { t: `"${ex.after.name}"`, c: 'str' }, { t: ',' }],
    [{ t: '  ' }, { t: '"verdict"', c: 'hl' }, { t: ': ' }, { t: `"${r.verdict}"`, c: r.verdict === 'unsafe' ? 'bad' : 'str' }, { t: ',' }],
    [{ t: '  "change": ' }, { t: `"${r.changeClass.replace(/_/g, ' ')}"`, c: 'str' }, { t: ',' }],
    [{ t: '  "findings": [' }],
    ...ranked.slice(0, 2).map((f, i, a): Tok[] => [{ t: '    ' }, { t: `"${f.title}"`, c: 'str' }, { t: i < a.length - 1 || ranked.length > 2 ? ',' : '' }]),
    ...(ranked.length > 2 ? [[{ t: `    … ${ranked.length - 2} more`, c: 'dim' as const }]] : []),
    [{ t: '  ],' }],
    [{ t: '  "sealed": ' }, { t: `"${shortHash(r.before, 6, 4)}"`, c: 'num' }, { t: ',' }],
    [{ t: '  "live": ' }, { t: `"${shortHash(r.after, 6, 4)}"`, c: 'num' }],
    [{ t: '}' }],
  ];
  return (
    <div className="relative">
      <div className="glow glow-blue left-[30%] top-[24%] h-[340px] w-[420px]" aria-hidden />
      <div className="glow glow-teal right-[-6%] top-[56%] h-[220px] w-[260px] opacity-40" aria-hidden />

      <div role="tablist" aria-label="Attack examples" className="relative z-30 mb-4 flex justify-end gap-1">
        {EXAMPLES.map((e) => (
          <button key={e.id} role="tab" aria-selected={tab === e.id} onClick={() => setTab(e.id)} className={cx('relative rounded-full px-3.5 py-1.5 text-[13.5px] transition-colors duration-[180ms]', tab === e.id ? 'text-quartz' : 'text-ash hover:text-mist')}>
            {tab === e.id && <motion.span layoutId="hero-tab" className="absolute inset-0 -z-10 rounded-full border border-ink/25 bg-ink/[0.06]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            {e.tab}
          </button>
        ))}
      </div>

      <div className="relative flex flex-col gap-4 lg:block lg:h-[628px]">
        {/* The agent's side: what it asked for and what it got back. */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.9, ease: EASE_EXPO, delay: 0.55 }} className="z-10 lg:absolute lg:left-0 lg:top-[118px] lg:w-[37%]">
          <div className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#121318] shadow-[var(--shadow-float)]">
            <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#1a1f33] px-3 py-2">
              <span className="flex gap-1" aria-hidden>
                <span className="size-2 rounded-full bg-white/15" />
                <span className="size-2 rounded-full bg-white/10" />
                <span className="size-2 rounded-full bg-white/[0.07]" />
              </span>
              <span className="text-[11.5px] text-[#9aa8c7]">agent · claude-code</span>
            </div>
            <div className="p-4 lg:pr-8">
              <p className="text-[12px] text-[#a3a6b4]">Agent calls</p>
              <p className="mt-1 font-mono text-[15px] text-white">
                <span className="rounded-[4px] bg-[#2d5bd9] px-1">{ex.after.name}</span>()
              </p>
              <AnimatePresence mode="wait">
                <motion.p key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3, ease: EASE_OUT }} className="mt-3 rounded-[8px] border border-[#f0646a]/25 bg-[#2c1618]/80 p-2.5 text-[12px] leading-relaxed text-[#f3c5c7]">
                  {r.refusal.content[0].text}
                </motion.p>
              </AnimatePresence>
              <div className="mt-3 space-y-2" aria-hidden>
                <div className="h-1.5 w-4/5 rounded-full bg-white/[0.06]" />
                <div className="h-1.5 w-3/5 rounded-full bg-white/[0.05]" />
              </div>
            </div>
          </div>
        </motion.div>


        {/* The live definition, as the server sends it now. */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE_EXPO, delay: 0.25 }} className="z-20 lg:absolute lg:right-0 lg:top-0 lg:w-[66%]">
          <Panel title={`${ex.server} · ${ex.after.name}`} icon={<Mark className="size-3.5 text-[#dbe4ff]" />} right={<span className="text-[11px] text-[#ff9aa0]">new version · held back</span>}>
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.32, ease: EASE_OUT }} className="max-h-[230px] overflow-hidden px-4 py-3 font-mono text-[12.5px] leading-[1.75] text-[#aab6d3]">
                <span className="text-[#5a6788]">description: </span>
                <span>{desc.kept}</span>
                <span className="rounded-[3px] bg-[#2d5bd9]/45 text-white [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
                  <Revealed text={desc.added} />
                </span>
              </motion.div>
            </AnimatePresence>
          </Panel>
        </motion.div>

        {/* Sentinel's verdict on it. */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE_EXPO, delay: 0.4 }} className="z-20 lg:absolute lg:right-0 lg:top-[262px] lg:w-[66%]">
          <Panel title="Sentinel verdict" icon={<ShieldAlert className="size-3.5 text-[#ff9aa0]" aria-hidden />} right={<span className="text-[11px] text-[#7d8bb0]">computed in your browser</span>}>
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <Lines lines={verdictLines} />
              </motion.div>
            </AnimatePresence>
          </Panel>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.9 }} className="z-30 lg:absolute lg:bottom-0 lg:left-[38%]">
          <Link href={`/verify?q=${r.after}`} className="group inline-flex items-center gap-2 rounded-full border border-white/15 bg-[linear-gradient(90deg,#2f5fd0,#5b5cf0)] px-4 py-2 text-[13.5px] font-medium text-white shadow-[0_8px_30px_-6px_rgba(70,100,255,0.7)] transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.97]">
            Verify this verdict yourself
            <ArrowRight className="size-3.5 transition-transform duration-300 ease-out group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

const SEV = ['info', 'low', 'medium', 'high', 'critical'];

// ---------- integrations tiles ----------

const TILE_FILLS = [
  'from-[#ff7a45] via-[#b8456a] to-[#3b2a8f]',
  'from-[#2f6bff] via-[#2b4fc7] to-[#1a2a6b]',
  'from-[#6c5cff] via-[#4b3fc9] to-[#1d1a5a]',
  'from-[#22c7b8] via-[#1f7fa8] to-[#163a6b]',
  'from-[#ff8c5a] via-[#e05a7a] to-[#5a2a8a]',
  'from-[#3a8dff] via-[#3858d6] to-[#24236e]',
];

export function IntegrationTile({ label, sub, icon, i }: { label: string; sub: string; icon: ReactNode; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.7, ease: EASE_EXPO, delay: 0.05 * i }}
      whileHover={{ y: -4 }}
      className={cx('relative flex aspect-square flex-col justify-between overflow-hidden rounded-[16px] border border-white/20 bg-gradient-to-br p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_14px_30px_-10px_rgba(0,0,0,0.7)]', TILE_FILLS[i % TILE_FILLS.length])}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_0%,rgba(255,255,255,0.28),transparent_55%)]" aria-hidden />
      <span className="relative text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]">{icon}</span>
      <span className="relative">
        <span className="block text-[13.5px] font-semibold leading-tight text-white">{label}</span>
        <span className="mt-0.5 hidden text-[11px] leading-tight text-white/75 sm:block">{sub}</span>
      </span>
    </motion.div>
  );
}

// ---------- bento visuals ----------

/** Clients → Zoro → servers, with calls travelling through the gateway. */
export function GatewayVisual() {
  const clients = ['Claude Code', 'Cursor', 'Claude Desktop'];
  const servers = ['filesystem', 'postmail', 'wallet'];
  return (
    <div className="relative flex h-full items-center justify-between gap-2 px-6">
      <div className="glow glow-violet left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 opacity-50" aria-hidden />
      <ul className="relative space-y-2.5">
        {clients.map((c) => (
          <li key={c} className="rounded-full border border-ink/10 bg-raised px-3 py-1.5 text-[12px] text-mist">
            {c}
          </li>
        ))}
      </ul>
      <div className="relative flex flex-1 items-center justify-center">
        <Connector className="left-0 top-1/2" length={56} />
        <motion.div initial={{ scale: 0.85, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease: EASE_EXPO }} className="relative z-10 flex size-[92px] items-center justify-center rounded-[24px] border border-white/25 bg-[linear-gradient(145deg,#3a6bff,#5a4dff_55%,#2a1f7a)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_18px_40px_-10px_rgba(80,90,255,0.8)]">
          <Mark className="size-11 text-white" />
        </motion.div>
        <Connector className="right-0 top-1/2" length={56} delay={0.9} />
      </div>
      <ul className="relative space-y-2.5">
        {servers.map((s) => (
          <li key={s} className="rounded-[8px] border border-[#1d2b4d] bg-code px-3 py-1.5 font-mono text-[11.5px] text-[#aab6d3]">
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Sentinel's layers, ticking through in order. */
export function SentinelVisual() {
  const layers = [
    { name: 'Deterministic rules', note: 'zoro-rules/1.0.0', state: 'done' },
    { name: 'Diff against the last seal', note: 'change class', state: 'done' },
    { name: 'AI review', note: 'quotes the exact text', state: 'run' },
    { name: 'Signed attestation', note: 'EIP-191', state: 'wait' },
  ] as const;
  return (
    <div className="relative mx-auto flex h-full max-w-[380px] flex-col justify-center gap-2 px-6">
      <div className="glow glow-blue right-0 top-0 h-[200px] w-[240px] opacity-40" aria-hidden />
      {layers.map((l, i) => (
        <motion.div key={l.name} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: EASE_EXPO, delay: 0.12 * i }} className="relative flex items-center gap-3 rounded-[10px] border border-ink/[0.08] bg-raised/90 px-3.5 py-2.5">
          {l.state === 'done' ? <Check className="size-4 text-ok" aria-hidden /> : l.state === 'run' ? <Loader2 className="size-4 animate-spin text-frosted motion-reduce:animate-none" aria-hidden /> : <span className="size-4 rounded-full border border-dashed border-ink/25" aria-hidden />}
          <span className="text-[13px] text-quartz">{l.name}</span>
          <span className="ml-auto text-[11.5px] text-ash">{l.note}</span>
        </motion.div>
      ))}
    </div>
  );
}

/** What was sealed against what the server sends now. */
export function PinningVisual() {
  const ex = EXAMPLES[0];
  const r = useMemo(() => analyze(ex), [ex]);
  const d = addedPart(String(ex.before.description ?? ''), String(ex.after.description ?? ''));
  return (
    <div className="relative grid gap-3 md:grid-cols-2">
      <Panel title="Sealed" icon={<ShieldCheck className="size-3.5 text-ok" aria-hidden />} right={<span className="font-mono text-[11px] text-[#7d8bb0]">{shortHash(r.before, 6, 4)}</span>}>
        <Lines lines={[[{ t: '{' }], [{ t: '  "name": ' }, { t: `"${ex.before.name}"`, c: 'str' }, { t: ',' }], [{ t: '  "description":' }], [{ t: `    "${ex.before.description}"`, c: 'str' }], [{ t: '}' }]]} />
      </Panel>
      <Panel title="Live now" icon={<CircleSlash className="size-3.5 text-[#ff9aa0]" aria-hidden />} right={<span className="font-mono text-[11px] text-[#ff9aa0]">{shortHash(r.after, 6, 4)}</span>}>
        <Lines lines={[[{ t: '{' }], [{ t: '  "name": ' }, { t: `"${ex.after.name}"`, c: 'str' }, { t: ',' }], [{ t: '  "description":' }], [{ t: `    "${d.kept}` , c: 'str' }, { t: d.added.trim(), c: 'hl' }, { t: '"', c: 'str' }], [{ t: '}' }]]} />
      </Panel>
    </div>
  );
}

/** The names a tool version gets in the registry, computed for the fixture above. */
export function RegistryVisual() {
  const fp = useMemo(() => fingerprintDefinition('tool', EXAMPLES[0].before), []);
  const n = ensNamesFor('zoro.eth', 'postmail', 'send_email', fp);
  const rows = [
    { k: 'server', v: n.server },
    { k: 'tool', v: n.tool },
    { k: 'version', v: n.version },
    { k: 'current →', v: n.current },
  ];
  return (
    <div className="relative flex h-full flex-col justify-center gap-2 px-6">
      <div className="glow glow-teal left-0 top-1/3 h-[180px] w-[220px] opacity-35" aria-hidden />
      {rows.map((r, i) => (
        <motion.div key={r.k} initial={{ opacity: 0, x: 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: EASE_EXPO, delay: 0.1 * i }} className="relative flex items-baseline gap-3" style={{ paddingLeft: Math.min(i, 2) * 18 }}>
          <span className="w-16 shrink-0 text-right text-[11px] text-ash">{r.k}</span>
          <span className="truncate rounded-[6px] border border-[#1d2b4d] bg-code px-2 py-1 font-mono text-[11.5px] text-[#aab6d3]">{r.v}</span>
        </motion.div>
      ))}
    </div>
  );
}

/** The kinds of message Zoro writes to its Hedera topics. */
export function LedgerVisual() {
  const rows = [
    ['verdict.issued', 'fingerprint, verdict, signature'],
    ['seal.revoked', 'fingerprint, reason, badge burned'],
    ['dispute.opened', 'challenge with evidence hash'],
    ['commitment.batch', 'Merkle root of your local log'],
  ];
  return (
    <div className="relative h-full px-5 py-5">
      <div className="glow glow-violet right-0 bottom-0 h-[180px] w-[240px] opacity-40" aria-hidden />
      <div className="relative overflow-hidden rounded-[10px] border border-ink/[0.08] bg-panel/90">
        <div className="grid grid-cols-[1fr_1.4fr] border-b border-ink/[0.06] px-3 py-2 text-[11px] text-ash">
          <span>Message</span>
          <span>Carries</span>
        </div>
        {rows.map(([t, c], i) => (
          <motion.div key={t} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 * i }} className="grid grid-cols-[1fr_1.4fr] items-center border-b border-ink/[0.04] px-3 py-2 last:border-0">
            <span className="font-mono text-[11.5px] text-frosted">{t}</span>
            <span className="text-[11.5px] text-mist">{c}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** A risky action, its digest, and what a Human Seal does with it. */
export function HumanSealVisual() {
  const steps = [
    { t: 'Approved by a verified person', tone: 'ok' },
    { t: 'Same proof used again → refused', tone: 'bad' },
    { t: 'Expired or cancelled → nothing runs', tone: 'bad' },
  ] as const;
  return (
    <div className="relative flex h-full flex-col justify-center gap-2 px-6">
      <div className="glow glow-ember left-1/3 top-0 h-[160px] w-[220px] opacity-35" aria-hidden />
      <div className="relative rounded-[10px] border border-[#1d2b4d] bg-code px-3 py-2 font-mono text-[11.5px] text-[#aab6d3]">
        action = send_transaction · 5000 USDC
        <span className="block text-[#5a6788]">signal = zoro-action:&lt;digest&gt;</span>
      </div>
      {steps.map((s, i) => (
        <motion.div key={s.t} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.55, ease: EASE_EXPO, delay: 0.12 * i }} className="relative flex items-center gap-2 text-[12.5px] text-mist">
          {s.tone === 'ok' ? <Check className="size-3.5 text-ok" aria-hidden /> : <CircleSlash className="size-3.5 text-danger" aria-hidden />}
          {s.t}
        </motion.div>
      ))}
    </div>
  );
}

// ---------- scroll story visuals ----------

export function StoryVisual({ step }: { step: number }) {
  const ex = EXAMPLES[0];
  const r = useMemo(() => analyze(ex), [ex]);
  const h = useMemo(() => analyze({ ...ex, after: { ...ex.before, description: String(ex.before.description ?? '').replace('one or more', 'one or several') } } satisfies Example), [ex]);
  const content = [
    <Panel key="0" title="fingerprint · zoro-canon/1" icon={<Mark className="size-3.5" />}>
      <Lines
        lines={[
          [{ t: 'sha256(' }],
          [{ t: '  "zoro-canon/1\\ntool\\n"', c: 'str' }, { t: ' +' }],
          [{ t: '  canonicalJson(definition)' }],
          [{ t: ')' }],
          [{ t: '= ' }, { t: shortHash(r.before, 14, 10), c: 'hl' }],
        ]}
      />
    </Panel>,
    <Panel key="1" title="what the agent is shown" icon={<ShieldCheck className="size-3.5 text-ok" aria-hidden />} right={<span className="text-[11px] text-ok">sealed text only</span>}>
      <Lines lines={[[{ t: '"name": ' }, { t: `"${ex.before.name}"`, c: 'str' }], [{ t: '"description": ' }, { t: `"${ex.before.description}"`, c: 'str' }], [{ t: '// live version ' }, { t: shortHash(r.after, 6, 4), c: 'bad' }, { t: ' is held back', c: 'dim' }]]} />
    </Panel>,
    <Panel key="2" title="an honest typo fix" icon={<Check className="size-3.5 text-ok" aria-hidden />} right={<span className="text-[11px] text-ok">{h.changeClass.replace(/_/g, ' ')} · {h.verdict}</span>}>
      <Lines lines={[[{ t: '- "Send an email to ' }, { t: 'one or more', c: 'bad' }, { t: ' recipients…"' }], [{ t: '+ "Send an email to ' }, { t: 'one or several', c: 'hl' }, { t: ' recipients…"' }], [{ t: '// sealed and released, the agent never notices', c: 'dim' }]]} />
    </Panel>,
    <Panel key="3" title="seal.revoked" icon={<ShieldAlert className="size-3.5 text-[#ff9aa0]" aria-hidden />} right={<span className="text-[11px] text-[#ff9aa0]">every gateway blocks it</span>}>
      <Lines lines={[[{ t: '{' }], [{ t: '  "type": ' }, { t: '"seal.revoked"', c: 'str' }, { t: ',' }], [{ t: '  "fp": ' }, { t: `"${shortHash(r.before, 6, 4)}"`, c: 'num' }, { t: ',' }], [{ t: '  "exposure": ' }, { t: '"report generated locally"', c: 'str' }], [{ t: '}' }]]} />
    </Panel>,
  ];
  return (
    <div className="relative">
      <div className={cx('glow h-[360px] w-[420px] left-[10%] top-[-10%] transition-[background] duration-700', step === 3 ? 'glow-ember' : step === 2 ? 'glow-teal' : 'glow-blue')} aria-hidden />
      <div className="halftone-blue fade-radial absolute -inset-10 opacity-40" aria-hidden />
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.99, transition: { duration: 0.2 } }} transition={{ duration: 0.5, ease: EASE_EXPO }} className="relative">
          {content[step]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
