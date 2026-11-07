import { canonicalJson } from './canonical';
import { keccakHex } from './hash';
import { slugLabel } from './text';
import type { Verdict } from './types';

// --- ENSv2 naming (§4.6) ---

export const versionLabel = (fingerprint: string) => `fp-${fingerprint.replace(/^0x/, '').slice(0, 8)}`;

export interface EnsNames {
  server: string;
  tool: string;
  version: string;
  current: string;
  manifest: string;
}

/** server.root / tool.server.root / fp-xxxxxxxx.tool.server.root. Lab records live under lab.<root>. */
export function ensNamesFor(root: string, serverLabel: string, toolName: string, fingerprint: string, lab = false): EnsNames {
  const base = lab ? `lab.${root}` : root;
  const server = `${slugLabel(serverLabel)}.${base}`;
  const tool = `${slugLabel(toolName)}.${server}`;
  return { server, tool, version: `${versionLabel(fingerprint)}.${tool}`, current: `current.${tool}`, manifest: `manifest.${server}` };
}

/** Appendix A.2 record keys written by the Auditor role. */
export const AUDITOR_KEYS = [
  'zoro.fingerprint',
  'zoro.verdict',
  'zoro.risk',
  'zoro.capabilities',
  'zoro.findings',
  'zoro.attestation',
  'zoro.audited',
  'zoro.expires',
  'zoro.ledger',
  'zoro.status',
  'zoro.serverVersion',
  'zoro.verdictHash',
  'zoro.auditor',
] as const;
export const PUBLISHER_KEYS = ['url', 'repository', 'description', 'notes'] as const;

// --- Hedera Consensus Service messages (Appendix A.3) ---

export type LedgerEventType =
  | 'verdict.issued'
  | 'verdict.reissued'
  | 'seal.revoked'
  | 'seal.expired'
  | 'dispute.opened'
  | 'dispute.resolved'
  | 'namespace.claimed'
  | 'namespace.contested'
  | 'auditor.key_rotated'
  | 'ruleset.updated'
  | 'commitment.batch';

export interface LedgerMessage {
  v: 1;
  type: LedgerEventType;
  lab?: boolean;
  /** fingerprint of the tool version, where relevant */
  fp?: string;
  ens?: string;
  server?: string;
  tool?: string;
  verdict?: Verdict;
  risk?: number;
  changeClass?: string;
  verdictHash?: string;
  auditor?: string;
  sig?: string;
  reason?: string;
  ref?: string;
  outcome?: string;
  root?: string;
  count?: number;
  fromSeq?: number;
  toSeq?: number;
  ts: string;
}

/** HCS messages must stay under 1024 bytes for a single chunk; keep them compact and never include user data. */
export function encodeLedgerMessage(m: LedgerMessage): string {
  return canonicalJson(m);
}

export function parseLedgerMessage(raw: string): LedgerMessage | null {
  try {
    const m = JSON.parse(raw) as LedgerMessage;
    return m && m.v === 1 && typeof m.type === 'string' ? m : null;
  } catch {
    return null;
  }
}

// --- Human Seal action digests (§4.9) ---

export interface SealedAction {
  kind: 'tool_call' | 'override' | 'policy_change' | 'namespace_claim' | 'dispute' | 'release' | 'danger_zone' | 'lockdown_release' | 'org_join';
  /** request identifier that makes each action unique, even if otherwise identical */
  requestId: string;
  agent?: string;
  server?: string;
  tool?: string;
  fingerprint?: string | null;
  args?: unknown;
  detail?: unknown;
}

export const actionDigest = (a: SealedAction) => keccakHex(`zoro-action/1:${canonicalJson(a)}`);
