'use client';

import { useState } from 'react';
import type { Finding } from '@zoro/core';
import { Badge, Button, Card, CardHeader, CodeBlock, EmptyState, ErrorState, Field, LoadingBlock, Notice, PageHeader, Select, Table, Td, VerdictBadge, inputCls } from '@/components/ui';
import { FindingList, LayerProgress, type LayerState } from '@/components/security';
import { HumanSealModal, type SealableApproval } from '@/components/human-seal';
import { api, useApi } from '@/lib/api';
import { fmtDate, shortHash } from '@/lib/format';

interface PublisherData {
  namespaces: { label: string; method: string; target: string; challenge: string; status: string; proof: string | null; verified_at: number | null; publisher: string | null; error: string | null; instructions: string; badge: string; history: { fingerprint: string; name: string; verdict: string; status: string; risk: number; audited_at: number; sightings: number; badge_serial: number | null }[] }[];
  releases: { id: string; created_at: number; namespace: string; version: string | null; audits: ({ id: string; name: string; status: string; verdict: string | null; fingerprint: string; layers: LayerState[]; findings: Finding[]; ens: { ens_name: string | null; ledger_seq: number | null; badge_serial: number | null } | null } | null)[] }[];
  ensConfigured: boolean;
  ledgerConfigured: boolean;
}

