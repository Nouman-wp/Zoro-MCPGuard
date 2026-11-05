'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { diffDefinitions, type VerdictPackage } from '@zoro/core';
import { Badge, Button, Card, CardHeader, CodeBlock, DecisionBadge, ErrorState, Field, LinkButton, LoadingBlock, Modal, Notice, PageHeader, SeverityBadge, inputCls } from '@/components/ui';
import { CapabilityChips, DiffView, FindingList, PublicationBadges } from '@/components/security';
import { HumanSealModal, type SealableApproval } from '@/components/human-seal';
import { ChallengeModal } from '@/components/console/challenge';
import { api, useApi } from '@/lib/api';
import { fmtDate, shortHash, timeAgo } from '@/lib/format';

interface IncidentDetail {
  incident: { id: string; ref: string; seq: number; type: string; severity: string; status: string; title: string; summary: string; server_id: string | null; tool: string | null; fingerprint: string | null; count: number; resolution: string | null; created_at: number; updated_at: number; lab: number; evidence: Record<string, unknown> & { overridable?: boolean; flows?: { sourceTool: string; sourceServer: string; sourceLabel: string; sinkTypes: string[]; matched: string; argument: string; sourceCallId: string }[]; findings?: { label: string; severity: string }[]; detail?: unknown; rejected?: unknown } };
  events: { id: number; ts: number; kind: string; message: string }[];
  verdict: VerdictPackage | null;
  diff: { serverId: string | null; kind: string; a: string | null; b: string } | null;
  seal: (Record<string, unknown> & { ens_status: string | null; ledger_status: string | null; badge_status: string | null; links: { ens: string | null; ledger: string | null } }) | null;
  calls: { id: string; ts: number; agent: string; decision: string; outcome: string; reason: string }[];
  approvals: (SealableApproval & { status: string; kind: string; outcome: string | null })[];
  server: { id: string; name: string; label: string; mode: string } | null;
  exposure: { calls: { id: string; ts: number; agent: string; tool: string; args_masked: unknown }[]; guidance: string[]; note: string } | null;
}

