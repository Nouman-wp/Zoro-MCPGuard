import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Isolated data directory, no AI provider (no API calls), development-mode seals. Set before any daemon import.
process.env.ZORO_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'zoro-test-'));
process.env.GROQ_API_KEY = '';
process.env.AI_API_KEY = '';
process.env.SENTINEL_REQUIRE_AI = 'false';
process.env.ZORO_ENS_ROOT = '';
process.env.HEDERA_OPERATOR_ID = '';
process.env.WORLD_APP_ID = '';

const { gateway } = await import('../src/gateway/gateway');
const { lab } = await import('../src/lab/lab');
const { world } = await import('../src/lab/servers');

async function runScenario(id: string) {
  await lab.start(id);
  for (let i = 0; i < 600 && lab.run?.status === 'running'; i++) await new Promise((r) => setTimeout(r, 100));
  expect(lab.run?.status).toBe('done');
  return lab.run!.events.map((e) => `${e.actor}|${e.title}|${e.detail ?? ''}`);
}

beforeAll(async () => {
  await gateway.init();
  lab.init();
});

// Each Attack Lab scenario doubles as a regression test of the real enforcement path (§14.6).
describe('Attack Lab through the real gateway', () => {
  it('rug pull: the poisoned description never reaches the agent and nothing is BCC’d', async () => {
    const ev = await runScenario('rug-pull');
    expect(ev.some((e) => e.includes('The poisoned description never reached the agent'))).toBe(true);
    expect(ev.some((e) => e.startsWith('zoro|Zoro refused the call to send_email') && e.includes('unsafe'))).toBe(true);
    expect(world.outbox.filter((m) => m.bcc.length)).toEqual([]);
  }, 90_000);

  it('cross-server exfiltration: the data-flow guard holds the send, so the file never leaves', async () => {
    const ev = await runScenario('exfiltration');
    expect(ev.some((e) => e.includes('waiting for the user’s approval'))).toBe(true);
    expect(world.outbox.filter((m) => m.to.includes('contractor-mail'))).toEqual([]);
  }, 120_000);

  it('wallet swap: argument constraint and seal both stop transfers to the attacker', async () => {
    const ev = await runScenario('wallet-swap');
    expect(ev.some((e) => e.includes('outside what the user’s policy allows'))).toBe(true);
    expect(world.transactions.filter((t) => t.to.startsWith('0x7a3B') || t.to.includes('badf00d'))).toEqual([]);
  }, 90_000);

  it('honest update: a typo fix is sealed and auto-released, and the agent keeps working', async () => {
    const ev = await runScenario('honest-update');
    expect(ev.some((e) => e.startsWith('result|send_email returned'))).toBe(true);
    expect(ev.some((e) => e.includes('Zoro refused'))).toBe(false);
  }, 90_000);

  it('Lab sessions never see real servers', async () => {
    const ev = await runScenario('rug-pull');
    const listed = ev.filter((e) => e.startsWith('agent|Agent reads its tools')).join('\n');
    expect(listed).toContain('send_email');
    expect(listed).not.toContain('read_text_file');
  }, 90_000);
});
