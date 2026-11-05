'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardHeader, CodeBlock, ErrorState, LoadingBlock, Modal, Notice, PageHeader, Select, Table, Td, inputCls } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, shortHash } from '@/lib/format';

interface LogResponse {
  items: { seq: number; ts: number; kind: string; ref: string | null; summary: string; hash: string; prev_hash: string; anchor_id: string | null }[];
  anchors: { id: string; ts: number; from_seq: number; to_seq: number; count: number; root: string; status: string; topic: string | null; seq: number | null; consensus_ts: string | null; url: string | null }[];
  orgTopic: string | null;
}

const KINDS = ['call', 'approval', 'human_seal', 'policy_change', 'config_change', 'server_change', 'tool_change', 'incident', 'verdict', 'revocation', 'onboarding', 'dispute', 'namespace', 'anchor', 'danger_zone', 'lab'];

export default function LogPage() {
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const r = useApi<LogResponse>(`/api/console/log?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(q ? { q } : {}), limit: '200' })}`, { on: ['log'] });
  const [chain, setChain] = useState<{ ok: boolean; brokenAt: number | null; checked: number } | null>(null);
  const [proof, setProof] = useState<unknown>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every local event, append-only and hash-chained. Batches are anchored as Merkle roots so an auditor can verify nothing was altered."
        actions={
          <>
            <Button size="sm" variant="subtle" onClick={() => void api<typeof chain>('/api/console/log/verify').then(setChain)}>Verify the chain</Button>
            <Button size="sm" variant="subtle" onClick={() => void api<{ message?: string; id?: string }>('/api/console/anchors', { json: {} }).then((x) => (setMsg(x.message ?? `Anchor ${x.id} created`), r.reload()))}>Anchor now</Button>
          </>
        }
      />
      {chain && <Notice tone={chain.ok ? 'ok' : 'danger'} className="mb-4">{chain.ok ? `Chain intact: ${chain.checked} entries recomputed and matched.` : `Chain broken at entry #${chain.brokenAt} — an entry was altered or removed.`}</Notice>}
      {msg && <Notice tone="info" className="mb-4">{msg}</Notice>}
      {!r.data?.orgTopic && <Notice tone="info" className="mb-4">No organization topic is configured, so anchors are computed and kept locally only. Run pnpm setup:hedera to publish them.</Notice>}
      <div className="mb-4 flex flex-wrap gap-2">
        <Select ariaLabel="Kind" value={kind} onChange={setKind} options={[{ value: '', label: 'All kinds' }, ...KINDS.map((k) => ({ value: k, label: k.replace(/_/g, ' ') }))]} className="w-48" />
        <input className={`${inputCls} w-72`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search summaries" aria-label="Search the log" />
      </div>
      {r.loading && !r.data ? <LoadingBlock /> : r.error ? <ErrorState error={r.error} retry={r.reload} /> : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <Table head={['#', 'When', 'Kind', 'Summary', 'Entry hash', 'Anchored']}>
              {r.data!.items.map((e) => (
                <tr key={e.seq}>
                  <Td className="font-mono text-[12px] text-ash">{e.seq}</Td>
                  <Td className="whitespace-nowrap text-[12px] text-ash">{fmtDate(e.ts)}</Td>
                  <Td><Badge tone="neutral">{e.kind.replace(/_/g, ' ')}</Badge></Td>
                  <Td className="text-[13px]">{e.summary}</Td>
                  <Td className="font-mono text-[11.5px] text-ash">{shortHash(e.hash)}</Td>
                  <Td>{e.anchor_id ? <button className="text-[12px] text-frosted" onClick={() => void api(`/api/console/log/${e.seq}/proof`).then(setProof)}>proof</button> : <span className="text-[12px] text-ash">pending</span>}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card>
            <CardHeader title="Anchors" subtitle="Merkle roots over batches of entries" />
            <ul className="divide-y divide-inkline">
              {r.data!.anchors.length === 0 && <li className="px-5 py-4 text-[13px] text-ash">None yet.</li>}
              {r.data!.anchors.map((a) => (
                <li key={a.id} className="px-5 py-3 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="text-mist">#{a.from_seq}–{a.to_seq} ({a.count})</span>
                    <Badge tone={a.status === 'anchored' ? 'ok' : a.status === 'local_only' ? 'neutral' : 'warn'}>{a.status.replace(/_/g, ' ')}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-[11.5px] text-ash">{shortHash(a.root, 10, 6)}</p>
                  {a.url && <a className="text-[12px] text-frosted" href={a.url} target="_blank" rel="noreferrer">{a.topic} #{a.seq} ↗</a>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      <Modal open={Boolean(proof)} onClose={() => setProof(null)} title="Inclusion proof" wide>
        <p className="mb-3 text-[13px] text-ash">leaf = keccak256(&quot;zoro-leaf/1:&quot; + entryHash); fold the proof with sorted-pair keccak256 hashing and compare with the anchor root.</p>
        <CodeBlock code={JSON.stringify(proof, null, 2)} filename="proof.json" />
      </Modal>
    </>
  );
}
