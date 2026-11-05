'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Select, SeverityBadge, Table, Td } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { timeAgo } from '@/lib/format';

interface IncidentRow {
  id: string;
  seq: number;
  ref: string;
  created_at: number;
  updated_at: number;
  type: string;
  severity: string;
  status: string;
  title: string;
  summary: string;
  tool: string | null;
  count: number;
}

function IncidentsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState('open');
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(severity ? { severity } : {}), ...(type ? { type } : {}) });
  const r = useApi<IncidentRow[]>(`/api/console/incidents?${qs}`, { on: ['incident'] });
  const seq = params.get('seq');
  useEffect(() => {
    if (!seq) return;
    void api<IncidentRow[]>('/api/console/incidents').then((all) => {
      const hit = all.find((i) => String(i.seq) === seq);
      if (hit) router.replace(`/console/incidents/${hit.id}`);
    });
  }, [seq, router]);
  const rows = r.data ?? [];
  const ackable = rows.filter((i) => sel.has(i.id) && i.status === 'open');
  return (
    <>
      <PageHeader title="Incidents" description="Security-relevant events, grouped so that repeated events are one incident." actions={ackable.length > 0 && <Button size="sm" variant="subtle" onClick={() => void api('/api/console/incidents/bulk-ack', { json: { ids: ackable.map((i) => i.id) } }).then(() => (setSel(new Set()), r.reload()))}>Acknowledge {ackable.length}</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select ariaLabel="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'Any status' }, { value: 'open', label: 'Open' }, { value: 'acknowledged', label: 'Acknowledged' }, { value: 'resolved', label: 'Resolved' }, { value: 'dismissed', label: 'Dismissed' }]} className="w-44" />
        <Select ariaLabel="Severity" value={severity} onChange={setSeverity} options={[{ value: '', label: 'Any severity' }, ...['critical', 'high', 'medium', 'low', 'info'].map((s) => ({ value: s, label: s }))]} className="w-44" />
        <Select ariaLabel="Type" value={type} onChange={setType} options={[{ value: '', label: 'Any type' }, ...['blocked_call', 'tool_changed', 'unsafe_verdict', 'revocation', 'data_flow', 'output_shield', 'trust_contradiction', 'bypass_config', 'artifact_changed', 'shadowing', 'drift', 'human_seal_invalid', 'flapping', 'observe_would_block', 'malformed_manifest'].map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))]} className="w-52" />
      </div>
      <Card>
        {r.loading && !r.data ? (
          <LoadingBlock />
        ) : r.error ? (
          <ErrorState error={r.error} retry={r.reload} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="size-5" />} title="No incidents match" description={status === 'open' ? 'Nothing needs your attention right now.' : 'Try another filter.'} />
        ) : (
          <Table head={['', 'Incident', 'Severity', 'Type', 'Status', 'Updated']}>
            {rows.map((i) => (
              <tr key={i.id} className="hover:bg-ink/[0.02]">
                <Td className="w-8">
                  {/* Critical incidents can be acknowledged in bulk but never resolved in bulk. */}
                  <input type="checkbox" aria-label={`Select ${i.ref}`} checked={sel.has(i.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} />
                </Td>
                <Td>
                  <Link href={`/console/incidents/${i.id}`} className="text-[14px] text-quartz hover:underline">
                    {i.title}
                  </Link>
                  <p className="mt-0.5 line-clamp-1 text-[12px] text-ash">
                    {i.ref}
                    {i.count > 1 ? ` · ${i.count} events` : ''} · {i.summary}
                  </p>
                </Td>
                <Td><SeverityBadge severity={i.severity} /></Td>
                <Td className="text-[13px]">{i.type.replace(/_/g, ' ')}</Td>
                <Td><Badge tone={i.status === 'open' ? 'warn' : 'neutral'}>{i.status}</Badge></Td>
                <Td className="whitespace-nowrap text-[13px] text-ash">{timeAgo(i.updated_at)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

export default function IncidentsPage() {
  return (
    <Suspense>
      <IncidentsInner />
    </Suspense>
  );
}
