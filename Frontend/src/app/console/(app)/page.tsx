'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, Inbox } from 'lucide-react';
import { Card, CardHeader, EmptyState, ErrorState, LinkButton, LoadingBlock, PageHeader, Select, Stat, cx } from '@/components/ui';
import { DecisionBars, type DecisionBucket } from '@/components/charts';
import { useApi } from '@/lib/api';
import { timeAgo } from '@/lib/format';

const SEV_DOT: Record<string, string> = { critical: 'bg-danger', high: 'bg-danger', medium: 'bg-warn', low: 'bg-slate', info: 'bg-slate' };

interface Overview {
  hours: number;
  decisions: Record<string, number>;
  series: DecisionBucket[];
  incidents: { id: string; ref: string; severity: string; title: string; updated_at: number; count: number; status: string }[];
  bySeverity: Record<string, number>;
  approvals: { id: string; ref: string; summary: string; reason: string; human_seal: number; expires_at: number }[];
  quarantine: { server_id: string; kind: string; name: string; state: string; reason: string | null; label: string; audit: { status: string } | null }[];
  posture: {
    servers: { id: string; name: string; mode: string; status: string }[];
    toolCount: number;
    quarantined: number;
    coverage: Record<string, number>;
    capabilities: { capability: string; label: string; highImpact: boolean; count: number }[];
    policyProfile: string;
    gaps: string[];
    unprotected: { client: string; server: string }[];
  };
  publicEvents: { topic: string; seq: number; consensus_ts: string; type: string; payload: { tool?: string; server?: string; verdict?: string }; url: string }[];
  clients: { client: string; path: string; routed: number }[];
}