export default function PublisherPage() {
  const r = useApi<PublisherData>('/api/console/publisher', { on: ['audit', 'seal', 'approval', 'ledger'] });
  const [label, setLabel] = useState('');
  const [method, setMethod] = useState('github');
  const [target, setTarget] = useState('');
  const [publisher, setPublisher] = useState('');
  const [ns, setNs] = useState('');
  const [version, setVersion] = useState('');
  const [manifest, setManifest] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [seal, setSeal] = useState<SealableApproval | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setInfo(null);
    try {
      await fn();
      await r.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <PageHeader title="Publisher Portal" description="For MCP server authors: claim your namespace, get releases sealed before you ship them, and give users a verifiable badge." />
      <Notice tone="info" title="What publishers can and cannot do" className="mb-4">
        You can claim your namespace, submit releases for audit, edit descriptive records (homepage, repository, description, notes) and appeal verdicts. You cannot change a verdict, hide history or remove a revocation — only the Auditor role can write verdict records.
      </Notice>
      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      {info && <Notice tone="ok" className="mb-4">{info}</Notice>}
      {r.loading && !r.data ? <LoadingBlock rows={5} /> : r.error ? <ErrorState error={r.error} retry={r.reload} /> : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Claim a namespace" subtitle="Prove you control the server, then confirm with a Human Seal" />
            <div className="space-y-3 p-5">
              <Field label="Namespace (server label)"><input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="postmail" /></Field>
              <Field label="Proof method"><Select value={method} onChange={setMethod} options={[{ value: 'github', label: 'Control of the source repository (GitHub)' }, { value: 'npm', label: 'Ownership of the npm package' }, { value: 'dns', label: 'DNS TXT record on your domain' }, { value: 'ens', label: 'Text record on an ENS name you own' }]} /></Field>
              <Field label={method === 'github' ? 'owner/repo' : method === 'npm' ? 'package name' : method === 'dns' ? 'domain' : 'ENS name'}><input className={`${inputCls} font-mono`} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
              <Field label="Publisher Ethereum address (optional)" hint="Receives descriptive-record roles on your namespace’s resolver."><input className={`${inputCls} font-mono`} value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="0x…" /></Field>
              <Button onClick={() => void run(async () => { const res = await api<{ instructions: string }>('/api/console/publisher/claims', { json: { label, method, target, publisher } }); setInfo(res.instructions); })}>Start claim</Button>
            </div>
          </Card>
          <Card>
            <CardHeader title="Submit a release for audit" subtitle="Sealed before you publish means your users never see a quarantine" />
            <div className="space-y-3 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Namespace"><input className={inputCls} value={ns} onChange={(e) => setNs(e.target.value)} /></Field>
                <Field label="Version"><input className={inputCls} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.5.0" /></Field>
              </div>
              <Field label="Manifest" hint="Paste the tools/list result (or a single definition) of the candidate release.">
                <textarea className={`${inputCls} h-40 py-2 font-mono text-[12.5px]`} value={manifest} onChange={(e) => setManifest(e.target.value)} placeholder='{"tools":[{"name":"send_email","description":"…","inputSchema":{…}}]}' spellCheck={false} />
              </Field>
              <Button onClick={() => void run(async () => { const res = await api<{ auditIds: string[] }>('/api/console/publisher/releases', { json: { namespace: ns, version, manifest } }); setInfo(`${res.auditIds.length} definition(s) submitted to Sentinel.`); })}>Submit for audit</Button>
              {!r.data!.ledgerConfigured && <p className="text-[12px] text-ash">The ledger is not configured on this instance; verdicts will be local only.</p>}
            </div>
          </Card>
        </div>
      )}
      {r.data && (
        <>
          <Card className="mt-4">
            <CardHeader title="Your namespaces" />
            {r.data.namespaces.length === 0 ? <EmptyState title="No claims yet" /> : (
              <div className="divide-y divide-inkline">
                {r.data.namespaces.map((n) => (
                  <div key={n.label} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-medium">{n.label}</span>
                      <Badge tone={n.status === 'verified' ? 'ok' : n.status === 'contested' ? 'danger' : 'warn'}>{n.status.replace(/_/g, ' ')}</Badge>
                      <span className="text-[13px] text-ash">{n.method}: {n.target}</span>
                      {n.status === 'awaiting_proof' || n.status === 'proof_verified' ? (
                        <Button size="sm" className="ml-auto" onClick={() => void run(async () => { const res = await api<{ ok: boolean; detail: string; approval: (SealableApproval & { seq: number }) | null }>(`/api/console/publisher/claims/${n.label}/verify`, { json: {} }); if (res.approval) setSeal({ ...res.approval, ref: `APR-${res.approval.seq}` }); else setError(`Proof not found yet: ${res.detail}`); })}>Check proof</Button>
                      ) : null}
                    </div>
                    {n.status !== 'verified' && <p className="text-[13px] text-mist">{n.instructions}</p>}
                    {n.error && <p className="text-[13px] text-warn">{n.error}</p>}
                    {n.proof && <p className="text-[12px] text-ash">Proof: {n.proof}</p>}
                    {n.status === 'verified' && <CodeBlock language="text" filename="README badge (live seal state)" code={`[![Zoro seal](${n.badge.replace('<tool>', n.history[0]?.name ?? 'your_tool')})](${n.badge.split('/api/')[0]}/verify?q=${n.history[0]?.fingerprint ?? ''})`} maxHeight={120} />}
                    {n.history.length > 0 && (
                      <Table head={['Version', 'Definition', 'Verdict', 'Risk', 'Seen by gateways', 'Audited']}>
                        {n.history.map((h) => (
                          <tr key={h.fingerprint}>
                            <Td className="font-mono text-[12px]">{shortHash(h.fingerprint)}</Td>
                            <Td className="font-mono text-[13px]">{h.name}</Td>
                            <Td><VerdictBadge verdict={h.verdict} status={h.status} /></Td>
                            <Td>{h.risk}</Td>
                            <Td className="text-[13px] text-ash">{h.sightings} (aggregate, this gateway)</Td>
                            <Td className="text-[13px] text-ash">{fmtDate(h.audited_at)}</Td>
                          </tr>
                        ))}
                      </Table>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="mt-4">
            <CardHeader title="Pre-release audits" />
            {r.data.releases.length === 0 ? <EmptyState title="No releases submitted" /> : (
              <div className="divide-y divide-inkline">
                {r.data.releases.map((rel) => (
                  <div key={rel.id} className="px-5 py-4">
                    <p className="text-[15px] font-medium">{rel.namespace}{rel.version ? `@${rel.version}` : ''} <span className="text-[12px] font-normal text-ash">{fmtDate(rel.created_at)}</span></p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {rel.audits.filter(Boolean).map((a) => (
                        <div key={a!.id} className="rounded-[10px] border border-inkline bg-abyss p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="font-mono text-[13px]">{a!.name}</span>
                            {a!.verdict ? <VerdictBadge verdict={a!.verdict} /> : <Badge tone="info">{a!.status}</Badge>}
                          </div>
                          {a!.status !== 'done' ? <LayerProgress layers={a!.layers} /> : (
                            <>
                              <p className="mb-2 font-mono text-[11.5px] text-ash">{shortHash(a!.fingerprint)}{a!.ens?.ens_name ? ` · ${a!.ens.ens_name}` : ''}{a!.ens?.badge_serial ? ` · badge #${a!.ens.badge_serial}` : ''}</p>
                              {a!.findings.length > 0 && <p className="mb-2 text-[12px] uppercase tracking-wider text-ash">Remediation guidance</p>}
                              <FindingList findings={a!.findings} compact={false} />
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
      <HumanSealModal approval={seal} open={Boolean(seal)} onClose={() => setSeal(null)} onDone={() => void r.reload()} />
    </>
  );
}
