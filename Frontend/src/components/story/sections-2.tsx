'use client';

import { useMemo, useRef, useState } from 'react';
import type { ShieldAction } from '@zoro/core';
import { Depth, gsap, useGSAP } from './runtime';
import { INBOX_RESULT, PROFILES, auditForecast, shieldApply, shieldFindings } from './demo';
import { cx, Eyebrow, Heading, Panel, Pill, Rise, short, WRAP, type Tone } from './ui';

// ---------- 05 Quarantine ----------

export function Quarantine() {
  const audit = useMemo(auditForecast, []);
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 60%', once: true } });
        tl.from('[data-held]', { x: -140, opacity: 0, duration: 0.9, ease: 'power3.out' }).from('[data-lid]', { scaleX: 0, transformOrigin: 'left', duration: 0.5, ease: 'power2.out' }, '-=0.2').from('[data-lock]', { opacity: 0, y: -8, duration: 0.3 });
      });
    },
    { scope: root },
  );
  return (
    <section id="quarantine" ref={root} className={cx(WRAP, 'grid gap-12 py-28 lg:grid-cols-2 lg:items-center')}>
      <div>
        <Eyebrow n="04" tone="ask">
          Quarantine
        </Eyebrow>
        <Heading className="mt-5">Unsealed changes never reach your AI.</Heading>
        <Depth
          className="mt-6 max-w-[520px] text-[17px] leading-relaxed text-(--text-2)"
          simple={<p>A bag that fails the scanner goes to a separate room. It does not get on the plane while someone looks at it. Your AI keeps using the version that was already checked.</p>}
          engineer={<p>The gateway answers tools/list with sealed, released definitions only. New and changed definitions are held back, invisible to the model, until they have a verdict and are released.</p>}
        />
      </div>
      <div className="grid gap-4">
        <Panel title="What your agent sees" tone="seal">
          <div className="flex items-center justify-between gap-3 p-5">
            <div>
              <p className="font-mono text-[14px] text-(--text)">get_forecast</p>
              <p className="mt-1 font-mono text-[12px] text-(--text-3)">v3.0.0 · {short(audit.v1.fingerprint)}</p>
            </div>
            <Pill tone="seal">sealed · released</Pill>
          </div>
        </Panel>
        <div className="relative rounded-[16px] border border-dashed border-(--ask)/50 bg-(--ask)/[0.04] p-4">
          <div data-lid className="absolute inset-x-0 top-0 h-[3px] rounded-t-[16px] bg-(--ask)" aria-hidden />
          <p data-lock className="mb-3 font-mono text-[12px] text-(--ask)">
            held back · not in tools/list
          </p>
          <div data-held className="rounded-[12px] border border-(--line) bg-(--surface) p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[14px] text-(--text)">get_forecast</p>
                <p className="mt-1 font-mono text-[12px] text-(--text-3)">v3.1.0 · {short(audit.v2.fingerprint)}</p>
              </div>
              <Pill tone="block">unsafe</Pill>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- 06 Policy ----------

const LANES: { id: 'allow' | 'ask' | 'block'; tone: Tone; y: number; simple: string; engineer: string }[] = [
  { id: 'allow', tone: 'seal', y: 40, simple: 'Runs straight away.', engineer: 'The call is forwarded to the upstream server.' },
  { id: 'ask', tone: 'ask', y: 100, simple: 'Waits until a person says yes.', engineer: 'An approval is created, bound to the action digest, single-use and expiring.' },
  { id: 'block', tone: 'block', y: 160, simple: 'Never happens.', engineer: 'The call never reaches the server; the agent gets a refusal.' },
];

export function Policy() {
  const [profile, setProfile] = useState<keyof typeof PROFILES>('standard');
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const dots = gsap.utils.toArray<SVGCircleElement>('[data-dot]');
        const tweens = dots.map((d, i) => {
          const blocked = d.dataset.lane === 'block';
          return gsap.fromTo(d, { attr: { cx: 0 } }, { attr: { cx: blocked ? 300 : 560 }, duration: 2.4, ease: 'none', repeat: -1, delay: (i % 4) * 0.6, opacity: blocked ? 0 : 1 });
        });
        // Only animate while the section is on screen.
        const st = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top bottom', end: 'bottom top', onToggle: (s) => tweens.forEach((t) => (s.isActive ? t.resume() : t.pause())) } });
        return () => st.kill();
      });
    },
    { scope: root },
  );
  return (
    <section id="policy" ref={root} className={cx(WRAP, 'py-28')}>
      <div className="max-w-[760px]">
        <Eyebrow n="05">Policy</Eyebrow>
        <Heading className="mt-5">Every call gets one of three answers.</Heading>
        <Depth
          className="mt-6 text-[17px] leading-relaxed text-(--text-2)"
          simple={<p>The gate has rules: some things go through, some need a supervisor, some never pass. You choose how strict the rules are.</p>}
          engineer={<p>Profiles strict, standard and lab. Twelve rule types with preview, replay simulation against past calls, and loosening detection, which flags any change that weakens protection.</p>}
        />
      </div>
      <div className="mt-12 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="decision lanes">
          <svg viewBox="0 0 560 200" className="w-full" role="img" aria-label="Calls split into three lanes: allow continues, ask waits for a person, block stops at the gate.">
            {LANES.map((l) => (
              <g key={l.id}>
                <line x1="0" x2="560" y1={l.y} y2={l.y} stroke="var(--line-strong)" strokeDasharray={l.id === 'block' ? '0' : '4 6'} />
                {l.id === 'block' && <line x1="300" x2="300" y1={l.y - 14} y2={l.y + 14} stroke="var(--block)" strokeWidth="3" />}
                {l.id === 'ask' && <rect x="372" y={l.y - 12} width="40" height="24" rx="6" fill="none" stroke="var(--ask)" />}
                {[0, 1, 2, 3].map((k) => (
                  <circle key={k} data-dot data-lane={l.id} cx={-20} cy={l.y} r="5" fill={`var(--${l.tone})`} />
                ))}
                <text x="8" y={l.y - 12} fill={`var(--${l.tone})`} fontSize="12" fontFamily="var(--font-mono)">
                  {l.id}
                </text>
              </g>
            ))}
          </svg>
          <ul className="grid gap-px border-t border-(--line) bg-(--line) sm:grid-cols-3">
            {LANES.map((l) => (
              <li key={l.id} className="bg-(--surface) p-4">
                <Pill tone={l.tone}>{l.id}</Pill>
                <Depth className="mt-2 text-[13.5px] text-(--text-2)" simple={<p>{l.simple}</p>} engineer={<p>{l.engineer}</p>} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="profile">
          <div className="p-5">
            <div role="tablist" aria-label="Policy profile" className="inline-flex rounded-full border border-(--line-strong) p-1 text-[13px]">
              {(Object.keys(PROFILES) as (keyof typeof PROFILES)[]).map((p) => (
                <button key={p} role="tab" aria-selected={profile === p} onClick={() => setProfile(p)} className={cx('rounded-full px-3.5 py-1 font-mono', profile === p ? 'bg-(--trust-fill) text-white' : 'text-(--text-2) hover:text-(--text)')}>
                  {p}
                </button>
              ))}
            </div>
            <p role="tabpanel" className="mt-5 text-[15px] leading-relaxed text-(--text)">
              {PROFILES[profile]}
            </p>
          </div>
        </Panel>
      </div>
    </section>
  );
}

// ---------- 07 Output Shield ----------

const ACTIONS: { id: ShieldAction; simple: string }[] = [
  { id: 'pass', simple: 'Let it through, but log it' },
  { id: 'annotate', simple: 'Warn the AI it is untrusted' },
  { id: 'redact', simple: 'Cut out the dangerous part' },
  { id: 'block', simple: 'Withhold the whole result' },
];

export function Shield() {
  const findings = useMemo(shieldFindings, []);
  const [action, setAction] = useState<ShieldAction>('redact');
  const result = useMemo(() => shieldApply(action), [action]);

  // Highlight exactly the spans the scanner matched.
  const marked = useMemo(() => {
    const parts: { text: string; hit: boolean }[] = [];
    let at = 0;
    for (const f of findings.filter((x) => x.end > x.start)) {
      if (f.start < at) continue;
      parts.push({ text: INBOX_RESULT.slice(at, f.start), hit: false }, { text: INBOX_RESULT.slice(f.start, f.end), hit: true });
      at = f.end;
    }
    parts.push({ text: INBOX_RESULT.slice(at), hit: false });
    return parts;
  }, [findings]);

  return (
    <section id="shield" className={cx(WRAP, 'py-28')}>
      <div className="max-w-[760px]">
        <Eyebrow n="06">Output Shield</Eyebrow>
        <Heading className="mt-5">What comes back is checked too.</Heading>
        <Depth
          className="mt-6 text-[17px] leading-relaxed text-(--text-2)"
          simple={<p>A perfectly honest tool can still carry a bad message, like an email written by an attacker. Zoro reads every result before your AI does and catches text that tries to give it orders.</p>}
          engineer={<p>scanOutput() runs on every tool result before it reaches the model: instruction patterns, text addressed to the agent, hidden tag characters, encoded payloads and references to other tools. The data-flow guard also labels sources and stops tainted content from reaching risky sinks.</p>}
        />
      </div>
      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <Panel title="lab-inbox · read_inbox result" tone="block" right={<Pill tone="block">{findings.length} findings</Pill>}>
          <pre className="whitespace-pre-wrap p-5 font-mono text-[12.5px] leading-relaxed text-(--text-2)">
            {marked.map((p, i) =>
              p.hit ? (
                <mark key={i} className="rounded-sm bg-(--block)/15 text-(--block) underline decoration-(--block)/60 underline-offset-4">
                  {p.text}
                </mark>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </pre>
          <ul className="space-y-1.5 border-t border-(--line) px-5 py-4 text-[13px]">
            {findings.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <Pill tone={f.severity === 'critical' || f.severity === 'high' ? 'block' : 'ask'}>{f.severity}</Pill>
                <span className="text-(--text)">{f.label}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="shield action">
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
              {ACTIONS.map((a) => (
                <button key={a.id} aria-pressed={action === a.id} onClick={() => setAction(a.id)} className={cx('rounded-[10px] border px-3 py-2.5 text-left transition-colors', action === a.id ? 'border-(--scan) bg-(--scan)/10' : 'border-(--line) hover:border-(--line-strong)')}>
                  <span className="block font-mono text-[13px] text-(--text)">{a.id}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-(--text-3)">{a.simple}</span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="what the model receives" tone={result.text === null ? 'block' : 'scan'} right={result.note ? <span className="text-(--text-3)">{result.note}</span> : null}>
            <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap p-5 font-mono text-[12.5px] leading-relaxed text-(--text-2)">{result.text ?? '(nothing: the result was withheld)'}</pre>
          </Panel>
          <Rise>
            <Panel title="data-flow guard">
              <div className="flex flex-wrap items-center gap-2 p-5 text-[13px]">
                <Pill tone="block">untrusted_external</Pill>
                <span className="font-mono text-(--text-3)">read_inbox →</span>
                <span className="font-mono text-(--block)">✕</span>
                <span className="font-mono text-(--text-3)">→ send_email</span>
                <Pill tone="ask">external_communication</Pill>
              </div>
            </Panel>
          </Rise>
        </div>
      </div>
    </section>
  );
}

// ---------- 08 Human Seal ----------

const KINDS = ['tool call', 'override', 'policy change', 'release', 'namespace claim', 'dispute', 'danger zone', 'mode change', 'artifact release'];

export function Human() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap
          .timeline({ scrollTrigger: { trigger: '[data-stamp-card]', start: 'top 65%', once: true } })
          .from('[data-stamp]', { y: -120, scale: 1.6, rotate: -18, opacity: 0, duration: 0.55, ease: 'power4.in' })
          .to('[data-stamp-card]', { x: 4, duration: 0.05, yoyo: true, repeat: 3 })
          .from('[data-stamp-ring]', { scale: 0.6, opacity: 0.9, duration: 0.6, ease: 'expo.out' }, '<');
      });
    },
    { scope: root },
  );
  const steps = [
    ['Bound to one exact action', 'The approval carries the digest of this call. Change any argument and it no longer applies.'],
    ['Single-use', 'It runs once. Replaying it does nothing.'],
    ['Expires', 'If nobody answers in time, the answer is no.'],
    ['Human Seal (World ID)', 'For the riskiest actions, the approver also proves they are a unique human, with a proof bound to the same digest.'],
  ];
  return (
    <section id="human" ref={root} className={cx(WRAP, 'grid gap-12 py-28 lg:grid-cols-2 lg:items-center')}>
      <div>
        <Eyebrow n="07" tone="human">
          Human Seal
        </Eyebrow>
        <Heading className="mt-5">Some decisions need a person.</Heading>
        <Depth
          className="mt-6 max-w-[520px] text-[17px] leading-relaxed text-(--text-2)"
          simple={<p>When a call is risky, like moving money or signing something, Zoro stops and asks a real person. Their “yes” only works for that one exact action, one time.</p>}
          engineer={<p>Approvals are bound to an action digest, single-use and expiring. With a Human Seal, each approval must carry a verified World ID proof for that exact digest. Kinds: {KINDS.join(', ')}.</p>}
        />
        <ol className="mt-8 space-y-4">
          {steps.map(([t, d], i) => (
            <Rise key={t} delay={i * 0.06}>
              <li className="flex gap-4">
                <span className="mt-0.5 font-mono text-[12px] text-(--human)">0{i + 1}</span>
                <div>
                  <p className="text-[15px] font-medium text-(--text)">{t}</p>
                  <p className="mt-0.5 text-[14px] text-(--text-2)">{d}</p>
                </div>
              </li>
            </Rise>
          ))}
        </ol>
      </div>
      <div className="relative">
        <div data-stamp-card className="relative rounded-[16px] border border-(--line) bg-(--surface) p-6">
          <p className="font-mono text-[12px] text-(--text-3)">approval · tool_call</p>
          <p className="mt-3 text-[17px] text-(--text)">
            send_email to <span className="font-mono">reports@weather-now.example</span>
          </p>
          <p className="mt-2 font-mono text-[12px] text-(--text-3)">bound to the digest of this exact action · single use · expires</p>
          <div className="mt-6 flex gap-2">
            <Pill tone="ask">waiting for a person</Pill>
          </div>
          <div data-stamp className="pointer-events-none absolute -right-3 -top-6 flex size-32 rotate-[-8deg] items-center justify-center rounded-full border-[3px] border-(--human) bg-(--night)/80 text-center font-mono text-[11px] uppercase leading-tight tracking-[0.12em] text-(--human) backdrop-blur" aria-hidden>
            <span data-stamp-ring className="absolute inset-2 rounded-full border border-(--human)/50" />
            human
            <br />
            seal
          </div>
        </div>
        <p className="mt-4 text-[12.5px] text-(--text-3)">Human Seal runs with World ID staging test identities, and is not configured on the hosted demo yet.</p>
      </div>
    </section>
  );
}
