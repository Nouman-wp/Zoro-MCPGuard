import { randomUUID } from 'node:crypto';
import { hashSignal } from '@worldcoin/idkit-core/hashing';
import { signRequest } from '@worldcoin/idkit-server';
import { appendLog } from './auditlog';
import { bus } from './bus';
import { config, isWorldConfigured } from './config';
import { all, get, json, run } from './db';
import { raiseIncident } from './incidents';

export type HumanSealStatus =
  | 'awaiting_verification'
  | 'verified'
  | 'executed'
  | 'denied'
  | 'cancelled'
  | 'expired'
  | 'invalid'
  | 'mismatched'
  | 'replay'
  | 'service_unavailable';

export interface HumanSealRow {
  id: string;
  approval_id: string | null;
  digest: string;
  action_string: string;
  signal: string;
  status: HumanSealStatus;
  created_at: number;
  expires_at: number;
  verified_at: number | null;
  nullifier: string | null;
  environment: string | null;
  error: string | null;
  response: string | null;
}

export const usesTestIdentities = () => config.world.environment !== 'production';

/** World ID binds a proof to an action string; Zoro's action string is derived from the action digest. */
export const actionStringFor = (digest: string) => `zoro-human-seal:${digest.replace(/^0x/, '')}`;
/** The proof signal: a non-hex string, so it is always hashed as UTF-8 bytes. */
export const signalFor = (digest: string) => `zoro-action:${digest}`;
/** World's own signal hashing (hash_to_field of the signal), so the comparison matches World's verifier exactly. */
export const signalHashFor = (signal: string) => hashSignal(signal);

export function startHumanSeal(digest: string, approvalId: string | null, windowEndsAt: number) {
  const id = randomUUID();
  const action = actionStringFor(digest);
  const now = Date.now();
  if (!isWorldConfigured()) {
    run('INSERT INTO human_seals(id, approval_id, digest, action_string, signal, status, created_at, expires_at, environment, error) VALUES(?,?,?,?,?,?,?,?,?,?)', id, approvalId, digest, action, signalFor(digest), 'service_unavailable', now, now, config.world.environment, 'World ID is not configured (WORLD_APP_ID, WORLD_RP_ID, WORLD_SIGNING_KEY)');
    appendLog('human_seal', 'Human Seal unavailable: World ID not configured — action did not proceed', { digest }, approvalId);
    bus.emitEvent('human_seal', { id, status: 'service_unavailable' });
    return { ok: false as const, id, status: 'service_unavailable' as const, error: 'Human Seal service unavailable: World ID is not configured on this Zoro instance. The action will not proceed.' };
  }
  const ttl = Math.max(30, Math.min(config.world.approvalTtlSec, Math.floor((windowEndsAt - now) / 1000)));
  let sig: ReturnType<typeof signRequest>;
  try {
    sig = signRequest({ signingKeyHex: config.world.signingKey.replace(/^0x/, ''), action, ttl });
  } catch (e) {
    run('INSERT INTO human_seals(id, approval_id, digest, action_string, signal, status, created_at, expires_at, environment, error) VALUES(?,?,?,?,?,?,?,?,?,?)', id, approvalId, digest, action, signalFor(digest), 'service_unavailable', now, now, config.world.environment, `RP signing failed: ${(e as Error).message}`);
    return { ok: false as const, id, status: 'service_unavailable' as const, error: 'Human Seal service unavailable: could not sign the World ID request.' };
  }
  const expiresAt = sig.expiresAt * 1000;
  run('INSERT INTO human_seals(id, approval_id, digest, action_string, signal, status, created_at, expires_at, environment) VALUES(?,?,?,?,?,?,?,?,?)', id, approvalId, digest, action, signalFor(digest), 'awaiting_verification', now, expiresAt, config.world.environment);
  appendLog('human_seal', 'Human Seal requested', { digest, action }, approvalId);
  bus.emitEvent('human_seal', { id, status: 'awaiting_verification', approvalId });
  return {
    ok: true as const,
    id,
    status: 'awaiting_verification' as const,
    request: {
      app_id: config.world.appId,
      action,
      signal: signalFor(digest),
      environment: config.world.environment,
      rp_context: { rp_id: config.world.rpId, nonce: sig.nonce, created_at: sig.createdAt, expires_at: sig.expiresAt, signature: sig.sig },
      expiresAt,
      testIdentities: usesTestIdentities(),
    },
  };
}

function finish(row: HumanSealRow, status: HumanSealStatus, error: string | null, extra: { nullifier?: string | null; response?: unknown } = {}) {
  try {
    run('UPDATE human_seals SET status = ?, error = ?, nullifier = COALESCE(?, nullifier), response = COALESCE(?, response), verified_at = CASE WHEN ? = ? THEN ? ELSE verified_at END WHERE id = ?',
      status, error, extra.nullifier ?? null, extra.response === undefined ? null : JSON.stringify(extra.response), status, 'verified', Date.now(), row.id);
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) {
      run("UPDATE human_seals SET status = 'replay', error = ? WHERE id = ?", 'This World ID proof was already used for this action', row.id);
      appendLog('human_seal', 'Human Seal rejected: replayed proof', { id: row.id }, row.approval_id);
      bus.emitEvent('human_seal', { id: row.id, status: 'replay', approvalId: row.approval_id });
      return 'replay' as const;
    }
    throw e;
  }
  appendLog('human_seal', `Human Seal ${status}${error ? `: ${error}` : ''}`, { id: row.id, digest: row.digest }, row.approval_id);
  bus.emitEvent('human_seal', { id: row.id, status, approvalId: row.approval_id });
  return status;
}

