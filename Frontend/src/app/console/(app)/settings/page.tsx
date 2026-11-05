'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardHeader, CodeBlock, ErrorState, Field, KV, LoadingBlock, Modal, Notice, PageHeader, Select, Table, Td, Tabs, Toggle, inputCls } from '@/components/ui';
import { useProtectedAction, type ProtectedResult } from '@/components/console/protected';
import { api, useApi } from '@/lib/api';
import { fmtDate, timeAgo } from '@/lib/format';

interface Settings {
  notifications: { webhookUrl?: string; webhookMinSeverity?: string; quietHours?: { start: number; end: number } | null; desktop?: boolean };
  gateway: { mcpUrl: string; refreshIntervalSec: number; approvalWaitSec: number; approvalWindowSec: number; snippet: { command: string; args: string[] } };
  auditor: { model: string; requireAi: boolean; aiConfigured: boolean; sealLifetimeDays: number; publicSubmission: boolean };
  networks: {
    ens: { configured: boolean; network: string; root: string | null; resolver: string | null; registry: string | null; rpcUrl: string; operatorConfigured: boolean; cacheTtlSec: number };
    hedera: { configured: boolean; network: string; operatorId: string | null; registryTopic: string | null; labTopic: string | null; orgTopic: string | null; badgeToken: string | null };
    world: { configured: boolean; appId: string | null; environment: string; approvalTtlSec: number };
    privateLookups: string;
  };
  privacy: { stored: Record<string, number>; dataDir: string; sentOutside: string[] };
  team: { note: string };
  scanPermitted: boolean;
}

type Tab = 'gateway' | 'auditor' | 'networks' | 'humanseal' | 'notifications' | 'privacy' | 'danger';

const DANGER = [
  { op: 'disable-protection', phrase: 'disable protection', title: 'Disable protection', body: 'Every enforced server switches to observe mode. Zoro keeps recording but blocks nothing.' },
  { op: 'remove-zoro', phrase: 'remove zoro', title: 'Remove Zoro', body: 'Restores every original client configuration exactly and disables all servers in Zoro. Protection ends.' },
  { op: 'delete-local-data', phrase: 'delete local data', title: 'Delete local activity data', body: 'Deletes calls, incidents, approvals and notifications from this machine. Verdicts, the audit log chain and public records are kept.' },
];

