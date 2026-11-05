import { randomUUID } from 'node:crypto';
import { encodeLedgerMessage, ensNamesFor, type LedgerMessage, type VerdictPackage } from '@zoro/core';
import { appendLog } from '../auditlog';
import { bus } from '../bus';
import { config, isEnsConfigured, isHederaConfigured } from '../config';
import { all, get, json, run } from '../db';
import { auditorAccount } from '../keys';
import { burnBadge, mintBadge, submitTopicMessage } from '@zoro/blockchain/hedera';
import { registerNamespace, resolverForNamespace, txUrl, writeVersionRecords } from '@zoro/blockchain/ens';

export type OutboxKind = 'ens.namespace' | 'ens.verdict' | 'ens.revoke' | 'hcs.publish' | 'hts.mint' | 'hts.burn';

interface OutboxRow {
  id: string;
  created_at: number;
  kind: OutboxKind;
  ref: string | null;
  payload: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'retrying';
  attempts: number;
  next_at: number;
  last_error: string | null;
  result: string | null;
}

const MAX_ATTEMPTS = 12;

export function enqueue(kind: OutboxKind, payload: Record<string, unknown>, ref: string | null = null) {
  const id = randomUUID();
  run('INSERT INTO outbox(id, created_at, kind, ref, payload, status, next_at) VALUES(?,?,?,?,?,?,?)', id, Date.now(), kind, ref, JSON.stringify(payload), 'queued', Date.now());
  bus.emitEvent('outbox', { id, kind, status: 'queued' });
  kick();
  return id;
}

export const topicFor = (which: 'registry' | 'lab' | 'org') =>
  which === 'lab' ? config.hedera.labTopic || config.hedera.registryTopic : which === 'org' ? config.hedera.orgTopic : config.hedera.registryTopic;

interface SealRow {
  fingerprint: string;
  kind: string;
  name: string;
  server_label: string;
  audit_id: string;
  verdict: string;
  status: string;
  risk: number;
  verdict_hash: string;
  signature: string;
  ens_name: string | null;
  ledger_topic: string | null;
  ledger_seq: number | null;
  badge_serial: number | null;
  badge_token: string | null;
  lab: number;
  private: number;
  expires_at: number;
  audited_at: number;
}

/** Publish a fresh verdict: Ledger first (so ENS can reference it), then ENS records, then the badge. */
export function publishVerdict(fingerprint: string, reissue = false) {
  const seal = get<SealRow>('SELECT * FROM seals WHERE fingerprint = ?', fingerprint);
  if (!seal) return;
  if (seal.private) {
    run("UPDATE seals SET ens_status = 'private', ledger_status = 'private', badge_status = 'private' WHERE fingerprint = ?", fingerprint);
    return;
  }
  if (seal.lab && !config.ens.publishLab) {
    run("UPDATE seals SET ens_status = 'lab_unpublished', ledger_status = 'lab_unpublished', badge_status = 'lab_unpublished' WHERE fingerprint = ?", fingerprint);
    return;
  }
  const pkg = json<VerdictPackage | null>(get<{ package: string }>('SELECT package FROM audits WHERE id = ?', seal.audit_id)?.package, null);
  if (!pkg) return;
  if (isHederaConfigured()) {
    const msg: LedgerMessage = {
      v: 1,
      type: reissue ? 'verdict.reissued' : 'verdict.issued',
      lab: seal.lab ? true : undefined,
      fp: fingerprint,
      ens: seal.ens_name ?? undefined,
      server: seal.server_label,
      tool: seal.name,
      verdict: pkg.verdict,
      risk: pkg.riskScore,
      changeClass: pkg.changeClass,
      verdictHash: seal.verdict_hash,
      auditor: auditorAccount.address,
      sig: seal.signature,
      ts: new Date().toISOString(),
    };
    run("UPDATE seals SET ledger_status = 'pending' WHERE fingerprint = ?", fingerprint);
    enqueue('hcs.publish', { topic: seal.lab ? 'lab' : 'registry', message: encodeLedgerMessage(msg), then: { kind: 'seal', fingerprint } }, fingerprint);
  } else {
    run("UPDATE seals SET ledger_status = 'not_configured' WHERE fingerprint = ?", fingerprint);
    afterLedger(fingerprint);
  }
}

