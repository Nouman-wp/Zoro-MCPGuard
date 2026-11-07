import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// World ID configured (staging) with a throwaway RP signing key; World's verify API is stubbed per test.
process.env.ZORO_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'zoro-test-'));
process.env.GROQ_API_KEY = '';
process.env.AI_API_KEY = '';
process.env.ZORO_ENS_ROOT = '';
process.env.HEDERA_OPERATOR_ID = '';
process.env.WORLD_APP_ID = 'app_test0000000000000000000000000';
process.env.WORLD_RP_ID = 'rp_test000000000';
process.env.WORLD_SIGNING_KEY = randomBytes(32).toString('hex');
process.env.WORLD_ENVIRONMENT = 'staging';

const { abandonHumanSeal, completeHumanSeal, getHumanSeal, startHumanSeal, signalHashFor, usesTestIdentities } = await import('../src/humanseal');
const { createApproval, decideApproval } = await import('../src/approvals');
const { config } = await import('../src/config');
const { all } = await import('../src/db');

type Started = Extract<ReturnType<typeof startHumanSeal>, { ok: true }>;

const digest = () => `0x${randomBytes(32).toString('hex')}`;

function seal(d: string, approvalId: string | null): Started {
  const s = startHumanSeal(d, approvalId, Date.now() + 120_000);
  if (!s.ok) throw new Error(s.error);
  return s;
}

/** What IDKit hands the page after World App (or the Simulator) answers. */
const idkitResult = (s: Started, identifier = 'proof_of_human', nullifier = '0x1234') => ({
  protocol_version: identifier === 'orb' ? '3.0' : '4.0',
  nonce: s.request.rp_context.nonce,
  action: s.request.action,
  environment: s.request.environment,
  responses: [{ identifier, signal_hash: signalHashFor(s.request.signal), proof: ['1', '2', '3', '4', '5'], nullifier, issuer_schema_id: 1, expires_at_min: 0 }],
});

/** Stub World's verify endpoint: it answers success for the given credential and records what Zoro sent. */
function worldVerifies(identifier = 'proof_of_human', nullifier = '0x1234') {
  const sent: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    sent.push(body);
    return new Response(JSON.stringify({ success: true, results: [{ identifier, success: true, nullifier }], nullifier, environment: body.environment, created_at: new Date().toISOString() }), { status: 200 });
  }));
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
  config.world.environment = 'staging';
});

describe('Human Seal (World ID IDKit)', () => {
  it('gives every approval its own World ID action, so the same person can approve the same command again', async () => {
    const d = digest();
    const a = seal(d, 'approval-one');
    const b = seal(d, 'approval-two');
    expect(a.request.action).not.toBe(b.request.action);
    expect(a.request.signal).toBe(b.request.signal); // both bound to the same exact action digest
    worldVerifies('proof_of_human', '0xaaaa');
    expect((await completeHumanSeal(a.id, idkitResult(a, 'proof_of_human', '0xaaaa'))).status).toBe('verified');
    expect((await completeHumanSeal(b.id, idkitResult(b, 'proof_of_human', '0xaaaa'))).status).toBe('verified');
  });

  it('keeps one action per organization join, so a returning member is recognized', async () => {
    const d = digest();
    const a = seal(d, null);
    const b = seal(d, null);
    expect(a.request.action).toBe(b.request.action);
    worldVerifies('proof_of_human', '0xbbbb');
    expect((await completeHumanSeal(a.id, idkitResult(a, 'proof_of_human', '0xbbbb'))).status).toBe('verified');
    expect((await completeHumanSeal(b.id, idkitResult(b, 'proof_of_human', '0xbbbb'))).status).toBe('replay');
  });

  it('accepts World ID 4.0 Proof of Human and the Orb fallback', async () => {
    const s4 = seal(digest(), 'approval-v4');
    worldVerifies('proof_of_human', '0xc4');
    expect((await completeHumanSeal(s4.id, idkitResult(s4, 'proof_of_human', '0xc4'))).status).toBe('verified');
    const s3 = seal(digest(), 'approval-v3');
    worldVerifies('orb', '0xc3');
    expect((await completeHumanSeal(s3.id, idkitResult(s3, 'orb', '0xc3'))).status).toBe('verified');
    expect(JSON.parse(getHumanSeal(s3.id)!.response!).credential).toBe('orb');
  });

  it('refuses a valid proof from a weaker credential and records an incident', async () => {
    const s = seal(digest(), 'approval-device');
    worldVerifies('device', '0xdd');
    const r = await completeHumanSeal(s.id, idkitResult(s, 'device', '0xdd'));
    expect(r.status).toBe('insufficient_credential');
    expect(r.nullifier).toBeNull();
    expect(all<{ title: string }>("SELECT title FROM incidents WHERE type = 'human_seal_invalid'").some((i) => i.title.includes('weaker credential'))).toBe(true);
  });

  it('verifies in the World ID Sandbox environment when configured', async () => {
    config.world.environment = 'sandbox';
    const s = seal(digest(), 'approval-sandbox');
    expect(s.request.environment).toBe('sandbox');
    expect(usesTestIdentities()).toBe(true);
    const sent = worldVerifies('proof_of_human', '0x5a');
    expect((await completeHumanSeal(s.id, idkitResult(s, 'proof_of_human', '0x5a'))).status).toBe('verified');
    expect(sent[0].environment).toBe('sandbox');
  });

  it('records why a World ID flow ended without a proof, and the action does not proceed', () => {
    expect(abandonHumanSeal(seal(digest(), 'approval-x').id, 'credential_unavailable')).toBe('credential_unavailable');
    const declined = seal(digest(), 'approval-y');
    expect(abandonHumanSeal(declined.id, 'user_rejected')).toBe('cancelled');
    expect(getHumanSeal(declined.id)!.error).toBe('Declined in World App');
    expect(abandonHumanSeal(seal(digest(), 'approval-z').id, 'cancelled')).toBe('cancelled');
  });

  it('a verified seal approves only the approval it was started for', async () => {
    const d = digest();
    const call = createApproval({ kind: 'tool_call', digest: d, action: {}, summary: 'call', reason: 'test', humanSeal: true });
    const other = createApproval({ kind: 'override', digest: d, action: {}, summary: 'override', reason: 'test', humanSeal: true });
    const s = seal(d, call.id);
    worldVerifies('proof_of_human', '0xee');
    expect((await completeHumanSeal(s.id, idkitResult(s, 'proof_of_human', '0xee'))).status).toBe('verified');
    await expect(decideApproval(other.id, 'approve', 'test', s.id)).rejects.toThrow(/exact action/);
    expect((await decideApproval(call.id, 'approve', 'test', s.id)).status).toBe('approved');
  });
});
