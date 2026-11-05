'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, CodeBlock, Field, LinkButton, Notice, PageHeader, Select, inputCls } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';

interface Envelope {
  kind: string;
  title: string;
  generatedAt: string;
  timeRange: { from: string | null; to: string | null };
  sources: string[];
  howToVerify: string[];
  body: unknown;
}

const REPORTS = [
  { id: 'posture', title: 'Posture report', audience: 'You, your security lead', needs: [] as string[], desc: 'Protected servers and tools, seal coverage, warnings, capability inventory, policy profile and gaps.' },
  { id: 'evidence', title: 'Audit evidence pack', audience: 'Compliance, external auditors', needs: ['range'], desc: 'All decisions and approvals in a date range, with inclusion proofs against anchored commitments and a chain check.' },
  { id: 'incident', title: 'Incident report', audience: 'Post-incident review', needs: ['id'], desc: 'One incident end to end: timeline, evidence, decisions, approvals, outcome.' },
  { id: 'exposure', title: 'Exposure report', audience: 'You, your security lead', needs: ['fingerprint'], desc: 'Calls made to a revoked version while it was trusted, with guidance. Generated locally.' },
  { id: 'dossier', title: 'Tool dossier', audience: 'Anyone', needs: ['label', 'name'], desc: 'One tool’s full history: every version, diff, verdict, dispute and attestation.' },
];

export default function ReportsPage() {
  const [kind, setKind] = useState('posture');
  const [days, setDays] = useState('30');
  const [id, setId] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [report, setReport] = useState<Envelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const def = REPORTS.find((r) => r.id === kind)!;
  const qs = new URLSearchParams(kind === 'evidence' ? { from: String(Date.now() - Number(days) * 86_400_000), to: String(Date.now()) } : kind === 'incident' ? { id } : kind === 'exposure' ? { fingerprint } : kind === 'dossier' ? { label, name } : {});
  const generate = async () => {
    setError(null);
    try {
      setReport(await api<Envelope>(`/api/console/reports/${kind}?${qs}`));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <PageHeader title="Reports" description="Generated from your own records. Every report states its time range, its data sources and how to verify it." />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader title="Generate" />
          <div className="space-y-3 p-5">
            <Field label="Report"><Select value={kind} onChange={(v) => (setKind(v), setReport(null))} options={REPORTS.map((r) => ({ value: r.id, label: r.title }))} /></Field>
            <p className="text-[13px] text-ash">{def.desc} <span className="text-mist">For: {def.audience}.</span></p>
            {def.needs.includes('range') && <Field label="Range"><Select value={days} onChange={setDays} options={[{ value: '7', label: 'last 7 days' }, { value: '30', label: 'last 30 days' }, { value: '90', label: 'last 90 days' }]} /></Field>}
            {def.needs.includes('id') && <Field label="Incident ID" hint="Open an incident and copy its ID from the address bar."><input className={`${inputCls} font-mono`} value={id} onChange={(e) => setId(e.target.value)} /></Field>}
            {def.needs.includes('fingerprint') && <Field label="Revoked fingerprint"><input className={`${inputCls} font-mono`} value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} /></Field>}
            {def.needs.includes('label') && <Field label="Server label"><input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>}
            {def.needs.includes('name') && <Field label="Tool name"><input className={`${inputCls} font-mono`} value={name} onChange={(e) => setName(e.target.value)} /></Field>}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => void generate()}>Generate</Button>
              <LinkButton variant="ghost" href={`/api/console/reports/${kind}?${qs}&format=md`} external>Download Markdown</LinkButton>
              <LinkButton variant="ghost" href={`/api/console/reports/${kind}?${qs}&download=1`} external>Download JSON</LinkButton>
            </div>
            {error && <Notice tone="danger">{error}</Notice>}
          </div>
        </Card>
        <Card>
          {report ? (
            <>
              <CardHeader title={report.title} subtitle={`Generated ${fmtDate(report.generatedAt)} · range ${report.timeRange.from ? fmtDate(report.timeRange.from) : 'beginning'} → ${report.timeRange.to ? fmtDate(report.timeRange.to) : 'now'}`} />
              <div className="space-y-4 p-5">
                <div>
                  <p className="text-[12px] uppercase tracking-wider text-ash">Data sources</p>
                  <ul className="mt-1 list-disc pl-5 text-[14px] text-mist">{report.sources.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
                <div>
                  <p className="text-[12px] uppercase tracking-wider text-ash">How to verify</p>
                  <ul className="mt-1 list-disc pl-5 text-[14px] text-mist">{report.howToVerify.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
                <CodeBlock code={JSON.stringify(report.body, null, 2)} filename={`${report.kind}.json`} maxHeight={560} />
              </div>
            </>
          ) : (
            <p className="p-10 text-center text-[14px] text-ash">Choose a report and generate it to preview here.</p>
          )}
        </Card>
      </div>
    </>
  );
}
