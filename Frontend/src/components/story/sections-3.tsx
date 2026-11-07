'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Depth, gsap, scrollStore, ScrollTrigger, useGSAP } from './runtime';
import { SAMPLE_LOG, batchRoot, recomputedHash, verifyChain, writeChain, type ChainRow } from './demo';
import { Stage } from './stage';
import { VERDICT_TONE, VERDICT_WORD } from './sections-1';
import { Btn, cx, Eyebrow, Heading, Panel, Pill, Rise, short, WRAP, type Tone } from './ui';
import type { Verdict } from '@zoro/core';

// ---------- 09 The Seal, exploded ----------

const LAYERS: { tone: Tone; title: string; simple: string; engineer: string }[] = [
  { tone: 'scan', title: 'Fingerprint', simple: 'The exact “photo” of the tool.', engineer: 'sha-256 over the canonical definition (zoro-canon/1), plus the manifest root of the server.' },
  { tone: 'seal', title: 'Verdict', simple: 'What Sentinel decided, and why.', engineer: 'sealed · sealed_with_warnings · unsafe · pending, with risk score, findings and change class.' },
  { tone: 'unknown', title: 'Capability profile', simple: 'What the tool is able to do.', engineer: 'Inferred capabilities with evidence: e.g. read local files, send communication, financial action.' },
  { tone: 'trust', title: 'Attestation', simple: 'The auditor’s signature.', engineer: 'EIP-191 signature by the Auditor key over keccak-256 of the canonical verdict package.' },
  { tone: 'ledger', title: 'ENS record', simple: 'A public name anyone can look up.', engineer: 'Written under an ENSv2 name on Ethereum Sepolia, when the registry is configured.' },
  { tone: 'ledger', title: 'Hedera event', simple: 'A public receipt that cannot be changed.', engineer: 'Verdict event on a Hedera consensus topic, plus a badge token that is burned on revoke.' },
];

