'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, CircleDashed, CircleSlash, Loader2, XCircle } from 'lucide-react';
import { CAPABILITY_LABELS, FINDING_CATEGORY_LABELS, HIGH_IMPACT_CAPABILITIES, codePointLabel, revealHidden, type Capability, type FieldDiff, type Finding, type FindingCategory } from '@zoro/core';
import { Badge, CodeBlock, PublishBadge, SeverityBadge, Tabs, cx } from './ui';

/** Render text so a person sees what the model reads: hidden characters become labeled, visible chips. */
export function Revealed({ text, className }: { text: string; className?: string }) {
  const segs = revealHidden(text);
  return (
    <span className={cx('whitespace-pre-wrap break-words', className)}>
      {segs.map((s, i) =>
        s.hidden ? (
          <mark key={i} className="mx-0.5 rounded border border-danger/40 bg-danger-bg px-1 font-mono text-[11px] text-danger" title={s.hidden.name}>
            {s.hidden.kind === 'tag' ? `⟦hidden text: “${s.hidden.decoded}”⟧` : `⟦${codePointLabel(s.hidden.codePoint)} ${s.hidden.name}⟧`}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
}

const fieldLabel = (pointer: string) =>
  pointer === '/' ? 'definition' : pointer.replace(/#key$/, ' (key)').replace(/^\/inputSchema\/properties\//, 'parameter ').replace(/\/properties\//g, '.').replace(/^\//, '').replace(/~1/g, '/').replace(/~0/g, '~');

export function DiffView({ fields, findings = [], compact }: { fields: FieldDiff[]; findings?: Finding[]; compact?: boolean }) {
  const [mode, setMode] = useState<'unified' | 'split'>('unified');
  const forField = (p: string) => findings.filter((f) => f.evidence.some((e) => e.field === p || e.field.replace(/#key$/, '') === p || p.startsWith(e.field.replace(/#key$/, '') + '/')));
  if (!fields.length) return <p className="px-1 py-3 text-[14px] text-ash">The two versions are identical.</p>;
  return (
    <div>
      {!compact && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="min-w-0 flex-1 text-[13px] text-ash">{fields.length} field change(s). Additions in blue, removals struck through, hidden characters shown in red.</p>
          <Tabs tabs={[{ id: 'unified', label: 'Unified' }, { id: 'split', label: 'Side by side' }]} value={mode} onChange={setMode} className="shrink-0 border-none" />
        </div>
      )}
      <div className="space-y-3">
        {fields.map((f) => {
          const anchored = forField(f.pointer);
          return (
            <div key={f.pointer} className="overflow-hidden rounded-[10px] border border-inkline">
              <div className="flex flex-wrap items-center gap-2 border-b border-inkline bg-abyss px-3 py-2">
                <span className="font-mono text-[12px] text-steel">{fieldLabel(f.pointer)}</span>
                <Badge tone={f.op === 'added' ? 'info' : f.op === 'removed' ? 'neutral' : 'warn'}>{f.op}</Badge>
                {anchored.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1">
                    <SeverityBadge severity={a.severity} />
                    <span className="text-[12px] text-mist">{a.title}</span>
                  </span>
                ))}
              </div>
              {mode === 'unified' || f.op !== 'changed' ? (
                <div className="px-3 py-2.5 font-mono text-[13px] leading-relaxed">
                  {f.op === 'changed' && f.words ? (
                    f.words.map((w, i) =>
                      w.op === 'equal' ? (
                        <Revealed key={i} text={w.text} className="text-mist" />
                      ) : w.op === 'insert' ? (
                        <ins key={i} className="rounded bg-add-bg text-add-ink no-underline">
                          <Revealed text={w.text} />
                        </ins>
                      ) : (
                        <del key={i} className="text-ash/70 decoration-danger/70">
                          <Revealed text={w.text} />
                        </del>
                      ),
                    )
                  ) : f.op === 'added' ? (
                    <ins className="rounded bg-add-bg text-add-ink no-underline">
                      <Revealed text={f.after ?? ''} />
                    </ins>
                  ) : (
                    <del className="text-ash/70">
                      <Revealed text={f.before ?? ''} />
                    </del>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 divide-y divide-inkline font-mono text-[13px] leading-relaxed md:grid-cols-2 md:divide-x md:divide-y-0">
                  <div className="px-3 py-2.5 text-ash">
                    <p className="mb-1 font-sans text-[11px] uppercase tracking-wider text-slate">Before</p>
                    <Revealed text={f.before ?? ''} />
                  </div>
                  <div className="px-3 py-2.5 text-mist">
                    <p className="mb-1 font-sans text-[11px] uppercase tracking-wider text-slate">After</p>
                    <Revealed text={f.after ?? ''} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const LAYER_LABEL: Record<string, string> = { deterministic: 'Deterministic', differential: 'Differential', ai: 'AI review', detonation: 'Detonation' };

export function FindingList({ findings, compact }: { findings: Finding[]; compact?: boolean }) {
  if (!findings.length) return <p className="text-[14px] text-ash">No findings.</p>;
  const order = ['critical', 'high', 'medium', 'low', 'info'];
  const sorted = [...findings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return (
    <ul className="space-y-3">
      {sorted.map((f) => (
        <li key={f.id} className="rounded-[10px] border border-inkline bg-abyss p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={f.severity} />
            <span className="text-[14px] font-medium text-quartz">{f.title}</span>
            <Badge tone="neutral">{LAYER_LABEL[f.layer] ?? f.layer}</Badge>
            <Badge tone="neutral">{FINDING_CATEGORY_LABELS[f.category as FindingCategory] ?? f.category}</Badge>
            {f.confidence !== 'high' && <Badge tone={f.confidence === 'low' ? 'warn' : 'neutral'}>{f.confidence} confidence</Badge>}
            <span className="ml-auto font-mono text-[11px] text-slate">{f.ruleId}</span>
          </div>
          <p className="mt-2 text-[14px] font-light leading-relaxed text-mist">
            <Revealed text={f.explanation} />
          </p>
          {!compact &&
            f.evidence
              .filter((e) => e.text)
              .map((e, i) => (
                <div key={i} className="mt-2 rounded-md border border-inkline bg-deep-sea px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-slate">Evidence · {fieldLabel(e.field)}</p>
                  <p className="mt-1 font-mono text-[13px] text-quartz">
                    <Revealed text={e.text} />
                  </p>
                </div>
              ))}
          {!compact && f.recommendation && <p className="mt-2 text-[13px] text-ash">What to do: {f.recommendation}</p>}
        </li>
      ))}
    </ul>
  );
}

export function CapabilityChips({ capabilities }: { capabilities: (Capability | string)[] }) {
  if (!capabilities.length) return <span className="text-[13px] text-ash">No notable capabilities</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {capabilities.map((c) => (
        <Badge key={c} tone={HIGH_IMPACT_CAPABILITIES.includes(c as Capability) ? 'violet' : 'neutral'}>
          {CAPABILITY_LABELS[c as Capability] ?? c}
          {HIGH_IMPACT_CAPABILITIES.includes(c as Capability) ? ' · high impact' : ''}
        </Badge>
      ))}
    </span>
  );
}

export interface LayerState {
  layer: string;
  status: 'waiting' | 'running' | 'done' | 'skipped' | 'failed';
  detail: string | null;
}

export function LayerProgress({ layers }: { layers: LayerState[] }) {
  const Icon = ({ s }: { s: LayerState['status'] }) =>
    s === 'done' ? <CheckCircle2 className="size-4 text-ok" aria-hidden /> : s === 'running' ? <Loader2 className="size-4 animate-spin text-frosted" aria-hidden /> : s === 'failed' ? <XCircle className="size-4 text-warn" aria-hidden /> : s === 'skipped' ? <CircleSlash className="size-4 text-slate" aria-hidden /> : <CircleDashed className="size-4 text-slate" aria-hidden />;
  return (
    <ol className="space-y-2">
      {layers.map((l) => (
        <li key={l.layer} className="flex items-start gap-2.5">
          <span className="mt-0.5">
            <Icon s={l.status} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] text-quartz">
              {l.layer === 'attestation' ? 'Attestation' : LAYER_LABEL[l.layer] ?? l.layer} <span className="text-ash">· {l.status}</span>
            </p>
            {l.detail && <p className="text-[12px] text-ash">{l.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

interface SchemaProp {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

/** Readable rendering of a tool definition, with hidden characters made visible (§10.6 Definition). */
export function DefinitionView({ definition }: { definition: Record<string, unknown> | null }) {
  const [raw, setRaw] = useState(false);
  if (!definition) return <p className="text-[14px] text-ash">No definition recorded.</p>;
  const schema = (definition.inputSchema ?? {}) as { properties?: Record<string, SchemaProp>; required?: string[] };
  const props = Object.entries(schema.properties ?? {});
  const args = Array.isArray(definition.arguments) ? (definition.arguments as { name: string; description?: string; required?: boolean }[]) : [];
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Tabs tabs={[{ id: 'read', label: 'Readable' }, { id: 'raw', label: 'Raw JSON' }]} value={raw ? 'raw' : 'read'} onChange={(v) => setRaw(v === 'raw')} className="border-none" />
      </div>
      {raw ? (
        <CodeBlock code={JSON.stringify(definition, null, 2)} filename="definition.json" />
      ) : (
        <div className="space-y-4">
          <div>
            <p className="font-mono text-[15px] text-quartz">
              <Revealed text={String(definition.name)} />
            </p>
            {typeof definition.title === 'string' && <p className="text-[14px] text-mist">{definition.title}</p>}
          </div>
          {typeof definition.description === 'string' && (
            <div className="rounded-[10px] border border-inkline bg-abyss p-4 text-[14px] font-light leading-relaxed text-mist">
              <Revealed text={definition.description} />
            </div>
          )}
          {typeof definition.uriTemplate === 'string' && <p className="font-mono text-[13px] text-mist">{definition.uriTemplate}</p>}
          {props.length > 0 && (
            <div className="overflow-hidden rounded-[10px] border border-inkline">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-abyss text-[11px] uppercase tracking-wider text-ash">
                  <tr>
                    <th className="px-3 py-2">Parameter</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-inkline">
                  {props.map(([k, p]) => (
                    <tr key={k}>
                      <td className="px-3 py-2 font-mono text-quartz">
                        <Revealed text={k} />
                        {schema.required?.includes(k) && <span className="ml-1 text-[11px] text-warn">required</span>}
                      </td>
                      <td className="px-3 py-2 text-ash">{p.type ?? '—'}</td>
                      <td className="px-3 py-2 text-mist">
                        {p.description ? <Revealed text={p.description} /> : <span className="text-slate">—</span>}
                        {p.default !== undefined && <span className="mt-1 block font-mono text-[12px] text-warn">default: {JSON.stringify(p.default)}</span>}
                        {p.enum && <span className="mt-1 block font-mono text-[12px] text-ash">one of: {p.enum.map(String).join(', ')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {args.length > 0 && (
            <ul className="space-y-1 text-[13px] text-mist">
              {args.map((a) => (
                <li key={a.name}>
                  <span className="font-mono text-quartz">{a.name}</span>
                  {a.required && <span className="ml-1 text-[11px] text-warn">required</span>} — {a.description ? <Revealed text={a.description} /> : '—'}
                </li>
              ))}
            </ul>
          )}
          {definition.annotations !== undefined && definition.annotations !== null && (
            <p className="text-[12px] text-ash">
              Annotations: <span className="font-mono">{JSON.stringify(definition.annotations)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export interface SealPublication {
  ens_name?: string | null;
  ens_status?: string | null;
  ledger_status?: string | null;
  ledger_topic?: string | null;
  ledger_seq?: number | null;
  badge_status?: string | null;
  links?: { ens?: string | null; ensTx?: string | null; ledger?: string | null; badge?: string | null };
}

export function PublicationBadges({ seal }: { seal: SealPublication }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <PublishBadge label="ENS" status={seal.ens_status} href={seal.links?.ens ?? seal.links?.ensTx} />
      <PublishBadge label="Hedera" status={seal.ledger_status} href={seal.links?.ledger} />
      <PublishBadge label="Badge" status={seal.badge_status} href={seal.links?.badge} />
    </span>
  );
}

export function Dot({ tone }: { tone: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  return <Circle className={cx('size-2 fill-current', tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : 'text-slate')} aria-hidden />;
}