export default function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const r = useApi<IncidentDetail>(`/api/console/incidents/${id}`, { on: ['incident', 'approval', 'audit', 'seal'] });
  const diff = useApi<{ a: Record<string, unknown> | null; b: Record<string, unknown> }>(r.data?.diff?.b ? `/api/console/diff?serverId=${r.data.diff.serverId ?? ''}&kind=${r.data.diff.kind}&a=${r.data.diff.a ?? ''}&b=${r.data.diff.b}` : null);
  const [seal, setSeal] = useState<SealableApproval | null>(null);
  const [dismiss, setDismiss] = useState(false);
  const [challenge, setChallenge] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (r.loading && !r.data) return <LoadingBlock rows={8} />;
  if (r.error && !r.data) return <ErrorState error={r.error} retry={r.reload} />;
  if (!r.data) return null;
  const d = r.data;
  const inc = d.incident;
  const setStatus = async (status: string, n?: string) => {
    setError(null);
    try {
      await api(`/api/console/incidents/${id}/status`, { json: { status, note: n } });
      await r.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const override = async () => {
    setError(null);
    try {
      const a = await api<SealableApproval & { seq: number }>(`/api/console/incidents/${id}/override`, { json: {} });
      setSeal({ ...a, ref: `APR-${a.seq}` });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const pending = d.approvals.find((a) => a.status === 'pending');
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/console/incidents">Incidents · {inc.ref}</Link>}
        title={inc.title}
        actions={
          <>
            <LinkButton size="sm" variant="ghost" href={`/api/console/reports/incident?id=${id}&format=md`} external>Export report</LinkButton>
            {inc.status === 'open' && <Button size="sm" variant="subtle" onClick={() => void setStatus('acknowledged')}>Acknowledge</Button>}
            {inc.status !== 'resolved' && <Button size="sm" variant="subtle" onClick={() => void setStatus('resolved', 'Kept blocked; resolved from the Console')}>Keep blocked & resolve</Button>}
            {inc.status !== 'dismissed' && <Button size="sm" variant="subtle" onClick={() => setDismiss(true)}>Dismiss…</Button>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={inc.severity} />
        <Badge tone={inc.status === 'open' ? 'warn' : 'neutral'}>{inc.status}</Badge>
        <Badge tone="neutral">{inc.type.replace(/_/g, ' ')}</Badge>
        {inc.count > 1 && <Badge tone="neutral">{inc.count} events grouped</Badge>}
        {inc.lab ? <Badge tone="violet">Attack Lab</Badge> : null}
        <span className="text-[13px] text-ash">opened {fmtDate(inc.created_at)}</span>
      </div>
      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      <Notice tone={inc.severity === 'critical' || inc.severity === 'high' ? 'danger' : 'info'} title="What happened" className="mb-4">
        {inc.summary}
        {inc.resolution && <p className="mt-1 text-ash">Resolution: {inc.resolution}</p>}
      </Notice>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {d.diff?.b && diff.data && (
            <Card>
              <CardHeader title={d.diff.a ? 'What changed' : 'The definition'} subtitle={`${d.diff.a ? `${shortHash(d.diff.a)} → ` : ''}${shortHash(d.diff.b)} · the new text was never shown to the agent`} action={<LinkButton size="sm" variant="ghost" href={`/console/diff?serverId=${d.diff.serverId ?? ''}&kind=${d.diff.kind}&a=${d.diff.a ?? ''}&b=${d.diff.b}`}>Open diff viewer</LinkButton>} />
              <div className="p-5">
                <DiffView fields={diffDefinitions(diff.data.a as never, diff.data.b as never)} findings={d.verdict?.findings ?? []} />
              </div>
            </Card>
          )}
          {d.verdict && (
            <Card>
              <CardHeader title={`Sentinel verdict: ${d.verdict.verdict.replace(/_/g, ' ')}`} subtitle={`risk ${d.verdict.riskScore} · ${d.verdict.changeClass.replace(/_/g, ' ')} change · audited ${timeAgo(d.verdict.auditedAt)}`} />
              <div className="space-y-4 p-5">
                {d.verdict.aiSummary && <p className="text-[14px] font-light text-mist">{d.verdict.aiSummary}</p>}
                <CapabilityChips capabilities={d.verdict.capabilityProfile.map((c) => c.capability)} />
                <FindingList findings={d.verdict.findings} />
              </div>
            </Card>
          )}
          {inc.evidence.flows && inc.evidence.flows.length > 0 && (
            <Card>
              <CardHeader title="Data-flow chain" subtitle="Where the content came from, and where it was about to go" />
              <ol className="space-y-2 p-5 text-[14px]">
                {inc.evidence.flows.map((f, i) => (
                  <li key={i} className="rounded-[10px] border border-inkline bg-abyss p-3 text-mist">
                    <Link href={`/console/traffic/${f.sourceCallId}`} className="text-quartz hover:underline">{f.sourceServer}/{f.sourceTool}</Link> <Badge tone="warn">{f.sourceLabel.replace(/_/g, ' ')}</Badge> → argument <span className="font-mono">{f.argument}</span> → {f.sinkTypes.join(' / ').replace(/_/g, ' ')}
                    <p className="mt-1 font-mono text-[12px] text-warn">matched: {f.matched.slice(0, 120)}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
          {d.exposure && (
            <Card>
              <CardHeader title={`Exposure report · ${d.exposure.calls.length} call(s) while trusted`} subtitle={d.exposure.note} action={inc.fingerprint && <LinkButton size="sm" variant="ghost" href={`/api/console/reports/exposure?fingerprint=${inc.fingerprint}&format=md`} external>Export</LinkButton>} />
              <div className="space-y-3 p-5">
                <ul className="list-disc space-y-1 pl-5 text-[14px] text-quartz">
                  {d.exposure.guidance.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
                <ul className="divide-y divide-inkline rounded-[10px] border border-inkline">
                  {d.exposure.calls.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                      <Link href={`/console/traffic/${c.id}`} className="text-mist hover:underline">{fmtDate(c.ts)} · {c.agent} → {c.tool}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}
          {Boolean(inc.evidence.detail || inc.evidence.rejected || inc.evidence.findings) && <CodeBlock code={JSON.stringify(inc.evidence.detail ?? inc.evidence.rejected ?? inc.evidence.findings, null, 2)} filename="evidence" maxHeight={260} />}
        </div>

        <div className="space-y-4">
          <Card highlight>
            <CardHeader title="What you can do" subtitle="The protective choice is the default" />
            <div className="flex flex-col gap-2 p-5">
              <Button variant="primary" onClick={() => void setStatus('resolved', 'Kept blocked; resolved from the Console')}>Keep blocked</Button>
              {inc.evidence.overridable && !pending && <Button variant="ghost" onClick={() => void override()}>Override this one call with a Human Seal</Button>}
              {pending && <Button variant="ghost" onClick={() => setSeal(pending)}>Continue {pending.ref} (Human Seal)</Button>}
              {d.server && d.server.mode !== 'disabled' && <Button variant="subtle" onClick={() => void api(`/api/console/incidents/${id}/disable-server`, { json: {} }).then(r.reload)}>Disable {d.server.name}</Button>}
              {inc.fingerprint && d.verdict && ['sealed', 'sealed_with_warnings'].includes(d.verdict.verdict) && <Button variant="subtle" onClick={() => setChallenge(true)}>Challenge this seal on the public registry</Button>}
              {inc.fingerprint && <LinkButton variant="link" href={`/verify?q=${inc.fingerprint}`}>Verify the public record →</LinkButton>}
            </div>
          </Card>
          {d.seal && (
            <Card>
              <CardHeader title="Public record" />
              <div className="p-5">
                <PublicationBadges seal={d.seal} />
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Timeline" />
            <ol className="space-y-3 p-5">
              {d.events.map((e) => (
                <li key={e.id} className="border-l border-sapphire pl-3">
                  <p className="text-[12px] text-ash">{fmtDate(e.ts)} · {e.kind.replace(/_/g, ' ')}</p>
                  <p className="text-[13px] text-mist">{e.message}</p>
                </li>
              ))}
            </ol>
          </Card>
          {d.calls.length > 0 && (
            <Card>
              <CardHeader title="Calls in this incident" />
              <ul className="divide-y divide-inkline">
                {d.calls.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-[13px]">
                    <Link href={`/console/traffic/${c.id}`} className="text-mist hover:underline">{timeAgo(c.ts)} · {c.agent}</Link>
                    <DecisionBadge decision={c.decision} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {d.approvals.length > 0 && (
            <Card>
              <CardHeader title="Approvals" />
              <ul className="divide-y divide-inkline">
                {d.approvals.map((a) => (
                  <li key={a.id} className="px-5 py-2.5 text-[13px] text-mist">
                    {a.ref} · {a.kind.replace(/_/g, ' ')} · <Badge tone={a.status === 'executed' || a.status === 'approved' ? 'ok' : a.status === 'pending' ? 'warn' : 'neutral'}>{a.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Modal open={dismiss} onClose={() => setDismiss(false)} title="Dismiss incident" footer={<><Button variant="subtle" onClick={() => setDismiss(false)}>Cancel</Button><Button disabled={!note.trim()} onClick={() => void setStatus('dismissed', note).then(() => setDismiss(false))}>Dismiss</Button></>}>
        <Field label="Why is this not a problem? (required, recorded in the audit log)">
          <textarea className={`${inputCls} h-24 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>
      <ChallengeModal open={challenge} onClose={() => setChallenge(false)} fingerprint={inc.fingerprint} onOpened={(a) => (setChallenge(false), setSeal(a))} />
      <HumanSealModal approval={seal} open={Boolean(seal)} onClose={() => setSeal(null)} onDone={() => void r.reload()} />
    </>
  );
}

