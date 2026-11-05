'use client';

import Link from 'next/link';
import { Waypoints } from 'lucide-react';
import { Badge, Card, CardHeader, DecisionBadge, EmptyState, ErrorState, LinkButton, LoadingBlock, PageHeader, Table, Td } from '@/components/ui';
import { Revealed } from '@/components/security';
import { useApi } from '@/lib/api';
import { outcomeLabel, timeAgo } from '@/lib/format';

interface FlowsResponse {
  items: { id: string; ts: number; agent: string; server_label: string; tool: string; decision: string; outcome: string; approval_id: string | null; approval: { seq: number; status: string } | null; incident_id: string | null; flows: { sourceCallId: string; sourceTool: string; sourceServer: string; sourceLabel: string; sinkTypes: string[]; matched: string; matchKind: string; argument: string }[]; sources: ({ id: string; ts: number; server_label: string; tool: string; result_summary: string | null } | null)[] }[];
  summary: { source: string; sink: string; count: number; asked: number; blocked: number }[];
}

export default function FlowsPage() {
  const r = useApi<FlowsResponse>('/api/console/flows', { on: ['call'] });
  return (
    <>
      <PageHeader title="Data flows" description="Content returned by one tool that showed up in the arguments of another — the pattern behind cross-server exfiltration." actions={<LinkButton href="/console/policies" size="sm" variant="ghost">Tune data-flow rules</LinkButton>} />
      {r.loading && !r.data ? (
        <LoadingBlock />
      ) : r.error ? (
        <ErrorState error={r.error} retry={r.reload} />
      ) : !r.data?.items.length ? (
        <Card>
          <EmptyState icon={<Waypoints className="size-5" />} title="No flows observed" description="Zoro labels untrusted and private sources, then watches for their content reaching sinks such as email, network or payments. Detected flows appear here." />
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <CardHeader title="Source → sink summary" />
            <Table head={['Source', 'Sink', 'Times', 'Asked', 'Blocked']}>
              {r.data.summary.map((s) => (
                <tr key={`${s.source}->${s.sink}`}>
                  <Td className="font-mono text-[13px]">{s.source}</Td>
                  <Td className="font-mono text-[13px]">{s.sink}</Td>
                  <Td>{s.count}</Td>
                  <Td>{s.asked}</Td>
                  <Td>{s.blocked}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          <div className="space-y-3">
            {r.data.items.map((it) => (
              <Card key={it.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <DecisionBadge decision={it.decision} />
                  <span className="text-[14px] text-quartz">{it.agent} → {it.server_label}/{it.tool}</span>
                  <span className="text-[12px] text-ash">{timeAgo(it.ts)} · {outcomeLabel(it.outcome, it.approval)}</span>
                  <Link href={`/console/traffic/${it.id}`} className="ml-auto text-[13px] text-frosted">Call record →</Link>
                </div>
                <ol className="mt-3 space-y-2">
                  {it.flows.map((f, i) => (
                    <li key={i} className="rounded-[10px] border border-inkline bg-abyss p-3 text-[13px] text-mist">
                      <Badge tone="warn">{f.sourceLabel.replace(/_/g, ' ')}</Badge> <span className="text-quartz">{f.sourceServer}/{f.sourceTool}</span> → argument <span className="font-mono">{f.argument}</span> ({f.matchKind} match: <span className="font-mono text-warn">{f.matched.slice(0, 80)}</span>)
                      {it.sources[i]?.result_summary && (
                        <p className="mt-2 font-mono text-[12px] text-ash">
                          source output (untrusted): <Revealed text={it.sources[i]!.result_summary!.slice(0, 220)} />
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
