'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { diffDefinitions, type VerdictPackage } from '@zoro/core';
import { Badge, Button, Card, CardHeader, DecisionBadge, ErrorState, Field, Hash, KV, LinkButton, LoadingBlock, Modal, Notice, PageHeader, Select, StateBadge, Table, Tabs, Td, VerdictBadge, inputCls } from '@/components/ui';
import { CapabilityChips, DefinitionView, DiffView, FindingList, LayerProgress, PublicationBadges, type LayerState } from '@/components/security';
import { HumanSealModal, type SealableApproval } from '@/components/human-seal';
import { api, useApi } from '@/lib/api';
import { fmtDate, ms, timeAgo } from '@/lib/format';

interface ToolDetail {
  server: { id: string; name: string; label: string; transport: string; lab: number };
  live: { fingerprint: string; exposed_fingerprint: string | null; state: string; reason: string | null };
  state: string;
  registry: string;
  definition: Record<string, unknown> | null;
  sealedDefinition: Record<string, unknown> | null;
  seal: (Record<string, unknown> & { verdict: string; status: string; ens_name: string | null; ens_status: string | null; ledger_status: string | null; badge_status: string | null; ens_check: { ok: boolean | null; mismatches?: string[]; error?: string } | null; links: { ens: string | null; ensTx: string | null; ledger: string | null; badge: string | null }; expires_at: number; signature: string; auditor: string; verdict_hash: string }) | null;
  package: VerdictPackage | null;
  auditId: string | null;
  versions: { fingerprint: string; first_seen: number; verdict: string | null; changeClass: string | null; risk: number | null; status: string | null; summary: string | null }[];
  calls: { id: string; ts: number; agent: string; decision: string; outcome: string; rule: string | null; reason: string; latency_ms: number | null; overhead_ms: number | null; shield_action: string | null }[];
  policy: { id: string; type: string; enabled: boolean; reading: string }[];
  baseline: { n: number; mean_size: number; m2_size: number; mean_latency: number; m2_latency: number; errors: number } | null;
  remoteNotice: boolean;
}

type Tab = 'definition' | 'seal' | 'history' | 'calls' | 'policy' | 'behavior';

