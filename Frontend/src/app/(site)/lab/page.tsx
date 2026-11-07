'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, FlaskConical, Play, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button, ErrorState, LoadingBlock, Notice, StatusPill, cx } from '@/components/ui';
import type { LayerState } from '@/components/security';
import { HumanSealModal, type SealableApproval } from '@/components/human-seal';
import { EASE_EXPO } from '@/components/motion';
import { PageIntro } from '@/components/site';
import { SCENARIO_ART } from '@/components/illustrations';
import { SentinelBuddy, type Mood } from '@/components/lab/sentinel-buddy';
import { ReplayLanes } from '@/components/lab/replay-lanes';
import { AlertTickets, AttackerView, Checkpoints, NetworkMap, Receipts } from '@/components/lab/bento';
import { InfoTip, Tip } from '@/components/tip';
import { BASICS, FLOW, PANEL_HELP, RESET_HELP, SCENARIO_HELP } from '@/components/lab/explain';
import { api, useApi } from '@/lib/api';
import { timeAgo } from '@/lib/format';

interface LabEvent {
  id: string;
  ts: number;
  actor: 'step' | 'agent' | 'attacker' | 'zoro' | 'note' | 'result' | 'error';
  title: string;
  detail?: string;
}

interface LabStatus {
  run: { id: string; scenario: string; status: 'running' | 'done' | 'failed'; events: LabEvent[]; startedAt: number; finishedAt: number | null } | null;
  scenarios: { id: string; title: string; attack: string; shows: string; servers: string[] }[];
  servers: { label: string; name: string; purpose: string; version: string; connected: boolean; state: string; serverId: string | null }[];
  world: { outbox: { id: string; to: string; bcc: string[]; subject: string; at: number }[]; transactions: { id: string; to: string; amount: number; token: string; at: number }[]; network: { to: string; bytes: number; at: number; via: string }[] };
  incidents: { id: string; seq: number; created_at: number; severity: string; status: string; title: string; summary: string; count: number }[];
  approvals: (SealableApproval & { status: string; kind: string })[];
  seals: { fingerprint: string; name: string; server_label: string; verdict: string; status: string; ens_status: string | null; ledger_status: string | null; badge_status: string | null; links: { ens: string | null; ledger: string | null; badge: string | null } }[];
  audits: { id: string; name: string; status: string; verdict: string | null; layers: LayerState[]; created_at: number; server_label: string; source: string }[];
  aiConfigured: boolean;
  requireAi: boolean;
}

/** What leaked to the simulated outside world: hidden BCCs and requests to the attacker's collector. */
function leakSummary(w: LabStatus['world'] | undefined) {
  const bcc = (w?.outbox ?? []).filter((m) => m.bcc.length).length;
  const net = (w?.network ?? []).length;
  return { bcc, net, leaked: bcc + net > 0 };
}

/** Sentinel's mood and line, from the latest real event. */
function narrate(d: LabStatus | null | undefined): { mood: Mood; say: string } {
  const run = d?.run;
  if (!run) return { mood: 'asleep', say: 'Nothing is running. Pick an attack above and I’ll talk you through every step as it happens.' };
  const last = run.events[run.events.length - 1];
  const { leaked } = leakSummary(d?.world);
  if (run.status !== 'running') {
    if (run.status === 'failed') return { mood: 'alarmed', say: 'The run stopped with an error. Reset the Lab and try again.' };
    return leaked ? { mood: 'alarmed', say: 'Something reached the attacker this time. Look at “What actually happened” for exactly what got out.' } : { mood: 'happy', say: 'Done. The attack ran for real and the attacker got nothing. Scroll the timeline to see where I stopped it.' };
  }
  if (!last) return { mood: 'watching', say: 'Starting the scenario. Watching every call…' };
  switch (last.actor) {
    case 'attacker':
      return { mood: 'alarmed', say: `Heads up: ${last.title}. I’m checking it now.` };
    case 'zoro':
      return { mood: 'relieved', say: `${last.title}. That one doesn’t get through.` };
    case 'agent':
      return { mood: 'watching', say: `The agent is acting: ${last.title}. Every call passes me first.` };
    case 'result':
      return { mood: leaked ? 'alarmed' : 'happy', say: last.title };
    case 'error':
      return { mood: 'alarmed', say: `Something went wrong: ${last.title}` };
    default:
      return { mood: 'watching', say: last.title };
  }
}