/**
 * Server-side validation (FR-H2). The client's response is never treated as authorization: the proof is forwarded to
 * World's verify API, then bound to this action string, this digest's signal and the right environment, and its
 * nullifier is recorded once per action so the same proof cannot be replayed.
 */
export async function completeHumanSeal(id: string, result: Record<string, unknown>): Promise<{ status: HumanSealStatus; error: string | null; nullifier: string | null }> {
  const row = get<HumanSealRow>('SELECT * FROM human_seals WHERE id = ?', id);
  if (!row) return { status: 'invalid', error: 'unknown Human Seal request', nullifier: null };
  if (row.status !== 'awaiting_verification') return { status: row.status === 'verified' ? 'replay' : row.status, error: `request is already ${row.status}`, nullifier: null };
  if (Date.now() > row.expires_at + 5_000) return { status: finish(row, 'expired', 'Verification completed after the approval window closed'), error: 'expired', nullifier: null };
  if (typeof result.action === 'string' && result.action !== row.action_string) {
    const st = finish(row, 'mismatched', 'The proof is bound to a different action');
    raiseIncident({ type: 'human_seal_invalid', severity: 'high', title: 'Human Seal proof bound to a different action', summary: 'A World ID proof for a different action digest was submitted. Approvals cannot be reused across actions.', groupKey: `hs-mismatch:${row.digest}`, evidence: { sealId: row.id } });
    return { status: st, error: 'mismatched action', nullifier: null };
  }
  const responses = Array.isArray(result.responses) ? (result.responses as Record<string, unknown>[]) : [];
  const expectedSignal = signalHashFor(row.signal);
  const badSignal = responses.find((r) => typeof r.signal_hash === 'string' && BigInt(r.signal_hash as string) !== BigInt(expectedSignal));
  if (badSignal) {
    const st = finish(row, 'mismatched', 'The proof signal does not match this action digest');
    raiseIncident({ type: 'human_seal_invalid', severity: 'high', title: 'Human Seal proof signal mismatch', summary: 'A World ID proof whose signal does not match the action digest was submitted.', groupKey: `hs-signal:${row.digest}`, evidence: { sealId: row.id } });
    return { status: st, error: 'signal mismatch', nullifier: null };
  }
  const environment = config.world.environment === 'production' ? 'production' : 'staging';
  let resp: Response;
  try {
    resp = await fetch(`${config.world.verifyBase}/api/v4/verify/${encodeURIComponent(config.world.rpId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...result, environment }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return { status: finish(row, 'service_unavailable', `World verify API unreachable: ${(e as Error).message}`), error: 'service unavailable', nullifier: null };
  }
  const body = json<Record<string, unknown>>(await resp.text(), {});
  if (resp.status >= 500) return { status: finish(row, 'service_unavailable', `World verify API returned ${resp.status}`, { response: body }), error: 'service unavailable', nullifier: null };
  if (!resp.ok || body.success !== true) {
    const st = finish(row, 'invalid', `Proof rejected by World: ${String(body.code ?? resp.status)} ${String(body.detail ?? '')}`.trim(), { response: body });
    // An invalid proof may indicate an attack (J5).
    raiseIncident({ type: 'human_seal_invalid', severity: 'high', title: 'Invalid Human Seal proof', summary: `World ID rejected the proof submitted for an approval (${String(body.code ?? resp.status)}). The action did not proceed.`, groupKey: `hs-invalid:${row.digest}`, evidence: { sealId: row.id, code: body.code ?? null } });
    return { status: st, error: 'invalid proof', nullifier: null };
  }
  if (body.environment && body.environment !== environment) return { status: finish(row, 'invalid', `Unexpected environment ${String(body.environment)}`, { response: body }), error: 'wrong environment', nullifier: null };
  const results = Array.isArray(body.results) ? (body.results as Record<string, unknown>[]) : [];
  const rawNullifier = (body.nullifier as string | undefined) ?? (results.find((r) => r.success)?.nullifier as string | undefined) ?? (responses[0]?.nullifier as string | undefined) ?? null;
  const nullifier = rawNullifier ? BigInt(rawNullifier).toString(16) : null;
  if (!nullifier) return { status: finish(row, 'invalid', 'No nullifier in verification response', { response: body }), error: 'no nullifier', nullifier: null };
  const st = finish(row, 'verified', null, { nullifier, response: { success: true, environment: body.environment ?? environment, created_at: body.created_at ?? null } });
  return { status: st, error: st === 'verified' ? null : 'replay', nullifier: st === 'verified' ? nullifier : null };
}

export function cancelHumanSeal(id: string) {
  const row = get<HumanSealRow>('SELECT * FROM human_seals WHERE id = ?', id);
  if (row && row.status === 'awaiting_verification') finish(row, 'cancelled', 'Cancelled by the approver');
}

export function markExecuted(id: string) {
  run("UPDATE human_seals SET status = 'executed' WHERE id = ? AND status = 'verified'", id);
  bus.emitEvent('human_seal', { id, status: 'executed' });
}

export function expireHumanSeals() {
  for (const row of all<HumanSealRow>("SELECT * FROM human_seals WHERE status = 'awaiting_verification' AND expires_at < ?", Date.now()))
    finish(row, 'expired', 'The approval window closed before verification completed');
}

export const getHumanSeal = (id: string) => get<HumanSealRow>('SELECT * FROM human_seals WHERE id = ?', id);
