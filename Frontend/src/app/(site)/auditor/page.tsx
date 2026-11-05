'use client';

import { Badge, Card, CardHeader, CodeBlock, ErrorState, Hash, LoadingBlock, Notice, Stat, Table, Td } from '@/components/ui';
import { PageIntro } from '@/components/site';
import { useApi } from '@/lib/api';
import { fmtDate, ms } from '@/lib/format';

interface CorpusRun {
  id: string;
  ts: number;
  ruleset: string;
  results: {
    layers: string;
    malicious: { total: number; detected: number; items?: { id: string; title: string; category: string; reference: string; verdict: string; detected: boolean }[] };
    clean: { total: number; falseBlocks?: number; falseAlarms?: number; warnings?: number; capturedAt?: string; sources?: { server: string; package: string; version: string | null; command: string }[]; items?: { server: string; name: string; verdict: string; findings: { rule: string; severity: string; title: string }[] }[] } | null;
    outputShield?: { total: number; detected: number };
  };
}

interface AuditorInfo {
  address: string;
  keySource: 'env' | 'generated';
  rulesetVersion: string;
  canonicalizationVersion: string;
  rules: { id: string; category: string; title: string; description: string }[];
  ai: { provider: string; model: string; configs: { id: string; system: string }[]; dualReviewHighImpact: boolean } | null;
  requireAi: boolean;
  sealLifetimeDays: number;
  detonation: string;
  corpus: { deterministic: CorpusRun | null; ai: CorpusRun | null };
  performance: { samples: number; p50: number | null; p95: number | null; max: number | null };
  totals: { audits: number; byVerdict: { verdict: string; n: number }[] };
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—');

export default function AuditorPage() {
  const a = useApi<AuditorInfo>('/api/public/auditor');
  const d = a.data;
  const det = d?.corpus.deterministic?.results;
  const ai = d?.corpus.ai?.results;
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
      <PageIntro eyebrow="About the auditor" a="How Sentinel decides" b="and how well it does" />
      <p className="mt-4 max-w-3xl text-[17px] font-light text-mist">Sentinel combines layers that can only make a verdict stricter. Its deterministic rules are published here and re-runnable by anyone; its measured detection and false-alarm rates come from the latest run against the public test corpus, not from a claim.</p>
      {a.loading && !d ? (
        <LoadingBlock rows={5} />
      ) : a.error ? (
        <ErrorState error={a.error} retry={a.reload} />
      ) : d ? (
        <div className="mt-10 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Malicious corpus detected" value={det ? pct(det.malicious.detected, det.malicious.total) : '—'} hint={det ? `${det.malicious.detected} of ${det.malicious.total} · deterministic layer` : 'not measured yet'} />
            <Stat label="False blocks on real servers" value={det?.clean ? pct(det.clean.falseBlocks ?? 0, det.clean.total) : '—'} hint={det?.clean ? `${det.clean.falseBlocks} of ${det.clean.total} real definitions · ${det.clean.warnings} with warnings` : 'clean corpus not captured (pnpm corpus:capture)'} />
            <Stat label="Output Shield samples caught" value={det?.outputShield ? pct(det.outputShield.detected, det.outputShield.total) : '—'} hint={det?.outputShield ? `${det.outputShield.detected} of ${det.outputShield.total}` : undefined} />
            <Stat label="Gateway overhead (p95, 24h)" value={d.performance.samples ? ms(d.performance.p95) : '—'} hint={d.performance.samples ? `${d.performance.samples} allowed calls measured · p50 ${ms(d.performance.p50)}` : 'no calls in the last 24 hours'} />
          </div>
          <p className="text-[12px] text-ash">Last deterministic measurement: {d.corpus.deterministic ? `${fmtDate(d.corpus.deterministic.ts)} with ${d.corpus.deterministic.ruleset}` : 'never'}. {ai ? `AI layer measured ${fmtDate(d.corpus.ai!.ts)}: ${ai.malicious.detected}/${ai.malicious.total} malicious flagged, ${ai.clean?.falseAlarms ?? 0}/${ai.clean?.total ?? 0} clean flagged.` : 'The AI layer has not been measured on this instance (it costs API usage and runs only on request).'}</p>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Identity and configuration" />
              <div className="space-y-3 p-5 text-[14px]">
                <p>
                  <span className="text-ash">Attestation key </span>
                  <Hash value={d.address} head={8} tail={6} /> {d.keySource === 'generated' && <Badge tone="warn">generated locally</Badge>}
                </p>
                <p>
                  <span className="text-ash">Ruleset </span>
                  <span className="font-mono">{d.rulesetVersion}</span> · <span className="text-ash">Canonicalization </span>
                  <span className="font-mono">{d.canonicalizationVersion}</span>
                </p>
                <p>
                  <span className="text-ash">AI layer </span>
                  {d.ai ? `${d.ai.provider} · ${d.ai.model} · ${d.ai.configs.length} review configuration(s)${d.ai.dualReviewHighImpact ? ' · two must agree for high-impact tools' : ''}` : 'not configured'}
                </p>
                <p>
                  <span className="text-ash">Without the AI layer </span>
                  {d.requireAi ? 'versions without deterministic findings stay pending' : 'development mode: seals record that the AI layer did not run'}
                </p>
                <p>
                  <span className="text-ash">Seal lifetime </span>
                  {d.sealLifetimeDays} days ({Math.round(d.sealLifetimeDays / 2)} for high-impact tools)
                </p>
                <p>
                  <span className="text-ash">Dynamic detonation </span>
                  {d.detonation}
                </p>
                <p>
                  <span className="text-ash">Audits completed </span>
                  {d.totals.audits} ({d.totals.byVerdict.map((v) => `${v.n} ${v.verdict.replace(/_/g, ' ')}`).join(', ') || 'none'})
                </p>
              </div>
            </Card>
            <Card>
              <CardHeader title="Combination rules" />
              <ul className="list-disc space-y-2 py-5 pl-10 pr-5 text-[14px] text-mist">
                <li>Any critical deterministic finding makes the verdict unsafe, regardless of the AI layer.</li>
                <li>A critical or high finding from any layer is unsafe; medium or low findings seal with warnings.</li>
                <li>The AI layer can only add severity. It cannot clear a deterministic finding.</li>
                <li>Unavailable, uncertain, refused or malformed AI output leaves the version pending — never sealed.</li>
                <li>AI findings must quote text that exists in the definition; unverifiable ones are shown at low confidence and never count.</li>
                <li>Text addressed to the auditor is always a critical finding.</li>
              </ul>
            </Card>
          </div>

          <Card>
            <CardHeader title={`Deterministic rules · ${d.rulesetVersion}`} subtitle="Re-runnable by anyone with @zoro/core" />
            <Table head={['Rule', 'Category', 'What it detects']}>
              {d.rules.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap font-mono text-[12px]">{r.id}</Td>
                  <Td>{r.title}</Td>
                  <Td className="text-[13px] text-ash">{r.description}</Td>
                </tr>
              ))}
            </Table>
          </Card>

          {det && (
            <Card>
              <CardHeader title="Malicious corpus" subtitle="Constructed fixtures reproducing publicly documented techniques; each names its source" />
              <Table head={['Sample', 'Category', 'Verdict', 'Reference']}>
                {(det.malicious.items ?? []).map((m) => (
                  <tr key={m.id}>
                    <Td>{m.title}</Td>
                    <Td className="text-[13px]">{m.category.replace(/_/g, ' ')}</Td>
                    <Td>
                      <Badge tone={m.detected ? 'ok' : 'danger'}>{m.detected ? 'caught' : `missed (${m.verdict})`}</Badge>
                    </Td>
                    <Td className="text-[12px] text-ash">{m.reference}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {det?.clean ? (
            <Card>
              <CardHeader title="Clean corpus" subtitle={`Real definitions captured ${fmtDate(det.clean.capturedAt ?? null)} from published servers`} />
              <div className="flex flex-wrap gap-2 px-5 pt-4">
                {(det.clean.sources ?? []).map((s) => (
                  <Badge key={s.server} tone="neutral">
                    {s.package}@{s.version ?? '?'}
                  </Badge>
                ))}
              </div>
              <Table head={['Definition', 'Verdict', 'Notes']} className="mt-2">
                {(det.clean.items ?? []).map((c) => (
                  <tr key={`${c.server}/${c.name}`}>
                    <Td className="font-mono text-[12.5px]">
                      {c.server}/{c.name}
                    </Td>
                    <Td>
                      <Badge tone={c.verdict === 'sealed' ? 'ok' : c.verdict === 'unsafe' ? 'danger' : 'warn'}>{c.verdict.replace(/_/g, ' ')}</Badge>
                    </Td>
                    <Td className="text-[12px] text-ash">{c.findings.map((f) => `${f.rule} ${f.title}`).join('; ') || '—'}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          ) : (
            <Notice tone="info">The clean corpus has not been captured on this instance. Run pnpm corpus:capture to record real definitions from published MCP servers.</Notice>
          )}

          {d.ai && (
            <Card>
              <CardHeader title="AI review configurations" subtitle="The exact system prompts Sentinel uses" />
              <div className="space-y-3 p-5">
                {d.ai.configs.map((c) => (
                  <CodeBlock key={c.id} filename={c.id} code={c.system} language="text" maxHeight={220} />
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