export default function ToolPage({ params }: { params: Promise<{ serverId: string; kind: string; name: string }> }) {
  const { serverId, kind, name: rawName } = use(params);
  const name = decodeURIComponent(rawName);
  const base = `/api/console/tools/${serverId}/${kind}/${encodeURIComponent(name)}`;
  const t = useApi<ToolDetail>(base, { on: ['tool', 'seal', 'audit', 'call'] });
  const [tab, setTab] = useState<Tab>('definition');
  const audit = useApi<{ status: string; layers: LayerState[] }>(t.data?.auditId ? `/api/console/audits/${t.data.auditId}` : null, { on: ['audit'] });
  const [seal, setSeal] = useState<SealableApproval | null>(null);
  const [revoke, setRevoke] = useState(false);
  const [reason, setReason] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (t.data && !b) {
      setB(t.data.versions[0]?.fingerprint ?? '');
      setA(t.data.versions[1]?.fingerprint ?? '');
    }
  }, [t.data, b]);
  if (t.loading && !t.data) return <LoadingBlock rows={6} />;
  if (t.error && !t.data) return <ErrorState error={t.error} retry={t.reload} />;
  if (!t.data) return null;
  const d = t.data;
  const pkg = d.package;
  const verA = d.versions.find((v) => v.fingerprint === a);
  const action = async (path: string, body: unknown = {}) => {
    setMsg(null);
    try {
      const r = await api<{ approval?: SealableApproval & { ref: string }; auditId?: string }>(`${base}/${path}`, { json: body });
      if (r.approval) setSeal(r.approval);
      if (r.auditId) setMsg('Re-audit queued.');
      await t.reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const held = d.live.state !== 'released';

  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/console/servers/${serverId}`}>{d.server.name}</Link>}
        title={<span className="font-mono">{name}</span>}
        description={`${kind.replace('_', ' ')} · gateway state ${d.state.replace(/_/g, ' ')} · registry ${d.registry.replace(/_/g, ' ')}`}
        actions={
          <>
            <LinkButton href={`/verify?q=${d.live.fingerprint}`} variant="ghost" size="sm">Verify independently</LinkButton>
            <Button variant="subtle" size="sm" onClick={() => void action('reaudit')}>Re-audit</Button>
            {held && d.seal?.verdict !== 'unsafe' && d.seal?.status !== 'revoked' && <Button size="sm" onClick={() => void action('human-release')}>Release with Human Seal</Button>}
            {held && <Button variant="subtle" size="sm" onClick={() => void action('keep-blocked')}>Keep blocked</Button>}
            {d.seal && d.seal.status !== 'revoked' && <Button variant="danger" size="sm" onClick={() => setRevoke(true)}>Revoke seal</Button>}
          </>
        }
      />
      {msg && <Notice tone="info" className="mb-4">{msg}</Notice>}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StateBadge state={d.live.state} />
        <VerdictBadge verdict={d.seal?.verdict} status={d.seal?.status} />
        {pkg && <Badge tone="neutral">risk {pkg.riskScore}</Badge>}
        {pkg && <Badge tone="neutral">{pkg.changeClass.replace(/_/g, ' ')} change</Badge>}
        {d.server.lab ? <Badge tone="violet">Attack Lab</Badge> : null}
        {d.live.reason && <span className="text-[13px] text-ash">— {d.live.reason}</span>}
      </div>
      {d.seal?.ens_check?.ok === false && <Notice tone="danger" title="Trust-chain contradiction" className="mb-4">Registry records disagree with the local verdict ({d.seal.ens_check.mismatches?.join(', ')}). Zoro treats this version as not sealed.</Notice>}
      {pkg?.pendingReason && <Notice tone="warn" title="Pending" className="mb-4">{pkg.pendingReason}</Notice>}
      {audit.data && audit.data.status !== 'done' && (
        <Card className="mb-4 p-5">
          <p className="mb-3 text-[14px] font-medium">Audit in progress</p>
          <LayerProgress layers={audit.data.layers} />
        </Card>
      )}
      <Card>
        <Tabs className="px-3" tabs={[{ id: 'definition', label: 'Definition' }, { id: 'seal', label: 'Seal and proofs' }, { id: 'history', label: 'History', count: d.versions.length }, { id: 'calls', label: 'Calls', count: d.calls.length }, { id: 'policy', label: 'Policy' }, { id: 'behavior', label: 'Behavior' }]} value={tab} onChange={setTab} />
        <div className="p-5">
          {tab === 'definition' && (
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-[13px] text-ash">{d.sealedDefinition ? 'Sealed definition (what agents see)' : 'No sealed version is exposed to agents'}</p>
                {d.sealedDefinition ? <DefinitionView definition={d.sealedDefinition} /> : <Notice tone="warn">This {kind.replace('_', ' ')} is held back. Agents cannot see or call it.</Notice>}
              </div>
              {d.live.fingerprint !== d.live.exposed_fingerprint && (
                <div>
                  <p className="mb-2 text-[13px] text-ash">Live definition from the server (not shown to agents)</p>
                  <DefinitionView definition={d.definition} />
                </div>
              )}
            </div>
          )}
          {tab === 'seal' && (
            <div className="space-y-5">
              {!pkg ? (
                <p className="text-[14px] text-ash">No verdict yet.</p>
              ) : (
                <>
                  <KV
                    items={[
                      ['Fingerprint', <Hash key="f" value={pkg.fingerprint} head={10} tail={8} />],
                      ['ENS name', d.seal?.ens_name ?? 'registry not configured'],
                      ['Public records', d.seal ? <PublicationBadges key="p" seal={d.seal} /> : '—'],
                      ['Audited', fmtDate(pkg.auditedAt)],
                      ['Expires', fmtDate(pkg.expiresAt)],
                      ['Auditor', <Hash key="a" value={pkg.attestation?.auditor} head={8} tail={6} />],
                      ['Verdict hash', <Hash key="h" value={pkg.attestation?.verdictHash} head={10} tail={6} />],
                      ['Ruleset', `${pkg.auditorConfig.rulesetVersion} · ${pkg.canonicalizationVersion}`],
                      ['AI review', pkg.auditorConfig.ai ? pkg.auditorConfig.ai.configs.map((c) => `${c.id} (${c.model})`).join(', ') : 'did not run'],
                      ['Capabilities', <CapabilityChips key="c" capabilities={pkg.capabilityProfile.map((c) => c.capability)} />],
                    ]}
                  />
                  {pkg.aiSummary && <Notice tone="info" title="Sentinel summary">{pkg.aiSummary}</Notice>}
                  <div>
                    <p className="mb-2 text-[14px] font-medium">Risk factors</p>
                    <ul className="space-y-1 text-[13px] text-mist">
                      {pkg.riskFactors.map((f) => (
                        <li key={f.label}>+{f.points} · {f.label}</li>
                      ))}
                      {pkg.riskFactors.length === 0 && <li className="text-ash">None.</li>}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-[14px] font-medium">Findings</p>
                    <FindingList findings={pkg.findings} />
                  </div>
                </>
              )}
            </div>
          )}
          {tab === 'history' && (
            <div className="space-y-5">
              <Table head={['First seen', 'Fingerprint', 'Change', 'Verdict', 'Risk']}>
                {d.versions.map((v) => (
                  <tr key={v.fingerprint}>
                    <Td className="text-[13px] text-ash">{fmtDate(v.first_seen)}</Td>
                    <Td><Hash value={v.fingerprint} /></Td>
                    <Td className="text-[13px]">{v.changeClass?.replace(/_/g, ' ') ?? '—'}</Td>
                    <Td><VerdictBadge verdict={v.verdict} status={v.status} /></Td>
                    <Td className="text-[13px]">{v.risk ?? '—'}</Td>
                  </tr>
                ))}
              </Table>
              {d.versions.length > 1 && (
                <div>
                  <div className="mb-3 flex flex-wrap items-end gap-3">
                    <Field label="Compare">
                      <Select value={a} onChange={setA} options={d.versions.map((v) => ({ value: v.fingerprint, label: `${v.fingerprint.slice(0, 10)}… (${fmtDate(v.first_seen)})` }))} className="w-80" />
                    </Field>
                    <Field label="with">
                      <Select value={b} onChange={setB} options={d.versions.map((v) => ({ value: v.fingerprint, label: `${v.fingerprint.slice(0, 10)}… (${fmtDate(v.first_seen)})` }))} className="w-80" />
                    </Field>
                    <LinkButton size="sm" variant="ghost" href={`/console/diff?serverId=${serverId}&kind=${kind}&a=${a}&b=${b}`}>Open in diff viewer</LinkButton>
                  </div>
                  <DiffCompare serverId={serverId} kind={kind} a={verA ? a : ''} b={b} />
                </div>
              )}
            </div>
          )}
          {tab === 'calls' && (
            <Table head={['When', 'Agent', 'Decision', 'Rule', 'Overhead', 'Latency', 'Shield']}>
              {d.calls.map((c) => (
                <tr key={c.id}>
                  <Td className="text-[13px] text-ash"><Link href={`/console/traffic/${c.id}`} className="hover:underline">{timeAgo(c.ts)}</Link></Td>
                  <Td className="text-[13px]">{c.agent}</Td>
                  <Td><DecisionBadge decision={c.decision} /></Td>
                  <Td className="font-mono text-[12px]">{c.rule ?? '—'}</Td>
                  <Td className="text-[13px]">{ms(c.overhead_ms)}</Td>
                  <Td className="text-[13px]">{ms(c.latency_ms)}</Td>
                  <Td className="text-[13px]">{c.shield_action && c.shield_action !== 'none' ? c.shield_action : '—'}</Td>
                </tr>
              ))}
              {d.calls.length === 0 && <tr><Td colSpan={7} className="text-ash">No calls yet.</Td></tr>}
            </Table>
          )}
          {tab === 'policy' && (
            <ul className="space-y-2">
              {d.policy.map((r) => (
                <li key={r.id} className="text-[14px]">
                  <span className="font-mono text-[12px] text-ash">{r.id}</span> <span className="text-mist">{r.reading}</span>
                </li>
              ))}
              <li><Link href={`/console/policies?tool=${encodeURIComponent(name)}&server=${d.server.label}`} className="text-[13px] text-frosted">Add a rule for this tool →</Link></li>
            </ul>
          )}
          {tab === 'behavior' && (
            <div className="text-[14px] text-mist">
              {d.baseline ? (
                <KV
                  items={[
                    ['Calls observed', d.baseline.n],
                    ['Result size', `${Math.round(d.baseline.mean_size)} bytes ± ${Math.round(Math.sqrt(d.baseline.m2_size / Math.max(1, d.baseline.n - 1)))}`],
                    ['Upstream latency', `${ms(d.baseline.mean_latency)} ± ${ms(Math.sqrt(d.baseline.m2_latency / Math.max(1, d.baseline.n - 1)))}`],
                    ['Errors', d.baseline.errors],
                  ]}
                />
              ) : (
                <p className="text-ash">No baseline yet. Zoro learns typical result size and latency from allowed calls; significant drift raises an informational incident and never blocks on its own.</p>
              )}
            </div>
          )}
        </div>
      </Card>
      {d.remoteNotice && <Notice tone="info" className="mt-4">Remote server: its code can change without any change to this definition. Zoro’s seal covers what the server says, not what its code does.</Notice>}
      <Modal open={revoke} onClose={() => setRevoke(false)} title="Revoke this seal" footer={<><Button variant="subtle" onClick={() => setRevoke(false)}>Cancel</Button><Button variant="danger" disabled={!reason.trim()} onClick={() => void action('revoke', { reason }).then(() => setRevoke(false))}>Revoke</Button></>}>
        <p className="text-[14px] text-mist">Every gateway will block this version, the badge is burned, and an exposure report of past calls is generated locally. Revocations are public and permanent.</p>
        <Field label="Reason (published)">
          <textarea className={`${inputCls} mt-2 h-24 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
      <HumanSealModal approval={seal} open={Boolean(seal)} onClose={() => setSeal(null)} onDone={() => void t.reload()} />
    </>
  );
}

function DiffCompare({ serverId, kind, a, b }: { serverId: string; kind: string; a: string; b: string }) {
  const r = useApi<{ a: Record<string, unknown> | null; b: Record<string, unknown>; findings: VerdictPackage['findings'] }>(b ? `/api/console/diff?serverId=${serverId}&kind=${kind}&a=${a}&b=${b}` : null);
  if (!r.data) return null;
  return <DiffView fields={diffDefinitions(r.data.a as never, r.data.b as never)} findings={r.data.findings} />;
}
