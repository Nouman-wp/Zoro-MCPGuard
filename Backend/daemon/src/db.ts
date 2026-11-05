import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import path from 'node:path';
import { useChainCache } from '@zoro/blockchain/cache';
import { config } from './config';

export const db = new DatabaseSync(path.join(config.dataDir, 'zoro.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, label TEXT NOT NULL UNIQUE, transport TEXT NOT NULL,
  command TEXT, args TEXT, env TEXT, cwd TEXT, url TEXT, headers TEXT,
  mode TEXT NOT NULL DEFAULT 'enforce', source TEXT NOT NULL, lab INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'idle', last_error TEXT,
  declared_name TEXT, declared_version TEXT, artifact_id TEXT, artifact_detail TEXT, sealed_artifact_id TEXT, manifest_root TEXT,
  unstable INTEGER NOT NULL DEFAULT 0, flap_count INTEGER NOT NULL DEFAULT 0, private INTEGER NOT NULL DEFAULT 0,
  publisher_verified INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, connected_at INTEGER, last_change_at INTEGER, last_refresh_at INTEGER
);

CREATE TABLE IF NOT EXISTS versions (
  server_id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, fingerprint TEXT NOT NULL,
  definition TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  previous_fingerprint TEXT, change_class TEXT,
  PRIMARY KEY (server_id, kind, fingerprint)
);
CREATE INDEX IF NOT EXISTS versions_name ON versions(server_id, kind, name, first_seen);

CREATE TABLE IF NOT EXISTS live (
  server_id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, fingerprint TEXT NOT NULL,
  exposed_fingerprint TEXT, state TEXT NOT NULL, reason TEXT, updated_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, kind, name)
);

CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, server_id TEXT, server_label TEXT, kind TEXT, name TEXT, status TEXT NOT NULL,
  layers TEXT NOT NULL, definition TEXT, package TEXT, verdict TEXT, verdict_hash TEXT, trigger TEXT, source TEXT, error TEXT,
  lab INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS audits_fp ON audits(fingerprint, created_at);