/** Which of the five Lab steps is happening now, from the live run. */
function currentStep(d: LabStatus | null | undefined): number {
  const run = d?.run;
  if (!run) return 0;
  if (run.status !== 'running') return 4;
  const ev = run.events;
  if (ev.some((e) => e.actor === 'agent')) return 3;
  if (ev.some((e) => e.actor === 'zoro')) return 2;
  return 1;
}

/** The Lab in five ordered steps; the live one is highlighted. Every step explains itself on hover. */
function FlowStrip({ step }: { step: number }) {
  return (
    <ol className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-5" aria-label="How the Attack Lab works">
      {FLOW.map((f, i) => {
        const done = i < step;
        const now = i === step;
        return (
          <li key={f.title} className="relative">
            <Tip content={f.tip} block className="h-full">
              <div tabIndex={0} className={cx('flex h-full cursor-help items-center gap-3 rounded-[12px] border px-3.5 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent sm:flex-col sm:items-start sm:gap-2', now ? 'border-sapphire bg-lavender text-on-pastel shadow-[3px_3px_0_var(--border-strong)]' : done ? 'border-sapphire bg-mint-soft text-on-pastel' : 'border-obsidian bg-panel')}>
                <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-full border text-[13px] font-bold', now || done ? 'border-sapphire bg-panel text-quartz' : 'border-obsidian text-slate')}>{done ? <Check className="size-3.5" aria-hidden /> : i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold leading-tight">{f.title}</span>
                  <span className={cx('mt-0.5 block text-[12.5px]', now || done ? 'opacity-80' : 'text-ash')}>{f.short}</span>
                </span>
              </div>
            </Tip>
          </li>
        );
      })}
    </ol>
  );
}