function afterLedger(fingerprint: string) {
  const seal = get<SealRow>('SELECT * FROM seals WHERE fingerprint = ?', fingerprint);
  if (!seal) return;
  if (isEnsConfigured() && config.ens.root) {
    run("UPDATE seals SET ens_status = 'pending' WHERE fingerprint = ?", fingerprint);
    enqueue('ens.verdict', { fingerprint }, fingerprint);
  } else run("UPDATE seals SET ens_status = 'not_configured' WHERE fingerprint = ?", fingerprint);
  if ((seal.verdict === 'sealed' || seal.verdict === 'sealed_with_warnings') && seal.status === 'active') {
    if (isHederaConfigured() && config.hedera.badgeToken && !seal.badge_serial) {
      run("UPDATE seals SET badge_status = 'pending' WHERE fingerprint = ?", fingerprint);
      enqueue('hts.mint', { fingerprint }, fingerprint);
    } else if (!seal.badge_serial) run("UPDATE seals SET badge_status = ? WHERE fingerprint = ?", isHederaConfigured() ? 'not_configured' : 'not_configured', fingerprint);
  } else run("UPDATE seals SET badge_status = 'not_applicable' WHERE fingerprint = ?", fingerprint);
}

export function publishRevocation(fingerprint: string, reason: string) {
  const seal = get<SealRow>('SELECT * FROM seals WHERE fingerprint = ?', fingerprint);
  if (!seal || seal.private) return;
  if (isHederaConfigured()) {
    const msg: LedgerMessage = { v: 1, type: 'seal.revoked', lab: seal.lab ? true : undefined, fp: fingerprint, ens: seal.ens_name ?? undefined, server: seal.server_label, tool: seal.name, verdictHash: seal.verdict_hash, auditor: auditorAccount.address, reason: reason.slice(0, 300), ts: new Date().toISOString() };
    enqueue('hcs.publish', { topic: seal.lab ? 'lab' : 'registry', message: encodeLedgerMessage(msg), then: { kind: 'revocation', fingerprint } }, fingerprint);
    if (seal.badge_serial && seal.badge_token) enqueue('hts.burn', { fingerprint }, fingerprint);
  }
  if (isEnsConfigured() && seal.ens_name) enqueue('ens.revoke', { fingerprint }, fingerprint);
}

/** Publish any public ledger event (disputes, namespace claims, commitments). */
export function publishEvent(topic: 'registry' | 'lab' | 'org', msg: LedgerMessage, then: Record<string, unknown> | null) {
  if (!isHederaConfigured() || !topicFor(topic)) return null;
  return enqueue('hcs.publish', { topic, message: encodeLedgerMessage(msg), then }, (msg.fp as string) ?? null);
}

