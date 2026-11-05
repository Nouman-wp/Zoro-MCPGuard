import { defaultPolicy, findLoosening, type LooseningChange, type Policy } from '@zoro/core';
import { appendLog } from './auditlog';
import { bus } from './bus';
import { all, get, json, run } from './db';

let cached: Policy | null = null;

export function getPolicy(): Policy {
  if (cached) return cached;
  const row = get<{ body: string }>('SELECT body FROM policy WHERE id = 1');
  if (row) cached = json<Policy>(row.body, defaultPolicy('standard'));
  else {
    cached = defaultPolicy('standard');
    run('INSERT INTO policy(id, body, updated_at) VALUES(1, ?, ?)', JSON.stringify(cached), Date.now());
  }
  return cached;
}

/** Lab traffic is evaluated under the Lab profile plus scenario rules, never the user's real policy (§4.20). */
export function getLabPolicy(): Policy {
  const base = defaultPolicy('lab');
  const extra = json<Policy['rules']>(get<{ value: string }>("SELECT value FROM settings WHERE key = 'lab_rules'")?.value, []);
  return { ...base, rules: [...base.rules, ...extra] };
}
export const policyFor = (lab: boolean) => (lab ? getLabPolicy() : getPolicy());

export function validatePolicy(p: unknown): Policy {
  const pol = p as Policy;
  if (!pol || pol.version !== 1 || !['standard', 'strict', 'lab'].includes(pol.profile) || !Array.isArray(pol.rules)) throw new Error('Invalid policy document');
  const ids = new Set<string>();
  for (const r of pol.rules) {
    if (!r || typeof r.id !== 'string' || !r.id || typeof r.type !== 'string') throw new Error('Every rule needs an id and a type');
    if (ids.has(r.id)) throw new Error(`Duplicate rule id: ${r.id}`);
    ids.add(r.id);
    if (r.type === 'argument_constraint' && r.constraint.kind === 'deny_pattern') new RegExp(r.constraint.pattern);
  }
  return pol;
}

export function loosenings(next: Policy): LooseningChange[] {
  return findLoosening(getPolicy(), next);
}

/** Save a policy. Callers must have completed the protection flow for loosening changes (FR-P3). */
export function savePolicy(next: Policy, actor: string, humanSealId: string | null, note: string | null) {
  const before = getPolicy();
  const loose = findLoosening(before, next);
  run('INSERT INTO policy(id, body, updated_at) VALUES(1, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at', JSON.stringify(next), Date.now());
  run('INSERT INTO policy_changes(ts, actor, before, after, loosening, human_seal_id, note) VALUES(?,?,?,?,?,?,?)', Date.now(), actor, JSON.stringify(before), JSON.stringify(next), JSON.stringify(loose), humanSealId, note);
  cached = next;
  appendLog('policy_change', loose.length ? `Policy loosened (${loose.length} change(s))` : 'Policy updated', { loosening: loose, profile: next.profile, humanSeal: humanSealId }, null);
  bus.emitEvent('policy', { loosening: loose.length });
}

export function policyHistory(limit = 50) {
  return all<{ id: number; ts: number; actor: string; loosening: string; human_seal_id: string | null; note: string | null; before: string; after: string }>(
    'SELECT * FROM policy_changes ORDER BY ts DESC LIMIT ?',
    limit,
  ).map((r) => ({ ...r, loosening: json<LooseningChange[]>(r.loosening, []), before: json<Policy | null>(r.before, null), after: json<Policy | null>(r.after, null) }));
}