export function Seal() {
  const wrap = useRef<HTMLElement>(null);
  const [active, setActive] = useState(-1);
  const [pinned, setPinned] = useState(false);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
        setPinned(true);
        const st = ScrollTrigger.create({
          trigger: wrap.current,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (s) => {
            scrollStore.seal = s.progress;
            setActive(Math.min(LAYERS.length - 1, Math.floor(gsap.utils.clamp(0, 0.999, (s.progress - 0.1) / 0.75) * LAYERS.length)));
          },
        });
        return () => {
          st.kill();
          setPinned(false);
        };
      });
      mm.add('(max-width: 1023px), (prefers-reduced-motion: reduce)', () => {
        scrollStore.seal = 1;
        setActive(LAYERS.length - 1);
      });
    },
    { scope: wrap },
  );
  return (
    <section id="seal" ref={wrap} className={cx('relative', pinned && 'h-[280vh]')}>
      <div className={cx(pinned && 'sticky top-0 flex h-[100svh] items-center')}>
        <div className={cx(WRAP, 'grid gap-10 py-24 lg:grid-cols-[1fr_1fr] lg:items-center lg:py-0')}>
          <div className="lg:order-2">
            <Eyebrow n="08" tone="ledger">
              The Seal
            </Eyebrow>
            <Heading className="mt-5 !text-[34px] md:!text-[46px]">A Seal is a stack of proofs.</Heading>
            <Depth
              className="mt-5 max-w-[520px] text-[16px] leading-relaxed text-(--text-2)"
              simple={<p>Like a stamped boarding pass that is also written in a public book. Anyone can check it, and nobody can quietly change it.</p>}
              engineer={<p>The verdict package is signed, then published. Seal status is active, superseded, revoked, expired or disputed.</p>}
            />
            <ol className="mt-7 space-y-2">
              {LAYERS.map((l, i) => (
                <li key={l.title} className={cx('flex gap-4 rounded-[12px] border p-3.5 transition-[border-color,background-color,opacity] duration-300', i <= active ? 'opacity-100' : 'opacity-40', i === active ? 'bg-(--surface)' : 'border-transparent')} style={i === active ? { borderColor: `color-mix(in srgb, var(--${l.tone}) 40%, var(--line))` } : undefined}>
                  <span className="mt-0.5 font-mono text-[12px]" style={{ color: `var(--${l.tone})` }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p className="text-[15px] font-medium text-(--text)">{l.title}</p>
                    <Depth className="text-[13.5px] text-(--text-2)" simple={<p>{l.simple}</p>} engineer={<p>{l.engineer}</p>} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <Stage scene="seal" label="An exploded view of a Seal: six layers, from the fingerprint at the bottom to the public Hedera record at the top." className="h-[360px] lg:order-1 lg:h-[620px]" />
        </div>
      </div>
    </section>
  );
}

// ---------- 10 Audit log: tamper with it ----------

export function Chain() {
  const original = useMemo(() => writeChain(SAMPLE_LOG), []);
  const [rows, setRows] = useState<ChainRow[]>(original);
  const check = useMemo(() => verifyChain(rows), [rows]);
  const root = useMemo(() => batchRoot(rows), [rows]);
  const originalRoot = useMemo(() => batchRoot(original), [original]);
  const box = useRef<HTMLDivElement>(null);

  const tamper = (seq: number) => {
    setRows((rs) => rs.map((r) => (r.seq === seq ? { ...r, summary: r.summary.replace(/unsafe|sealed|allowed|opened|asked/, (m) => ({ unsafe: 'sealed', sealed: 'unsafe', allowed: 'blocked', opened: 'closed', asked: 'allowed' })[m] ?? m) } : r)));
    if (box.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.fromTo(box.current, { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
  };

  return (
    <section id="chain" className={cx(WRAP, 'py-28')}>
      <div className="max-w-[760px]">
        <Eyebrow n="09" tone="ledger">
          Audit log
        </Eyebrow>
        <Heading className="mt-5">Try to rewrite history.</Heading>
        <Depth
          className="mt-6 text-[17px] leading-relaxed text-(--text-2)"
          simple={<p>Every entry includes a fingerprint of the entry before it, like links in a chain. Change one word in any entry and every link after it breaks. Click “Tamper” and see for yourself.</p>}
          engineer={<p>Append-only, hash-chained: hash = keccak256(canonicalJson({`{ ts, kind, ref, summary, data, prev }`})). Batches are anchored as a Merkle root over the entry hashes, with inclusion proofs. Verification here uses the same formula as the daemon.</p>}
        />
      </div>
      <div ref={box} className="mt-12 grid gap-3">
        {rows.map((r) => {
          const broken = check.brokenAt !== null && r.seq >= check.brokenAt;
          const first = check.brokenAt === r.seq;
          return (
            <div key={r.seq} className={cx('grid items-center gap-3 rounded-[12px] border bg-(--surface) px-4 py-3 md:grid-cols-[40px_1fr_auto_auto]', broken ? 'border-(--block)/50' : 'border-(--line)')}>
              <span className="font-mono text-[12px] text-(--text-3)">#{r.seq}</span>
              <div className="min-w-0">
                <p className="truncate text-[14.5px] text-(--text)">
                  <span className="mr-2 font-mono text-[12px] text-(--text-3)">{r.kind}</span>
                  {r.summary}
                </p>
                <p className="mt-0.5 truncate font-mono text-[11.5px] text-(--text-3)">
                  prev {short(r.prev_hash, 8, 4)} · hash {short(r.hash, 8, 4)}
                  {first && <span className="text-(--block)"> · recomputed {short(recomputedHash(r), 8, 4)}</span>}
                </p>
              </div>
              <Pill tone={broken ? 'block' : 'seal'}>{broken ? (first ? 'tampered' : 'link broken') : 'verified'}</Pill>
              <button onClick={() => tamper(r.seq)} className="rounded-[8px] border border-(--line-strong) px-3 py-1.5 text-[13px] text-(--text-2) hover:border-(--block)/60 hover:text-(--block)">
                Tamper
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 text-[13.5px]">
        <Pill tone={check.ok ? 'seal' : 'block'}>{check.ok ? 'chain verified' : `chain broken at #${check.brokenAt}`}</Pill>
        <span className="font-mono text-[12px] text-(--text-3)">
          batch Merkle root {short(root, 10, 6)}
          {root !== originalRoot && <span className="text-(--block)"> ≠ anchored {short(originalRoot, 10, 6)}</span>}
        </span>
        {!check.ok && (
          <button onClick={() => setRows(original)} className="text-(--trust) underline-offset-4 hover:underline">
            Restore
          </button>
        )}
      </div>
      <p className="mt-3 text-[12.5px] text-(--text-3)">Sample entries; real hashing. The daemon runs the same check on its own log.</p>
    </section>
  );
}

// ---------- 11 Live ----------

interface Stats {
  source: 'local' | 'ledger';
  counts: Partial<Record<Verdict, number>>;
  revocations: number;
}
interface FeedEvent {
  type: string;
  consensus_ts: string;
  seq: number;
  url: string;
}

/** Waits for the hosted backend the same way BackendWake does; hides itself if it never answers. Never shows fake data. */
function useLive() {
  const [state, setState] = useState<{ phase: 'loading' | 'waking' | 'ok' | 'gone'; stats?: Stats; feed?: { ledgerConfigured: boolean; events: FeedEvent[] } }>({ phase: 'loading' });
  useEffect(() => {
    let alive = true;
    const slow = setTimeout(() => alive && setState((s) => (s.phase === 'loading' ? { phase: 'waking' } : s)), 2500);
    (async () => {
      try {
        const opts = { cache: 'no-store' as const, signal: AbortSignal.timeout(130_000) };
        const [s, f] = await Promise.all([fetch('/api/public/stats', opts), fetch('/api/public/feed?limit=6', opts)]);
        if (!s.ok || !f.ok) throw new Error('unavailable');
        const [stats, feed] = await Promise.all([s.json(), f.json()]);
        if (alive) setState({ phase: 'ok', stats, feed });
      } catch {
        if (alive) setState({ phase: 'gone' });
      } finally {
        clearTimeout(slow);
      }
    })();
    return () => {
      alive = false;
      clearTimeout(slow);
    };
  }, []);
  return state;
}

export function Live() {
  const live = useLive();
  if (live.phase === 'gone') return <div id="live" />;
  const counts = live.stats?.counts ?? {};
  return (
    <section id="live" className={cx(WRAP, 'py-28')}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[640px]">
          <Eyebrow n="10" tone="scan">
            Live
          </Eyebrow>
          <Heading className="mt-5">This is running right now.</Heading>
          <p className="mt-5 text-[17px] leading-relaxed text-(--text-2)">Real numbers from this deployment’s public API. Then break something yourself in the Attack Lab.</p>
        </div>
        <Btn href="/lab" variant="ghost">
          Open the Attack Lab →
        </Btn>
      </div>
      {live.phase !== 'ok' ? (
        <p role="status" className="mt-10 flex items-center gap-3 text-[14px] text-(--text-2)">
          <span className="size-3.5 animate-spin rounded-full border-2 border-(--scan)/30 border-t-(--scan)" aria-hidden />
          {live.phase === 'waking' ? 'Starting the backend… it sleeps when idle and takes about a minute to wake.' : 'Loading live numbers…'}
        </p>
      ) : (
        <>
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-5">
            {(['sealed', 'sealed_with_warnings', 'unsafe', 'pending'] as Verdict[]).map((v) => (
              <Rise key={v}>
                <div className="rounded-[14px] border border-(--line) bg-(--surface) p-5">
                  <p className="font-mono text-[34px] font-light tabular-nums" style={{ color: `var(--${VERDICT_TONE[v]})` }}>
                    {counts[v] ?? 0}
                  </p>
                  <p className="mt-1 text-[13px] text-(--text-2)">{VERDICT_WORD[v]}</p>
                </div>
              </Rise>
            ))}
            <Rise>
              <div className="rounded-[14px] border border-(--line) bg-(--surface) p-5">
                <p className="font-mono text-[34px] font-light tabular-nums text-(--block)">{live.stats!.revocations}</p>
                <p className="mt-1 text-[13px] text-(--text-2)">revoked</p>
              </div>
            </Rise>
          </div>
          <p className="mt-3 text-[12.5px] text-(--text-3)">
            {live.stats!.source === 'ledger' ? 'Source: the Hedera ledger.' : 'Source: this server’s local records. On the free hosted instance they reset when it restarts.'}
          </p>
          {live.feed!.events.length > 0 && (
            <Panel title="latest ledger events" className="mt-6">
              <ul className="divide-y divide-(--line)">
                {live.feed!.events.map((e) => (
                  <li key={`${e.seq}-${e.consensus_ts}`} className="flex items-center justify-between gap-3 px-5 py-2.5 font-mono text-[12.5px]">
                    <span className="text-(--text)">{e.type}</span>
                    <a href={e.url} target="_blank" rel="noreferrer" className="text-(--trust) hover:underline">
                      #{e.seq} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </section>
  );
}

// ---------- 12 Verify ----------

type Lookup = { phase: 'idle' | 'busy' } | { phase: 'none'; q: string } | { phase: 'error' } | { phase: 'found'; fp: string; name: string | null; server: string | null; verdict: Verdict; status: string | null };

export function Verify() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Lookup>({ phase: 'idle' });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setRes({ phase: 'busy' });
    try {
      const l = await fetch(`/api/public/lookup?q=${encodeURIComponent(query)}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject()));
      if (!l.fingerprint) return setRes({ phase: 'none', q: query });
      const v = await fetch(`/api/public/verdict/${l.fingerprint}`, { cache: 'no-store' });
      if (v.status === 404) return setRes({ phase: 'none', q: query });
      if (!v.ok) throw new Error();
      const d = await v.json();
      setRes({ phase: 'found', fp: l.fingerprint, name: d.package?.name ?? d.seal?.name ?? null, server: d.seal?.server_label ?? null, verdict: d.package?.verdict ?? d.seal?.verdict, status: d.seal?.status ?? null });
    } catch {
      setRes({ phase: 'error' });
    }
  };
  return (
    <section id="verify" className="relative overflow-hidden border-t border-(--line) py-28">
      <div className="story-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className={cx(WRAP, 'relative max-w-[880px] text-center')}>
        <Eyebrow n="11" tone="seal">
          <span>Verify</span>
        </Eyebrow>
        <Heading className="mt-5">Check any tool. You do not need to trust us.</Heading>
        <Depth
          className="mx-auto mt-6 max-w-[620px] text-[17px] leading-relaxed text-(--text-2)"
          simple={<p>Paste a tool’s fingerprint or its public name and see what Zoro decided about it.</p>}
          engineer={<p>Accepts a fingerprint (or an 8+ character prefix), an ENS name, or a Hedera topic:sequence reference. The full Verify page re-checks the signature and the ledger from first principles in your browser.</p>}
        />
        <form onSubmit={submit} className="mx-auto mt-10 flex max-w-[640px] flex-col gap-3 sm:flex-row">
          <label htmlFor="verify-q" className="sr-only">
            Fingerprint, ENS name or Hedera reference
          </label>
          <input
            id="verify-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="0x69fa1bce… or a name"
            autoComplete="off"
            spellCheck={false}
            className="h-12 flex-1 rounded-[10px] border border-(--line-strong) bg-(--surface) px-4 font-mono text-[14px] text-(--text) placeholder:text-(--text-3) focus:border-(--trust) focus:outline-none focus:ring-[3px] focus:ring-(--trust)/25"
          />
          <button type="submit" disabled={res.phase === 'busy'} className="h-12 rounded-[10px] bg-(--trust-fill) px-6 text-[15px] font-medium text-white transition-colors hover:bg-(--trust) disabled:opacity-60">
            {res.phase === 'busy' ? 'Checking…' : 'Verify'}
          </button>
        </form>
        <div className="mx-auto mt-5 max-w-[640px] text-left" aria-live="polite">
          {res.phase === 'none' && <p className="text-[14px] text-(--text-2)">No public verdict found for “{res.q}”. It may never have been audited here, or this instance’s records were reset.</p>}
          {res.phase === 'error' && <p className="text-[14px] text-(--block)">The backend did not answer. It may be waking up; try again in a minute.</p>}
          {res.phase === 'found' && (
            <Panel title={res.server ? `${res.server} · ${res.name}` : res.name ?? 'definition'} tone={VERDICT_TONE[res.verdict]} right={<Pill tone={VERDICT_TONE[res.verdict]}>{VERDICT_WORD[res.verdict]}</Pill>}>
              <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                <span className="font-mono text-[12.5px] text-(--text-2)">
                  {short(res.fp, 12, 8)}
                  {res.status && ` · ${res.status}`}
                </span>
                <Link href={`/verify?q=${res.fp}`} className="text-[14px] text-(--trust) hover:underline">
                  Full verification →
                </Link>
              </div>
            </Panel>
          )}
        </div>
        <div className="mt-14 flex flex-wrap justify-center gap-3">
          <Btn href="/docs#quick-start">Get started</Btn>
          <Btn href="/lab" variant="ghost">
            Launch an attack
          </Btn>
        </div>
        <pre className="mx-auto mt-10 max-w-[640px] overflow-x-auto rounded-[12px] border border-(--line) bg-(--night-2) p-5 text-left font-mono text-[12.5px] leading-relaxed text-(--text-2)">
          {['git clone <your-repo-url> zoro && cd zoro', 'pnpm install', 'pnpm dev                    # daemon on :7420, web on :3000'].join('\n')}
        </pre>
      </div>
    </section>
  );
}
