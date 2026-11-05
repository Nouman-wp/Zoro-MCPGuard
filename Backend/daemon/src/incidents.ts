import { randomUUID } from 'node:crypto';
import { severityRank, type Severity } from '@zoro/core';
import { appendLog } from './auditlog';
import { bus } from './bus';
import { all, get, json, nextSeq, run } from './db';

export type IncidentType =
  | 'blocked_call'
  | 'tool_changed'
  | 'unsafe_verdict'
  | 'revocation'
  | 'data_flow'
  | 'output_shield'
  | 'trust_contradiction'
  | 'bypass_config'
  | 'artifact_changed'
  | 'shadowing'
  | 'drift'
  | 'human_seal_invalid'
  | 'flapping'
  | 'observe_would_block'
  | 'server_offline'
  | 'malformed_manifest'
  | 'lockdown'
  | 'new_power'
  | 'config_tamper'
  | 'skill_risk'
  | 'package_risk'
  | 'known_vulnerability'
  | 'builtin_tool';

export interface IncidentRow {
  id: string;
  seq: number;
  created_at: number;
  updated_at: number;
  type: IncidentType;
  severity: Severity;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  title: string;
  summary: string | null;
  server_id: string | null;
  tool: string | null;
  fingerprint: string | null;
  group_key: string | null;
  evidence: string | null;
  count: number;
  resolution: string | null;
  lab: number;
}

export const incidentRef = (seq: number) => `INC-${seq}`;

export interface RaiseInput {
  type: IncidentType;
  severity: Severity;
  title: string;
  summary: string;
  groupKey: string;
  serverId?: string | null;
  tool?: string | null;
  fingerprint?: string | null;
  evidence?: Record<string, unknown>;
  lab?: boolean;
  eventMessage?: string;
}

/**
 * Create an incident, or fold the event into the open incident with the same group key (FR-I1):
 * twenty blocked calls to the same quarantined tool are one incident, not twenty.
 */
export function raiseIncident(input: RaiseInput): IncidentRow {
  const now = Date.now();
  const existing = get<IncidentRow>("SELECT * FROM incidents WHERE group_key = ? AND status IN ('open','acknowledged') ORDER BY created_at DESC LIMIT 1", input.groupKey);
  if (existing) {
    const severity = severityRank(input.severity) > severityRank(existing.severity) ? input.severity : existing.severity;
    const evidence = { ...json<Record<string, unknown>>(existing.evidence, {}), ...(input.evidence ?? {}) };
    const escalated = severity !== existing.severity;
    run('UPDATE incidents SET updated_at = ?, count = count + 1, severity = ?, title = ?, summary = ?, evidence = ? WHERE id = ?', now, severity, escalated ? input.title : existing.title, escalated ? input.summary : existing.summary, JSON.stringify(evidence), existing.id);
    addIncidentEvent(existing.id, escalated ? 'escalated' : 'recurred', input.eventMessage ?? input.title);
    const row = get<IncidentRow>('SELECT * FROM incidents WHERE id = ?', existing.id)!;
    if (escalated) notify(row.severity, row.title, row.summary ?? '', row.id, Boolean(row.lab));
    bus.emitEvent('incident', { id: row.id, action: 'updated' });
    return row;
  }
  const id = randomUUID();
  const seq = nextSeq('incident');
  run(
    'INSERT INTO incidents(id, seq, created_at, updated_at, type, severity, status, title, summary, server_id, tool, fingerprint, group_key, evidence, lab) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, seq, now, now, input.type, input.severity, 'open', input.title, input.summary, input.serverId ?? null, input.tool ?? null, input.fingerprint ?? null, input.groupKey, JSON.stringify(input.evidence ?? {}), Boolean(input.lab),
  );
  addIncidentEvent(id, 'opened', input.eventMessage ?? input.title);
  appendLog('incident', `${incidentRef(seq)} opened: ${input.title}`, { type: input.type, severity: input.severity }, id, input.lab);
  notify(input.severity, input.title, input.summary, id, Boolean(input.lab));
  bus.emitEvent('incident', { id, action: 'created' });
  return get<IncidentRow>('SELECT * FROM incidents WHERE id = ?', id)!;
}

export function addIncidentEvent(incidentId: string, kind: string, message: string, data: unknown = null) {
  run('INSERT INTO incident_events(incident_id, ts, kind, message, data) VALUES(?,?,?,?,?)', incidentId, Date.now(), kind, message, JSON.stringify(data));
  run('UPDATE incidents SET updated_at = ? WHERE id = ?', Date.now(), incidentId);
}

export function setIncidentStatus(id: string, status: IncidentRow['status'], note: string | null, actor = 'console') {
  const inc = get<IncidentRow>('SELECT * FROM incidents WHERE id = ?', id);
  if (!inc) throw new Error('incident not found');
  if (status === 'dismissed' && !note?.trim()) throw new Error('A resolution note is required to dismiss an incident.');
  run('UPDATE incidents SET status = ?, resolution = COALESCE(?, resolution), updated_at = ? WHERE id = ?', status, note, Date.now(), id);
  addIncidentEvent(id, status, note ? `${status} by ${actor}: ${note}` : `${status} by ${actor}`);
  appendLog('incident', `${incidentRef(inc.seq)} ${status}`, { note }, id, Boolean(inc.lab));
  bus.emitEvent('incident', { id, action: status });
}

export function listIncidentEvents(id: string) {
  return all<{ id: number; ts: number; kind: string; message: string; data: string }>('SELECT * FROM incident_events WHERE incident_id = ? ORDER BY ts, id', id);
}

/** Notification center entries. Critical always notifies; every notification links to its incident (§9.3). */
export function notify(severity: Severity, title: string, body: string, incidentId: string | null, lab = false) {
  const id = randomUUID();
  run('INSERT INTO notifications(id, ts, severity, title, body, incident_id, lab) VALUES(?,?,?,?,?,?,?)', id, Date.now(), severity, title, body, incidentId, lab);
  bus.emitEvent('notification', { id, severity, title, body, incidentId, lab });
  void deliverWebhook({ id, severity, title, body, incidentId, lab });
}

import { getSetting } from './db';
async function deliverWebhook(n: { id: string; severity: Severity; title: string; body: string; incidentId: string | null; lab: boolean }) {
  const cfg = json<{ webhookUrl?: string; webhookMinSeverity?: Severity; quietHours?: { start: number; end: number } | null }>(getSetting('notifications'), {});
  if (!cfg.webhookUrl) return;
  if (severityRank(n.severity) < severityRank(cfg.webhookMinSeverity ?? 'high')) return;
  const h = new Date().getHours();
  const quiet = cfg.quietHours && (cfg.quietHours.start <= cfg.quietHours.end ? h >= cfg.quietHours.start && h < cfg.quietHours.end : h >= cfg.quietHours.start || h < cfg.quietHours.end);
  if (quiet && n.severity !== 'critical') return;
  try {
    // Notifications never contain secrets or full sensitive values; only the title, severity and incident link.
    await fetch(cfg.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'zoro', severity: n.severity, title: n.title, summary: n.body, incident: n.incidentId, lab: n.lab }), signal: AbortSignal.timeout(8000) });
  } catch {
    /* delivery failures are visible in the Console notification center; never block enforcement */
  }
}
