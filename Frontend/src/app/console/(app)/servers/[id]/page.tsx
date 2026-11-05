'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, RotateCw, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, CodeBlock, ErrorState, Hash, KV, LoadingBlock, Modal, Notice, PageHeader, StateBadge, Table, Tabs, Td, VerdictBadge } from '@/components/ui';
import { CapabilityChips } from '@/components/security';
import { ModeSelect, type ServerSummary } from '@/components/console/server-bits';
import { api, useApi } from '@/lib/api';
import { fmtDate, shortHash, timeAgo } from '@/lib/format';

interface Detail {
  server: ServerSummary & { manifest_root: string | null; artifact_id: string | null; sealed_artifact_id: string | null; created_at: number; connected_at: number | null };
  artifact: Record<string, unknown> | null;
  entries: { kind: string; name: string; fingerprint: string; state: string; reason: string | null; seal: { verdict: string; status: string; risk: number; ens_name: string | null } | null; capabilities: string[]; calls: number; lastUsed: number | null }[];
  history: { kind: string; name: string; fingerprint: string; first_seen: number; verdict: { verdict: string; status: string } | null; changeClass: string | null }[];
  policy: { id: string; type: string; enabled: boolean; reading: string }[];
  log: { seq: number; ts: number; kind: string; summary: string }[];
  stderr: string[];
  namespace: { status: string; method: string; target: string } | null;
  remoteNotice: boolean;
}

