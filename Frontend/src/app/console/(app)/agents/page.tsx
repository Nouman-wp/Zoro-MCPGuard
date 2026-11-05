'use client';

import { useState } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, LoadingBlock, Modal, Notice, PageHeader, Table, Td, inputCls } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, timeAgo } from '@/lib/format';

interface Agent {
  id: string;
  name: string;
  client: string | null;
  first_seen: number;
  last_seen: number;
  ens_name: string | null;
  declaration: { allowedTools?: string[] } | null;
  tools: { server_label: string; tool: string; n: number; last: number }[];
  decisions: Record<string, number>;
  incidents: number;
}

interface Powers {
  agents: { agent: string; lab: boolean; powers: { capability: string; label: string; state: 'approved' | 'pending'; baseline: boolean; firstSeen: number; approvedAt: number | null }[]; gainedSinceApproval: { capability: string; label: string; state: string; firstSeen: number; approvedAt: number | null }[] }[];
}

export default function AgentsPage() {
  const r = useApi<Agent[]>('/api/console/agents', { on: ['call'] });
  const powers = useApi<Powers>('/api/console/powers', { on: ['power', 'approval', 'call'] });
  const powersOf = (id: string) => powers.data?.agents.find((p) => p.agent === id);
  const [edit, setEdit] = useState<Agent | null>(null);
  const [tools, setTools] = useState('');
  return (
    <>
      <PageHeader title="Agents" description="Every client that has called a tool through Zoro, what it uses, and what it is allowed to use." />
      {r.loading && !r.data ? (
        <LoadingBlock />
      ) : r.error ? (
        <ErrorState error={r.error} retry={r.reload} />
      ) : !r.data?.length ? (
        <Card>
          <EmptyState icon={<Bot className="size-5" />} title="No agents yet" description="Agents appear here when a client connects to the Zoro gateway and calls a tool. They are identified by the client name they send." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {r.data.map((a) => (
            <Card key={a.id}>
              <CardHeader
                title={a.name}
                subtitle={`${a.client ? `client ${a.client} · ` : ''}first seen ${fmtDate(a.first_seen)} · last active ${timeAgo(a.last_seen)}`}
                action={<Button size="sm" variant="subtle" onClick={() => { setEdit(a); setTools((a.declaration?.allowedTools ?? a.tools.map((t) => `${t.server_label}/${t.tool}`)).join('\n')); }}>{a.declaration ? 'Edit declaration' : 'Declare allowed tools'}</Button>}
              />
              <div className="space-y-3 p-5">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="ok">{a.decisions.allow ?? 0} allowed</Badge>
                  <Badge tone="warn">{a.decisions.ask ?? 0} asked</Badge>
                  <Badge tone="danger">{a.decisions.block ?? 0} blocked</Badge>
                  <Badge tone="neutral">{a.incidents} incident(s)</Badge>
                  {a.declaration && <Badge tone="info">declaration enforced · {a.declaration.allowedTools?.length ?? 0} tools</Badge>}
                </div>
                {(() => {
                  const p = powersOf(a.id);
                  if (!p) return null;
                  return (
                    <div className="rounded-[10px] border border-inkline bg-deep-sea p-3">
                      <p className="flex items-center gap-2 text-[12px] uppercase tracking-wider text-ash"><Sparkles className="size-3.5" aria-hidden /> Abilities</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.powers.filter((x) => x.baseline).map((x) => <Badge key={x.capability} tone="neutral">{x.label}</Badge>)}
                      </div>
                      {p.gainedSinceApproval.length > 0 ? (
                        <div className="mt-3">
                          <p className="text-[13px] text-quartz">Capabilities gained since last approval</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {p.gainedSinceApproval.map((x) => (
                              <Badge key={x.capability} tone={x.state === 'pending' ? 'warn' : 'ok'}>
                                {x.label} · {x.state === 'pending' ? `pending since ${timeAgo(x.firstSeen)}` : `approved ${x.approvedAt ? timeAgo(x.approvedAt) : ''}`}
                              </Badge>
                            ))}
                          </div>
                          {p.gainedSinceApproval.some((x) => x.state === 'pending') && <p className="mt-1.5 text-[12.5px] text-ash">The first use of a pending ability goes through Approvals (World ID for money).</p>}
                        </div>
                      ) : (
                        <p className="mt-2 text-[12.5px] text-ash">No new abilities since its first approval.</p>
                      )}
                    </div>
                  );
                })()}
                <Table head={['Tool', 'Calls', 'Last']}>
                  {a.tools.map((t) => (
                    <tr key={`${t.server_label}/${t.tool}`}>
                      <Td className="font-mono text-[13px]">
                        {t.server_label}/{t.tool}
                        {a.declaration?.allowedTools && !a.declaration.allowedTools.includes(`${t.server_label}/${t.tool}`) && <Badge tone="danger" className="ml-2">not declared</Badge>}
                      </Td>
                      <Td className="text-[13px]">{t.n}</Td>
                      <Td className="text-[13px] text-ash">{timeAgo(t.last)}</Td>
                    </tr>
                  ))}
                </Table>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={`Tools ${edit?.name} may use`} footer={<><Button variant="subtle" onClick={() => void api(`/api/console/agents/${encodeURIComponent(edit!.id)}/declaration`, { method: 'PUT', json: { allowedTools: null } }).then(() => (setEdit(null), r.reload()))}>Remove declaration</Button><Button onClick={() => void api(`/api/console/agents/${encodeURIComponent(edit!.id)}/declaration`, { method: 'PUT', json: { allowedTools: tools.split('\n').map((s) => s.trim()).filter(Boolean) } }).then(() => (setEdit(null), r.reload()))}>Save and enforce</Button></>}>
        <Notice tone="info">Zoro enforces the declaration for this agent: any tool not listed is blocked. The public declaration and the enforcement always match.</Notice>
        <Field label="One server/tool per line">
          <textarea className={`${inputCls} mt-3 h-48 py-2 font-mono text-[13px]`} value={tools} onChange={(e) => setTools(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
