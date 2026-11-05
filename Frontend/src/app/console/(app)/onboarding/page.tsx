'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Check, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, CardHeader, LinkButton, Notice, PageHeader, StateBadge, VerdictBadge, cx } from '@/components/ui';
import { CapabilityChips } from '@/components/security';
import { api, useApi } from '@/lib/api';

interface DetectedClient {
  id: string;
  client: string;
  label: string;
  path: string;
  servers: { name: string; transport: string; command: string | null; args: string[]; url: string | null; hasEnv: boolean; status: 'unprotected' | 'zoro' | 'routed' }[];
  routed: boolean;
  backup: string | null;
  error: string | null;
}

const STEPS = ['Welcome', 'Permission', 'Your clients', 'Mode', 'Baseline audit', 'Posture', 'Human Seal & alerts', 'Done'];

export default function OnboardingPage() {
  const state = useApi<{ permitted: boolean; completed: boolean; clients: { id: string; client: string; path: string; routed: number }[] }>('/api/console/onboarding/state');
  const [step, setStep] = useState(0);
  const [clients, setClients] = useState<DetectedClient[]>([]);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [mode, setMode] = useState<'enforce' | 'observe'>('enforce');
  const [error, setError] = useState<string | null>(null);
  const [routedMsg, setRoutedMsg] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const servers = useApi<{ id: string; name: string; total: number; sealed: number; quarantined: number; online: string }[]>(step >= 4 ? '/api/console/servers' : null, { on: ['tool', 'seal', 'server', 'audit'] });
  const quarantine = useApi<{ name: string; label: string; state: string; verdict: string | null; audit: { status: string } | null }[]>(step >= 4 ? '/api/console/quarantine' : null, { on: ['tool', 'audit', 'seal'] });
  const posture = useApi<{ body: { toolCount: number; quarantined: number; coverage: Record<string, number>; capabilities: { capability: string; count: number; highImpact: boolean }[]; gaps: string[] } }>(step >= 5 ? '/api/console/reports/posture' : null, { on: ['seal', 'tool'] });

  useEffect(() => {
    if (state.data?.permitted && step === 0 && clients.length === 0) void scan(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data?.permitted]);

  const scan = async (grant: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ clients: DetectedClient[] }>('/api/console/onboarding/scan', { json: { grant } });
      setClients(r.clients);
      setSelected(Object.fromEntries(r.clients.map((c) => [c.id, new Set(c.servers.filter((s) => s.status === 'unprotected' && s.transport !== 'sse').map((s) => s.name))])));
      if (grant) setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const route = async () => {
    setError(null);
    setBusy(true);
    const msgs: string[] = [];
    try {
      for (const c of clients) {
        const names = [...(selected[c.id] ?? [])];
        if (!names.length) continue;
        const r = await api<{ imported: string[]; backup: string; restartRequired: string }>('/api/console/onboarding/route', { json: { clientId: c.id, servers: names, mode } });
        msgs.push(`${c.label}: ${r.imported.length} server(s) routed through Zoro. Backup saved. ${r.restartRequired}`);
      }
      setRoutedMsg(msgs);
      setStep(4);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const totalSelected = useMemo(() => Object.values(selected).reduce((n, s) => n + s.size, 0), [selected]);
  const auditing = (quarantine.data ?? []).filter((q) => q.audit && q.audit.status !== 'done').length;

  return (
    <>
      <PageHeader title="Onboarding" description="Protect the MCP servers you already use in a few minutes, without editing any file." />
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button onClick={() => i <= Math.max(step, state.data?.completed ? 7 : 0) && setStep(i)} className={cx('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[13px]', i === step ? 'border-quartz text-quartz' : i < step ? 'border-ok/30 text-ok' : 'border-obsidian text-ash')}>
              {i < step ? <Check className="size-3.5" aria-hidden /> : <span className="font-mono text-[11px]">{i + 1}</span>}
              {s}
            </button>
          </li>
        ))}
      </ol>
      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}

      {step === 0 && (
        <Card className="max-w-3xl p-8">
          <h2 className="font-display text-[28px] font-medium">What Zoro will do — and never do</h2>
          <ul className="mt-6 space-y-4">
            {[
              [ShieldCheck, 'Check every tool, every time', 'Zoro fingerprints every tool your agents use and verifies it on every call. Changed tools are held back until audited.'],
              [EyeOff, 'Keep your data with you', 'Public records describe tools only — never your prompts, arguments, results, files or identity.'],
              [Lock, 'Never fail silently', 'If Zoro cannot decide safely, the call does not quietly go through, and you are told why.'],
            ].map(([Icon, t, b]) => {
              const I = Icon as typeof ShieldCheck;
              return (
                <li key={t as string} className="flex gap-3">
                  <I className="mt-0.5 size-5 shrink-0 text-frosted" aria-hidden />
                  <div>
                    <p className="text-[16px] font-medium">{t as string}</p>
                    <p className="text-[14px] font-light text-mist">{b as string}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <Button className="mt-8" onClick={() => setStep(1)}>Continue</Button>
        </Card>
      )}

      {step === 1 && (
        <Card className="max-w-3xl p-8">
          <h2 className="font-display text-[28px] font-medium">May Zoro read your AI client configurations?</h2>
          <p className="mt-3 text-[15px] font-light text-mist">Zoro looks for the MCP configuration files of Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI and Cline on this machine. It reads them to list your servers. Nothing is changed until you choose, every file is backed up first, and one action restores them all.</p>
          <div className="mt-6 flex gap-2">
            <Button loading={busy} onClick={() => void scan(true)}>Allow and scan</Button>
            <LinkButton variant="ghost" href="/console/servers?add=1">Add servers by hand instead</LinkButton>
          </div>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {clients.length === 0 ? (
            <Notice tone="info" title="No MCP client configurations found">None of the supported clients has a configuration file on this machine. You can add servers by hand from the Servers page.</Notice>
          ) : (
            clients.map((c) => (
              <Card key={c.id}>
                <CardHeader title={c.label} subtitle={c.path} action={c.routed ? <Badge tone="ok">routed through Zoro</Badge> : <Badge tone="warn">unprotected</Badge>} />
                {c.error ? <Notice tone="danger" className="m-5">{c.error}</Notice> : (
                  <ul className="divide-y divide-inkline">
                    {c.servers.length === 0 && <li className="px-5 py-3 text-[13px] text-ash">No servers configured.</li>}
                    {c.servers.map((s) => (
                      <li key={s.name} className="flex items-center gap-3 px-5 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Protect ${s.name}`}
                          disabled={s.status !== 'unprotected'}
                          checked={selected[c.id]?.has(s.name) ?? false}
                          onChange={(e) => setSelected((prev) => { const next = new Set(prev[c.id]); if (e.target.checked) next.add(s.name); else next.delete(s.name); return { ...prev, [c.id]: next }; })}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[14px] text-quartz">{s.name}</p>
                          <p className="truncate font-mono text-[12px] text-ash">{s.url ?? `${s.command ?? ''} ${s.args.join(' ')}`}{s.hasEnv ? ' · has secrets (moved to Zoro’s local store)' : ''}</p>
                        </div>
                        <Badge tone={s.status === 'unprotected' ? 'warn' : 'ok'}>{s.status === 'zoro' ? 'Zoro gateway' : s.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))
          )}
          <div className="flex gap-2">
            <Button disabled={totalSelected === 0} onClick={() => setStep(3)}>Protect {totalSelected} server(s)</Button>
            <Button variant="subtle" onClick={() => void scan(false)}>Rescan</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <Card className="max-w-3xl p-8">
          <h2 className="font-display text-[28px] font-medium">How should Zoro start?</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {([
              ['enforce', 'Enforce (recommended)', 'Full protection from the first call: unsealed or changed tools are held back, risky calls ask first.'],
              ['observe', 'Observe for a while', 'Record and alert, but never block. No protection — use it to tune policies, then switch to Enforce.'],
            ] as const).map(([id, t, b]) => (
              <button key={id} onClick={() => setMode(id)} className={cx('rounded-[12px] border p-5 text-left', mode === id ? 'border-frosted/60 bg-cobalt' : 'border-obsidian bg-deep-sea hover:border-sapphire')}>
                <p className="text-[16px] font-medium">{t}</p>
                <p className="mt-1 text-[14px] text-mist">{b}</p>
              </button>
            ))}
          </div>
          {mode === 'observe' && <Notice tone="warn" className="mt-4">Observe mode is shown persistently everywhere these servers appear, because it gives no protection.</Notice>}
          <Button className="mt-6" loading={busy} onClick={() => void route()}>Route through Zoro and start the baseline audit</Button>
        </Card>
      )}

      {step === 4 && (
        <div className="space-y-4">
          {routedMsg.map((m) => <Notice key={m} tone="ok">{m}</Notice>)}
          <Card>
            <CardHeader title="Baseline audit" subtitle={auditing ? `${auditing} definition(s) still being audited` : 'Every definition has a decision'} />
            <ul className="divide-y divide-inkline">
              {(servers.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between px-5 py-3 text-[14px]">
                  <span className="text-quartz">{s.name} <span className="text-ash">· {s.online}</span></span>
                  <span className="text-mist">{s.sealed}/{s.total} sealed{s.quarantined ? ` · ${s.quarantined} held` : ''}</span>
                </li>
              ))}
            </ul>
            {(quarantine.data ?? []).length > 0 && (
              <ul className="divide-y divide-inkline border-t border-inkline">
                {quarantine.data!.slice(0, 20).map((q) => (
                  <li key={`${q.label}/${q.name}`} className="flex items-center justify-between gap-2 px-5 py-2.5 text-[13px]">
                    <span className="font-mono text-mist">{q.label}/{q.name}</span>
                    <span className="flex gap-2"><StateBadge state={q.state} /><VerdictBadge verdict={q.verdict} /></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Button onClick={() => setStep(5)}>See my posture</Button>
        </div>
      )}

      {step === 5 && posture.data && (
        <div className="space-y-4">
          <Card className="p-6">
            <h2 className="font-display text-[24px] font-medium">Your first posture report</h2>
            <p className="mt-2 text-[15px] text-mist">{posture.data.body.toolCount} definitions protected · {posture.data.body.coverage.sealed ?? 0} sealed · {posture.data.body.coverage.sealed_with_warnings ?? 0} with warnings · {posture.data.body.quarantined} held back</p>
            <div className="mt-4 space-y-2">
              {posture.data.body.capabilities.slice(0, 8).map((c) => (
                <div key={c.capability} className="flex items-center justify-between">
                  <CapabilityChips capabilities={[c.capability]} />
                  <span className="text-[13px] text-mist">{c.count} tool(s)</span>
                </div>
              ))}
            </div>
            {posture.data.body.gaps.length > 0 && <Notice tone="warn" title="Gaps" className="mt-4"><ul className="list-disc pl-5">{posture.data.body.gaps.map((g) => <li key={g}>{g}</li>)}</ul></Notice>}
          </Card>
          <div className="flex gap-2">
            <Button onClick={() => setStep(6)}>Continue</Button>
            <LinkButton variant="ghost" href="/console/quarantine">Review held-back tools</LinkButton>
          </div>
        </div>
      )}

      {step === 6 && (
        <Card className="max-w-3xl space-y-4 p-8">
          <h2 className="font-display text-[24px] font-medium">Human Seal and alerts (optional)</h2>
          <p className="text-[15px] font-light text-mist">Zoro asks a verified person — you — before risky actions: overriding a block, large transfers, weakening a policy. It uses World ID; configure WORLD_APP_ID, WORLD_RP_ID and WORLD_SIGNING_KEY on the daemon to enable it. Alerts can go to a webhook (team chat or your own endpoint).</p>
          <div className="flex gap-2">
            <LinkButton variant="ghost" href="/console/settings">Configure notifications</LinkButton>
            <Button onClick={() => void api('/api/console/onboarding/complete', { json: {} }).then(() => setStep(7))}>Finish</Button>
          </div>
        </Card>
      )}

      {step === 7 && (
        <Card className="max-w-3xl p-8">
          <h2 className="font-display text-[28px] font-medium">You’re protected</h2>
          <p className="mt-3 text-[15px] font-light text-mist">Restart the AI clients you routed so they reconnect through Zoro. You can restore every original configuration at any time from here or Settings → Gateway.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <LinkButton href="/console">Go to the overview</LinkButton>
            <Button variant="subtle" onClick={() => void api<{ restored: string[] }>('/api/console/onboarding/restore', { json: {} }).then((r) => setRoutedMsg([`Restored ${r.restored.length} original configuration(s). Protection for those clients has ended.`]))}>Restore original configurations</Button>
          </div>
          {routedMsg.map((m) => <Notice key={m} tone="info" className="mt-4">{m}</Notice>)}
          <p className="mt-6 text-[13px] text-ash">Want to see Zoro work first? <Link href="/lab" className="text-frosted">Open the Attack Lab →</Link></p>
        </Card>
      )}
    </>
  );
}
