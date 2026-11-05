import { CAPABILITY_LABELS, HIGH_IMPACT_CAPABILITIES, type Capability, type VerdictPackage } from '@zoro/core';
import { inclusionProof, type AnchorRow } from './anchors';
import { verifyLogChain, type LogRow } from './auditlog';
import { config, isEnsConfigured, isHederaConfigured } from './config';
import { all, get, getSetting, json } from './db';
import { gateway } from './gateway/gateway';
import { listIncidentEvents, type IncidentRow } from './incidents';
import { auditorAccount } from './keys';
import { getPolicy } from './policy';
import { latestPackage } from './sentinel/runner';

export interface ReportEnvelope<T> {
  kind: string;
  title: string;
  generatedAt: string;
  timeRange: { from: string | null; to: string | null };
  sources: string[];
  howToVerify: string[];
  body: T;
}

const env = <T>(kind: string, title: string, body: T, range: { from: number | null; to: number | null }, sources: string[], howToVerify: string[]): ReportEnvelope<T> => ({
  kind,
  title,
  generatedAt: new Date().toISOString(),
  timeRange: { from: range.from ? new Date(range.from).toISOString() : null, to: range.to ? new Date(range.to).toISOString() : null },
  sources,
  howToVerify,
  body,
});

const SOURCES_LOCAL = 'Local Zoro database on this machine (calls, decisions, incidents, approvals)';

export function postureReport() {
  const servers = all<{ id: string; name: string; label: string; mode: string; status: string; transport: string; lab: number; publisher_verified: number; unstable: number }>('SELECT id, name, label, mode, status, transport, lab, publisher_verified, unstable FROM servers WHERE lab = 0');
  const live = all<{ server_id: string; kind: string; name: string; fingerprint: string; state: string }>("SELECT l.server_id, l.kind, l.name, l.fingerprint, l.state FROM live l JOIN servers s ON s.id = l.server_id WHERE s.lab = 0 AND l.state != 'removed'");
  const coverage = { sealed: 0, sealed_with_warnings: 0, pending: 0, unsafe: 0, revoked: 0, unaudited: 0 };
  const capCount = new Map<Capability, Set<string>>();
  for (const l of live) {
    const s = get<{ verdict: string; status: string }>('SELECT verdict, status FROM seals WHERE fingerprint = ?', l.fingerprint);
    if (!s) coverage.unaudited++;
    else if (s.status === 'revoked') coverage.revoked++;
    else if (s.verdict in coverage) coverage[s.verdict as keyof typeof coverage]++;
    const pkg = latestPackage(l.fingerprint);
    for (const c of pkg?.capabilityProfile ?? []) {
      if (!capCount.has(c.capability)) capCount.set(c.capability, new Set());
      capCount.get(c.capability)!.add(`${servers.find((x) => x.id === l.server_id)?.label}/${l.name}`);
    }
  }
  const capabilities = [...capCount.entries()].map(([c, tools]) => ({ capability: c, label: CAPABILITY_LABELS[c], highImpact: HIGH_IMPACT_CAPABILITIES.includes(c), count: tools.size, tools: [...tools] })).sort((a, b) => Number(b.highImpact) - Number(a.highImpact) || b.count - a.count);
  const lastScan = all<{ client: string; path: string; routed: number; last_scan: string | null }>('SELECT client, path, routed, last_scan FROM client_configs');
  const unprotected = lastScan.flatMap((c) => json<{ name: string; status: string }[]>(c.last_scan, []).filter((s) => s.status === 'unprotected').map((s) => ({ client: c.client, server: s.name })));
  const gaps = [
    ...servers.filter((s) => s.mode === 'observe').map((s) => `${s.name} is in observe mode: Zoro records but does not block`),
    ...servers.filter((s) => s.mode === 'disabled').map((s) => `${s.name} is disabled`),
    ...unprotected.map((u) => `${u.client}: “${u.server}” connects directly, bypassing Zoro`),
    ...servers.filter((s) => s.unstable).map((s) => `${s.name} has an unstable manifest`),
  ];
  const quarantined = live.filter((l) => l.state !== 'released').length;
  return env(
    'posture',
    'Posture report',
    { servers, toolCount: live.length, quarantined, coverage, capabilities, policyProfile: getPolicy().profile, gaps, unprotected, network: { registry: isEnsConfigured() ? `ENSv2 ${config.ens.network} (${config.ens.root})` : 'not configured', ledger: isHederaConfigured() ? `Hedera ${config.hedera.network} (${config.hedera.registryTopic})` : 'not configured' } },
    { from: null, to: Date.now() },
    [SOURCES_LOCAL, 'Sentinel verdict packages stored locally', 'Client configuration scan (if permitted)'],
    ['Each verdict can be verified independently on Zoro Verify by its ENS name or fingerprint.', 'Fingerprints can be recomputed from the raw definitions with the published canonicalization (zoro-canon/1).'],
  );
}

