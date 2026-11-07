'use client';

import { useMemo, useRef, useState } from 'react';
import { RULESET_VERSION, type Verdict } from '@zoro/core';
import { Depth, Flip, gsap, scrollStore, ScrollTrigger, useGSAP } from './runtime';
import { FORECAST_V1, FORECAST_V2, INSERTED, auditForecast, canonical, weatherManifest } from './demo';
import { Stage } from './stage';
import { Btn, cx, Eyebrow, Heading, Panel, Pill, Rise, short, WRAP, type Tone } from './ui';

export const VERDICT_TONE: Record<Verdict, Tone> = { sealed: 'seal', sealed_with_warnings: 'ask', unsafe: 'block', pending: 'unknown' };
export const VERDICT_WORD: Record<Verdict, string> = { sealed: 'sealed', sealed_with_warnings: 'sealed with warnings', unsafe: 'unsafe', pending: 'pending' };
const SEV_TONE: Record<string, Tone> = { critical: 'block', high: 'block', medium: 'ask', low: 'unknown', info: 'unknown' };

// ---------- 01 Hero ----------

export function Hero() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('[data-hero-line]', { yPercent: 110, duration: 1.2, ease: 'expo.out', stagger: 0.09, delay: 0.15 });
        gsap.from('[data-hero-fade]', { y: 14, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, delay: 0.5 });
      });
      ScrollTrigger.create({ trigger: root.current, start: 'top top', end: 'bottom top', onUpdate: (s) => (scrollStore.gate = s.progress) });
    },
    { scope: root },
  );
  return (
    <section id="arrive" ref={root} className="relative -mt-[60px] flex min-h-[100svh] items-center overflow-hidden pt-[60px]">
      <div className="story-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className={cx(WRAP, 'relative grid items-center gap-8 py-16 lg:grid-cols-[1fr_1.05fr]')}>
        <div className="relative z-[2]">
          <p data-hero-fade className="mb-6 flex flex-wrap items-center gap-2">
            <Pill tone="unknown">unknown</Pill>
            <span className="text-(--text-3)">→</span>
            <Pill tone="scan">inspected</Pill>
            <span className="text-(--text-3)">→</span>
            <Pill tone="seal">sealed</Pill>
            <span className="text-(--text-3)">or</span>
            <Pill tone="block">blocked</Pill>
          </p>
          <h1 className="font-display text-[46px] font-medium leading-[1.02] tracking-[-0.03em] md:text-[76px]">
            <span className="block overflow-hidden pb-1">
              <span data-hero-line className="block">
                Seal every tool
              </span>
            </span>
            <span className="block overflow-hidden pb-1">
              <span data-hero-line className="block text-(--text-2)">
                your AI uses
              </span>
            </span>
          </h1>
          <p data-hero-fade className="mt-6 max-w-[520px] text-[18px] font-light leading-relaxed text-(--text-2)">
            Zoro checks every MCP tool at the moment your agent uses it, against a public, tamper-evident record of what that tool is supposed to be.
          </p>
          <div data-hero-fade className="mt-9 flex flex-wrap gap-3">
            <Btn href="/docs#quick-start">Get started</Btn>
            <Btn href="/lab" variant="ghost">
              Launch an attack
            </Btn>
          </div>
          <p data-hero-fade className="mt-6 text-[13px] text-(--text-3)">
            Free, local, and you never need a token to be protected.
          </p>
        </div>
        <Stage scene="gate" label="Tool calls stream through the Zoro gate: grey calls turn cyan while they are inspected, leave green when sealed, and blocked calls fall away in red." className="h-[340px] sm:h-[440px] lg:h-[560px]" />
      </div>
      <a href="#risk" className="absolute bottom-6 left-1/2 z-[2] -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.2em] text-(--text-3) hover:text-(--text)">
        Follow one tool call ↓
      </a>
    </section>
  );
}

// ---------- 02 The risk: a silent change ----------