export default function LabPage() {
  const s = useApi<LabStatus>('/api/public/lab', { on: ['lab', 'lab_event', 'audit', 'incident', 'approval', 'seal', 'ledger', 'outbox', 'human_seal'], scope: 'lab' });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sealFor, setSealFor] = useState<SealableApproval | null>(null);
  const d = s.data;
  const running = d?.run?.status === 'running';
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      await s.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const active = d?.scenarios.find((x) => x.id === d.run?.scenario);
  const buddy = narrate(d);
  const pending = (d?.approvals ?? []).filter((a) => a.status === 'pending');

  return (
    <div className="relative">
      <div className="relative mx-auto max-w-[1240px] px-4 py-14 sm:px-6">
        <PageIntro eyebrow="Attack Lab" a="Launch a real attack." b="Watch Zoro stop it." />
        <p className="mt-5 max-w-[680px] text-[18px] leading-[1.6] text-ash">Deliberately vulnerable demo servers and a scripted agent, running through the same Zoro you would install. Nothing here is pre-recorded, and the Lab never touches your real servers or policy.</p>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-[13.5px]">
          <span className="font-semibold text-quartz">New here? Hover a word:</span>
          {BASICS.map((b) => (
            <Tip key={b.term} content={b.tip}>
              <button type="button" className="cursor-help rounded-full border border-dashed border-sapphire bg-panel px-3 py-1 font-medium text-quartz hover:bg-lavender-soft">
                {b.term}
              </button>
            </Tip>
          ))}
        </div>
        <FlowStrip step={currentStep(d)} />
        {d && !d.aiConfigured && (
          <Notice tone="warn" title={d.requireAi ? 'AI review is off on this instance' : 'Development mode: AI review is off'} className="mt-6 max-w-[860px]">
            {d.requireAi ? 'Clean versions stay pending, because Sentinel never guesses “sealed”, so a few scenarios can’t show an allowed baseline. Attacks are still caught by the rule-based layer. Add GROQ_API_KEY (free at console.groq.com) for the full demo.' : 'Seals come from the rule-based and diff layers only, and every verdict records that the AI layer did not run.'}
          </Notice>
        )}
        {err && (
          <Notice tone="danger" className="mt-4">
            {err}
          </Notice>
        )}
        {s.error && <ErrorState error={s.error} retry={s.reload} />}

        {/* ---------- scenario picker ---------- */}
        <div className="mt-12 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-slate">Step 1</p>
            <h2 className="font-display mt-1 text-[28px] md:text-[34px]">Choose an attack</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tip content={RESET_HELP.soft}><Button variant="secondary" size="sm" icon={<RotateCcw className="size-3.5" />} disabled={running} loading={busy === 'reset'} onClick={() => act('reset', () => api('/api/public/lab/reset', { json: { mode: 'soft' } }))}>
              Reset
            </Button></Tip>
            <Tip content={RESET_HELP.full}><Button variant="subtle" size="sm" disabled={running} loading={busy === 'full'} onClick={() => act('full', () => api('/api/public/lab/reset', { json: { mode: 'full' } }))}>
              Full reset
            </Button></Tip>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {(d?.scenarios ?? []).map((sc, i) => {
            const on = d?.run?.scenario === sc.id;
            return (
              <motion.div key={sc.id} className="h-full" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_EXPO, delay: 0.04 * i }}>
                <div className={cx('tabcard flex h-full flex-col overflow-hidden rounded-[12px] border bg-panel', on ? 'border-accent ring-2 ring-[color:var(--lavender)]' : 'border-sapphire')}>
                  <div className={cx('border-b border-sapphire px-3 pt-2', on ? 'bg-lavender-soft' : 'bg-peach-soft')}>{SCENARIO_ART[sc.id]}</div>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[16.5px] font-semibold leading-snug">{sc.title}</p>
                      <InfoTip content={SCENARIO_HELP[sc.id] ?? { title: sc.title, body: sc.attack }} label={`What is ${sc.title}?`} className="mt-0.5 shrink-0" />
                    </div>
                    <p className="mt-1.5 line-clamp-3 flex-1 text-[13.5px] leading-[1.5] text-ash">{sc.attack}</p>
                    <Button size="sm" variant={on ? 'primary' : 'secondary'} className="mt-4 w-full" icon={on && running ? undefined : <Play className="size-3.5" />} disabled={running} loading={busy === sc.id} onClick={() => act(sc.id, () => api('/api/public/lab/start', { json: { scenario: sc.id } }))}>
                      {on && running ? 'Running…' : on ? 'Run again' : 'Launch'}
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ---------- dashboard ---------- */}
        <div className="mt-14">
          <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-slate">Step 2</p>
          <h2 className="font-display mt-1 text-[28px] md:text-[34px]">Watch it happen</h2>
          <p className="mt-1 max-w-[640px] text-[15px] text-ash">Sentinel, Zoro’s inspector, narrates every step. Hover any “?” to learn what you are looking at.</p>
        </div>
        {!d && s.loading ? (
          <LoadingBlock rows={6} />
        ) : (
          <div className="mt-6 space-y-5">
            {/* mission control: Sentinel narrates above the replay lanes */}
            <section className="overflow-hidden rounded-[16px] border border-sapphire bg-panel">
              <div className="grid grid-cols-1 items-center gap-4 border-b border-sapphire bg-lavender-soft px-5 py-5 md:grid-cols-[1fr_auto] md:px-6">
                <SentinelBuddy mood={buddy.mood} say={buddy.say} />
                <div className="flex items-center gap-3 md:flex-col md:items-end">
                  <p className="flex items-center gap-1.5 text-[18px] font-semibold">
                    {active ? active.title : 'Attack replay'} <InfoTip content={PANEL_HELP.replay} label="What is the attack replay?" />
                  </p>
                  <p className="text-[13px] text-ash">{d?.run ? `${d.run.status === 'running' ? 'Running' : d.run.status === 'done' ? 'Finished' : 'Stopped'} · started ${timeAgo(d.run.startedAt)}` : 'Idle'}</p>
                  {running && <StatusPill state="pending">Live</StatusPill>}
                </div>
              </div>
              {!d?.run ? (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <FlaskConical className="size-8 text-slate" strokeWidth={1.5} aria-hidden />
                  <p className="mt-4 text-[17px] font-semibold">No attack running</p>
                  <p className="mt-1 max-w-[380px] text-[14.5px] text-ash">Launch one above. The attacker, the agent and Zoro each get a lane, so you can see who did what to whom.</p>
                </div>
              ) : (
                <div className="max-h-[620px] overflow-y-auto">
                  <ReplayLanes events={d.run.events} running={running} />
                  {active && d.run.status !== 'running' && (
                    <p className="mx-4 mb-4 rounded-[12px] border border-sapphire bg-mint-soft px-4 py-3.5 text-[14.5px] leading-[1.55] text-on-pastel">
                      <span className="font-semibold">What this proves: </span>
                      {active.shows}
                    </p>
                  )}
                </div>
              )}
            </section>

            {pending.length > 0 && (
              <section className="overflow-hidden rounded-[16px] border-2 border-sapphire bg-lavender-soft">
                <header className="flex flex-wrap items-center gap-3 px-5 pt-4">
                  <ShieldCheck className="size-5" aria-hidden />
                  <h3 className="font-display text-[22px]">Waiting for you</h3>
                  <span className="text-[13px] text-ash">The agent is paused until a person decides.</span>
                  <InfoTip content={PANEL_HELP.approvals} label="Why is Zoro waiting for me?" />
                </header>
                <ul className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
                  {pending.map((a) => (
                    <li key={a.id} className="rounded-[12px] border border-sapphire bg-panel p-4">
                      <p className="text-[15px] font-semibold">{a.summary}</p>
                      <p className="mt-1 text-[13.5px] text-ash">
                        <span className="font-mono text-[12px] text-slate">{a.ref}</span> · {a.reason}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {a.human_seal ? (
                          <Button size="sm" onClick={() => setSealFor(a)}>
                            Approve with World ID
                          </Button>
                        ) : null}
                        <Button size="sm" variant="danger" onClick={() => act(`deny-${a.id}`, () => api(`/api/public/lab/approvals/${a.id}/deny`, { json: {} }))} loading={busy === `deny-${a.id}`}>
                          Deny
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* bento */}
            <div className="pt-8">
              <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-slate">Step 3</p>
              <h2 className="font-display mt-1 text-[28px] md:text-[34px]">Check the evidence</h2>
              <p className="mt-1 max-w-[640px] text-[15px] text-ash">Did anything reach the attacker? What did Zoro check, and what did it publish? Read the numbered panels in order.</p>
            </div>
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_1.25fr]">
              <AttackerView world={d?.world} hasRun={Boolean(d?.run)} />
              <Checkpoints audits={d?.audits ?? []} />
            </div>
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
              <NetworkMap servers={d?.servers ?? []} leaked={leakSummary(d?.world).leaked} />
              <AlertTickets incidents={d?.incidents ?? []} />
              <Receipts seals={d?.seals ?? []} />
            </div>
          </div>
        )}
      </div>
      <HumanSealModal approval={sealFor} open={Boolean(sealFor)} onClose={() => setSealFor(null)} mode="lab" onDone={() => void s.reload()} />
    </div>
  );
}