export function incidentReport(id: string) {
  const inc = get<IncidentRow>('SELECT * FROM incidents WHERE id = ?', id);
  if (!inc) return null;
  const events = listIncidentEvents(id);
  const evidence = json<Record<string, unknown>>(inc.evidence, {});
  const calls = all<{ id: string; ts: number; agent: string; decision: string; reason: string; args_masked: string }>('SELECT id, ts, agent, decision, reason, args_masked FROM calls WHERE incident_id = ? ORDER BY ts LIMIT 500', id);
  const approvals = all<{ id: string; seq: number; status: string; outcome: string | null; summary: string; human_seal: number }>('SELECT id, seq, status, outcome, summary, human_seal FROM approvals WHERE incident_id = ?', id);
  const pkg = inc.fingerprint ? latestPackage(inc.fingerprint) : null;
  return env(
    'incident',
    `Incident report INC-${inc.seq}: ${inc.title}`,
    { incident: { ...inc, evidence }, events, calls: calls.map((c) => ({ ...c, args_masked: json(c.args_masked, {}) })), approvals, verdict: pkg ? { verdict: pkg.verdict, riskScore: pkg.riskScore, findings: pkg.findings, attestation: pkg.attestation } : null },
    { from: inc.created_at, to: inc.updated_at },
    [SOURCES_LOCAL, 'Sentinel verdict package and attestation'],
    ['The verdict’s attestation can be checked by recovering the signer of the attestation message (EIP-191) and comparing it with the auditor address.', 'Log entries referenced here are covered by anchored Merkle commitments; see the audit evidence pack for inclusion proofs.'],
  );
}

export function exposureReport(fingerprint: string) {
  const seal = get<{ name: string; server_label: string; revoked_at: number | null; revoke_reason: string | null; status: string }>('SELECT name, server_label, revoked_at, revoke_reason, status FROM seals WHERE fingerprint = ?', fingerprint);
  const calls = all<{ id: string; ts: number; agent: string; tool: string; args_masked: string; result_summary: string | null }>("SELECT id, ts, agent, tool, args_masked, result_summary FROM calls WHERE fingerprint = ? AND decision = 'allow' ORDER BY ts", fingerprint);
  const pkg = latestPackage(fingerprint);
  const caps = new Set((pkg?.capabilityProfile ?? []).map((c) => c.capability));
  const guidance: string[] = [];
  if (caps.has('send_communication')) guidance.push(`${calls.length} message(s) were sent while this version was active; consider notifying recipients and rotating anything they contained.`);
  if (caps.has('read_local_files') || caps.has('credential_access')) guidance.push('Files or credentials read by these calls may have been exposed; rotate any secrets they could reach.');
  if (caps.has('financial_action') || caps.has('transaction_signing')) guidance.push('Review every transfer listed here against your records.');
  if (!guidance.length) guidance.push('Review the listed calls and their results.');
  return env(
    'exposure',
    `Exposure report: ${seal?.server_label ?? ''}/${seal?.name ?? fingerprint.slice(0, 12)}`,
    { fingerprint, seal, calls: calls.map((c) => ({ ...c, args_masked: json(c.args_masked, {}) })), guidance, note: 'Generated entirely on this machine. Nothing about these calls was sent anywhere.' },
    { from: calls[0]?.ts ?? null, to: seal?.revoked_at ?? Date.now() },
    [SOURCES_LOCAL],
    ['The revocation is public: look it up on Zoro Verify or the Hedera registry topic.'],
  );
}

