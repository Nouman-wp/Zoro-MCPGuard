'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { Building, Fingerprint, RefreshCw, Snowflake, Users } from 'lucide-react';
import { Badge, Button, Card, CardHeader, CopyButton, EmptyState, ErrorState, Field, LoadingBlock, Notice, PageHeader, Select, Table, Tabs, Td, inputCls } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, timeAgo } from '@/lib/format';

interface InvItem {
  kind: string;
  key: string;
  name: string;
  versions: string[];
  verdicts: string[];
  members: string[];
  devices: number;
  lastSeen: number;
  detail: { tools?: { name: string; verdict: string }[]; knownVulns?: string[] } | null;
}

interface HostOrg {
  id: string;
  name: string;
  created_at: number;
  share_level: 'inventory' | 'events';
  lockdown: { by: string; at: number; reason: string | null } | null;
  members: { id: string; name: string; joinedAt: number; lastSeen: number | null; status: string; humanId: string; devices: { id: string; hostname: string | null; os: string | null; online: boolean; last_seen: number | null }[] }[];
  inventory: { servers: InvItem[]; packages: InvItem[]; skills: InvItem[]; clients: InvItem[] };
  events: { ts: number; type: string; severity: string; summary: string; member: string | null }[];
}

interface Membership {
  server: string;
  orgId: string;
  orgName: string;
  memberId: string;
  deviceId: string;
  name: string;
  joinedAt: number;
  shareLevel: 'inventory' | 'events';
  lastSync: number | null;
  lastError: string | null;
}

interface OrgResponse {
  host: HostOrg[];
  membership: Membership | null;
  worldConfigured: boolean;
}

interface JoinStart {
  orgId: string;
  orgName: string;
  shareLevel: 'inventory' | 'events';
  sealId: string;
  request: { app_id: `app_${string}`; action: string; signal: string; environment: 'staging' | 'production'; rp_context: Record<string, unknown>; testIdentities: boolean };
}

const VERDICT_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = { sealed: 'ok', clean: 'ok', protected: 'ok', sealed_with_warnings: 'warn', warning: 'warn', pending: 'neutral', unknown: 'neutral', unsafe: 'danger', unprotected: 'danger' };

const SHARED_TEXT = {
  inventory: 'which MCP servers, npm/PyPI packages, skills and AI clients you use, with Zoro’s verdict on each',
  events: 'your inventory, plus the titles and severity of your Zoro incidents',
};