export default function ServerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const d = useApi<Detail>(`/api/console/servers/${id}`, { on: ['server', 'tool', 'seal', 'audit'] });
  const [tab, setTab] = useState<'tools' | 'history' | 'identity' | 'policy' | 'log'>('tools');
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  if (d.loading && !d.data) return <LoadingBlock rows={6} />;
  if (d.error && !d.data) return <ErrorState error={d.error} retry={d.reload} />;
  if (!d.data) return null;
  const { server: s } = d.data;
  const act = async (k: string, fn: () => Promise<unknown>) => {
    setBusy(k);
    try {
      await fn();
      await d.reload();
    } finally {
      setBusy(null);
    }
  };
  const artifactChanged = s.sealed_artifact_id && s.artifact_id && s.sealed_artifact_id !== s.artifact_id;
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/console/servers">Servers</Link>}
        title={s.name}
        description={`${s.ensName ?? s.label} · ${s.transport === 'http' ? 'remote' : s.transport === 'lab' ? 'Attack Lab' : 'local process'} · imported via ${s.source}`}
        actions={
          <>
            <ModeSelect server={s} onChanged={d.reload} />
            <Button variant="subtle" size="sm" icon={<RefreshCw className="size-3.5" />} loading={busy === 'refresh'} onClick={() => act('refresh', () => api(`/api/console/servers/${id}/refresh`, { json: {} }))}>
              Re-read definitions
            </Button>
            <Button variant="subtle" size="sm" icon={<RotateCw className="size-3.5" />} loading={busy === 'restart'} onClick={() => act('restart', () => api(`/api/console/servers/${id}/restart`, { json: {} }))}>
              Restart
            </Button>
            <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setRemove(true)}>
              Remove
            </Button>
          </>
        }
      />
      {s.mode === 'observe' && <Notice tone="warn" title="Observe mode" className="mb-4">Zoro records what it would decide but never blocks calls to this server. It gives no protection.</Notice>}
      {artifactChanged && <Notice tone="danger" title="The code behind this server changed" className="mb-4">Its artifact identity no longer matches the approved one. Tools stay unavailable until the new code is reviewed — see Approvals and Incidents.</Notice>}
      {d.data.remoteNotice && <Notice tone="info" title="Remote server limitation" className="mb-4">A remote server can change what its code does without changing any definition or version string. Zoro cannot see inside it; it narrows the gap with identity checks, behavioral baselines, Output Shield, argument constraints and network revocations.</Notice>}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4"><p className="text-[12px] text-ash">Connection</p><p className="mt-1"><Badge tone={s.online === 'online' ? 'ok' : 'danger'} dot>{s.online}</Badge></p><p className="mt-1 text-[12px] text-ash">since {timeAgo(s.connected_at)}</p></Card>
        <Card className="p-4"><p className="text-[12px] text-ash">Definitions</p><p className="mt-1 text-[20px]">{s.total}</p><p className="text-[12px] text-ash">{s.tools} tools · {s.prompts} prompts · {s.templates} templates</p></Card>
        <Card className="p-4"><p className="text-[12px] text-ash">Sealed</p><p className="mt-1 text-[20px]">{s.sealed}/{s.total}</p><p className="text-[12px] text-ash">{s.quarantined} held back</p></Card>
        <Card className="p-4"><p className="text-[12px] text-ash">Publisher</p><p className="mt-1 text-[14px]">{d.data.namespace ? `${d.data.namespace.status} (${d.data.namespace.method})` : 'not claimed'}</p></Card>
      </div>
      <Card className="mt-4">
        <Tabs className="px-3" tabs={[{ id: 'tools', label: 'Definitions', count: d.data.entries.length }, { id: 'history', label: 'Change history', count: d.data.history.length }, { id: 'identity', label: 'Identity' }, { id: 'policy', label: 'Policy' }, { id: 'log', label: 'Connection log' }]} value={tab} onChange={setTab} />
        {tab === 'tools' && (
          <Table head={['Name', 'Kind', 'State', 'Verdict', 'Capabilities', 'Calls', 'Last used']}>
            {d.data.entries.map((e) => (
              <tr key={`${e.kind}-${e.name}`} className="hover:bg-ink/[0.02]">
                <Td>
                  <Link className="font-mono text-[13px] text-quartz hover:underline" href={`/console/tools/${id}/${e.kind}/${encodeURIComponent(e.name)}`}>
                    {e.name}
                  </Link>
                  <div className="font-mono text-[11px] text-ash">{shortHash(e.fingerprint)}</div>
                </Td>
                <Td className="text-[13px]">{e.kind.replace('_', ' ')}</Td>
                <Td>
                  <StateBadge state={e.state} />
                </Td>
                <Td>
                  <VerdictBadge verdict={e.seal?.verdict} status={e.seal?.status} />
                </Td>
                <Td>
                  <CapabilityChips capabilities={e.capabilities.slice(0, 2)} />
                </Td>
                <Td className="text-[13px]">{e.calls}</Td>
                <Td className="text-[13px] text-ash">{timeAgo(e.lastUsed)}</Td>
              </tr>
            ))}
          </Table>
        )}
        {tab === 'history' && (
          <Table head={['When', 'Definition', 'Fingerprint', 'Change', 'Verdict']}>
            {d.data.history.map((h) => (
              <tr key={`${h.kind}-${h.fingerprint}`}>
                <Td className="text-[13px] text-ash">{fmtDate(h.first_seen)}</Td>
                <Td className="font-mono text-[13px]">{h.name}</Td>
                <Td><Hash value={h.fingerprint} /></Td>
                <Td className="text-[13px]">{h.changeClass?.replace(/_/g, ' ') ?? '—'}</Td>
                <Td><VerdictBadge verdict={h.verdict?.verdict} status={h.verdict?.status} /></Td>
              </tr>
            ))}
          </Table>
        )}
        {tab === 'identity' && (
          <div className="space-y-4 p-5">
            <KV
              items={[
                ['Declared name', s.declared_name ?? '—'],
                ['Declared version', s.declared_version ?? '—'],
                ['Manifest root', <Hash key="m" value={s.manifest_root} />],
                ['Artifact identity', <Hash key="a" value={s.artifact_id} />],
                ['Approved artifact', <Hash key="b" value={s.sealed_artifact_id} />],
                [s.transport === 'http' ? 'Endpoint' : 'Command', <span key="c" className="font-mono text-[13px]">{s.transport === 'http' ? s.url : `${s.command} ${s.args.join(' ')}`}</span>],
                ['Secrets', s.envKeys.length || s.headerKeys.length ? `${[...s.envKeys, ...s.headerKeys].join(', ')} (values stored locally, never shown)` : 'none'],
                ['Added', fmtDate(s.created_at)],
              ]}
            />
            {d.data.artifact && <CodeBlock code={JSON.stringify(d.data.artifact, null, 2)} filename="artifact identity" maxHeight={260} />}
          </div>
        )}
        {tab === 'policy' && (
          <ul className="divide-y divide-inkline">
            {d.data.policy.length === 0 && <li className="px-5 py-4 text-[14px] text-ash">Only global rules apply to this server.</li>}
            {d.data.policy.map((r) => (
              <li key={r.id} className="px-5 py-3 text-[14px]">
                <span className="font-mono text-[12px] text-ash">{r.id}</span> <span className="text-mist">{r.reading}</span> {!r.enabled && <Badge tone="neutral">disabled</Badge>}
              </li>
            ))}
            <li className="px-5 py-3">
              <Link href="/console/policies" className="text-[13px] text-frosted">Edit policy →</Link>
            </li>
          </ul>
        )}
        {tab === 'log' && (
          <div className="space-y-4 p-5">
            <ul className="space-y-1.5 text-[13px]">
              {d.data.log.map((l) => (
                <li key={l.seq} className="flex gap-3">
                  <span className="shrink-0 text-ash">{fmtDate(l.ts)}</span>
                  <span className="text-mist">{l.summary}</span>
                </li>
              ))}
              {d.data.log.length === 0 && <li className="text-ash">No entries.</li>}
            </ul>
            {d.data.stderr.length > 0 && <CodeBlock code={d.data.stderr.join('\n')} language="text" filename="server stderr (in memory only, last 15 lines)" maxHeight={240} />}
          </div>
        )}
      </Card>
      <Modal open={remove} onClose={() => setRemove(false)} title={`Remove ${s.name}?`} footer={<><Button variant="subtle" onClick={() => setRemove(false)}>Cancel</Button><Button variant="danger" onClick={() => void api(`/api/console/servers/${id}`, { method: 'DELETE' }).then(() => router.push('/console/servers'))}>Remove server</Button></>}>
        <p className="text-[14px] text-mist">Agents will lose access to its tools through Zoro. Its history, calls and verdicts stay in the audit log.</p>
      </Modal>
    </>
  );
}
