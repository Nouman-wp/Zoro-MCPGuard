import { parseLedgerMessage, type LedgerMessage } from '@zoro/core';
import { recoverMessageAddress, type Hex } from 'viem';
import { appendLog } from '../auditlog';
import { bus } from '../bus';
import { config, isEnsConfigured, isHederaConfigured } from '../config';
import { all, get, json, run, setSetting, getSetting } from '../db';
import { gateway } from '../gateway/gateway';
import { raiseIncident } from '../incidents';
import { auditorAccount } from '../keys';
import { mirrorTopicMessages } from '@zoro/blockchain/hedera';
import { readVersionRecords } from '@zoro/blockchain/ens';

/** Auditor addresses whose ledger messages this gateway trusts: its own auditor plus any configured peers. */
export const trustedAuditors = () =>
  new Set([
    auditorAccount.address.toLowerCase(),
    // The organization's auditor (a member device trusts its organization's public revocations).
    ...[json<{ auditor?: string | null } | null>(getSetting('org_membership'), null)?.auditor ?? ''].filter(Boolean).map((a) => a.toLowerCase()),
    ...(process.env.ZORO_TRUSTED_AUDITORS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  ]);

async function validSignature(m: LedgerMessage) {
  if (!m.sig || !m.verdictHash || !m.auditor) return m.type === 'seal.revoked' && Boolean(m.auditor);
  try {
    const rec = await recoverMessageAddress({ message: `zoro-attestation/1:${m.verdictHash}`, signature: m.sig as Hex });
    return rec.toLowerCase() === m.auditor.toLowerCase();
  } catch {
    return false;
  }
}

let polling = false;

/** Poll each public topic through the Mirror Node and record every message (§4.7). */
export async function pollLedger() {
  if (polling || !isHederaConfigured()) return;
  polling = true;
  try {
    const topics = [...new Set([config.hedera.registryTopic, config.hedera.labTopic].filter(Boolean))];
    for (const topic of topics) {
      const key = `mirror:last:${topic}`;
      let last = Number(getSetting(key) ?? '0');
      for (let page = 0; page < 10; page++) {
        const msgs = await mirrorTopicMessages(topic, last);
        if (!msgs.length) break;
        for (const m of msgs) {
          const raw = Buffer.from(m.message, 'base64').toString('utf8');
          const parsed = parseLedgerMessage(raw);
          const valid = parsed ? await validSignature(parsed) : false;
          run(
            'INSERT OR IGNORE INTO public_events(topic, seq, consensus_ts, payload, type, fp, lab, valid) VALUES(?,?,?,?,?,?,?,?)',
            topic, m.sequence_number, m.consensus_timestamp, raw, parsed?.type ?? 'unparsed', parsed?.fp ?? null, Boolean(parsed?.lab) || topic === config.hedera.labTopic, valid,
          );
          if (parsed) await applyEvent(parsed, valid, topic, m.sequence_number);
          last = Math.max(last, m.sequence_number);
        }
        setSetting(key, String(last));
        bus.emitEvent('ledger', { topic, last });
        if (msgs.length < 100) break;
      }
    }
    setSetting('mirror:last_ok', String(Date.now()));
  } catch (e) {
    setSetting('mirror:last_error', `${Date.now()}|${(e as Error).message}`);
  } finally {
    polling = false;
  }
}

/** Exported for tests: apply one public ledger message to this gateway. */
export const applyLedgerMessage = (m: LedgerMessage, valid: boolean, topic: string, seq: number) => applyEvent(m, valid, topic, seq);

async function applyEvent(m: LedgerMessage, valid: boolean, topic: string, seq: number) {
  if (!m.fp) return;
  const trusted = m.auditor && trustedAuditors().has(m.auditor.toLowerCase());
  const local = get<{ status: string; verdict_hash: string; verdict: string }>('SELECT status, verdict_hash, verdict FROM seals WHERE fingerprint = ?', m.fp);
  if (m.type === 'seal.revoked' && trusted && local && local.status !== 'revoked') {
    // Global kill switch: revocations reach this gateway through the ledger, independently of Zoro's own servers (FR-R7).
    gateway.revoke(m.fp, m.reason ?? `Revoked on the public ledger (${topic} #${seq})`, 'ledger');
  } else if (m.type === 'seal.revoked' && trusted && !local && get('SELECT 1 FROM live WHERE fingerprint = ?', m.fp)) {
    // A version this gateway runs but never sealed itself (e.g. audited by the organization's auditor): record the
    // public revocation as a revoked seal so the version is blocked here too.
    run("INSERT OR IGNORE INTO seals(fingerprint, audit_id, verdict, status, revoked_at, revoke_reason, lab) VALUES(?, 'public-record', 'unsafe', 'active', NULL, NULL, ?)", m.fp, topic === config.hedera.labTopic);
    gateway.revoke(m.fp, m.reason ?? `Revoked on the public ledger (${topic} #${seq})`, 'ledger');
  }
  if ((m.type === 'verdict.issued' || m.type === 'verdict.reissued') && trusted && valid && local && m.verdictHash && local.verdict_hash !== m.verdictHash) {
    // The same auditor published a different verdict for this exact version: treat as a contradiction (FR-R6).
    const later = get<{ n: number }>("SELECT COUNT(*) AS n FROM public_events WHERE fp = ? AND type IN ('verdict.issued','verdict.reissued') AND seq > ? AND topic = ?", m.fp, seq, topic)?.n ?? 0;
    if (!later && m.verdict !== local.verdict) {
      run('UPDATE seals SET ens_check = ? WHERE fingerprint = ?', JSON.stringify({ ok: false, mismatches: [`ledger #${seq} says ${m.verdict}, local says ${local.verdict}`], at: Date.now() }), m.fp);
      raiseIncident({ type: 'trust_contradiction', severity: 'high', title: 'Ledger and local seal disagree', summary: `Hedera ${topic} #${seq} records “${m.verdict}” for a version that is “${local.verdict}” locally. The version is treated as not sealed until resolved.`, groupKey: `contradiction:${m.fp}`, fingerprint: m.fp, evidence: { topic, seq, ledger: m.verdict, local: local.verdict } });
    }
  }
}

let checking = false;

/** Re-verify written ENS records against local seals (cache period, §4.6). Disagreement is a security signal. */
export async function checkRegistry() {
  if (checking || !isEnsConfigured()) return;
  checking = true;
  try {
    const due = all<{ fingerprint: string; ens_name: string; verdict: string; status: string; verdict_hash: string; ens_check: string | null; lab: number }>(
      "SELECT fingerprint, ens_name, verdict, status, verdict_hash, ens_check, lab FROM seals WHERE ens_status = 'written' AND ens_name IS NOT NULL AND (ens_checked_at IS NULL OR ens_checked_at < ?) LIMIT 10",
      Date.now() - config.ens.cacheTtlSec * 1000,
    );
    for (const s of due) {
      const prev = json<{ lastOkAt?: number } | null>(s.ens_check, null);
      const r = await readVersionRecords(s.ens_name, auditorAccount.address);
      if (r.error) {
        run('UPDATE seals SET ens_checked_at = ?, ens_check = ? WHERE fingerprint = ?', Date.now(), JSON.stringify({ ok: null, error: r.error, lastOkAt: prev?.lastOkAt ?? null, at: Date.now() }), s.fingerprint);
        continue;
      }
      const mismatches: string[] = [];
      if (r.records['zoro.fingerprint'] && r.records['zoro.fingerprint'] !== s.fingerprint) mismatches.push('fingerprint');
      if (r.records['zoro.verdictHash'] && r.records['zoro.verdictHash'] !== s.verdict_hash) mismatches.push('verdict hash');
      if (r.records['zoro.verdict'] && r.records['zoro.verdict'] !== s.verdict) mismatches.push(`verdict (registry: ${r.records['zoro.verdict']})`);
      const regStatus = r.records['zoro.status'];
      if (regStatus === 'revoked' && s.status !== 'revoked') mismatches.push('registry says revoked');
      if (r.auditorRole === false) mismatches.push('record writer does not hold the Auditor role');
      const missing = !r.records['zoro.fingerprint'];
      const ok = mismatches.length === 0 && !missing;
      run('UPDATE seals SET ens_checked_at = ?, ens_check = ? WHERE fingerprint = ?', Date.now(), JSON.stringify({ ok: missing ? null : ok, mismatches, missing, lastOkAt: ok ? Date.now() : prev?.lastOkAt ?? null, at: Date.now(), resolver: r.resolver }), s.fingerprint);
      if (!ok && !missing) {
        appendLog('verdict', `Registry contradiction for ${s.ens_name}: ${mismatches.join(', ')}`, { mismatches }, s.fingerprint, Boolean(s.lab));
        raiseIncident({ type: 'trust_contradiction', severity: 'high', title: `Registry record disagrees with the seal for ${s.ens_name}`, summary: `ENS ${mismatches.join(', ')}. Zoro treats the version as not sealed and shows both values.`, groupKey: `contradiction:${s.fingerprint}`, fingerprint: s.fingerprint, evidence: { ens: r.records, mismatches }, lab: Boolean(s.lab) });
      }
    }
  } finally {
    checking = false;
  }
}