/** World ID verification widget for joining (same IDKit flow as the Human Seal). */
function WorldIdJoin({ start, onResult, onCancel }: { start: JoinStart; onResult: (result: unknown) => Promise<void>; onCancel: () => void }) {
  const [Widget, setWidget] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const [preset, setPreset] = useState<((o: { signal?: string }) => unknown) | null>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    void import('@worldcoin/idkit').then((m) => {
      setWidget(() => m.IDKitRequestWidget as unknown as ComponentType<Record<string, unknown>>);
      setPreset(() => m.orbLegacy as (o: { signal?: string }) => unknown);
    });
  }, []);
  const req = start.request;
  return (
    <div className="space-y-3">
      {req.testIdentities && <Notice tone="warn" title="Test identities">World ID {req.environment}: verification uses the World ID Simulator, not production identity assurance.</Notice>}
      <div className="flex gap-2">
        <Button icon={<Fingerprint className="size-4" />} onClick={() => setOpen(true)}>
          Open World ID verification
        </Button>
        <Button variant="subtle" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {Widget && preset && (
        <Widget
          open={open}
          onOpenChange={(o: boolean) => setOpen(o)}
          app_id={req.app_id}
          action={req.action}
          rp_context={req.rp_context}
          environment={req.environment}
          allow_legacy_proofs={true}
          action_description={`Join ${start.orgName} on Zoro`}
          preset={preset({ signal: req.signal })}
          handleVerify={onResult}
          onSuccess={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function MemberSection({ data, reload }: { data: OrgResponse; reload: () => void }) {
  const m = data.membership;
  const [server, setServer] = useState('');
  const [invite, setInvite] = useState('');
  const [name, setName] = useState('');
  const [start, setStart] = useState<JoinStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger' | 'info'; text: string } | null>(null);
  useEffect(() => {
    if (!server && typeof window !== 'undefined') setServer(/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) ? '' : window.location.origin);
  }, [server]);

  if (m)
    return (
      <Card className="mb-6">
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><Building className="size-4" aria-hidden /> {m.orgName}</span>}
          subtitle={`Member as ${m.name} · verified human · joined ${fmtDate(m.joinedAt)}`}
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="subtle" icon={<RefreshCw className="size-3.5" />} onClick={() => void api('/api/console/org/sync', { json: {} }).then(reload)}>Sync now</Button>
              <Button size="sm" variant="danger" onClick={() => void api('/api/console/org/leave', { json: {} }).then(reload)}>Leave</Button>
            </div>
          }
        />
        <div className="space-y-2 p-5 text-[14px] text-mist">
          <p>Your organization sees {SHARED_TEXT[m.shareLevel]}. Your prompts, tool arguments, results and files never leave this machine.</p>
          <p className="text-[13px] text-ash">Server {m.server} · last sync {m.lastSync ? timeAgo(m.lastSync) : 'never'}</p>
          {m.lastError && <Notice tone="danger">Last sync failed: {m.lastError}</Notice>}
        </div>
      </Card>
    );

  const begin = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setStart(await api<JoinStart>('/api/console/org/join/start', { json: { server, invite, name } }));
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const complete = async (result: unknown) => {
    try {
      await api('/api/console/org/join/complete', { json: { sealId: start!.sealId, result } });
      setStart(null);
      setMsg({ tone: 'ok', text: 'Joined. Your inventory syncs every minute.' });
      reload();
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as Error).message });
      throw e;
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader title="Join your organization" subtitle="Prove you are a unique human with World ID. Your organization sees your verified-human ID, not who you are in the real world." />
      <div className="space-y-3 p-5">
        {!start ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Organization server" hint="The Zoro address your manager gave you">
                <input className={inputCls} value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://zoro.example.com" />
              </Field>
              <Field label="Your display name">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya" />
              </Field>
            </div>
            <Field label="Invite code">
              <textarea className={`${inputCls} h-20 py-2 font-mono text-[12px]`} value={invite} onChange={(e) => setInvite(e.target.value)} />
            </Field>
            <Button icon={<Fingerprint className="size-4" />} loading={busy} disabled={!server.trim() || !invite.trim() || !name.trim()} onClick={() => void begin()}>
              Continue to World ID
            </Button>
          </>
        ) : (
          <>
            <Notice tone="info" title={`Joining ${start.orgName}`}>
              The organization will see {SHARED_TEXT[start.shareLevel]}. Per-call activity, prompts, arguments and files stay on this machine.
            </Notice>
            <WorldIdJoin start={start} onResult={complete} onCancel={() => setStart(null)} />
          </>
        )}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </div>
    </Card>
  );
}

function InventoryTable({ items, empty }: { items: InvItem[]; empty: string }) {
  if (!items.length) return <p className="p-5 text-[13.5px] text-ash">{empty}</p>;
  return (
    <Table head={['Name', 'Versions', 'Verdict', 'Used by', 'Devices', 'Last seen']}>
      {items
        .sort((a, b) => b.members.length - a.members.length)
        .map((i) => (
          <tr key={i.key}>
            <Td>
              <p className="font-mono text-[13px] text-quartz">{i.name}</p>
              {i.detail?.tools && <p className="text-[11.5px] text-ash">{i.detail.tools.length} tool(s){i.detail.knownVulns?.length ? ` · known CVEs: ${i.detail.knownVulns.join(', ')}` : ''}</p>}
            </Td>
            <Td className="font-mono text-[12.5px] text-ash">{i.versions.join(', ') || '—'}</Td>
            <Td>
              {i.verdicts.map((v) => (
                <Badge key={v} tone={VERDICT_TONE[v] ?? 'neutral'} className="mr-1">
                  {v.replace(/_/g, ' ')}
                </Badge>
              ))}
            </Td>
            <Td className="text-[13px] text-mist">{i.members.join(', ')}</Td>
            <Td className="text-[13px]">{i.devices}</Td>
            <Td className="whitespace-nowrap text-[12.5px] text-ash">{timeAgo(i.lastSeen)}</Td>
          </tr>
        ))}
    </Table>
  );
}

