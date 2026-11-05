'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Server } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, Field, LinkButton, LoadingBlock, Modal, Notice, PageHeader, Select, SeverityBadge, Table, Td, Toggle, inputCls } from '@/components/ui';
import { ModeSelect, type ServerSummary } from '@/components/console/server-bits';
import { api, useApi } from '@/lib/api';
import { timeAgo } from '@/lib/format';

function AddServer({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [transport, setTransport] = useState<'stdio' | 'http'>('stdio');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [env, setEnv] = useState('');
  const [observe, setObserve] = useState(false);
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const envObj = Object.fromEntries(env.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
      await api('/api/console/servers', { json: { name, transport, command, args, url, env: transport === 'stdio' ? envObj : undefined, headers: transport === 'http' ? envObj : undefined, mode: observe ? 'observe' : 'enforce', private: priv } });
      onAdded();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a server" footer={<><Button variant="subtle" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Add and audit</Button></>}>
      <div className="space-y-4">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="filesystem" />
        </Field>
        <Field label="Transport">
          <Select value={transport} onChange={(v) => setTransport(v as 'stdio' | 'http')} options={[{ value: 'stdio', label: 'Local process (stdio)' }, { value: 'http', label: 'Remote (Streamable HTTP)' }]} />
        </Field>
        {transport === 'stdio' ? (
          <>
            <Field label="Command">
              <input className={`${inputCls} font-mono`} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" />
            </Field>
            <Field label="Arguments" hint="Space separated; quote arguments with spaces.">
              <input className={`${inputCls} font-mono`} value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-y @modelcontextprotocol/server-filesystem /path/to/folder" />
            </Field>
          </>
        ) : (
          <Field label="URL">
            <input className={`${inputCls} font-mono`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/mcp" />
          </Field>
        )}
        <Field label={transport === 'stdio' ? 'Environment variables' : 'Headers'} hint="One KEY=value per line. Stored locally; never logged or shown in full.">
          <textarea className={`${inputCls} h-20 py-2 font-mono`} value={env} onChange={(e) => setEnv(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-2">
          <Toggle checked={observe} onChange={setObserve} label="Start in observe mode (records, never blocks)" />
          <Toggle checked={priv} onChange={setPriv} label="Private seals (internal server: nothing published)" />
        </div>
        {observe && <Notice tone="warn">Observe mode gives no protection. Use it only to tune policies on first rollout.</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  );
}

function ServersInner() {
  const params = useSearchParams();
  const [add, setAdd] = useState(params.get('add') === '1');
  useEffect(() => setAdd(params.get('add') === '1'), [params]);
  const s = useApi<ServerSummary[]>('/api/console/servers', { on: ['server', 'tool', 'seal', 'incident'] });
  return (
    <>
      <PageHeader title="Servers" description="Every upstream MCP server Zoro connects to on your behalf." actions={<><LinkButton href="/console/onboarding" variant="ghost">Import from clients</LinkButton><Button icon={<Plus className="size-4" />} onClick={() => setAdd(true)}>Add server</Button></>} />
      <Card>
        {s.loading && !s.data ? (
          <LoadingBlock />
        ) : s.error ? (
          <ErrorState error={s.error} retry={s.reload} />
        ) : !s.data?.length ? (
          <EmptyState icon={<Server className="size-5" />} title="No servers yet" description="Import from your AI clients, or add one by hand." action={<LinkButton href="/console/onboarding">Import from my AI clients</LinkButton>} />
        ) : (
          <Table head={['Server', 'Transport', 'Mode', 'Connection', 'Seal coverage', 'Open issues', 'Last change']}>
            {s.data.map((sv) => (
              <tr key={sv.id} className="hover:bg-ink/[0.02]">
                <Td>
                  <Link href={`/console/servers/${sv.id}`} className="font-medium text-quartz hover:underline">
                    {sv.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-[12px] text-ash">
                    {sv.ensName ?? sv.label}
                    {sv.publisher_verified ? <Badge tone="info">publisher verified</Badge> : null}
                    {sv.unstable ? <Badge tone="warn">unstable manifest</Badge> : null}
                  </div>
                </Td>
                <Td className="text-[13px]">{sv.transport === 'stdio' ? 'local' : sv.transport === 'http' ? 'remote' : 'lab'}</Td>
                <Td>
                  <ModeSelect server={sv} onChanged={s.reload} />
                </Td>
                <Td>
                  <Badge tone={sv.online === 'online' ? 'ok' : sv.online === 'connecting' ? 'info' : sv.mode === 'disabled' ? 'neutral' : 'danger'} dot>
                    {sv.online}
                  </Badge>
                  {sv.last_error && sv.online !== 'online' && <p className="mt-1 max-w-[220px] truncate text-[11px] text-ash" title={sv.last_error}>{sv.last_error}</p>}
                </Td>
                <Td className="text-[13px]">
                  {sv.sealed}/{sv.total} sealed{sv.quarantined ? <span className="text-warn"> · {sv.quarantined} held</span> : null}
                </Td>
                <Td>{sv.highestSeverity ? <SeverityBadge severity={sv.highestSeverity} /> : <span className="text-[13px] text-ash">none</span>}</Td>
                <Td className="text-[13px] text-ash">{timeAgo(sv.last_change_at)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <AddServer open={add} onClose={() => setAdd(false)} onAdded={s.reload} />
    </>
  );
}

export default function ServersPage() {
  return (
    <Suspense>
      <ServersInner />
    </Suspense>
  );
}
