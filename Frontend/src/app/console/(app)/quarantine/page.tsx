'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ShieldHalf } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, LinkButton, LoadingBlock, Notice, PageHeader, StateBadge, VerdictBadge } from '@/components/ui';
import { LayerProgress, type LayerState } from '@/components/security';
import { HumanSealModal, type SealableApproval } from '@/components/human-seal';
import { api, useApi } from '@/lib/api';
import { timeAgo } from '@/lib/format';

interface QRow {
  server_id: string;
  kind: string;
  name: string;
  fingerprint: string;
  state: string;
  reason: string | null;
  updated_at: number;
  label: string;
  sname: string;
  audit: { id: string; status: string; layers: LayerState[]; verdict: string | null } | null;
  verdict: string | null;
  changeClass: string | null;
  previousFingerprint: string | null;
  pendingReason: string | null;
  approval: (SealableApproval & { status: string }) | null;
}

const REASON: Record<string, string> = { new: 'new tool', changed: 'changed fingerprint', artifact_changed: 'code changed (artifact)', revoked: 'seal revoked', unsafe: 'unsafe verdict', 'pending verdict': 'verdict pending' };

export default function QuarantinePage() {
  const r = useApi<QRow[]>('/api/console/quarantine', { on: ['tool', 'audit', 'seal', 'approval'] });
  const [seal, setSeal] = useState<SealableApproval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (q: QRow, action: string) => {
    setError(null);
    try {
      const res = await api<{ approval?: SealableApproval & { seq: number } }>(`/api/console/tools/${q.server_id}/${q.kind}/${encodeURIComponent(q.name)}/${action}`, { json: {} });
      if (res.approval) setSeal({ ...res.approval, ref: `APR-${res.approval.seq}` });
      await r.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const release = async (a: SealableApproval) => {
    if (a.human_seal) return setSeal(a);
    await api(`/api/console/approvals/${a.id}/decide`, { json: { decision: 'approve' } }).catch((e) => setError((e as Error).message));
    await r.reload();
  };
  return (
    <>
      <PageHeader title="Quarantine" description="Versions held back from your agents. Their text is never shown to the model until resolved." />
      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      {r.loading && !r.data ? (
        <LoadingBlock rows={4} />
      ) : r.error ? (
        <ErrorState error={r.error} retry={r.reload} />
      ) : !r.data?.length ? (
        <Card>
          <EmptyState icon={<ShieldHalf className="size-5" />} title="Nothing in quarantine" description="New and changed tools land here while Sentinel audits them; most honest updates are sealed and released automatically." />
        </Card>
      ) : (
        <div className="space-y-3">
          {r.data.map((q) => (
            <Card key={`${q.server_id}-${q.kind}-${q.name}`} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/console/tools/${q.server_id}/${q.kind}/${encodeURIComponent(q.name)}`} className="font-mono text-[15px] text-quartz hover:underline">
                  {q.label}/{q.name}
                </Link>
                <StateBadge state={q.state} />
                <VerdictBadge verdict={q.verdict} />
                {q.changeClass && <Badge tone="neutral">{q.changeClass.replace(/_/g, ' ')}</Badge>}
                <span className="ml-auto text-[12px] text-ash">{REASON[q.reason ?? ''] ?? q.reason} · {timeAgo(q.updated_at)}</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
                <div>
                  {q.audit && q.audit.status !== 'done' ? <LayerProgress layers={q.audit.layers} /> : q.pendingReason ? <p className="text-[14px] text-warn">{q.pendingReason}</p> : q.state === 'awaiting_release' ? <p className="text-[14px] text-mist">Sealed. Policy wants a person to release this {q.changeClass?.replace(/_/g, ' ')} change.</p> : q.state === 'blocked' ? <p className="text-[14px] text-danger">Blocked: {q.reason}. Unsafe and revoked versions are never released; a single call can still be overridden with a Human Seal from its incident.</p> : null}
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {q.previousFingerprint && <LinkButton size="sm" variant="ghost" href={`/console/diff?serverId=${q.server_id}&kind=${q.kind}&a=${q.previousFingerprint}&b=${q.fingerprint}`}>View diff</LinkButton>}
                  {q.approval && q.approval.status === 'pending' && <Button size="sm" onClick={() => void release(q.approval!)}>{q.approval.human_seal ? 'Release with Human Seal' : 'Release'}</Button>}
                  {!q.approval && q.state === 'quarantined' && q.verdict !== 'unsafe' && <Button size="sm" variant="ghost" onClick={() => void act(q, 'human-release')}>Release with Human Seal</Button>}
                  {q.state !== 'blocked' && <Button size="sm" variant="subtle" onClick={() => void act(q, 'keep-blocked')}>Keep blocked</Button>}
                  <Button size="sm" variant="subtle" onClick={() => void act(q, 'reaudit')}>Re-audit</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <HumanSealModal approval={seal} open={Boolean(seal)} onClose={() => setSeal(null)} onDone={() => void r.reload()} />
    </>
  );
}
