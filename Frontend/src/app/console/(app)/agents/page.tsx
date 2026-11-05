'use client';

import { useState } from 'react';
import { Bot } from 'lucide-react';
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

export default function AgentsPage() {
  const r = useApi<Agent[]>('/api/console/agents', { on: ['call'] });
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