async function handle(job: OutboxRow): Promise<unknown> {
  const p = json<Record<string, unknown>>(job.payload, {});
  switch (job.kind) {
    case 'hcs.publish': {
      const topic = topicFor(p.topic as 'registry' | 'lab' | 'org');
      if (!topic) throw new Error(`no ${p.topic} topic configured`);
      const res = await submitTopicMessage(topic, String(p.message));
      const then = p.then as { kind: string; fingerprint?: string; id?: string } | null;
      if (then?.kind === 'seal' && then.fingerprint) {
        run("UPDATE seals SET ledger_status = 'anchored', ledger_topic = ?, ledger_seq = ?, ledger_ts = ?, ledger_tx = ?, ledger_error = NULL WHERE fingerprint = ?", res.topic, res.sequence, res.consensusTimestamp, res.transactionId, then.fingerprint);
        appendLog('verdict', `Verdict anchored on Hedera ${res.topic} #${res.sequence}`, res, then.fingerprint);
        afterLedger(then.fingerprint);
      } else if (then?.kind === 'revocation' && then.fingerprint) {
        appendLog('revocation', `Revocation anchored on Hedera ${res.topic} #${res.sequence}`, res, then.fingerprint);
      } else if (then?.kind === 'anchor' && then.id) {
        run("UPDATE anchors SET status = 'anchored', topic = ?, seq = ?, consensus_ts = ?, tx = ?, error = NULL WHERE id = ?", res.topic, res.sequence, res.consensusTimestamp, res.transactionId, then.id);
      } else if (then?.kind === 'dispute_open' && then.id) {
        run('UPDATE disputes SET ledger_open = ? WHERE id = ?', JSON.stringify(res), then.id);
      } else if (then?.kind === 'dispute_resolve' && then.id) {
        run('UPDATE disputes SET ledger_resolve = ? WHERE id = ?', JSON.stringify(res), then.id);
      } else if (then?.kind === 'namespace' && then.id) {
        run('UPDATE namespaces SET ledger_ref = ? WHERE label = ?', JSON.stringify(res), then.id);
      }
      bus.emitEvent('ledger', { ...res, kind: then?.kind });
      return res;
    }
    case 'ens.namespace': {
      if (!config.ens.operatorKey || !config.ens.registry) return { skipped: 'operator key or root registry not configured; records resolve through the root resolver (wildcard)' };
      return registerNamespace(String(p.label), Boolean(p.lab));
    }
    case 'ens.verdict': {
      const seal = get<SealRow>('SELECT * FROM seals WHERE fingerprint = ?', String(p.fingerprint));
      if (!seal || !seal.ens_name) throw new Error('seal not found');
      const pkg = json<VerdictPackage | null>(get<{ package: string }>('SELECT package FROM audits WHERE id = ?', seal.audit_id)?.package, null);
      if (!pkg) throw new Error('verdict package not found');
      const names = ensNamesFor(config.ens.root, seal.server_label, seal.name, seal.fingerprint, Boolean(seal.lab));
      const resolver = resolverForNamespace(seal.lab ? 'lab' : seal.server_label);
      const records: Record<string, string> = {
        'zoro.fingerprint': seal.fingerprint,
        'zoro.verdict': seal.verdict,
        'zoro.risk': String(seal.risk),
        'zoro.capabilities': pkg.capabilityProfile.map((c) => c.capability).join(','),
        'zoro.findings': `${pkg.findings.length}:${seal.verdict_hash}`,
        'zoro.attestation': seal.signature,
        'zoro.verdictHash': seal.verdict_hash,
        'zoro.auditor': auditorAccount.address,
        'zoro.audited': new Date(seal.audited_at).toISOString(),
        'zoro.expires': new Date(seal.expires_at).toISOString(),
        'zoro.ledger': seal.ledger_topic && seal.ledger_seq ? `hedera:${config.hedera.network}:${seal.ledger_topic}:${seal.ledger_seq}` : 'none',
        'zoro.status': seal.status,
        'zoro.serverVersion': pkg.serverIdentity.declaredVersion ?? '',
      };
      const sealedVerdict = seal.verdict === 'sealed' || seal.verdict === 'sealed_with_warnings';
      const res = await writeVersionRecords({ resolver: resolver as `0x${string}`, versionName: names.version, currentName: sealedVerdict && seal.status === 'active' ? names.current : null, records });
      run("UPDATE seals SET ens_status = 'written', ens_tx = ?, ens_error = NULL, ens_checked_at = NULL WHERE fingerprint = ?", res.tx, seal.fingerprint);
      appendLog('verdict', `ENS records written for ${names.version}`, { tx: res.tx, url: txUrl(res.tx) }, seal.fingerprint);
      return { ...res, url: txUrl(res.tx), name: names.version };
    }
    case 'ens.revoke': {
      const seal = get<SealRow>('SELECT * FROM seals WHERE fingerprint = ?', String(p.fingerprint));
      if (!seal) throw new Error('seal not found');
      const names = ensNamesFor(config.ens.root, seal.server_label, seal.name, seal.fingerprint, Boolean(seal.lab));
      const resolver = resolverForNamespace(seal.lab ? 'lab' : seal.server_label);
      const res = await writeVersionRecords({ resolver: resolver as `0x${string}`, versionName: names.version, currentName: null, records: { 'zoro.status': 'revoked' } });
      run('UPDATE seals SET ens_tx = ?, ens_checked_at = NULL WHERE fingerprint = ?', res.tx, seal.fingerprint);
      return { ...res, url: txUrl(res.tx) };
    }
    case 'hts.mint': {
      const seal = get<SealRow>('SELECT * FROM seals WHERE fingerprint = ?', String(p.fingerprint));
      if (!seal) throw new Error('seal not found');
      if (seal.badge_serial) return { serial: seal.badge_serial };
      const res = await mintBadge(config.hedera.badgeToken, seal.fingerprint);
      run("UPDATE seals SET badge_status = 'minted', badge_token = ?, badge_serial = ?, badge_error = NULL WHERE fingerprint = ?", config.hedera.badgeToken, res.serial, seal.fingerprint);
      return res;
    }
    case 'hts.burn': {
      const seal = get<SealRow>('SELECT * FROM seals WHERE fingerprint = ?', String(p.fingerprint));
      if (!seal?.badge_serial || !seal.badge_token) return { skipped: 'no badge' };
      const res = await burnBadge(seal.badge_token, seal.badge_serial);
      run("UPDATE seals SET badge_status = 'burned' WHERE fingerprint = ?", seal.fingerprint);
      return res;
    }
  }
}

