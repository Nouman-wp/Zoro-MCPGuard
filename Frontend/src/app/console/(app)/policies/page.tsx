'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { CAPABILITY_LABELS, describeRule, type Policy, type Rule } from '@zoro/core';
import { Badge, Button, Card, CardHeader, DecisionBadge, ErrorState, Field, LinkButton, LoadingBlock, Notice, PageHeader, Select, Table, Tabs, Td, Toggle, inputCls } from '@/components/ui';
import { useProtectedAction, type ProtectedResult } from '@/components/console/protected';
import { api, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';

interface PolicyResponse {
  policy: Policy;
  readings: { id: string; reading: string }[];
  profiles: { id: Policy['profile']; description: string; policy: Policy }[];
  history: { id: number; ts: number; actor: string; loosening: { description: string }[]; human_seal_id: string | null; note: string | null }[];
}

interface Preview {
  loosening: { ruleId: string; description: string }[];
  simulation: { replayed: number; changed: number; diffs: { callId: string; ts: number; agent: string; serverName: string; tool: string; before: string; after: string; ruleAfter: string | null; reasonAfter: string }[]; byRule: { key: string; count: number }[]; byAgent: { key: string; count: number }[]; byTool: { key: string; count: number }[] };
}

const NEW_RULES: Record<string, () => Rule> = {
  tool_permission: () => ({ id: `tool-${Date.now().toString(36)}`, type: 'tool_permission', enabled: true, server: '*', tool: '', action: 'ask' }),
  argument_constraint: () => ({ id: `arg-${Date.now().toString(36)}`, type: 'argument_constraint', enabled: true, server: '*', tool: '', argument: '', constraint: { kind: 'email_domain', domains: [] }, action: 'ask', humanSeal: false }),
  rate_limit: () => ({ id: `rate-${Date.now().toString(36)}`, type: 'rate_limit', enabled: true, server: '*', tool: '*', maxCalls: 30, windowSeconds: 60, action: 'ask' }),
  agent_rule: () => ({ id: `agent-${Date.now().toString(36)}`, type: 'agent_rule', enabled: true, agent: '', denyCapabilities: ['send_communication'], action: 'block' }),
  data_flow: () => ({ id: `flow-${Date.now().toString(36)}`, type: 'data_flow', enabled: true, from: 'untrusted_external', to: ['external_communication'], action: 'ask', humanSeal: true }),
  time_window: () => ({ id: `hours-${Date.now().toString(36)}`, type: 'time_window', enabled: true, capabilities: ['financial_action', 'transaction_signing'], days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18, outsideAction: 'ask' }),
  output_shield: () => ({ id: `shield-${Date.now().toString(36)}`, type: 'output_shield', enabled: true, server: '*', tool: '', action: 'redact' }),
  high_impact_ask: () => ({ id: `impact-${Date.now().toString(36)}`, type: 'high_impact_ask', enabled: true, capabilities: ['code_execution'], humanSeal: false }),
};

const DEC = [{ value: 'allow', label: 'allow' }, { value: 'ask', label: 'ask' }, { value: 'block', label: 'block' }];
const csv = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

function RuleFields({ rule, onChange }: { rule: Rule; onChange: (r: Rule) => void }) {
  const set = (patch: Partial<Rule>) => onChange({ ...rule, ...patch } as Rule);
  const input = (label: string, value: string | number, on: (v: string) => void, mono = true) => (
    <Field label={label}>
      <input className={`${inputCls} h-9 ${mono ? 'font-mono text-[13px]' : ''}`} value={value} onChange={(e) => on(e.target.value)} />
    </Field>
  );
  const caps = (label: string, value: string[], on: (v: string[]) => void) => (
    <Field label={label} hint={`Comma separated: ${Object.keys(CAPABILITY_LABELS).join(', ')}`}>
      <input className={`${inputCls} h-9 font-mono text-[13px]`} value={value.join(', ')} onChange={(e) => on(csv(e.target.value))} />
    </Field>
  );
  switch (rule.type) {
    case 'verdict_handling':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sealed"><Select value={rule.sealed} onChange={(v) => set({ sealed: v as 'allow' })} options={DEC} /></Field>
          <Field label="Sealed with warnings"><Select value={rule.sealed_with_warnings} onChange={(v) => set({ sealed_with_warnings: v as 'ask' })} options={DEC} /></Field>
        </div>
      );
    case 'auto_release':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          {(['cosmetic', 'documentation', 'functional'] as const).map((k) => (
            <Field key={k} label={`${k} changes`}><Select value={rule[k]} onChange={(v) => set({ [k]: v } as Partial<Rule>)} options={[{ value: 'auto', label: 'release automatically' }, { value: 'ask', label: 'ask' }]} /></Field>
          ))}
        </div>
      );
    case 'tool_permission':
    case 'output_shield':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          {input('Server (label or *)', rule.server, (v) => set({ server: v || '*' }))}
          {input('Tool (name or *)', rule.tool, (v) => set({ tool: v || '*' }))}
          <Field label="Action">
            <Select value={rule.action} onChange={(v) => set({ action: v } as Partial<Rule>)} options={rule.type === 'tool_permission' ? DEC : ['pass', 'annotate', 'redact', 'block'].map((x) => ({ value: x, label: x }))} />
          </Field>
        </div>
      );
    case 'argument_constraint': {
      const c = rule.constraint;
      const listValue = c.kind === 'email_domain' ? c.domains.join(', ') : c.kind === 'allowlist' ? c.values.join(', ') : c.kind === 'path_prefix' ? c.prefixes.join(', ') : c.kind === 'max_number' ? String(c.max) : c.kind === 'deny_pattern' ? c.pattern : '';
      const setValue = (v: string) =>
        set({ constraint: c.kind === 'email_domain' ? { kind: 'email_domain', domains: csv(v) } : c.kind === 'allowlist' ? { kind: 'allowlist', values: csv(v) } : c.kind === 'path_prefix' ? { kind: 'path_prefix', prefixes: csv(v) } : c.kind === 'max_number' ? { kind: 'max_number', max: Number(v) || 0 } : c.kind === 'deny_pattern' ? { kind: 'deny_pattern', pattern: v } : c });
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          {input('Server (label or *)', rule.server, (v) => set({ server: v || '*' }))}
          {input('Tool', rule.tool, (v) => set({ tool: v || '*' }))}
          {input('Argument (dotted path or *)', rule.argument, (v) => set({ argument: v }))}
          <Field label="Constraint">
            <Select value={c.kind} onChange={(k) => set({ constraint: k === 'email_domain' ? { kind: 'email_domain', domains: [] } : k === 'allowlist' ? { kind: 'allowlist', values: [] } : k === 'path_prefix' ? { kind: 'path_prefix', prefixes: [] } : k === 'max_number' ? { kind: 'max_number', max: 100 } : k === 'deny_pattern' ? { kind: 'deny_pattern', pattern: '' } : { kind: 'sql_read_only' } })} options={[{ value: 'email_domain', label: 'email domains' }, { value: 'allowlist', label: 'allowlist' }, { value: 'path_prefix', label: 'path prefixes' }, { value: 'max_number', label: 'maximum number' }, { value: 'deny_pattern', label: 'deny pattern (regex)' }, { value: 'sql_read_only', label: 'SQL read-only' }]} />
          </Field>
          {c.kind !== 'sql_read_only' && input(c.kind === 'max_number' ? 'Maximum' : c.kind === 'deny_pattern' ? 'Pattern' : 'Values (comma separated)', listValue, setValue)}
          <Field label="Otherwise"><Select value={rule.action} onChange={(v) => set({ action: v as 'ask' })} options={DEC.slice(1)} /></Field>
          <div className="self-end pb-2"><Toggle checked={rule.humanSeal} onChange={(v) => set({ humanSeal: v })} label="Human Seal" /></div>
        </div>
      );
    }
    case 'rate_limit':
      return (
        <div className="grid gap-3 sm:grid-cols-5">
          {input('Server', rule.server, (v) => set({ server: v || '*' }))}
          {input('Tool', rule.tool, (v) => set({ tool: v || '*' }))}
          {input('Max calls', rule.maxCalls, (v) => set({ maxCalls: Number(v) || 0 }))}
          {input('Per seconds', rule.windowSeconds, (v) => set({ windowSeconds: Number(v) || 0 }))}
          <Field label="Then"><Select value={rule.action} onChange={(v) => set({ action: v as 'ask' })} options={DEC.slice(1)} /></Field>
        </div>
      );
    case 'agent_rule':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          {input('Agent (client name or *)', rule.agent, (v) => set({ agent: v }))}
          {caps('Deny capabilities', rule.denyCapabilities, (v) => set({ denyCapabilities: v as never }))}
          <Field label="Then"><Select value={rule.action} onChange={(v) => set({ action: v as 'ask' })} options={DEC.slice(1)} /></Field>
        </div>
      );
    case 'data_flow':
      return (
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="From"><Select value={rule.from} onChange={(v) => set({ from: v as 'untrusted_external' })} options={[{ value: 'untrusted_external', label: 'untrusted external' }, { value: 'private_sensitive', label: 'private sensitive' }]} /></Field>
          <Field label="To sinks" hint="external_communication, external_network, financial_action, code_execution, privileged_write">
            <input className={`${inputCls} h-9 font-mono text-[13px]`} value={rule.to.join(', ')} onChange={(e) => set({ to: csv(e.target.value) as never })} />
          </Field>
          <Field label="Then"><Select value={rule.action} onChange={(v) => set({ action: v as 'ask' })} options={DEC.slice(1)} /></Field>
          <div className="self-end pb-2"><Toggle checked={rule.humanSeal} onChange={(v) => set({ humanSeal: v })} label="Human Seal" /></div>
        </div>
      );
    case 'time_window':
      return (
        <div className="grid gap-3 sm:grid-cols-5">
          {caps('Capabilities', rule.capabilities, (v) => set({ capabilities: v as never }))}
          {input('Days (0=Sun)', rule.days.join(','), (v) => set({ days: csv(v).map(Number) }))}
          {input('From hour', rule.startHour, (v) => set({ startHour: Number(v) }))}
          {input('To hour', rule.endHour, (v) => set({ endHour: Number(v) }))}
          <Field label="Outside"><Select value={rule.outsideAction} onChange={(v) => set({ outsideAction: v as 'ask' })} options={DEC.slice(1)} /></Field>
        </div>
      );
    case 'network_grace':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Registry unreachable"><Select value={rule.mode} onChange={(v) => set({ mode: v as 'strict' })} options={[{ value: 'strict', label: 'strict (block)' }, { value: 'grace', label: 'grace (warn)' }]} /></Field>
          <Field label="High-impact tools"><Select value={rule.highImpactMode} onChange={(v) => set({ highImpactMode: v as 'strict' })} options={[{ value: 'strict', label: 'strict (block)' }, { value: 'grace', label: 'grace (warn)' }]} /></Field>
          {input('Grace minutes', rule.graceMinutes, (v) => set({ graceMinutes: Number(v) || 0 }))}
        </div>
      );
    case 'human_seal':
      return (
        <Field label="Require a Human Seal for" hint="override, high_risk_ask, policy_weakening, capability_expansion_release, namespace_claim, dispute (override is always required)">
          <input className={`${inputCls} h-9 font-mono text-[13px]`} value={rule.for.join(', ')} onChange={(e) => set({ for: csv(e.target.value) as never })} />
        </Field>
      );
    case 'high_impact_ask':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {caps('Capabilities that always ask', rule.capabilities, (v) => set({ capabilities: v as never }))}
          <div className="self-end pb-2"><Toggle checked={rule.humanSeal} onChange={(v) => set({ humanSeal: v })} label="Human Seal" /></div>
        </div>
      );
  }
}

