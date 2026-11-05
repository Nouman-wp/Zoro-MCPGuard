'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { CAPABILITY_LABELS, type Capability } from '@zoro/core';
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, Notice, Select, Table, Td, VerdictBadge, inputCls } from '@/components/ui';
import { CapabilityChips, PublicationBadges } from '@/components/security';
import { PageIntro } from '@/components/site';
import { useApi } from '@/lib/api';
import { shortHash, timeAgo } from '@/lib/format';

interface RegistryItem {
  fingerprint: string;
  name: string;
  server_label: string;
  verdict: string;
  status: string;
  risk: number;
  audited_at: number;
  ens_name: string | null;
  ens_status: string | null;
  ledger_status: string | null;
  badge_status: string | null;
  capabilities: string[];
  findings: number;
  publisherVerified: boolean;
  contested: boolean;
  disputes: number;
  lab: number;
  links: { ens: string | null; ensTx: string | null; ledger: string | null; badge: string | null };
}

export default function RegistryPage() {
  const [q, setQ] = useState('');
  const [verdict, setVerdict] = useState('');
  const [cap, setCap] = useState('');
  const [verified, setVerified] = useState(false);
  const [recent, setRecent] = useState(false);
  const [lab, setLab] = useState(false);
  const params = new URLSearchParams({ ...(q ? { q } : {}), ...(verdict ? { verdict } : {}), ...(cap ? { capability: cap } : {}), ...(verified ? { verified: '1' } : {}), ...(recent ? { recent: '1' } : {}), ...(lab ? { lab: '1' } : {}) });
  const reg = useApi<{ registryConfigured: boolean; ledgerConfigured: boolean; root: string | null; network: string; total: number; items: RegistryItem[] }>(`/api/public/registry?${params}`, { on: ['seal', 'ledger'], scope: 'lab' });
  const feed = useApi<{ ledgerConfigured: boolean; events: { topic: string; seq: number; consensus_ts: string; type: string; payload: { server?: string; tool?: string; verdict?: string }; url: string }[] }>(`/api/public/feed?limit=12${lab ? '&lab=1' : ''}`, { on: ['ledger'], scope: 'lab' });
  const d = reg.data;
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
      <PageIntro eyebrow="Registry Explorer" a="Every version" b="this auditor has judged" />
      <p className="mt-3 max-w-2xl text-[16px] font-light text-mist">
        {d?.registryConfigured ? `Published under ${d.root} on ENSv2 ${d.network}.` : 'This instance has no ENSv2 registry configured: verdicts below are local records and are marked as not published.'}{' '}
        {d?.ledgerConfigured ? 'Each verdict is anchored on the Hedera ledger.' : 'The Hedera ledger is not configured.'}
      </p>

      <div className="mt-8 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools, servers, fingerprints, ENS names" className={`${inputCls} pl-9`} aria-label="Search the registry" />
        </label>
        <Select ariaLabel="Verdict" value={verdict} onChange={setVerdict} options={[{ value: '', label: 'Any verdict' }, { value: 'sealed', label: 'Sealed' }, { value: 'sealed_with_warnings', label: 'Sealed with warnings' }, { value: 'unsafe', label: 'Unsafe' }, { value: 'pending', label: 'Pending' }, { value: 'revoked', label: 'Revoked' }]} className="md:w-52" />
        <Select ariaLabel="Capability" value={cap} onChange={setCap} options={[{ value: '', label: 'Any capability' }, ...Object.entries(CAPABILITY_LABELS).map(([k, v]) => ({ value: k, label: v }))]} className="md:w-56" />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[14px] text-mist">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Publisher-verified only
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={recent} onChange={(e) => setRecent(e.target.checked)} /> Changed in the last 7 days
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={lab} onChange={(e) => setLab(e.target.checked)} /> Show Attack Lab records instead
        </label>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          {reg.loading && !d ? (
            <LoadingBlock />
          ) : reg.error ? (
            <ErrorState error={reg.error} retry={reg.reload} />
          ) : !d?.items.length ? (
            <EmptyState title={d?.total ? 'No versions match these filters' : 'No verdicts yet'} description={d?.total ? 'Try clearing a filter.' : 'Verdicts appear here once Sentinel audits a tool — connect a server in the Console, submit a release in the Publisher Portal, or run a scenario in the Attack Lab.'} />
          ) : (
            <Table head={['Tool', 'Verdict', 'Capabilities', 'Public record', 'Audited']}>
              {d.items.map((it) => (
                <tr key={it.fingerprint} className="hover:bg-ink/[0.02]">
                  <Td>
                    <Link href={`/registry/${it.server_label}/${encodeURIComponent(it.name)}${it.lab ? '?lab=1' : ''}`} className="font-medium text-quartz hover:underline">
                      {it.server_label}/{it.name}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11.5px] text-ash">
                      {shortHash(it.fingerprint)}
                      {it.publisherVerified && <Badge tone="info">publisher verified</Badge>}
                      {it.contested && <Badge tone="warn">contested</Badge>}
                      {it.disputes > 0 && <Badge tone="warn">{it.disputes} dispute(s)</Badge>}
                      {it.lab ? <Badge tone="violet">lab</Badge> : null}
                    </div>
                  </Td>
                  <Td>
                    <VerdictBadge verdict={it.verdict} status={it.status} />
                    <div className="mt-1 text-[12px] text-ash">risk {it.risk} · {it.findings} finding(s)</div>
                  </Td>
                  <Td>
                    <CapabilityChips capabilities={it.capabilities.slice(0, 3) as Capability[]} />
                  </Td>
                  <Td>
                    <PublicationBadges seal={it} />
                  </Td>
                  <Td className="whitespace-nowrap text-[13px] text-ash">{timeAgo(it.audited_at)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card>
          <div className="border-b border-inkline px-4 py-3">
            <p className="text-[14px] font-medium">Live ledger feed</p>
            <p className="text-[12px] text-ash">New verdicts and revocations from Hedera</p>
          </div>
          {!feed.data?.ledgerConfigured ? (
            <div className="p-4">
              <Notice tone="info">No public ledger is configured on this instance.</Notice>
            </div>
          ) : feed.data.events.length === 0 ? (
            <p className="p-4 text-[13px] text-ash">No ledger events yet.</p>
          ) : (
            <ul className="divide-y divide-inkline">
              {feed.data.events.map((e) => (
                <li key={`${e.topic}-${e.seq}`} className="px-4 py-3 text-[13px]">
                  <div className="flex items-center gap-2">
                    <Badge tone={e.type === 'seal.revoked' || e.payload.verdict === 'unsafe' ? 'danger' : e.payload.verdict === 'sealed' ? 'ok' : 'neutral'}>{e.type}</Badge>
                    <span className="truncate text-mist">{e.payload.server ? `${e.payload.server}/${e.payload.tool}` : ''}</span>
                  </div>
                  <a href={e.url} target="_blank" rel="noreferrer" className="mt-1 block font-mono text-[11.5px] text-frosted">
                    #{e.seq} · {timeAgo(e.consensus_ts)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