function HostOrgCard({ o, reload }: { o: HostOrg; reload: () => void }) {
  const [tab, setTab] = useState<'servers' | 'packages' | 'skills' | 'clients' | 'events'>('servers');
  const [invite, setInvite] = useState<{ code: string; server: string; expiresAt: number } | null>(null);
  const online = o.members.reduce((n, m) => n + m.devices.filter((d) => d.online).length, 0);
  return (
    <Card className="mb-6">
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Building className="size-4" aria-hidden /> {o.name}</span>}
        subtitle={`${o.members.filter((m) => m.status === 'active').length} verified member(s) · ${online} device(s) online · created ${fmtDate(o.created_at)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void api<{ code: string; server: string; expiresAt: number }>(`/api/console/org/${o.id}/invite`, { json: { days: 14 } }).then(setInvite)}>Create invite</Button>
            <Button size="sm" variant={o.lockdown ? 'subtle' : 'danger'} icon={<Snowflake className="size-3.5" />} onClick={() => void api(`/api/console/org/${o.id}/lockdown`, { json: { active: !o.lockdown, reason: o.lockdown ? undefined : 'Organization lockdown' } }).then(reload)}>
              {o.lockdown ? 'Lift org lockdown' : 'Freeze all members'}
            </Button>
          </div>
        }
      />
      <div className="space-y-4 p-5">
        {o.lockdown && <Notice tone="danger" title="Organization lockdown">Every member device freezes at its next sync (within a minute). Lifted only from here.</Notice>}
        {invite && (
          <Notice tone="info" title="Invite created (shown once)">
            <p className="mb-2">Send both values to the employee. They join from their own Zoro Console → Organization, and verify with World ID. Expires {fmtDate(invite.expiresAt)}.</p>
            <p className="text-[12px] text-ash">Organization server</p>
            <p className="mb-2 flex items-center gap-2 font-mono text-[12.5px] text-quartz">{invite.server} <CopyButton value={invite.server} /></p>
            <p className="text-[12px] text-ash">Invite code</p>
            <p className="flex items-start gap-2 break-all font-mono text-[11.5px] text-quartz">{invite.code} <CopyButton value={invite.code} /></p>
          </Notice>
        )}
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-mist">
          <span>Members share:</span>
          <Select ariaLabel="Sharing level" value={o.share_level} onChange={(v) => void api(`/api/console/org/${o.id}/share`, { json: { level: v } }).then(reload)} options={[{ value: 'inventory', label: 'Inventory only' }, { value: 'events', label: 'Inventory + incident titles' }]} className="w-60" />
          <span className="text-ash">Per-call activity never leaves a member’s machine.</span>
        </div>
        {o.members.length === 0 ? (
          <EmptyState icon={<Users className="size-5" />} title="No members yet" description="Create an invite and send it to your team. Each person joins from their own Zoro with a World ID proof — one person, one member, whatever AI account or seat they use." />
        ) : (
          <Table head={['Member', 'Verified human ID', 'Devices', 'Last seen', '']}>
            {o.members.map((m) => (
              <tr key={m.id}>
                <Td>
                  <p className="text-[14px] text-quartz">{m.name}</p>
                  <p className="text-[11.5px] text-ash">joined {fmtDate(m.joinedAt)}{m.status !== 'active' ? ` · ${m.status}` : ''}</p>
                </Td>
                <Td className="font-mono text-[12px]"><Badge tone="violet">World ID</Badge> {m.humanId}</Td>
                <Td className="text-[12.5px]">
                  {m.devices.map((d) => (
                    <p key={d.id}>
                      <span className={`mr-1.5 inline-block size-2 rounded-full ${d.online ? 'bg-ok' : 'bg-slate'}`} aria-hidden />
                      {d.hostname ?? d.id} <span className="text-ash">{d.os ?? ''}</span>
                    </p>
                  ))}
                </Td>
                <Td className="whitespace-nowrap text-[12.5px] text-ash">{m.lastSeen ? timeAgo(m.lastSeen) : '—'}</Td>
                <Td>{m.status === 'active' && <Button size="sm" variant="subtle" onClick={() => void api(`/api/console/org/${o.id}/members/${m.id}/revoke`, { json: {} }).then(reload)}>Remove</Button>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      <div className="border-t border-inkline px-5 pt-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'servers', label: 'MCP servers', count: o.inventory.servers.length },
            { id: 'packages', label: 'Packages', count: o.inventory.packages.length },
            { id: 'skills', label: 'Skills', count: o.inventory.skills.length },
            { id: 'clients', label: 'AI clients', count: o.inventory.clients.length },
            { id: 'events', label: 'Incidents', count: o.events.length },
          ]}
        />
      </div>
      {tab === 'servers' && <InventoryTable items={o.inventory.servers} empty="No MCP servers reported yet." />}
      {tab === 'packages' && <InventoryTable items={o.inventory.packages} empty="No packages reported yet." />}
      {tab === 'skills' && <InventoryTable items={o.inventory.skills} empty="No skills reported yet." />}
      {tab === 'clients' && <InventoryTable items={o.inventory.clients} empty="No AI clients reported yet." />}
      {tab === 'events' &&
        (o.share_level !== 'events' ? (
          <p className="p-5 text-[13.5px] text-ash">Members share inventory only. Switch the sharing level to see incident titles.</p>
        ) : !o.events.length ? (
          <p className="p-5 text-[13.5px] text-ash">No incidents reported.</p>
        ) : (
          <Table head={['When', 'Member', 'Severity', 'Incident']}>
            {o.events.map((e, i) => (
              <tr key={i}>
                <Td className="whitespace-nowrap text-[12.5px] text-ash">{timeAgo(e.ts)}</Td>
                <Td className="text-[13px]">{e.member ?? '—'}</Td>
                <Td><Badge tone={e.severity === 'critical' || e.severity === 'high' ? 'danger' : e.severity === 'medium' ? 'warn' : 'neutral'}>{e.severity}</Badge></Td>
                <Td className="text-[13px] text-quartz">{e.summary}</Td>
              </tr>
            ))}
          </Table>
        ))}
    </Card>
  );
}

export default function OrganizationPage() {
  const r = useApi<OrgResponse>('/api/console/org', { on: ['org', 'lockdown'], interval: 30_000 });
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title="Organization"
        description="Everyone on the team runs their own Zoro and joins with World ID. The manager sees which MCP servers, packages, skills and AI clients each verified person uses, and can freeze every member at once."
      />
      {r.loading && !r.data ? (
        <LoadingBlock />
      ) : r.error ? (
        <ErrorState error={r.error} retry={r.reload} />
      ) : (
        <>
          <MemberSection data={r.data!} reload={() => void r.reload()} />
          <h2 className="mb-3 text-[15px] font-medium text-quartz">Organizations you manage</h2>
          {!r.data!.worldConfigured && <Notice tone="warn" className="mb-4">World ID is not configured on this Zoro, so members cannot join it. Set WORLD_APP_ID, WORLD_RP_ID and WORLD_SIGNING_KEY.</Notice>}
          {r.data!.host.map((o) => (
            <HostOrgCard key={o.id} o={o} reload={() => void r.reload()} />
          ))}
          <Card>
            <CardHeader title="Create an organization" subtitle="Run this on the Zoro your team can reach (for example the hosted one). You manage it from this Console." />
            <div className="flex flex-wrap items-end gap-2 p-5">
              <input className={`${inputCls} max-w-sm`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." aria-label="Organization name" />
              <Button disabled={!name.trim()} onClick={() => void api('/api/console/org/create', { json: { name } }).then(() => (setName(''), r.reload())).catch((e) => setError((e as Error).message))}>
                Create
              </Button>
            </div>
            {error && <Notice tone="danger" className="mx-5 mb-5">{error}</Notice>}
          </Card>
        </>
      )}
    </>
  );
}
