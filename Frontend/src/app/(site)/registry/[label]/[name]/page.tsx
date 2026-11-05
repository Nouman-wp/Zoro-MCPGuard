'use client';

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { diffDefinitions, type Definition, type VerdictPackage } from '@zoro/core';
import { Badge, Card, CardHeader, ErrorState, Eyebrow, LinkButton, LoadingBlock, Notice, VerdictBadge } from '@/components/ui';
import { CapabilityChips, DefinitionView, DiffView, FindingList } from '@/components/security';
import { useApi } from '@/lib/api';
import { fmtDate, shortHash } from '@/lib/format';

interface DossierVersion {
  fingerprint: string;
  verdict: string;
  status: string;
  risk: number;
  change_class: string;
  audited_at: number;
  ens_name: string | null;
  ledger_topic: string | null;
  ledger_seq: number | null;
  revoke_reason: string | null;
  package: VerdictPackage | null;
  definition: Definition | null;
}

interface Dossier {
  title: string;
  generatedAt: string;
  body: { label: string; name: string; versions: DossierVersion[]; disputes: { id: string; seq: number; kind: string; status: string; outcome: string | null; reasoning: string | null }[]; ledger: { topic: string; seq: number; consensus_ts: string; type: string }[]; auditor: string };
}

export default function DossierPage({ params }: { params: Promise<{ label: string; name: string }> }) {
  const { label, name } = use(params);
  const d = useApi<Dossier>(`/api/public/dossier/${label}/${name}`);
  const versions = useMemo(() => [...(d.data?.body.versions ?? [])].reverse(), [d.data]);
  const [selected, setSelected] = useState<string | null>(null);
  const current = versions.find((v) => v.fingerprint === selected) ?? versions[0];
  const idx = current ? versions.indexOf(current) : -1;
  const prev = idx >= 0 ? versions[idx + 1] : undefined;
  const fields = current?.definition ? diffDefinitions(prev?.definition ?? null, current.definition) : [];
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
      <Link href="/registry" className="text-[13px] text-frosted hover:text-quartz">
        ← Registry
      </Link>
      <Eyebrow className="mt-4">Tool dossier</Eyebrow>
      <h1 className="font-display mt-2 break-all text-[36px] font-medium leading-tight md:text-[44px]">
        {label}/{decodeURIComponent(name)}
      </h1>
      {d.loading && !d.data ? (
        <LoadingBlock />
      ) : d.error ? (
        <ErrorState error={d.error} retry={d.reload} />
      ) : !versions.length ? (
        <Notice tone="info" className="mt-6">
          No version of this tool has been audited by this registry.
        </Notice>
      ) : (
        <div className="mt-8 grid gap-4 lg:grid-cols-[300px_1fr]">
          <Card>
            <CardHeader title="Every version seen" subtitle={`${versions.length} version(s)`} />
            <ol className="divide-y divide-inkline">
              {versions.map((v) => (
                <li key={v.fingerprint}>
                  <button onClick={() => setSelected(v.fingerprint)} className={`w-full px-4 py-3 text-left hover:bg-ink/[0.02] ${v === current ? 'bg-ink/[0.03]' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] text-mist">{shortHash(v.fingerprint)}</span>
                      <VerdictBadge verdict={v.verdict} status={v.status} />
                    </div>
                    <p className="mt-1 text-[12px] text-ash">
                      {fmtDate(v.audited_at)} · {v.change_class?.replace(/_/g, ' ')}
                    </p>
                  </button>
                </li>
              ))}
            </ol>
          </Card>
          {current && (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <VerdictBadge verdict={current.verdict} status={current.status} />
                  <Badge tone="neutral">risk {current.risk}</Badge>
                  {current.package?.serverIdentity.declaredVersion && <Badge tone="neutral">server v{current.package.serverIdentity.declaredVersion}</Badge>}
                  <span className="ml-auto">
                    <LinkButton href={`/verify?q=${current.fingerprint}`} size="sm" variant="ghost">
                      Verify independently
                    </LinkButton>
                  </span>
                </div>
                {current.revoke_reason && <Notice tone="danger" title="Revoked" className="mt-3">{current.revoke_reason}</Notice>}
                {current.package?.aiSummary && <p className="mt-3 text-[14px] font-light text-mist">{current.package.aiSummary}</p>}
                <div className="mt-3">
                  <CapabilityChips capabilities={current.package?.capabilityProfile.map((c) => c.capability) ?? []} />
                </div>
                <p className="mt-3 break-all font-mono text-[12px] text-ash">{current.fingerprint}</p>
                {current.ens_name && <p className="mt-1 font-mono text-[12px] text-ash">{current.ens_name}</p>}
              </Card>
              <Card>
                <CardHeader title={prev ? 'Changes from the previous version' : 'Definition (first version seen)'} />
                <div className="p-5">{prev ? <DiffView fields={fields} findings={current.package?.findings ?? []} /> : <DefinitionView definition={current.definition as Record<string, unknown> | null} />}</div>
              </Card>
              <Card>
                <CardHeader title="Findings" subtitle="Every finding points to the exact text it is based on" />
                <div className="p-5">
                  <FindingList findings={current.package?.findings ?? []} />
                </div>
              </Card>
              {d.data!.body.disputes.length > 0 && (
                <Card>
                  <CardHeader title="Disputes" />
                  <ul className="divide-y divide-inkline">
                    {d.data!.body.disputes.map((x) => (
                      <li key={x.id} className="px-5 py-3 text-[14px]">
                        DSP-{x.seq} · {x.kind} · {x.status}
                        {x.outcome ? ` · ${x.outcome}` : ''}
                        {x.reasoning && <p className="mt-1 text-[13px] text-ash">{x.reasoning}</p>}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
