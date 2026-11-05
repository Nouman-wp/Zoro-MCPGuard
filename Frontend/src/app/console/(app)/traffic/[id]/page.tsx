'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { Badge, Button, Card, CardHeader, CodeBlock, DecisionBadge, ErrorState, Hash, KV, LoadingBlock, Notice, PageHeader, SeverityBadge, Table, Td } from '@/components/ui';
import { Revealed } from '@/components/security';
import { api, useApi } from '@/lib/api';
import { fmtDate, ms } from '@/lib/format';

interface CallDetail {
  id: string;
  ts: number;
  session_id: string;
  agent: string;
  client: string | null;
  server_id: string;
  server_label: string;
  tool: string;
  exposed_name: string;
  fingerprint: string | null;
  decision: string;
  enforced_decision: string;
  outcome: string;
  rule: string | null;
  reason: string;
  reason_category: string;
  observe: number;
  latency_ms: number | null;
  overhead_ms: number | null;
  args_masked: Record<string, unknown>;
  result_summary: string | null;
  result_size: number | null;
  is_error: number;
  shield_action: string | null;
  shield_findings: { kind: string; severity: string; label: string; text: string }[];
  flows: { sourceCallId: string; sourceTool: string; sourceServer: string; sourceLabel: string; sinkTypes: string[]; matched: string; matchKind: string; argument: string }[];
  source_label: string | null;
  trace: { step: number; ruleId: string; ruleType: string; outcome: string; detail: string }[];
  incident: { id: string; seq: number; title: string; severity: string } | null;
  approval: { id: string; seq: number; status: string; outcome: string | null } | null;
}

export default function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const c = useApi<CallDetail>(`/api/console/calls/${id}`);
  const [revealed, setRevealed] = useState<Record<string, unknown> | null>(null);
  if (c.loading && !c.data) return <LoadingBlock rows={6} />;
  if (c.error && !c.data) return <ErrorState error={c.error} retry={c.reload} />;
  if (!c.data) return null;
  const d = c.data;
  return (
    <>
      <PageHeader eyebrow={<Link href="/console/traffic">Live traffic</Link>} title={<span className="font-mono">{d.server_label}/{d.tool}</span>} description={`${fmtDate(d.ts)} · ${d.agent}${d.client ? ` via ${d.client}` : ''}`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DecisionBadge decision={d.decision} observe={d.observe} />
        {d.observe && d.enforced_decision !== 'allow' ? <Badge tone="warn">would have {d.enforced_decision === 'block' ? 'blocked' : 'asked'}</Badge> : null}
        <Badge tone="neutral">outcome: {d.outcome.replace(/_/g, ' ')}</Badge>
        {d.incident && (
          <Link href={`/console/incidents/${d.incident.id}`}>
            <Badge tone="danger">INC-{d.incident.seq}</Badge>
          </Link>
        )}
        {d.approval && (
          <Link href="/console/approvals">
            <Badge tone="warn">APR-{d.approval.seq} · {d.approval.status}</Badge>
          </Link>
        )}
      </div>
      <Notice tone={d.decision === 'allow' ? 'ok' : d.decision === 'ask' ? 'warn' : 'danger'} title="Why" className="mb-4">
        {d.reason}
      </Notice>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Call" />
          <div className="p-5">
            <KV
              items={[
                ['Agent', d.agent],
                ['Session', <Hash key="s" value={d.session_id} />],
                ['Name the agent used', <span key="n" className="font-mono">{d.exposed_name}</span>],
                ['Version', <Hash key="f" value={d.fingerprint} />],
                ['Deciding rule', d.rule ?? 'none'],
                ['Verification overhead', ms(d.overhead_ms)],
                ['Upstream latency', ms(d.latency_ms)],
                ['Result size', d.result_size !== null ? `${d.result_size} bytes` : '—'],
                ['Data-flow label', d.source_label?.replace(/_/g, ' ') ?? '—'],
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Arguments" subtitle="Sensitive values are masked by default; secret-named values are never stored" action={!revealed ? <Button size="sm" variant="subtle" onClick={() => void api<{ args: Record<string, unknown> }>(`/api/console/calls/${id}/reveal`, { json: {} }).then((r) => setRevealed(r.args))}>Reveal</Button> : undefined} />
          <div className="p-5">
            <CodeBlock code={JSON.stringify(revealed ?? d.args_masked, null, 2)} filename={revealed ? 'arguments (revealed)' : 'arguments (masked)'} maxHeight={260} />
            {d.result_summary && (
              <div className="mt-3">
                <p className="mb-1 text-[12px] uppercase tracking-wider text-ash">Result summary (untrusted tool output)</p>
                <p className="rounded-md border border-inkline bg-abyss p-3 font-mono text-[12.5px] text-mist">
                  <Revealed text={d.result_summary} />
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="Policy evaluation trace" subtitle="Every rule evaluated, in order; the strictest outcome wins" />
        <Table head={['#', 'Rule', 'Type', 'Outcome', 'Detail']}>
          {d.trace.map((t) => (
            <tr key={t.step}>
              <Td className="text-[12px] text-ash">{t.step}</Td>
              <Td className="font-mono text-[12px]">{t.ruleId}</Td>
              <Td className="text-[13px]">{t.ruleType.replace(/_/g, ' ')}</Td>
              <Td>{t.outcome === 'skip' ? <Badge tone="neutral">n/a</Badge> : <DecisionBadge decision={t.outcome} />}</Td>
              <Td className="text-[13px]">{t.detail}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      {d.flows.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Data flow" subtitle="Content from an earlier call appeared in this call’s arguments" />
          <ul className="divide-y divide-inkline">
            {d.flows.map((f, i) => (
              <li key={i} className="px-5 py-3 text-[14px] text-mist">
                <Link href={`/console/traffic/${f.sourceCallId}`} className="text-quartz hover:underline">{f.sourceServer}/{f.sourceTool}</Link> ({f.sourceLabel.replace(/_/g, ' ')}) → argument <span className="font-mono">{f.argument}</span> of a {f.sinkTypes.join(' / ').replace(/_/g, ' ')} call · {f.matchKind} match: <span className="font-mono text-warn">{f.matched.slice(0, 80)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {d.shield_findings.length > 0 && (
        <Card className="mt-4">
          <CardHeader title={`Output Shield: ${d.shield_action}`} subtitle="What was found in the tool’s result before it reached the model" />
          <ul className="divide-y divide-inkline">
            {d.shield_findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 px-5 py-3 text-[14px]">
                <SeverityBadge severity={f.severity} /> <span className="text-mist">{f.label}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