let running = false;
let timer: NodeJS.Timeout | null = null;

export function kick() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void drain(), 50);
}

async function drain() {
  if (running) return;
  running = true;
  try {
    // Sequential processing keeps signer nonces in order and preserves Ledger → ENS ordering.
    for (;;) {
      const job = get<OutboxRow>("SELECT * FROM outbox WHERE status IN ('queued','retrying') AND next_at <= ? ORDER BY created_at LIMIT 1", Date.now());
      if (!job) break;
      run("UPDATE outbox SET status = 'running', attempts = attempts + 1 WHERE id = ?", job.id);
      bus.emitEvent('outbox', { id: job.id, kind: job.kind, status: 'running' });
      try {
        const result = await handle(job);
        run("UPDATE outbox SET status = 'done', result = ?, last_error = NULL, completed_at = ? WHERE id = ?", JSON.stringify(result ?? null, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), Date.now(), job.id);
        bus.emitEvent('outbox', { id: job.id, kind: job.kind, status: 'done' });
      } catch (e) {
        const msg = ((e as Error).message ?? String(e)).slice(0, 500);
        const attempts = job.attempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        const delay = Math.min(30 * 60_000, 15_000 * 2 ** (attempts - 1));
        run('UPDATE outbox SET status = ?, last_error = ?, next_at = ? WHERE id = ?', failed ? 'failed' : 'retrying', msg, Date.now() + delay, job.id);
        const fp = job.ref;
        if (fp) {
          if (job.kind === 'ens.verdict') run('UPDATE seals SET ens_status = ?, ens_error = ? WHERE fingerprint = ?', failed ? 'failed' : 'retrying', msg, fp);
          if (job.kind === 'hcs.publish') run("UPDATE seals SET ledger_status = CASE WHEN ledger_status = 'anchored' THEN ledger_status ELSE ? END, ledger_error = ? WHERE fingerprint = ?", failed ? 'failed' : 'retrying', msg, fp);
          if (job.kind === 'hts.mint') run('UPDATE seals SET badge_status = ?, badge_error = ? WHERE fingerprint = ?', failed ? 'failed' : 'retrying', msg, fp);
        }
        bus.emitEvent('outbox', { id: job.id, kind: job.kind, status: failed ? 'failed' : 'retrying', error: msg });
      }
    }
  } finally {
    running = false;
  }
}

export function startOutbox() {
  run("UPDATE outbox SET status = 'retrying' WHERE status = 'running'");
  setInterval(() => void drain(), 10_000).unref();
  kick();
}

export function outboxStats() {
  return all<{ kind: string; status: string; n: number }>('SELECT kind, status, COUNT(*) AS n FROM outbox GROUP BY kind, status');
}

export function retryFailed() {
  run("UPDATE outbox SET status = 'retrying', next_at = ?, attempts = 0 WHERE status = 'failed'", Date.now());
  kick();
}
