'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Badge, Button, Card, CardHeader, CodeBlock, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader, Table, Td } from '@/components/ui';
import { HumanSealModal, type SealableApproval } from '@/components/human-seal';
import { api, useApi } from '@/lib/api';
import { fmtDate, shortHash, timeAgo } from '@/lib/format';

interface Approval extends SealableApproval {
  seq: number;
  kind: string;
  status: string;
  outcome: string | null;
  created_at: number;
  decided_at: number | null;
  decided_by: string | null;
  agent: string | null;
  tool: string | null;
  fingerprint: string | null;
  rule: string | null;
  incident_id: string | null;
  action: unknown;
  evidence: { flows?: { sourceTool: string; sourceServer: string; sourceLabel: string; argument: string; matched: string }[]; capabilities?: string[] } | null;
}

const KIND: Record<string, string> = { tool_call: 'Tool call', override: 'Override a block', policy_change: 'Weaken policy', release: 'Release a version', namespace_claim: 'Namespace claim', dispute: 'Open a dispute', danger_zone: 'Danger zone', mode_change: 'Observe mode', artifact_release: 'Accept new code' };
const OUTCOME_TONE: Record<string, 'ok' | 'danger' | 'neutral' | 'warn'> = { executed: 'ok', approved: 'ok', denied: 'danger', cancelled: 'neutral', expired: 'warn', invalid: 'danger' };

export default function ApprovalsPage() {
  const r = useApi<{ pending: Approval[]; history: Approval[]; worldConfigured: boolean; testIdentities: boolean }>('/api/console/approvals', { on: ['approval', 'human_seal'] });
  const [seal, setSeal] = useState<Approval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (a: Approval, decision: 'approve' | 'deny') => {
    setError(null);
    try {
      await api(`/api/console/approvals/${a.id}/decide`, { json: { decision } });
      await r.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const d = r.data;
  return (
    <>
      <PageHeader title="Approvals" description="Actions waiting for a person. Each approval is bound to the exact action and works once." />
      {d && !d.worldConfigured && <Notice tone="warn" title="Human Seal unavailable" className="mb-4">World ID is not configured, so actions that need a Human Seal cannot proceed. You can still deny them.</Notice>}
      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      {r.loading && !d ? (
        <LoadingBlock rows={5} />
      ) : r.error ? (
        <ErrorState error={r.error} retry={r.reload} />
      ) : (
        <>
          {d!.pending.length === 0 ? (
            <Card>
              <EmptyState icon={<ClipboardCheck className="size-5" />} title="Nothing waiting for you" description="When policy needs a person to decide, the request appears here with the exact action and the evidence." />
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {d!.pending.map((a) => (
                <Card key={a.id} highlight={Boolean(a.human_seal)} className="flex flex-col">
                  <div className="flex flex-wrap items-center gap-2 border-b border-inkline px-5 py-3">
                    <Badge tone="warn">{KIND[a.kind] ?? a.kind}</Badge>
                    {a.human_seal ? <Badge tone="violet">Human Seal required</Badge> : null}
                    <span className="ml-auto text-[12px] text-ash">{a.ref} · expires {timeAgo(a.expires_at)}</span>
                  </div>
                  <div className="flex-1 space-y-3 px-5 py-4">
                    <p className="text-[15px] font-medium text-quartz">{a.summary}</p>
                    <p className="text-[14px] text-mist">{a.reason}</p>
                    {a.evidence?.flows?.map((f, i) => (
                      <p key={i} className="rounded-md border border-inkline bg-abyss p-2 text-[13px] text-mist">
                        {f.sourceServer}/{f.sourceTool} ({f.sourceLabel.replace(/_/g, ' ')}) → <span className="font-mono">{f.argument}</span>: <span className="font-mono text-warn">{f.matched.slice(0, 80)}</span>
                      </p>
                    ))}
                    {a.action ? <CodeBlock code={JSON.stringify(a.action, null, 2)} filename="exact action (sensitive values masked)" maxHeight={180} /> : null}
                    <p className="font-mono text-[11.5px] text-ash">digest {shortHash(a.digest, 10, 6)}{a.rule ? ` · rule ${a.rule}` : ''}{(a.approvers_required ?? 1) > 1 ? ` · ${a.approvals_received}/${a.approvers_required} approvers` : ''}</p>
                    {a.incident_id && <Link className="text-[13px] text-frosted" href={`/console/incidents/${a.incident_id}`}>Open incident →</Link>}
                  </div>
                  <div className="flex gap-2 border-t border-inkline px-5 py-3">
                    <Button variant="danger" size="sm" onClick={() => void decide(a, 'deny')}>Deny</Button>
                    {a.human_seal ? <Button size="sm" onClick={() => setSeal(a)}>Approve with Human Seal</Button> : <Button size="sm" variant="ghost" onClick={() => void decide(a, 'approve')}>Approve</Button>}
                  </div>
                </Card>
              ))}
            </div>
          )}
          <Card className="mt-6">
            <CardHeader title="History" subtitle="Every past approval with its outcome" />
            <Table head={['Approval', 'Kind', 'Outcome', 'Decided', 'By']}>
              {d!.history.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <p className="text-[14px] text-quartz">{a.summary}</p>
                    <p className="text-[12px] text-ash">{a.ref} · requested {fmtDate(a.created_at)}</p>
                  </Td>
                  <Td className="text-[13px]">{KIND[a.kind] ?? a.kind}{a.human_seal ? ' · Human Seal' : ''}</Td>
                  <Td><Badge tone={OUTCOME_TONE[a.status] ?? 'neutral'}>{a.outcome ?? a.status}</Badge></Td>
                  <Td className="text-[13px] text-ash">{a.decided_at ? fmtDate(a.decided_at) : '—'}</Td>
                  <Td className="text-[13px] text-ash">{a.decided_by ?? '—'}</Td>
                </tr>
              ))}
              {d!.history.length === 0 && <tr><Td colSpan={5} className="text-ash">No history yet.</Td></tr>}
            </Table>
          </Card>
        </>
      )}
      <HumanSealModal approval={seal} open={Boolean(seal)} onClose={() => setSeal(null)} onDone={() => void r.reload()} />
    </>
  );
}