export function Risk() {
  const audit = useMemo(auditForecast, []);
  const [v, setV] = useState<1 | 2>(1);
  const [scrub, setScrub] = useState(false);
  const wrap = useRef<HTMLElement>(null);
  const typed = useRef<HTMLSpanElement>(null);
  const fp = useRef<HTMLSpanElement>(null);

  const show = (version: 1 | 2) => {
    setV(version);
    if (typed.current) typed.current.textContent = version === 2 ? INSERTED : '';
  };

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
        setScrub(true);
        const st = ScrollTrigger.create({
          trigger: wrap.current,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (s) => {
            const t = gsap.utils.clamp(0, 1, (s.progress - 0.18) / 0.5);
            const n = Math.round(t * INSERTED.length);
            if (typed.current) typed.current.textContent = INSERTED.slice(0, n);
            setV(n === INSERTED.length ? 2 : 1);
          },
        });
        return () => {
          st.kill();
          setScrub(false);
        };
      });
    },
    { scope: wrap },
  );

  // The fingerprint "re-hashes" whenever the version flips.
  useGSAP(
    () => {
      if (!fp.current) return;
      const target = v === 1 ? audit.v1.fingerprint : audit.v2.fingerprint;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) fp.current.textContent = target;
      else gsap.to(fp.current, { duration: 0.7, scrambleText: { text: target, chars: '0123456789abcdef', speed: 0.6 } });
    },
    { dependencies: [v] },
  );

  const findings = audit.v2.deterministic;
  return (
    <section id="risk" ref={wrap} className={cx('relative', scrub && 'h-[230vh]')}>
      <div className={cx(scrub && 'sticky top-0 flex h-[100svh] items-center')}>
        <div className={cx(WRAP, 'grid gap-12 py-24 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-0')}>
          <div>
            <Eyebrow n="01" tone="block">
              The risk
            </Eyebrow>
            <Heading className="mt-5">The tool you approved is not the tool you are running.</Heading>
            <Depth
              className="mt-6 max-w-[520px] text-[17px] leading-relaxed text-(--text-2)"
              simple={
                <p>
                  You checked a weather app last week and it was fine. Today an update quietly added one sentence to its instructions. Your AI reads that sentence and obeys it. Nobody told you anything changed.
                </p>
              }
              engineer={
                <p>
                  MCP clients pass tool descriptions straight to the model. A server can change a definition after you approved it (a “rug pull”). Here, <code className="font-mono text-(--text)">lab-weather</code> 3.0.0 → 3.1.0 adds a cross-tool instruction targeting <code className="font-mono text-(--text)">send_email</code>. The name and schema are unchanged.
                </p>
              }
            />
            {!scrub && (
              <div className="mt-8 inline-flex rounded-full border border-(--line-strong) p-1 text-[13px]" role="radiogroup" aria-label="Server version">
                {([1, 2] as const).map((n) => (
                  <button key={n} role="radio" aria-checked={v === n} onClick={() => show(n)} className={cx('rounded-full px-4 py-1.5 font-mono', v === n ? 'bg-(--surface-2) text-(--text)' : 'text-(--text-2)')}>
                    {n === 1 ? 'v3.0.0' : 'v3.1.0'}
                  </button>
                ))}
              </div>
            )}
            {scrub && <p className="mt-8 font-mono text-[12px] text-(--text-3)">Keep scrolling: the update arrives as you scroll.</p>}
          </div>

          <div className="flex flex-col gap-4">
            <Panel title={`lab-weather · tools/list · v${v === 1 ? '3.0.0' : '3.1.0'}`} tone={v === 2 ? 'block' : undefined} right={<Pill tone={v === 1 ? 'seal' : 'block'}>{VERDICT_WORD[v === 1 ? audit.verdict1 : audit.verdict2]}</Pill>}>
              <div className="p-5 font-mono text-[13.5px] leading-relaxed">
                <p className="text-(--text-3)">name</p>
                <p className="text-(--text)">get_forecast</p>
                <p className="mt-3 text-(--text-3)">description</p>
                <p className="text-(--text)">
                  {String(FORECAST_V1.description)}
                  <span ref={typed} className="rounded-sm bg-(--block)/12 text-(--block) [box-decoration-break:clone]" />
                </p>
                <p className="mt-4 text-(--text-3)">fingerprint</p>
                <span ref={fp} className="break-all text-(--scan)">
                  {audit.v1.fingerprint}
                </span>
              </div>
            </Panel>
            <Panel title={`Sentinel deterministic layer · ${RULESET_VERSION}`} tone={v === 2 ? 'block' : 'seal'}>
              <ul className="divide-y divide-(--line)">
                {v === 1 ? (
                  <li className="px-5 py-3 text-[14px] text-(--text-2)">No findings. Verdict: sealed.</li>
                ) : (
                  findings.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[14px]">
                      <span className="text-(--text)">{f.title}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-[11px] text-(--text-3)">{f.ruleId}</span>
                        <Pill tone={SEV_TONE[f.severity]}>{f.severity}</Pill>
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </Panel>
            <p className="text-[12.5px] text-(--text-3)">Computed live in your browser with Zoro’s real engine (@zoro/core) on the Attack Lab fixture. Nothing here is a screenshot.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- 03 Fingerprint ----------

export function Fingerprint() {
  const root = useRef<HTMLElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const out = useRef<HTMLSpanElement>(null);
  const [sorted, setSorted] = useState(false);
  const keys = useMemo(() => Object.keys(FORECAST_V1), []);
  const order = sorted ? [...keys].sort() : keys;
  const fp = useMemo(() => auditForecast().v1.fingerprint, []);
  const manifest = useMemo(() => weatherManifest(FORECAST_V1), []);
  const flipState = useRef<ReturnType<typeof Flip.getState> | null>(null);

  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: list.current,
        start: 'top 70%',
        once: true,
        onEnter: () => {
          flipState.current = Flip.getState(list.current!.children);
          setSorted(true);
        },
      });
    },
    { scope: root },
  );
  useGSAP(
    () => {
      if (!sorted) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (flipState.current && !reduce) Flip.from(flipState.current, { duration: 0.9, ease: 'expo.inOut', stagger: 0.05 });
      if (out.current) {
        if (reduce) out.current.textContent = fp;
        else gsap.to(out.current, { duration: 1.4, delay: 0.6, scrambleText: { text: fp, chars: '0123456789abcdef', speed: 0.5 } });
      }
    },
    { dependencies: [sorted], scope: root },
  );

  return (
    <section id="fingerprint" ref={root} className={cx(WRAP, 'grid gap-12 py-28 lg:grid-cols-2 lg:items-center')}>
      <div>
        <Eyebrow n="02">Fingerprint</Eyebrow>
        <Heading className="mt-5">Every definition gets a fingerprint.</Heading>
        <Depth
          className="mt-6 max-w-[520px] space-y-4 text-[17px] leading-relaxed text-(--text-2)"
          simple={
            <>
              <p>Think of a passport photo. Zoro takes an exact “photo” of every tool: its name, its description, every setting. Change one letter, or hide an invisible character, and the photo no longer matches.</p>
              <p>First the fields are put in a fixed order, so the same tool always gives the same photo.</p>
            </>
          }
          engineer={
            <>
              <p>
                Canonicalisation <code className="font-mono text-(--text)">zoro-canon/1</code>: keys are sorted by UTF-16 code unit, arrays keep their order, and strings get JSON escaping only. Nothing is normalised or trimmed, so invisible, direction-override and homoglyph characters are part of the fingerprint.
              </p>
              <p>
                <code className="font-mono text-(--text)">fingerprint = sha256("zoro-canon/1\n" + kind + "\n" + canonicalJson(definition))</code>. A manifest root commits to every tool, prompt and resource template, so adding, removing or renaming entries changes it too.
              </p>
            </>
          }
        />
      </div>
      <div className="flex flex-col gap-4">
        <Panel title={sorted ? 'canonical order (keys sorted)' : 'as the server sent it'}>
          <ol ref={list} className="grid gap-2 p-5 font-mono text-[13.5px]">
            {order.map((k, i) => (
              <li key={k} data-flip-id={k} className="flex items-center gap-3 rounded-[8px] border border-(--line) bg-(--night-2) px-3 py-2">
                <span className="w-4 text-(--text-3)">{i + 1}</span>
                <span className="text-(--text)">{k}</span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="canonicalJson(get_forecast)">
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all p-5 font-mono text-[12px] leading-relaxed text-(--text-2)">{canonical(FORECAST_V1)}</pre>
        </Panel>
        <Panel title="sha-256 → fingerprint" tone="scan">
          <div className="space-y-3 p-5 font-mono text-[13px]">
            <span ref={out} className="block break-all text-(--scan)">
              {sorted ? fp : '0x'}
            </span>
            <p className="text-(--text-3)">
              manifest root (lab-weather 3.0.0): <span className="text-(--text-2)">{short(manifest, 12, 8)}</span>
            </p>
          </div>
        </Panel>
      </div>
    </section>
  );
}

// ---------- 04 Sentinel ----------

export function Sentinel() {
  const audit = useMemo(auditForecast, []);
  const root = useRef<HTMLElement>(null);
  const layers = [
    {
      id: 'deterministic',
      title: 'Deterministic',
      tone: 'block' as Tone,
      result: `${audit.v2.deterministic.length} findings`,
      simple: 'A checklist of known tricks: hidden instructions, invisible characters, extra recipients, references to other tools.',
      engineer: `Rules ${RULESET_VERSION}. Pure and reproducible by anyone. A critical finding here makes the verdict unsafe, and no other layer can override it.`,
    },
    {
      id: 'differential',
      title: 'Differential',
      tone: 'block' as Tone,
      result: `change: ${audit.v2.differential.changeClass}`,
      simple: 'Compares the new version with the old one, word by word. What exactly changed, and is that change harmless?',
      engineer: 'Field-level diff against the previous sealed version, classified as new, cosmetic, documentation, functional, capability expansion or suspicious.',
    },
    {
      id: 'ai',
      title: 'AI review',
      tone: 'unknown' as Tone,
      result: 'optional',
      simple: 'An AI reviewer reads the tool like a person would and looks for tricks the checklist cannot name.',
      engineer: 'Runs when an AI provider is configured. It can only make a verdict stricter. Uncertain, malformed or missing output means pending, never sealed.',
    },
    {
      id: 'detonation',
      title: 'Detonation',
      tone: 'unknown' as Tone,
      result: 'Lab servers',
      simple: 'For test servers, Zoro actually runs the tool in a sealed room and watches what it tries to do.',
      engineer: 'Exercises the tool in an isolated in-process sandbox with an instrumented network. Available for Attack Lab servers only.',
    },
  ];

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: '[data-layers]', start: 'top 75%', end: 'bottom 45%', scrub: 0.6 } });
        tl.fromTo('[data-beam]', { left: '0%' }, { left: '100%', ease: 'none', duration: 1 }, 0);
        gsap.utils.toArray<HTMLElement>('[data-layer]').forEach((el, i) => {
          tl.fromTo(el, { borderColor: 'var(--line)', opacity: 0.45 }, { borderColor: 'var(--scan)', opacity: 1, duration: 0.15 }, i * 0.24);
        });
        tl.from('[data-verdict]', { opacity: 0, scale: 0.9, duration: 0.12 }, 0.95);
      });
    },
    { scope: root },
  );

  return (
    <section id="sentinel" ref={root} className={cx(WRAP, 'py-28')}>
      <div className="max-w-[760px]">
        <Eyebrow n="03">Sentinel</Eyebrow>
        <Heading className="mt-5">Four layers look before anything is sealed.</Heading>
        <Depth
          className="mt-6 text-[17px] leading-relaxed text-(--text-2)"
          simple={<p>Like airport security: a scanner, a comparison with your last trip, an officer who looks closely, and, for test bags, opening them in a safe room.</p>}
          engineer={<p>Layers 1 and 2 are pure functions in @zoro/core. Each layer can only make the verdict stricter. The verdict package is then signed by the Auditor key.</p>}
        />
      </div>
      <div data-layers className="relative mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <span data-beam className="pointer-events-none absolute -bottom-3 -top-3 z-10 hidden w-px bg-(--scan) shadow-[0_0_24px_4px_rgba(34,211,238,0.45)] lg:block" style={{ left: '0%' }} aria-hidden />
        {layers.map((l, i) => (
          <div key={l.id} data-layer className="flex flex-col rounded-[14px] border border-(--line) bg-(--surface) p-5">
            <p className="font-mono text-[11px] text-(--text-3)">Layer {i + 1}</p>
            <h3 className="mt-1 text-[19px] font-medium">{l.title}</h3>
            <Depth className="mt-3 flex-1 text-[14px] leading-relaxed text-(--text-2)" simple={<p>{l.simple}</p>} engineer={<p>{l.engineer}</p>} />
            <div className="mt-5">
              <Pill tone={l.tone}>{l.result}</Pill>
            </div>
          </div>
        ))}
      </div>
      <Rise className="mt-8 flex flex-wrap items-center gap-3">
        <span className="text-[15px] text-(--text-2)">get_forecast 3.1.0 →</span>
        <span data-verdict>
          <Pill tone={VERDICT_TONE[audit.verdict2]} className="text-[13px]">
            verdict: {VERDICT_WORD[audit.verdict2]}
          </Pill>
        </span>
        <span className="text-[13px] text-(--text-3)">Possible verdicts:</span>
        {(['sealed', 'sealed_with_warnings', 'unsafe', 'pending'] as Verdict[]).map((x) => (
          <Pill key={x} tone={VERDICT_TONE[x]}>
            {VERDICT_WORD[x]}
          </Pill>
        ))}
      </Rise>
    </section>
  );
}
