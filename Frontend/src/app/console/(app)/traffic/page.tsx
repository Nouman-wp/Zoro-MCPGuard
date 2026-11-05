'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Activity, Pause, Play } from 'lucide-react';
import { Badge, Button, Card, DecisionBadge, EmptyState, ErrorState, LoadingBlock, PageHeader, Select, Table, Td } from '@/components/ui';
import { useApi } from '@/lib/api';
import { ms, outcomeLabel, shortHash, timeAgo } from '@/lib/format';

interface CallRow {
  id: string;
  ts: number;
  agent: string;
  server_id: string;
  server_label: string;
  tool: string;
  fingerprint: string | null;
  decision: string;
  enforced_decision: string;
  outcome: string;
  rule: string | null;
  reason: string;
  observe: number;
  latency_ms: number | null;
  overhead_ms: number | null;
  shield_action: string | null;
  incident_id: string | null;
  approval: { seq: number; status: string } | null;
  flows: unknown[];
}

export default function TrafficPage() {
  const [paused, setPaused] = useState(false);
  const [agent, setAgent] = useState('');
  const [server, setServer] = useState('');
  const [decision, setDecision] = useState('');
  const [since, setSince] = useState('');
  const qs = new URLSearchParams({ ...(agent ? { agent } : {}), ...(server ? { server } : {}), ...(decision ? { decision } : {}), ...(since ? { since: String(Date.now() - Number(since) * 3_600_000) } : {}), limit: '100' });
  const c = useApi<{ items: CallRow[]; facets: { agents: string[]; servers: string[] } }>(`/api/console/calls?${qs}`, { on: paused ? [] : ['call'] });
  const d = c.data;
  return (
    <>
      <PageHeader
        title="Live traffic"
        description="Every tool call through the Gateway. Pausing the view does not stop recording."
        actions={
          <Button variant={paused ? 'primary' : 'subtle'} size="sm" icon={paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />} onClick={() => setPaused(!paused)}>
            {paused ? 'Resume live view' : 'Pause live view'}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select ariaLabel="Agent" value={agent} onChange={setAgent} options={[{ value: '', label: 'All agents' }, ...(d?.facets.agents ?? []).map((a) => ({ value: a, label: a }))]} className="w-48" />
        <Select ariaLabel="Server" value={server} onChange={setServer} options={[{ value: '', label: 'All servers' }, ...(d?.facets.servers ?? []).map((a) => ({ value: a, label: a }))]} className="w-48" />
        <Select ariaLabel="Decision" value={decision} onChange={setDecision} options={[{ value: '', label: 'All decisions' }, { value: 'allow', label: 'Allowed' }, { value: 'ask', label: 'Asked' }, { value: 'block', label: 'Blocked' }]} className="w-44" />
        <Select ariaLabel="Time" value={since} onChange={setSince} options={[{ value: '', label: 'Any time' }, { value: '1', label: 'Last hour' }, { value: '24', label: 'Last 24 hours' }, { value: '168', label: 'Last 7 days' }]} className="w-40" />
        {paused && <Badge tone="warn">Paused — new calls are still recorded</Badge>}
      </div>
      <Card>
        {c.loading && !d ? (
          <LoadingBlock />
        ) : c.error ? (
          <ErrorState error={c.error} retry={c.reload} />
        ) : !d?.items.length ? (
          <EmptyState icon={<Activity className="size-5" />} title="No calls yet" description="Calls appear here as soon as an agent uses a tool through Zoro." />
        ) : (
          <Table head={['Time', 'Agent', 'Tool', 'Version', 'Decision', 'Deciding rule', 'Overhead', 'Latency', 'Shield']}>
            {d.items.map((r) => (
              <tr key={r.id} className="hover:bg-ink/[0.02]">
                <Td className="whitespace-nowrap text-[13px] text-ash">
                  <Link href={`/console/traffic/${r.id}`} className="hover:underline">
                    {timeAgo(r.ts)}
                  </Link>
                </Td>
                <Td className="text-[13px]">{r.agent}</Td>
                <Td>
                  {r.server_id === 'builtin' ? (
                    <span className="font-mono text-[13px] text-quartz">
                      {r.tool} <Badge tone="info" className="ml-1">built-in tool</Badge>
                    </span>
                  ) : (
                    <Link href={`/console/tools/${r.server_id}/tool/${encodeURIComponent(r.tool)}`} className="font-mono text-[13px] text-quartz hover:underline">
                      {r.server_label}/{r.tool}
                    </Link>
                  )}
                </Td>
                <Td className="font-mono text-[12px] text-ash">{shortHash(r.fingerprint)}</Td>
                <Td>
                  <DecisionBadge decision={r.decision} observe={r.observe && r.enforced_decision !== 'allow'} />
                  {r.flows.length > 0 && <Badge tone="warn" className="ml-1">flow</Badge>}
                  {r.outcome !== 'executed' && r.outcome !== 'hook_passthrough' && <p className="mt-0.5 text-[11px] text-ash">{r.outcome === 'hook_decision' ? 'decided by the Claude Code hook' : outcomeLabel(r.outcome, r.approval)}</p>}
                </Td>
                <Td className="font-mono text-[12px]">{r.rule ?? '—'}</Td>
                <Td className="text-[13px]">{ms(r.overhead_ms)}</Td>
                <Td className="text-[13px]">{ms(r.latency_ms)}</Td>
                <Td className="text-[13px]">{r.shield_action && r.shield_action !== 'none' ? r.shield_action : '—'}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
