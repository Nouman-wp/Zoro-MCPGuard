'use client';

import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'motion/react';
import { Bot, FlaskConical, RotateCcw, ShieldCheck, Skull, StickyNote, Trophy, TriangleAlert } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, Notice, SeverityBadge, VerdictBadge, cx } from '@/components/ui';
import { LayerProgress, PublicationBadges, type LayerState } from '@/components/security';
import { HumanSealModal, type SealableApproval } from '@/components/human-seal';
import { EASE_EXPO, Spotlight } from '@/components/motion';
import { PageIntro } from '@/components/site';
import { api, useApi } from '@/lib/api';
import { fmtDate, timeAgo } from '@/lib/format';

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

const ACTOR: Record<LabEvent['actor'], { icon: typeof Bot; label: string; cls: string }> = {
  step: { icon: FlaskConical, label: 'Lab', cls: 'text-ash' },
  agent: { icon: Bot, label: 'Agent', cls: 'text-frosted' },
  attacker: { icon: Skull, label: 'Attacker', cls: 'text-plasma' },
  zoro: { icon: ShieldCheck, label: 'Zoro', cls: 'text-quartz' },
  note: { icon: StickyNote, label: 'Note', cls: 'text-warn' },
  result: { icon: Trophy, label: 'Result', cls: 'text-ok' },
  error: { icon: TriangleAlert, label: 'Error', cls: 'text-danger' },
};

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

  return (
    <div className="relative">
      <div className="relative mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
        <PageIntro eyebrow="Attack Lab · simulation" a="Launch an attack." b="Watch it fail." />
        <p className="mt-4 max-w-3xl text-[17px] font-light text-mist">
          Intentionally vulnerable demonstration MCP servers, a scripted demo agent, and real attacks — all running through the same Gateway, Sentinel, Registry and Ledger as real traffic. Nothing here is a pre-recorded animation. Every record the Lab produces is labeled as a Lab record, and the Lab never touches your real servers or policy.
        </p>
        {d && !d.aiConfigured && (
          <Notice tone="warn" title={d.requireAi ? 'AI review layer not configured' : 'Development mode: AI review layer not configured'} className="mt-6">
            {d.requireAi
              ? 'Clean versions stay pending, because Sentinel never guesses “sealed” — so some scenarios cannot show an allowed baseline. Attacks are still caught by the deterministic layer. Set GROQ_API_KEY (free at console.groq.com) for the full demonstration.'
              : 'SENTINEL_REQUIRE_AI=false: seals are issued from the deterministic and differential layers only, and every verdict package records that the AI layer did not run.'}
          </Notice>
        )}
        {err && (
          <Notice tone="danger" className="mt-4">
            {err}
          </Notice>
        )}
        {s.error && <ErrorState error={s.error} retry={s.reload} />}

        {/* Scenarios arrive from the daemon after mount, so each card animates itself rather than relying on a parent's in-view state. */}
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(d?.scenarios ?? []).map((sc, i) => (
            <motion.div key={sc.id} className="h-full" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_EXPO, delay: 0.05 * i }}>
            <Spotlight className={cx('group flex h-full flex-col rounded-[14px] border card-grad p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[border-color] duration-300', d?.run?.scenario === sc.id ? 'border-frosted/50' : 'border-ink/[0.07] hover:border-ink/[0.14]')}>
              <p className="text-[15px] font-medium">{sc.title}</p>
              <p className="mt-2 flex-1 text-[13px] font-light leading-relaxed text-ash">{sc.attack}</p>
              <Button size="sm" variant={d?.run?.scenario === sc.id ? 'primary' : 'ghost'} className="mt-4 w-full" disabled={running} loading={busy === sc.id} onClick={() => act(sc.id, () => api('/api/public/lab/start', { json: { scenario: sc.id } }))}>
                {d?.run?.scenario === sc.id && running ? 'Running…' : 'Launch'}
              </Button>
            </Spotlight>
            </motion.div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" />} disabled={running} loading={busy === 'reset'} onClick={() => act('reset', () => api('/api/public/lab/reset', { json: { mode: 'soft' } }))}>
            Reset Lab
          </Button>
          <Button variant="subtle" size="sm" disabled={running} loading={busy === 'full'} onClick={() => act('full', () => api('/api/public/lab/reset', { json: { mode: 'full' } }))}>
            Full reset (re-audit from scratch)
          </Button>
          <span className="self-center text-[12px] text-ash">Reset keeps Lab audit history, so already-audited versions are recognized instantly — as they would be for every gateway.</span>
        </div>

        {!d && s.loading ? (
          <LoadingBlock rows={6} />
        ) : (
          <div className="mt-8 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            <Card>
              <CardHeader title={active ? `Timeline · ${active.title}` : 'Timeline'} subtitle={d?.run ? `${d.run.status} · started ${timeAgo(d.run.startedAt)}` : 'Launch a scenario to see each step as it happens'} action={running ? <Badge tone="info" dot>live</Badge> : undefined} />
              {!d?.run ? (
                <EmptyState icon={<FlaskConical className="size-5" />} title="No scenario running" description="Pick a scenario above. Each one explains what the attacker does and what Zoro should show." />
              ) : (
                <ol className="max-h-[720px] divide-y divide-inkline overflow-y-auto">
                  {d.run.events.map((e) => {
                    const a = ACTOR[e.actor];
                    return (
                      <li key={e.id} className="slide-in flex gap-3 px-5 py-3">
                        <a.icon className={cx('mt-0.5 size-4 shrink-0', a.cls)} aria-hidden />
                        <div className="min-w-0">
                          <p className="text-[14px] text-quartz">
                            <span className={cx('mr-2 text-[11px] uppercase tracking-wider', a.cls)}>{a.label}</span>
                            {e.title}
                          </p>
                          {e.detail && <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ash">{e.detail}</p>}
                        </div>
                      </li>
                    );
                  })}
                  {active && d.run.status !== 'running' && (
                    <li className="bg-cobalt/40 px-5 py-4 text-[14px] text-mist">
                      <span className="font-medium text-quartz">What this shows: </span>
                      {active.shows}
                    </li>
                  )}
                </ol>
              )}
            </Card>

            <div className="space-y-4">
              {d && d.approvals.filter((a) => a.status === 'pending').length > 0 && (
                <Card highlight>
                  <CardHeader title="Waiting for a person" subtitle="The agent’s call is paused until someone decides" />
                  <ul className="divide-y divide-cobalt-edge">
                    {d.approvals
                      .filter((a) => a.status === 'pending')
                      .map((a) => (
                        <li key={a.id} className="px-5 py-3">
                          <p className="text-[14px] text-quartz">
                            {a.ref}: {a.summary}
                          </p>
                          <p className="mt-1 text-[13px] text-mist">{a.reason}</p>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="danger" onClick={() => act(`deny-${a.id}`, () => api(`/api/public/lab/approvals/${a.id}/deny`, { json: {} }))} loading={busy === `deny-${a.id}`}>
                              Deny
                            </Button>
                            {a.human_seal ? (
                              <Button size="sm" onClick={() => setSealFor(a)}>
                                Approve with Human Seal
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                  </ul>
                </Card>
              )}

              <Card>
                <CardHeader title="Sentinel" subtitle="Latest Lab audits, layer by layer" />
                {d?.audits.length ? (
                  <ul className="divide-y divide-inkline">
                    {d.audits.slice(0, 4).map((a) => (
                      <li key={a.id} className="px-5 py-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[14px] text-quartz">
                            {a.server_label}/{a.name}
                            {a.source === 'artifact' && <span className="ml-2 text-[12px] text-ash">(code change)</span>}
                          </span>
                          {a.verdict ? <VerdictBadge verdict={a.verdict} /> : <Badge tone="info">{a.status}</Badge>}
                        </div>
                        <LayerProgress layers={a.layers} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-4 text-[13px] text-ash">No audits yet.</p>
                )}
              </Card>

              <Card>
                <CardHeader title="Incidents" subtitle="Lab incidents only" />
                {d?.incidents.length ? (
                  <ul className="divide-y divide-inkline">
                    {d.incidents.slice(0, 8).map((i) => (
                      <li key={i.id} className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={i.severity} />
                          <span className="text-[12px] text-ash">INC-{i.seq} · {i.status}{i.count > 1 ? ` · ×${i.count}` : ''}</span>
                        </div>
                        <p className="mt-1 text-[14px] text-quartz">{i.title}</p>
                        <p className="mt-0.5 text-[13px] text-ash">{i.summary}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-4 text-[13px] text-ash">No incidents.</p>
                )}
              </Card>

              <Card>
                <CardHeader title="What actually happened" subtitle="The simulated outside world — what the attacker received" />
                <div className="space-y-3 px-5 py-4 text-[13px]">
                  <WorldList title="Emails delivered" items={(d?.world.outbox ?? []).map((m) => `${fmtDate(m.at)} → ${m.to}${m.bcc.length ? `  ⚠ BCC ${m.bcc.join(', ')}` : ''}`)} />
                  <WorldList title="Transfers" items={(d?.world.transactions ?? []).map((t) => `${fmtDate(t.at)} ${t.amount} ${t.token} → ${t.to}`)} />
                  <WorldList title="Requests to attacker hosts" items={(d?.world.network ?? []).map((n) => `${fmtDate(n.at)} ${n.via} → ${n.to} (${n.bytes} bytes)`)} />
                </div>
              </Card>

              <Card>
                <CardHeader title="Lab servers" subtitle="Connected through the Zoro Gateway" />
                <ul className="divide-y divide-inkline">
                  {(d?.servers ?? []).map((sv) => (
                    <li key={sv.label} className="px-5 py-2.5 text-[13px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-quartz">{sv.label}</span>
                        <span className="text-ash">v{sv.version} · {sv.connected ? 'connected' : 'not connected'}</span>
                      </div>
                      <p className="text-ash">{sv.state}</p>
                    </li>
                  ))}
                </ul>
              </Card>

              {d && d.seals.length > 0 && (
                <Card>
                  <CardHeader title="Public records" subtitle="Lab verdicts are published under the lab namespace and labeled as lab records" />
                  <ul className="divide-y divide-inkline">
                    {d.seals.slice(0, 6).map((x) => (
                      <li key={x.fingerprint} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <Link href={`/verify?q=${x.fingerprint}`} className="text-[13px] text-quartz hover:underline">
                            {x.server_label}/{x.name}
                          </Link>
                          <VerdictBadge verdict={x.verdict} status={x.status} />
                        </div>
                        <div className="mt-1.5">
                          <PublicationBadges seal={x} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
      <HumanSealModal approval={sealFor} open={Boolean(sealFor)} onClose={() => setSealFor(null)} mode="lab" onDone={() => void s.reload()} />
    </div>
  );
}

function WorldList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[12px] uppercase tracking-wider text-ash">{title}</p>
      {items.length ? (
        <ul className="mt-1 space-y-0.5 font-mono text-[12px] text-mist">
          {items.map((i, n) => (
            <li key={n} className={i.includes('⚠') ? 'text-danger' : undefined}>
              {i}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-ash">None.</p>
      )}
    </div>
  );
}
