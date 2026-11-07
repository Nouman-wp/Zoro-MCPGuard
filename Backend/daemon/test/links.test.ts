import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Isolated data directory; nothing here talks to a network.
process.env.ZORO_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'zoro-links-'));
process.env.HEDERA_NETWORK = 'testnet';
process.env.HEDERA_OPERATOR_ID = '';
process.env.ZORO_ENS_ROOT = '';
process.env.WORLD_APP_ID = '';

const { hcsMessageUrl } = await import('../src/config');
const { run } = await import('../src/db');
const { consoleApi } = await import('../src/api/console');
const { publicApi } = await import('../src/api/public');

const TOPIC = '0.0.11329769';
const TS = '1793965357.951694078';
/** HashScan shows a topic message as the transaction at its consensus timestamp; /topic/<id>/message/<seq> is a 404. */
const MESSAGE = `https://hashscan.io/testnet/transaction/${TS}`;
const get = async (app: { request: (p: string) => Response | Promise<Response> }, p: string) => (await (await app.request(p)).json()) as Record<string, any>;

describe('HashScan links to topic messages', () => {
  it('link a message by its consensus timestamp, or its topic when the timestamp is unknown', () => {
    expect(hcsMessageUrl(TOPIC, TS)).toBe(MESSAGE);
    expect(hcsMessageUrl(TOPIC, null)).toBe(`https://hashscan.io/testnet/topic/${TOPIC}`);
  });

  it('every ledger link the Console and public pages show opens the message on HashScan', async () => {
    run('INSERT INTO public_events(topic, seq, consensus_ts, payload, type, fp, lab, valid) VALUES(?,?,?,?,?,?,?,?)', TOPIC, 16, TS, '{"type":"verdict.issued","fp":"0xabc"}', 'verdict.issued', '0xabc', 0, 1);
    run("INSERT INTO seals(fingerprint, kind, name, server_label, audit_id, verdict, status, audited_at, ledger_topic, ledger_seq, ledger_ts, badge_token, badge_serial) VALUES('0xabc', 'tool', 'write_file', 'filesystem', 'a1', 'sealed', 'active', 1, ?, 16, ?, '0.0.11329772', 24)", TOPIC, TS);
    run("INSERT INTO anchors(id, ts, from_seq, to_seq, count, root, status, topic, seq, consensus_ts) VALUES('n1', 1, 1, 2, 2, '0xroot', 'anchored', '0.0.11329771', 3, ?)", TS);
    // A dispute stored before the fix still carries the old, broken link.
    const stored = JSON.stringify({ topic: TOPIC, sequence: 17, consensusTimestamp: TS, transactionId: '0.0.1@1.2', url: `https://hashscan.io/testnet/topic/${TOPIC}/message/17` });
    run("INSERT INTO disputes(id, seq, created_at, kind, fingerprint, evidence, status, ledger_open) VALUES('d1', 1, 1, 'false_negative', '0xabc', '{}', 'open', ?)", stored);

    expect((await get(publicApi, '/feed')).events[0].url).toBe(MESSAGE);
    const registry = await get(publicApi, '/registry');
    expect(registry.items[0].links.ledger).toBe(MESSAGE);
    expect(registry.items[0].links.badge).toBe('https://hashscan.io/testnet/token/0.0.11329772/24');
    const search = await get(consoleApi, `/search?q=${encodeURIComponent(`${TOPIC}#16`)}`);
    expect(search.results.find((r: { type: string }) => r.type === 'ledger').href).toBe(MESSAGE);
    expect((await get(consoleApi, '/log')).anchors[0].url).toBe(MESSAGE);
    expect((await get(consoleApi, '/disputes'))[0].ledger_open.url).toBe(MESSAGE);
  });
});