export function evidencePack(from: number, to: number) {
  const entries = all<LogRow>('SELECT * FROM audit_log WHERE ts >= ? AND ts <= ? AND lab = 0 ORDER BY seq LIMIT 20000', from, to);
  const chain = entries.length ? verifyLogChain(entries[0].seq, entries[entries.length - 1].seq) : { ok: true, brokenAt: null, checked: 0 };
  const anchors = all<AnchorRow>('SELECT * FROM anchors WHERE ts >= ? ORDER BY ts', from - 7 * 86_400_000);
  const withProofs = entries.map((e) => ({ seq: e.seq, ts: e.ts, kind: e.kind, summary: e.summary, ref: e.ref, hash: e.hash, prevHash: e.prev_hash, proof: e.anchor_id ? inclusionProof(e.seq) : null }));
  return env(
    'evidence_pack',
    'Audit evidence pack',
    { chain, entries: withProofs, anchors, unanchored: withProofs.filter((e) => !e.proof).length, orgTopic: config.hedera.orgTopic || null },
    { from, to },
    [SOURCES_LOCAL, 'Hash-chained local audit log', config.hedera.orgTopic ? `Hedera organization topic ${config.hedera.orgTopic}` : 'Organization topic not configured (anchors are local only)'],
    [
      'Each entry hash is keccak256 of the canonical entry body including the previous hash; recompute the chain from the first entry.',
      'Each proof verifies leaf = keccak256("zoro-leaf/1:" + entryHash) against the anchor root with sorted-pair hashing.',
      'Compare each anchor root with the commitment.batch message on the organization topic (consensus timestamp and sequence number shown).',
    ],
  );
}

export function toolDossier(label: string, name: string) {
  const seals = all<{ fingerprint: string; audit_id: string; verdict: string; status: string; risk: number; change_class: string; audited_at: number; ens_name: string | null; ledger_topic: string | null; ledger_seq: number | null; badge_serial: number | null; revoke_reason: string | null }>(
    'SELECT * FROM seals WHERE server_label = ? AND name = ? ORDER BY audited_at', label, name,
  );
  const versions = seals.map((s) => ({ ...s, package: json<VerdictPackage | null>(get<{ package: string }>('SELECT package FROM audits WHERE id = ?', s.audit_id)?.package, null), definition: json(get<{ definition: string }>('SELECT definition FROM audits WHERE id = ?', s.audit_id)?.definition, null) }));
  const disputes = all('SELECT * FROM disputes WHERE fingerprint IN (SELECT fingerprint FROM seals WHERE server_label = ? AND name = ?)', label, name);
  const events = all<{ topic: string; seq: number; consensus_ts: string; type: string; payload: string }>('SELECT topic, seq, consensus_ts, type, payload FROM public_events WHERE fp IN (SELECT fingerprint FROM seals WHERE server_label = ? AND name = ?) ORDER BY consensus_ts', label, name);
  return env(
    'dossier',
    `Tool dossier: ${label}/${name}`,
    { label, name, versions, disputes, ledger: events.map((e) => ({ ...e, payload: json(e.payload, {}) })), auditor: auditorAccount.address },
    { from: seals[0]?.audited_at ?? null, to: Date.now() },
    ['Sentinel verdict packages', 'Public ledger messages mirrored from Hedera'],
    ['Every version’s attestation and ENS record can be verified on Zoro Verify.'],
  );
}

export function toMarkdown(r: ReportEnvelope<unknown>): string {
  const lines = [`# ${r.title}`, '', `Generated: ${r.generatedAt}`, `Time range: ${r.timeRange.from ?? 'beginning'} → ${r.timeRange.to ?? 'now'}`, '', '## Data sources', ...r.sources.map((s) => `- ${s}`), '', '## How to verify', ...r.howToVerify.map((s) => `- ${s}`), '', '## Contents', '', '```json', JSON.stringify(r.body, null, 2), '```', ''];
  return lines.join('\n');
}

export const reportMeta = () => ({ lastScan: getSetting('onboarding_scan_permission'), exposed: gateway.exposed('tool', false).length });
