'use client';

import Link from 'next/link';
import { useState } from 'react';
import { GitPullRequestArrow } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, Field, LoadingBlock, PageHeader, Select, inputCls } from '@/components/ui';
import { HumanSealModal, type SealableApproval } from '@/components/human-seal';
import { ChallengeModal } from '@/components/console/challenge';
import { useApi } from '@/lib/api';
import { fmtDate, shortHash } from '@/lib/format';

interface Dispute {
  id: string;
  ref: string;
  created_at: number;
  kind: string;
  fingerprint: string;
  ens_name: string | null;
  submitter: string | null;
  evidence: string;
  status: string;
  outcome: string | null;
  reasoning: string | null;
  ledger_open: { topic: string; sequence: number; url: string } | null;
  ledger_resolve: { topic: string; sequence: number; url: string } | null;
  resolved_at: number | null;
}

export default function DisputesPage() {
  const r = useApi<Dispute[]>('/api/console/disputes', { on: ['approval', 'audit', 'ledger', 'seal'] });
  const [fp, setFp] = useState('');
  const [kind, setKind] = useState<'challenge' | 'appeal'>('challenge');
  const [open, setOpen] = useState(false);
  const [seal, setSeal] = useState<SealableApproval | null>(null);
  return (
    <>
      <PageHeader title="Disputes" description="Challenges to seals and appeals of verdicts. Each is re-reviewed by a different auditor configuration and recorded publicly." />
      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Kind"><Select value={kind} onChange={(v) => setKind(v as 'challenge')} options={[{ value: 'challenge', label: 'Challenge a seal (it is harmful)' }, { value: 'appeal', label: 'Appeal a verdict (it is wrong)' }]} className="w-72" /></Field>
          <Field label="Fingerprint"><input className={`${inputCls} w-[420px] max-w-full font-mono`} value={fp} onChange={(e) => setFp(e.target.value)} placeholder="0x…" /></Field>
          <Button disabled={!/^0x[0-9a-f]{64}$/i.test(fp.trim())} onClick={() => setOpen(true)}>Open {kind}</Button>
        </div>
      </Card>
      {r.loading && !r.data ? <LoadingBlock /> : r.error ? <ErrorState error={r.error} retry={r.reload} /> : !r.data?.length ? (
        <Card><EmptyState icon={<GitPullRequestArrow className="size-5" />} title="No disputes" description="Anyone with evidence can challenge a seal; publishers can appeal a verdict." /></Card>
      ) : (
        <div className="space-y-3">
          {r.data.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-medium">{d.ref}</span>
                <Badge tone="neutral">{d.kind}</Badge>
                <Badge tone={d.status === 'resolved' ? (d.outcome === 'revoked' ? 'danger' : 'ok') : 'warn'}>{d.status.replace(/_/g, ' ')}{d.outcome ? ` · ${d.outcome}` : ''}</Badge>
                <Link href={`/verify?q=${d.fingerprint}`} className="font-mono text-[12px] text-frosted">{d.ens_name ?? shortHash(d.fingerprint)}</Link>
                <span className="ml-auto text-[12px] text-ash">{fmtDate(d.created_at)}{d.submitter ? ` · by ${d.submitter}` : ''}</span>
              </div>
              <p className="mt-3 text-[14px] text-mist">{d.evidence}</p>
              {d.reasoning && <p className="mt-2 rounded-md border border-inkline bg-abyss p-3 text-[13px] text-mist">Outcome reasoning: {d.reasoning}</p>}
              <div className="mt-2 flex gap-3 text-[12px]">
                {d.ledger_open && <a className="text-frosted" href={d.ledger_open.url} target="_blank" rel="noreferrer">opened on ledger #{d.ledger_open.sequence} ↗</a>}
                {d.ledger_resolve && <a className="text-frosted" href={d.ledger_resolve.url} target="_blank" rel="noreferrer">resolved on ledger #{d.ledger_resolve.sequence} ↗</a>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <ChallengeModal open={open} onClose={() => setOpen(false)} fingerprint={fp.trim()} kind={kind} onOpened={(a) => (setOpen(false), setSeal(a))} />
      <HumanSealModal approval={seal} open={Boolean(seal)} onClose={() => setSeal(null)} onDone={() => void r.reload()} />
    </>
  );
}