export default function SettingsPage() {
  const s = useApi<Settings>('/api/console/settings');
  const outbox = useApi<{ stats: { kind: string; status: string; n: number }[]; items: { id: string; created_at: number; kind: string; status: string; attempts: number; next_at: number; last_error: string | null }[] }>('/api/console/outbox', { on: ['outbox'] });
  const [tab, setTab] = useState<Tab>('gateway');
  const [notif, setNotif] = useState<Settings['notifications']>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [danger, setDanger] = useState<(typeof DANGER)[number] | null>(null);
  const [phrase, setPhrase] = useState('');
  const protectedDanger = useProtectedAction((r) => (setMsg(r), setDanger(null)));
  useEffect(() => {
    if (s.data) setNotif(s.data.notifications);
  }, [s.data]);
  if (s.loading && !s.data) return <LoadingBlock rows={6} />;
  if (s.error && !s.data) return <ErrorState error={s.error} retry={s.reload} />;
  if (!s.data) return null;
  const d = s.data;
  const n = d.networks;
  return (
    <>
      <PageHeader title="Settings" />
      {msg && <Notice tone="ok" className="mb-4">{msg}</Notice>}
      {protectedDanger.ui}
      <Card>
        <Tabs className="px-3" value={tab} onChange={setTab} tabs={[{ id: 'gateway', label: 'Gateway' }, { id: 'auditor', label: 'Auditor' }, { id: 'networks', label: 'Networks & identity' }, { id: 'humanseal', label: 'Human Seal' }, { id: 'notifications', label: 'Notifications' }, { id: 'privacy', label: 'Privacy' }, { id: 'danger', label: 'Danger zone' }]} />
        <div className="p-5">
          {tab === 'gateway' && (
            <div className="space-y-4">
              <KV items={[['MCP endpoint', <span key="u" className="font-mono">{d.gateway.mcpUrl}</span>], ['Definition refresh', `every ${d.gateway.refreshIntervalSec}s, on list changes, reconnects, restarts, and before high-risk calls`], ['Approval wait inside a call', `${d.gateway.approvalWaitSec}s, then the agent gets a “pending approval” refusal`], ['Approval window', `${Math.round(d.gateway.approvalWindowSec / 60)} minutes`]]} />
              <CodeBlock filename="manual client configuration (stdio bridge)" code={JSON.stringify({ mcpServers: { zoro: d.gateway.snippet } }, null, 2)} />
              <div className="flex gap-2">
                <Button variant="subtle" onClick={() => void api<{ restored: string[] }>('/api/console/onboarding/restore', { json: {} }).then((r) => setMsg(`Restored ${r.restored.length} original client configuration(s).`))}>Restore original client configurations</Button>
              </div>
            </div>
          )}
          {tab === 'auditor' && (
            <div className="space-y-4">
              <KV items={[['AI review', d.auditor.aiConfigured ? d.auditor.model : 'not configured (GROQ_API_KEY)'], ['Without AI', d.auditor.requireAi ? 'versions stay pending (default)' : 'development mode: seals record that AI did not run'], ['Seal lifetime', `${d.auditor.sealLifetimeDays} days (half for high-impact tools)`]]} />
              <Toggle checked={d.auditor.publicSubmission} onChange={(v) => void api('/api/console/settings/auditor', { method: 'PUT', json: { publicSubmission: v } }).then(s.reload)} label="Publish verdicts for public tool definitions to the registry (collective immunity). Private servers are never published." />
            </div>
          )}
          {tab === 'networks' && (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <Card className="p-4">
                  <p className="text-[14px] font-medium">ENSv2 registry <Badge tone={n.ens.configured ? 'ok' : 'neutral'}>{n.ens.configured ? n.ens.network : 'not configured'}</Badge></p>
                  <KV className="mt-3" items={[['Root', n.ens.root ?? '—'], ['Resolver', <span key="r" className="font-mono text-[12px]">{n.ens.resolver ?? '—'}</span>], ['Operator key', n.ens.operatorConfigured ? 'configured' : 'not configured'], ['Cache', `${n.ens.cacheTtlSec}s`], ['RPC', <span key="p" className="font-mono text-[12px]">{n.ens.rpcUrl}</span>]]} />
                </Card>
                <Card className="p-4">
                  <p className="text-[14px] font-medium">Hedera ledger <Badge tone={n.hedera.configured ? 'ok' : 'neutral'}>{n.hedera.configured ? n.hedera.network : 'not configured'}</Badge></p>
                  <KV className="mt-3" items={[['Operator', n.hedera.operatorId ?? '—'], ['Registry topic', n.hedera.registryTopic ?? '—'], ['Lab topic', n.hedera.labTopic ?? '—'], ['Org topic', n.hedera.orgTopic ?? '—'], ['Badge token', n.hedera.badgeToken ?? '—']]} />
                </Card>
                <Card className="p-4">
                  <p className="text-[14px] font-medium">World ID <Badge tone={n.world.configured ? 'ok' : 'neutral'}>{n.world.configured ? n.world.environment : 'not configured'}</Badge></p>
                  <KV className="mt-3" items={[['App', n.world.appId ?? '—'], ['Environment', n.world.environment === 'production' ? 'production' : `${n.world.environment} — test identities`]]} />
                </Card>
              </div>
              <Notice tone="info" title="Private lookups">Chain reads go through <span className="font-mono">{n.privateLookups}</span>. Point ENS_RPC_URL at a privacy-preserving endpoint (for example the Ethereum Foundation’s Anon-RPC) so whoever runs the RPC cannot learn which tools you use.</Notice>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[14px] font-medium">Onchain write queue</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="subtle" onClick={() => void api('/api/console/outbox/retry', { json: {} }).then(outbox.reload)}>Retry failed</Button>
                    <Button size="sm" variant="subtle" onClick={() => void api<{ queued: number }>('/api/console/republish', { json: {} }).then((r) => setMsg(`${r.queued} unpublished verdict(s) queued for publication.`))}>Publish unpublished verdicts</Button>
                  </div>
                </div>
                <Table head={['Queued', 'Kind', 'Status', 'Attempts', 'Next try', 'Last error']}>
                  {(outbox.data?.items ?? []).slice(0, 30).map((o) => (
                    <tr key={o.id}>
                      <Td className="text-[12px] text-ash">{fmtDate(o.created_at)}</Td>
                      <Td className="font-mono text-[12px]">{o.kind}</Td>
                      <Td><Badge tone={o.status === 'done' ? 'ok' : o.status === 'failed' ? 'danger' : 'warn'}>{o.status}</Badge></Td>
                      <Td>{o.attempts}</Td>
                      <Td className="text-[12px] text-ash">{o.status === 'done' ? '—' : timeAgo(o.next_at)}</Td>
                      <Td className="max-w-[280px] truncate text-[12px] text-ash" >{o.last_error ?? '—'}</Td>
                    </tr>
                  ))}
                  {(outbox.data?.items ?? []).length === 0 && <tr><Td colSpan={6} className="text-ash">Nothing queued.</Td></tr>}
                </Table>
              </div>
            </div>
          )}
          {tab === 'humanseal' && (
            <div className="space-y-4">
              {!n.world.configured && <Notice tone="warn">World ID is not configured. Actions that need a Human Seal cannot proceed until it is.</Notice>}
              {n.world.configured && n.world.environment !== 'production' && <Notice tone="warn" title="Test identities">Human Seals use World ID’s staging environment and the Simulator. This is not production identity assurance.</Notice>}
              <KV items={[['Request lifetime', `${n.world.approvalTtlSec}s per verification`], ['Binding', 'Each proof is bound to the action digest (action string and signal) and accepted once per action'], ['Always required for', 'Overriding a block on an unsafe, quarantined, revoked or contradicted version'], ['Multiple approvers', 'Counted by distinct World ID nullifiers, so one person cannot approve twice'], ['Configure where else it is required', 'Policies → human seal rule']]} />
            </div>
          )}
          {tab === 'notifications' && (
            <div className="max-w-xl space-y-4">
              <p className="text-[14px] text-ash">Critical incidents always notify, including during quiet hours. Notifications never contain secrets or full sensitive values.</p>
              <Field label="Webhook URL (team chat or your own endpoint)"><input className={inputCls} value={notif.webhookUrl ?? ''} onChange={(e) => setNotif({ ...notif, webhookUrl: e.target.value })} placeholder="https://…" /></Field>
              <Field label="Minimum severity for the webhook"><Select value={notif.webhookMinSeverity ?? 'high'} onChange={(v) => setNotif({ ...notif, webhookMinSeverity: v })} options={['critical', 'high', 'medium', 'low'].map((x) => ({ value: x, label: x }))} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quiet hours from"><input type="number" min={0} max={23} className={inputCls} value={notif.quietHours?.start ?? ''} onChange={(e) => setNotif({ ...notif, quietHours: e.target.value === '' ? null : { start: Number(e.target.value), end: notif.quietHours?.end ?? 7 } })} /></Field>
                <Field label="to"><input type="number" min={0} max={23} className={inputCls} value={notif.quietHours?.end ?? ''} onChange={(e) => setNotif({ ...notif, quietHours: { start: notif.quietHours?.start ?? 22, end: Number(e.target.value) } })} /></Field>
              </div>
              <Button onClick={() => void api('/api/console/settings/notifications', { method: 'PUT', json: notif }).then(() => setMsg('Notification settings saved.')).catch((e) => setMsg((e as Error).message))}>Save</Button>
            </div>
          )}
          {tab === 'privacy' && (
            <div className="space-y-4">
              <KV items={[['Local data', <span key="d" className="font-mono text-[12px]">{d.privacy.dataDir}</span>], ...Object.entries(d.privacy.stored).map(([k, v]) => [k.replace(/_/g, ' '), `${v} record(s)`] as [string, string])]} />
              <div>
                <p className="text-[14px] font-medium">What is ever sent outside this machine</p>
                {d.privacy.sentOutside.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-mist">{d.privacy.sentOutside.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-2 text-[14px] text-mist">Nothing: no external service is configured.</p>}
              </div>
              <p className="text-[13px] text-ash">Secret-named argument values are never stored. Server credentials (env, headers) stay in the local database and are never displayed in full, logged, or sent to the auditor.</p>
            </div>
          )}
          {tab === 'danger' && (
            <div className="space-y-3">
              {DANGER.map((x) => (
                <div key={x.op} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-danger/30 p-4">
                  <div>
                    <p className="text-[15px] font-medium">{x.title}</p>
                    <p className="text-[13px] text-ash">{x.body}</p>
                  </div>
                  <Button variant="danger" onClick={() => (setDanger(x), setPhrase(''))}>{x.title}</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      <Modal open={Boolean(danger)} onClose={() => setDanger(null)} title={danger?.title ?? ''} footer={<><Button variant="subtle" onClick={() => setDanger(null)}>Cancel</Button><Button variant="danger" disabled={phrase.trim().toLowerCase() !== danger?.phrase} onClick={() => void protectedDanger.run(() => api<ProtectedResult>(`/api/console/danger/${danger!.op}`, { json: { phrase } }))}>Confirm</Button></>}>
        <p className="text-[14px] text-mist">{danger?.body}</p>
        <Field label={`Type “${danger?.phrase}” to confirm`}><input className={`${inputCls} mt-3`} value={phrase} onChange={(e) => setPhrase(e.target.value)} /></Field>
        <p className="mt-3 text-[12px] text-ash">When World ID is configured, a Human Seal is also required.</p>
      </Modal>
    </>
  );
}