function PoliciesInner() {
  const params = useSearchParams();
  const r = useApi<PolicyResponse>('/api/console/policy', { on: ['policy'] });
  const [draft, setDraft] = useState<Policy | null>(null);
  const [tab, setTab] = useState<'rules' | 'json' | 'simulate' | 'history'>('rules');
  const [json, setJson] = useState('');
  const [hours, setHours] = useState('168');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const protectedSave = useProtectedAction((res) => {
    setSaved(res === 'human seal flow finished' ? 'Human Seal flow finished — check Approvals for the outcome.' : `Policy ${res}.`);
    void r.reload();
  });
  useEffect(() => {
    if (!r.data || draft) return;
    const p: Policy = structuredClone(r.data.policy);
    const proposed = params.get('propose');
    if (proposed) {
      try {
        const rule = JSON.parse(proposed) as Rule;
        p.rules.push({ ...rule, id: p.rules.some((x) => x.id === rule.id) ? `${rule.id}-${Date.now().toString(36)}` : rule.id });
      } catch {
        /* ignore malformed proposal */
      }
    }
    const tool = params.get('tool');
    if (tool) p.rules.push({ ...(NEW_RULES.tool_permission() as Extract<Rule, { type: 'tool_permission' }>), tool, server: params.get('server') ?? '*' });
    setDraft(p);
    setJson(JSON.stringify(p, null, 2));
  }, [r.data, draft, params]);
  const dirty = useMemo(() => draft && r.data && JSON.stringify(draft) !== JSON.stringify(r.data.policy), [draft, r.data]);
  if (r.loading && !r.data) return <LoadingBlock rows={6} />;
  if (r.error && !r.data) return <ErrorState error={r.error} retry={r.reload} />;
  if (!r.data || !draft) return null;
  const update = (p: Policy) => {
    setDraft(p);
    setJson(JSON.stringify(p, null, 2));
    setPreview(null);
  };
  const runPreview = async (p = draft) => {
    setError(null);
    try {
      setPreview(await api<Preview>('/api/console/policy/preview', { json: { policy: p, hours: Number(hours) } }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const save = () => protectedSave.run((confirm) => api<ProtectedResult>('/api/console/policy/save', { json: { policy: draft, note: note || null, confirm } }));
  return (
    <>
      <PageHeader
        title="Policies"
        description="How strict Zoro is, per server, tool, agent and action. Weakening protection is a protected action."
        actions={
          <>
            <LinkButton href="/api/console/policy/export" variant="ghost" size="sm" external>Export</LinkButton>
            <label className="inline-flex h-8 cursor-pointer items-center rounded-full border border-ghost-edge px-3.5 text-[13px] text-quartz hover:border-mist">
              Import
              <input type="file" accept="application/json" className="hidden" onChange={(e) => void e.target.files?.[0]?.text().then((t) => { try { update(JSON.parse(t) as Policy); setTab('rules'); } catch { setError('That file is not a policy document.'); } })} />
            </label>
            <Button size="sm" variant="subtle" disabled={!dirty} onClick={() => void runPreview()}>Preview changes</Button>
            <Button size="sm" disabled={!dirty} onClick={() => void save()}>Save policy</Button>
          </>
        }
      />
      {protectedSave.ui}
      {saved && <Notice tone="ok" className="mb-4">{saved}</Notice>}
      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {r.data.profiles.map((p) => (
          <button key={p.id} onClick={() => update({ ...structuredClone(p.policy), rules: [...p.policy.rules, ...draft.rules.filter((x) => !p.policy.rules.some((y) => y.id === x.id) && !['verdict_handling', 'auto_release', 'network_grace', 'human_seal', 'high_impact_ask'].includes(x.type) && !x.id.startsWith('flow-') && x.id !== 'shield')] })} className={`rounded-[12px] border p-4 text-left transition-colors ${draft.profile === p.id ? 'border-frosted/60 bg-cobalt' : 'border-obsidian bg-deep-sea hover:border-sapphire'}`}>
            <p className="text-[15px] font-medium capitalize">{p.id}{r.data!.policy.profile === p.id ? ' · active' : ''}</p>
            <p className="mt-1 text-[13px] text-ash">{p.description}</p>
          </button>
        ))}
      </div>
      {preview && (
        <Card className="mb-4">
          <CardHeader title="Preview" subtitle={`Replayed ${preview.simulation.replayed} recorded call(s) from the last ${hours} hours against the draft`} />
          <div className="space-y-4 p-5">
            {preview.loosening.length > 0 ? (
              <Notice tone="warn" title={`This draft weakens protection in ${preview.loosening.length} way(s)`}>
                <ul className="mt-1 list-disc pl-5">{preview.loosening.map((l) => <li key={l.description}>{l.description}</li>)}</ul>
              </Notice>
            ) : (
              <Notice tone="ok">No loosening changes.</Notice>
            )}
            <p className="text-[14px] text-mist">{preview.simulation.changed} past call(s) would be decided differently.</p>
            {preview.simulation.changed > 0 && (
              <>
                <div className="flex flex-wrap gap-2 text-[13px] text-ash">
                  {preview.simulation.byRule.map((g) => <Badge key={g.key}>{g.key}: {g.count}</Badge>)}
                  {preview.simulation.byAgent.map((g) => <Badge key={`a-${g.key}`} tone="info">{g.key}: {g.count}</Badge>)}
                </div>
                <Table head={['When', 'Agent', 'Tool', 'Before', 'After', 'Why']}>
                  {preview.simulation.diffs.slice(0, 50).map((x) => (
                    <tr key={x.callId}>
                      <Td className="text-[12px] text-ash">{fmtDate(x.ts)}</Td>
                      <Td className="text-[13px]">{x.agent}</Td>
                      <Td className="font-mono text-[12px]">{x.serverName}/{x.tool}</Td>
                      <Td><DecisionBadge decision={x.before} /></Td>
                      <Td><DecisionBadge decision={x.after} /></Td>
                      <Td className="text-[12px] text-ash">{x.reasonAfter}</Td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
          </div>
        </Card>
      )}
      <Card>
        <Tabs className="px-3" tabs={[{ id: 'rules', label: 'Rules', count: draft.rules.length }, { id: 'json', label: 'JSON' }, { id: 'simulate', label: 'Simulator' }, { id: 'history', label: 'Change history', count: r.data.history.length }]} value={tab} onChange={setTab} />
        {tab === 'rules' && (
          <div className="divide-y divide-inkline">
            {draft.rules.map((rule, i) => {
              let reading = '';
              try {
                reading = describeRule(rule);
              } catch {
                reading = 'Incomplete rule';
              }
              return (
                <div key={`${rule.id}-${i}`} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{rule.type.replace(/_/g, ' ')}</Badge>
                    <input aria-label="Rule id" className="h-7 rounded-md border border-transparent bg-transparent px-1 font-mono text-[12px] text-ash hover:border-obsidian focus:border-sapphire focus:outline-none" value={rule.id} onChange={(e) => update({ ...draft, rules: draft.rules.map((x, j) => (j === i ? ({ ...x, id: e.target.value } as Rule) : x)) })} />
                    <span className="ml-auto flex items-center gap-3">
                      <Toggle checked={rule.enabled} onChange={(v) => update({ ...draft, rules: draft.rules.map((x, j) => (j === i ? ({ ...x, enabled: v } as Rule) : x)) })} label={rule.enabled ? 'on' : 'off'} />
                      <button aria-label="Delete rule" className="rounded-md p-1 text-ash hover:text-danger" onClick={() => update({ ...draft, rules: draft.rules.filter((_, j) => j !== i) })}>
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  </div>
                  <p className="text-[14px] text-quartz">{reading}</p>
                  <RuleFields rule={rule} onChange={(nr) => update({ ...draft, rules: draft.rules.map((x, j) => (j === i ? nr : x)) })} />
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2 px-5 py-4">
              <span className="text-[13px] text-ash">Add a rule:</span>
              {Object.keys(NEW_RULES).map((t) => (
                <Button key={t} size="sm" variant="subtle" icon={<Plus className="size-3.5" />} onClick={() => update({ ...draft, rules: [...draft.rules, NEW_RULES[t]()] })}>
                  {t.replace(/_/g, ' ')}
                </Button>
              ))}
            </div>
            <div className="px-5 py-4">
              <Field label="Change note (recorded with the change)">
                <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          </div>
        )}
        {tab === 'json' && (
          <div className="space-y-3 p-5">
            <textarea className={`${inputCls} h-[480px] py-3 font-mono text-[12.5px]`} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} aria-label="Policy JSON" />
            <Button size="sm" variant="subtle" onClick={() => { try { update(JSON.parse(json) as Policy); setError(null); } catch { setError('Invalid JSON'); } }}>Apply JSON to draft</Button>
          </div>
        )}
        {tab === 'simulate' && (
          <div className="flex flex-wrap items-end gap-3 p-5">
            <Field label="Replay recorded calls from">
              <Select value={hours} onChange={setHours} options={[{ value: '24', label: 'last 24 hours' }, { value: '168', label: 'last 7 days' }, { value: '720', label: 'last 30 days' }]} className="w-48" />
            </Field>
            <Button onClick={() => void runPreview()}>Run simulation</Button>
            <p className="w-full text-[13px] text-ash">Runs locally on your own log. Shows which past calls the draft would decide differently, grouped by rule, agent and tool.</p>
          </div>
        )}
        {tab === 'history' && (
          <Table head={['When', 'By', 'Loosening', 'Human Seal', 'Note']}>
            {r.data.history.map((h) => (
              <tr key={h.id}>
                <Td className="text-[13px] text-ash">{fmtDate(h.ts)}</Td>
                <Td className="text-[13px]">{h.actor}</Td>
                <Td className="text-[13px]">{h.loosening.length ? h.loosening.map((l) => l.description).join('; ') : 'none'}</Td>
                <Td className="text-[13px]">{h.human_seal_id ? 'yes' : '—'}</Td>
                <Td className="text-[13px] text-ash">{h.note ?? '—'}</Td>
              </tr>
            ))}
            {r.data.history.length === 0 && <tr><Td colSpan={5} className="text-ash">No changes yet.</Td></tr>}
          </Table>
        )}
      </Card>
    </>
  );
}

export default function PoliciesPage() {
  return (
    <Suspense>
      <PoliciesInner />
    </Suspense>
  );
}