export default function OverviewPage() {
  const [hours, setHours] = useState('24');
  const o = useApi<Overview>(`/api/console/overview?hours=${hours}`, { on: ['call', 'incident', 'approval', 'seal', 'tool', 'server'] });
  const d = o.data;
  if (o.loading && !d) return <LoadingBlock rows={8} />;
  if (o.error && !d) return <ErrorState error={o.error} retry={o.reload} />;
  if (!d) return null;
  const p = d.posture;
  const routed = d.clients.filter((c) => c.routed).length;
  const openIncidents = Object.values(d.bySeverity).reduce((a, b) => a + b, 0);
  const total = (d.decisions.allow ?? 0) + (d.decisions.ask ?? 0) + (d.decisions.block ?? 0);
  const bucketMs = Number(hours) <= 24 ? 3_600_000 : 86_400_000;

  if (p.servers.length === 0)
    return (
      <>
        <PageHeader title="Overview" />
        <Card>
          <EmptyState icon={<Inbox className="size-5" />} title="No servers protected yet" description="Import the MCP servers your AI clients already use, or add one by hand. Zoro audits every tool before your agent can see it." action={<div className="flex gap-2"><LinkButton href="/console/onboarding">Import from my AI clients</LinkButton><LinkButton href="/console/servers?add=1" variant="ghost">Add a server</LinkButton></div>} />
        </Card>
      </>
    );

  const attention = [
    ...d.approvals.map((a) => ({ key: `a-${a.id}`, dot: 'bg-warn', title: a.summary, meta: `${a.ref} · approval${a.human_seal ? ' · Human Seal' : ''} · expires ${timeAgo(a.expires_at)}`, href: '/console/approvals' })),
    ...d.incidents.map((i) => ({ key: `i-${i.id}`, dot: SEV_DOT[i.severity] ?? 'bg-slate', title: i.title, meta: `${i.ref} · ${i.severity} · ${timeAgo(i.updated_at)}${i.count > 1 ? ` · ×${i.count}` : ''}`, href: `/console/incidents/${i.id}` })),
    ...d.quarantine.map((q) => ({ key: `q-${q.server_id}-${q.kind}-${q.name}`, dot: 'bg-warn', title: `${q.label}/${q.name} is held back`, meta: `quarantine · ${(q.reason ?? q.state).replace(/_/g, ' ')}`, href: `/console/tools/${q.server_id}/${q.kind}/${encodeURIComponent(q.name)}` })),
  ];
  const coverage = [
    { label: 'Sealed', n: p.coverage.sealed ?? 0, bar: 'bg-ok' },
    { label: 'With warnings', n: p.coverage.sealed_with_warnings ?? 0, bar: 'bg-warn' },
    { label: 'Pending', n: (p.coverage.pending ?? 0) + (p.coverage.unaudited ?? 0), bar: 'bg-slate' },
    { label: 'Unsafe', n: p.coverage.unsafe ?? 0, bar: 'bg-danger' },
    { label: 'Revoked', n: p.coverage.revoked ?? 0, bar: 'bg-danger/60' },
  ];
  const covered = coverage.reduce((a, c) => a + c.n, 0);

  return (
    <>
      <PageHeader title="Overview" description={`${p.policyProfile.charAt(0).toUpperCase()}${p.policyProfile.slice(1)} policy · computed from this machine’s records`} actions={<Select ariaLabel="Period" value={hours} onChange={setHours} options={[{ value: '24', label: 'Last 24 hours' }, { value: '168', label: 'Last 7 days' }, { value: '720', label: 'Last 30 days' }]} className="w-44" />} />
      <div className="grid gap-px overflow-hidden rounded-[14px] border border-ink/[0.07] bg-ink/[0.07] sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Protected servers" value={p.servers.filter((s) => s.mode === 'enforce').length} hint={`${p.servers.length} total${p.unprotected.length ? ` · ${p.unprotected.length} bypassing Zoro` : ''}`} href="/console/servers" />
        <Stat label="Open incidents" value={openIncidents} tone={(d.bySeverity.critical ?? 0) + (d.bySeverity.high ?? 0) > 0 ? 'danger' : undefined} hint={['critical', 'high', 'medium', 'low', 'info'].filter((s) => d.bySeverity[s]).map((s) => `${d.bySeverity[s]} ${s}`).join(' · ') || 'none open'} href="/console/incidents" />
        <Stat label="Waiting for you" value={d.approvals.length} tone={d.approvals.length ? 'warn' : undefined} hint="pending approvals" href="/console/approvals" />
        <Stat label="Quarantined" value={p.quarantined} tone={p.quarantined ? 'warn' : undefined} hint={`of ${p.toolCount} definitions`} href="/console/quarantine" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Activity" subtitle={`${total} call${total === 1 ? '' : 's'} in this period`} action={<Link href="/console/traffic" className="text-[13px] text-ash transition-colors hover:text-quartz">Live traffic →</Link>} />
          <div className="px-5 pb-5">{total ? <DecisionBars series={d.series} bucketMs={bucketMs} from={Date.now() - Number(hours) * 3_600_000} to={Date.now()} /> : <p className="py-12 text-center text-[14px] text-ash">No calls in this period.</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Needs your attention" subtitle={attention.length ? `${attention.length} item${attention.length === 1 ? '' : 's'}` : undefined} />
          {attention.length ? (
            <ul className="pb-2">
              {attention.slice(0, 7).map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-start gap-3 px-5 py-2.5 transition-colors hover:bg-ink/[0.025]">
                    <span className={cx('mt-[7px] size-2 shrink-0 rounded-full', a.dot)} aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] text-quartz">{a.title}</span>
                      <span className="block truncate text-[12.5px] text-ash">{a.meta}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {attention.length > 7 && <li className="px-5 pt-1 text-[12.5px] text-ash">and {attention.length - 7} more</li>}
            </ul>
          ) : (
            <div className="flex flex-col items-center px-6 pb-10 pt-6 text-center">
              <CheckCircle2 className="size-6 text-ok" aria-hidden />
              <p className="mt-3 text-[15px] text-quartz">All clear</p>
              <p className="mt-1 text-[13px] text-ash">No approvals, open incidents or held-back tools.</p>
            </div>
          )}
        </Card>
      </div>

      <div className={cx('mt-4 grid gap-4', d.publicEvents.length > 0 && 'xl:grid-cols-[1.5fr_1fr]')}>
        <Card>
          <CardHeader title="Your tools" subtitle={`${p.toolCount} live definition${p.toolCount === 1 ? '' : 's'} on ${p.servers.length} server${p.servers.length === 1 ? '' : 's'}`} action={<Link href="/console/servers" className="text-[13px] text-ash transition-colors hover:text-quartz">Servers →</Link>} />
          <div className="grid gap-8 px-5 pb-5 lg:grid-cols-2">
            <div>
              <p className="text-[12.5px] text-ash">Seal coverage</p>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-ink/[0.06]" role="img" aria-label={coverage.map((c) => `${c.label} ${c.n}`).join(', ')}>
                {covered > 0 && coverage.map((c) => c.n > 0 && <span key={c.label} className={cx('h-full', c.bar)} style={{ width: `${(c.n / covered) * 100}%` }} />)}
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                {coverage.map((c) => (
                  <li key={c.label} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-mist">
                      <span className={cx('size-2 rounded-full', c.bar)} aria-hidden />
                      {c.label}
                    </span>
                    <span className="tabular text-quartz">{c.n}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[12.5px] text-ash">What your tools can do</p>
              {p.capabilities.length ? (
                <ul className="mt-3 space-y-2 text-[13px]">
                  {p.capabilities.slice(0, 6).map((c) => (
                    <li key={c.capability} className="flex items-center justify-between gap-3">
                      <span className="truncate text-mist">
                        {c.label}
                        {c.highImpact && <span className="ml-2 text-[12px] text-warn">high impact</span>}
                      </span>
                      <span className="tabular text-quartz">{c.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[13px] text-ash">No capabilities inferred yet.</p>
              )}
              {p.gaps.length > 0 && (
                <ul className="mt-4 space-y-1 text-[13px] text-warn">
                  {p.gaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
        {d.publicEvents.length > 0 && (
          <Card>
            <CardHeader title="Public events" subtitle="From the Hedera registry topic" />
            <ul className="pb-2">
              {d.publicEvents.map((e) => (
                <li key={`${e.topic}-${e.seq}`} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                  <span className={cx('size-2 shrink-0 rounded-full', e.type === 'seal.revoked' ? 'bg-danger' : 'bg-slate')} aria-hidden />
                  <span className="truncate text-mist">
                    {e.type} · {e.payload.server}/{e.payload.tool}
                  </span>
                  <a href={e.url} target="_blank" rel="noreferrer" className="ml-auto font-mono text-[12px] text-ash hover:text-quartz">
                    #{e.seq}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
