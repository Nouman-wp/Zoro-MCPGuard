'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { FieldDiff, Finding } from '@zoro/core';
import { Badge, Card, CardHeader, ErrorState, LoadingBlock, Notice, PageHeader, VerdictBadge } from '@/components/ui';
import { DiffView, FindingList } from '@/components/security';
import { useApi } from '@/lib/api';
import { shortHash } from '@/lib/format';

function DiffInner() {
  const p = useSearchParams();
  const qs = p.toString();
  const r = useApi<{ fields: FieldDiff[]; findings: Finding[]; summary: string | null; verdict: string | null; changeClass: string | null }>(p.get('b') ? `/api/console/diff?${qs}` : null);
  if (!p.get('b')) return <Notice tone="info">Open the diff viewer from an incident, the quarantine or a tool’s history.</Notice>;
  if (r.loading && !r.data) return <LoadingBlock rows={6} />;
  if (r.error) return <ErrorState error={r.error} retry={r.reload} />;
  if (!r.data) return null;
  return (
    <>
      <PageHeader title="Diff viewer" description={`${p.get('a') ? shortHash(p.get('a')) : 'nothing'} → ${shortHash(p.get('b'))}`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={r.data.verdict} />
        {r.data.changeClass && <Badge tone="neutral">{r.data.changeClass.replace(/_/g, ' ')} change</Badge>}
      </div>
      {r.data.summary && <Notice tone="info" title="What changed" className="mb-4">{r.data.summary}</Notice>}
      <Card>
        <CardHeader title="Field-by-field" subtitle="Findings are anchored to the exact spans they refer to" />
        <div className="p-5">
          <DiffView fields={r.data.fields} findings={r.data.findings} />
        </div>
      </Card>
      <Card className="mt-4">
        <CardHeader title="Findings for the newer version" />
        <div className="p-5">
          <FindingList findings={r.data.findings} />
        </div>
      </Card>
    </>
  );
}

export default function DiffPage() {
  return (
    <Suspense>
      <DiffInner />
    </Suspense>
  );
}