CREATE TABLE IF NOT EXISTS seals (
  fingerprint TEXT PRIMARY KEY, kind TEXT, name TEXT, server_label TEXT, audit_id TEXT NOT NULL,
  verdict TEXT NOT NULL, status TEXT NOT NULL, risk INTEGER, change_class TEXT, verdict_hash TEXT, signature TEXT, auditor TEXT,
  audited_at INTEGER, expires_at INTEGER,
  ens_name TEXT, ens_status TEXT, ens_tx TEXT, ens_error TEXT, ens_checked_at INTEGER, ens_check TEXT,
  ledger_status TEXT, ledger_topic TEXT, ledger_seq INTEGER, ledger_ts TEXT, ledger_tx TEXT, ledger_error TEXT,
  badge_status TEXT, badge_token TEXT, badge_serial INTEGER, badge_error TEXT,
  lab INTEGER NOT NULL DEFAULT 0, private INTEGER NOT NULL DEFAULT 0, revoked_at INTEGER, revoke_reason TEXT, disputed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY, ts INTEGER NOT NULL, session_id TEXT, agent TEXT, client TEXT, server_id TEXT, server_label TEXT, tool TEXT, exposed_name TEXT, fingerprint TEXT,
  decision TEXT NOT NULL, enforced_decision TEXT, outcome TEXT, rule TEXT, reason TEXT, reason_category TEXT, observe INTEGER NOT NULL DEFAULT 0,
  latency_ms REAL, overhead_ms REAL, args TEXT, args_masked TEXT, result_summary TEXT, result_size INTEGER, is_error INTEGER,
  shield_action TEXT, shield_findings TEXT, flows TEXT, source_label TEXT, trace TEXT, context TEXT, incident_id TEXT, approval_id TEXT, lab INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS calls_ts ON calls(ts);
CREATE INDEX IF NOT EXISTS calls_tool ON calls(server_id, tool, ts);
CREATE INDEX IF NOT EXISTS calls_fp ON calls(fingerprint);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY, seq INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, type TEXT NOT NULL,
  severity TEXT NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL, summary TEXT, server_id TEXT, tool TEXT, fingerprint TEXT,
  group_key TEXT, evidence TEXT, count INTEGER NOT NULL DEFAULT 1, resolution TEXT, lab INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS incidents_group ON incidents(group_key, status);
CREATE TABLE IF NOT EXISTS incident_events (id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT NOT NULL, ts INTEGER NOT NULL, kind TEXT NOT NULL, message TEXT, data TEXT);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, seq INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, status TEXT NOT NULL, kind TEXT NOT NULL,
  digest TEXT NOT NULL, action TEXT NOT NULL, summary TEXT, reason TEXT, rule TEXT, human_seal INTEGER NOT NULL DEFAULT 0,
  approvers_required INTEGER NOT NULL DEFAULT 1, approvals_received INTEGER NOT NULL DEFAULT 0,
  session_id TEXT, agent TEXT, server_id TEXT, tool TEXT, fingerprint TEXT, evidence TEXT,
  decided_at INTEGER, decided_by TEXT, consumed_at INTEGER, outcome TEXT, incident_id TEXT, lab INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS approvals_digest ON approvals(digest, status);

CREATE TABLE IF NOT EXISTS human_seals (
  id TEXT PRIMARY KEY, approval_id TEXT, digest TEXT NOT NULL, action_string TEXT NOT NULL, signal TEXT, status TEXT NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, verified_at INTEGER, nullifier TEXT, environment TEXT, error TEXT, response TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS human_seals_nullifier ON human_seals(action_string, nullifier) WHERE nullifier IS NOT NULL;

CREATE TABLE IF NOT EXISTS policy (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS policy_changes (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, actor TEXT, before TEXT, after TEXT, loosening TEXT, human_seal_id TEXT, note TEXT);

CREATE TABLE IF NOT EXISTS audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, kind TEXT NOT NULL, ref TEXT, summary TEXT, data TEXT,
  prev_hash TEXT NOT NULL, hash TEXT NOT NULL, anchor_id TEXT, lab INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS anchors (
  id TEXT PRIMARY KEY, ts INTEGER NOT NULL, from_seq INTEGER NOT NULL, to_seq INTEGER NOT NULL, count INTEGER NOT NULL, root TEXT NOT NULL,
  status TEXT NOT NULL, topic TEXT, seq INTEGER, consensus_ts TEXT, tx TEXT, error TEXT
);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, kind TEXT NOT NULL, ref TEXT, payload TEXT NOT NULL, status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, last_error TEXT, result TEXT, completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL, body TEXT, incident_id TEXT, read INTEGER NOT NULL DEFAULT 0, lab INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS public_events (
  topic TEXT NOT NULL, seq INTEGER NOT NULL, consensus_ts TEXT NOT NULL, payload TEXT NOT NULL, type TEXT, fp TEXT, lab INTEGER NOT NULL DEFAULT 0, valid INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (topic, seq)
);

CREATE TABLE IF NOT EXISTS client_configs (
  id TEXT PRIMARY KEY, client TEXT NOT NULL, path TEXT NOT NULL UNIQUE, detected_at INTEGER NOT NULL, backup_path TEXT,
  routed INTEGER NOT NULL DEFAULT 0, routed_at INTEGER, routed_servers TEXT, last_scan TEXT
);

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY, seq INTEGER NOT NULL, created_at INTEGER NOT NULL, kind TEXT NOT NULL, fingerprint TEXT NOT NULL, ens_name TEXT, submitter TEXT,
  evidence TEXT NOT NULL, status TEXT NOT NULL, outcome TEXT, reasoning TEXT, review_audit_id TEXT, human_seal_id TEXT,
  ledger_open TEXT, ledger_resolve TEXT, resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS namespaces (
  label TEXT PRIMARY KEY, created_at INTEGER NOT NULL, method TEXT NOT NULL, target TEXT NOT NULL, challenge TEXT NOT NULL,
  status TEXT NOT NULL, proof TEXT, human_seal_id TEXT, verified_at INTEGER, publisher TEXT, ledger_ref TEXT, error TEXT
);

CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, namespace TEXT NOT NULL, version TEXT, manifest TEXT NOT NULL, audit_ids TEXT NOT NULL, status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, client TEXT, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, ens_name TEXT, declaration TEXT, lab INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS baselines (
  server_id TEXT NOT NULL, tool TEXT NOT NULL, n INTEGER NOT NULL, mean_size REAL NOT NULL, m2_size REAL NOT NULL,
  mean_latency REAL NOT NULL, m2_latency REAL NOT NULL, errors INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, tool)
);

CREATE TABLE IF NOT EXISTS corpus_runs (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, ruleset TEXT NOT NULL, ai TEXT, results TEXT NOT NULL);
`);

type Row = Record<string, unknown>;
type P = SQLInputValue | boolean | undefined;
const norm = (params: P[]): SQLInputValue[] => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

export const all = <T = Row>(sql: string, ...params: P[]) => db.prepare(sql).all(...norm(params)) as T[];
export const get = <T = Row>(sql: string, ...params: P[]) => db.prepare(sql).get(...norm(params)) as T | undefined;
export const run = (sql: string, ...params: P[]) => db.prepare(sql).run(...norm(params));

export const json = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string' || s === '') return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function nextSeq(name: string): number {
  const row = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', `seq:${name}`);
  const n = (row ? Number(row.value) : 0) + 1;
  run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', `seq:${name}`, String(n));
  return n;
}

export const getSetting = (key: string) => get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
export const setSetting = (key: string, value: string) =>
  run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);

// Chain lookups cached by the Blockchain package (namespace resolvers) persist in this database.
useChainCache({ get: getSetting, set: (key, value) => void setSetting(key, value) });
