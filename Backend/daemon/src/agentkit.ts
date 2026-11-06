import { AgentMode, TOOL_TYPE, type Context, type Tool as KitTool } from '@hashgraph/hedera-agent-kit';
import {
  GET_HBAR_BALANCE_QUERY_TOOL,
  GET_TOKEN_INFO_QUERY_TOOL,
  GET_TOPIC_INFO_QUERY_TOOL,
  GET_TOPIC_MESSAGES_QUERY_TOOL,
  GET_TRANSACTION_RECORD_QUERY_TOOL,
  coreAccountQueryPlugin,
  coreConsensusQueryPlugin,
  coreTokenQueryPlugin,
  coreTransactionQueryPlugin,
} from '@hashgraph/hedera-agent-kit/plugins';
import { Client } from '@hiero-ledger/sdk';
import type { z } from 'zod/v4';
import { config, hashscan } from './config';

/**
 * Ask Zoro reads the Hedera ledger through the Hedera Agent Kit's query plugins. Read-only by construction:
 *  1. only the tools named in LEDGER_TOOLS are loaded, and each must be a kit query tool;
 *  2. the kit runs in RETURN_BYTES mode, so even a transaction tool could only prepare bytes, never submit them;
 *  3. the SDK client has no operator key, so nothing can be signed or paid for.
 * The query tools read the public Mirror Node for the configured network (testnet or mainnet).
 */

/** Zoro's own descriptions: the kit's default prompts describe the agent as preparing transactions for signing. */
const LEDGER_TOOLS: Record<string, string> = {
  [GET_TOPIC_MESSAGES_QUERY_TOOL]:
    'Read messages from a Hedera Consensus Service topic, newest first, straight from the public ledger. Use it for Zoro’s registry, Lab and organization topics: verdicts, revocations, disputes, namespace claims and audit-log commitments. Optional startTime/endTime are ISO 8601 date-times; limit defaults to 20 (at most 50).',
  [GET_TOPIC_INFO_QUERY_TOOL]: 'Details of a Hedera topic: memo, keys, creation time and how many messages it holds.',
  [GET_TOKEN_INFO_QUERY_TOOL]: 'Details of a Hedera Token Service token, such as Zoro’s seal badge NFT: name, symbol, total supply (badges currently minted and not burned) and keys.',
  [GET_HBAR_BALANCE_QUERY_TOOL]: 'HBAR balance of a Hedera account. Without accountId it reads Zoro’s operator account, which pays for every ledger write.',
  [GET_TRANSACTION_RECORD_QUERY_TOOL]: 'Details of one Hedera transaction (status, fee, transfers) by transaction ID, e.g. one Zoro used to anchor a verdict.',
};

const MAX_MESSAGES = 50;
const TIMEOUT_MS = 25_000;

export const ledgerToolsEnabled = () => config.hedera.network === 'testnet' || config.hedera.network === 'mainnet';

const kitContext = (): Context => ({ mode: AgentMode.RETURN_BYTES, accountId: config.hedera.operatorId || undefined });

let kitTools: KitTool[] | null = null;
function loadKitTools(): KitTool[] {
  if (kitTools) return kitTools;
  const context = kitContext();
  const all = [coreConsensusQueryPlugin, coreTokenQueryPlugin, coreAccountQueryPlugin, coreTransactionQueryPlugin].flatMap((p) => p.tools(context));
  kitTools = Object.keys(LEDGER_TOOLS).map((method) => {
    const t = all.find((x) => x.method === method);
    if (!t) throw new Error(`Hedera Agent Kit has no tool ${method}`);
    if (t.toolType !== TOOL_TYPE.QUERY) throw new Error(`Hedera Agent Kit tool ${method} is not read-only`);
    return t;
  });
  return kitTools;
}

let client: Client | null = null;
/** Network only, no operator: the client can read but cannot sign or pay. */
const readOnlyClient = () => (client ??= Client.forName(config.hedera.network));

/** Zoro stores transaction IDs as 0.0.x@seconds.nanos; the Mirror Node expects 0.0.x-seconds-nanos. */
export const mirrorTransactionId = (id: string) => id.trim().replace(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/, '$1-$2-$3');

const tryJson = (s: unknown) => {
  if (typeof s !== 'string') return s;
  try {
    const v = JSON.parse(s) as Record<string, unknown>;
    // Signatures are long and only useful to a verifier; the Verify page checks them.
    if (v && typeof v === 'object' && 'sig' in v) return { ...v, sig: '(signature present)' };
    return v;
  } catch {
    return s;
  }
};

interface KitResult {
  raw?: Record<string, unknown> & { status?: string; error?: unknown };
  humanMessage?: string;
}

function compact(method: string, raw: Record<string, unknown>): unknown {
  if (method === GET_TOPIC_MESSAGES_QUERY_TOOL) {
    const messages = (raw.messages as Record<string, unknown>[] | undefined) ?? [];
    return {
      topicId: raw.topicId,
      order: 'newest first',
      count: messages.length,
      messages: messages.map((m) => ({ seq: m.sequence_number, consensusTimestamp: m.consensus_timestamp, payer: m.payer_account_id, message: tryJson(m.message) })),
    };
  }
  const { status: _status, ...rest } = raw;
  return rest;
}

export interface LedgerTool {
  name: string;
  description: string;
  input: z.ZodObject;
  run: (params: Record<string, unknown>) => Promise<string>;
}

/** Consensus timestamps of the topic messages the tools returned, keyed `topic#sequence`. */
export type SeenMessages = Map<string, string>;

/**
 * The Hedera Agent Kit query tools, in the shape Ask Zoro's tool loop uses. Empty when the network has no public mirror the
 * kit knows. Topic messages read are recorded in `seen`, so their citations can link to HashScan.
 */
export function ledgerTools(seen?: SeenMessages): LedgerTool[] {
  if (!ledgerToolsEnabled()) return [];
  return loadKitTools().map((t) => ({
    name: t.method,
    description: LEDGER_TOOLS[t.method],
    input: t.parameters as unknown as z.ZodObject,
    run: (params) => runLedgerTool(t, params, seen),
  }));
}

async function runLedgerTool(t: KitTool, input: Record<string, unknown>, seen?: SeenMessages): Promise<string> {
  const params = { ...input };
  if (t.method === GET_TOPIC_MESSAGES_QUERY_TOOL) params.limit = Math.min(Math.max(1, Math.floor(Number(params.limit) || 20)), MAX_MESSAGES);
  if (t.method === GET_TRANSACTION_RECORD_QUERY_TOOL && typeof params.transactionId === 'string') params.transactionId = mirrorTransactionId(params.transactionId);
  let timer: NodeJS.Timeout | undefined;
  let res: KitResult;
  try {
    res = (await Promise.race([
      t.execute(readOnlyClient(), kitContext(), params) as Promise<KitResult>,
      new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`no answer from the Mirror Node within ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS))),
    ])) as KitResult;
  } catch (e) {
    return `The ledger lookup failed: ${(e as Error).message}`.slice(0, 400);
  } finally {
    clearTimeout(timer);
  }
  const raw = res?.raw;
  if (!raw || raw.status === 'ERROR' || typeof raw.error === 'string') return `The ledger lookup failed: ${String(raw?.error ?? res?.humanMessage ?? 'no result')}`.slice(0, 400);
  if (t.method === GET_TOPIC_MESSAGES_QUERY_TOOL && seen) {
    for (const m of (raw.messages as Record<string, unknown>[] | undefined) ?? []) {
      if (m.sequence_number != null && typeof m.consensus_timestamp === 'string') seen.set(`${String(raw.topicId)}#${String(m.sequence_number)}`, m.consensus_timestamp);
    }
  }
  return JSON.stringify({ source: `Hedera ${config.hedera.network} Mirror Node, via the Hedera Agent Kit (${t.method})`, data: compact(t.method, raw) });
}

/** What Ask Zoro is told about Zoro's own ledger resources. */
export function ledgerReference(): string {
  if (!ledgerToolsEnabled()) return 'The Hedera ledger tools are off: this instance’s network has no public Mirror Node the Hedera Agent Kit supports.';
  const h = config.hedera;
  const ids = [
    `network ${h.network}`,
    h.operatorId ? `operator account ${h.operatorId} (pays for Zoro’s ledger writes)` : null,
    h.registryTopic ? `registry topic ${h.registryTopic} (public verdicts, revocations, disputes, namespace claims)` : null,
    h.labTopic ? `Attack Lab topic ${h.labTopic} (simulation records, not real seals)` : null,
    h.orgTopic ? `organization topic ${h.orgTopic} (Merkle roots of the audit log, never the events)` : null,
    h.badgeToken ? `seal badge token ${h.badgeToken} (one NFT per sealed version, burned on revocation)` : null,
  ].filter(Boolean);
  return `Zoro’s Hedera resources: ${ids.join('; ')}.`;
}

/** Ledger citations Ask Zoro may use, mapped to HashScan. */
export const LEDGER_CITATION = /\[(hcs:\d+\.\d+\.\d+#\d+|(?:topic|token|account):\d+\.\d+\.\d+|tx:\d+\.\d+\.\d+[-@]\d+[-.]\d+)\]/g;

export function ledgerLink(ref: string, seen?: SeenMessages): string | null {
  const [kind, id] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
  if (kind === 'hcs') {
    // HashScan has no page per topic message: a message is shown as the transaction at its consensus timestamp.
    // Without the timestamp, link the topic itself.
    const [topic, seq] = id.split('#');
    const ts = seen?.get(`${topic}#${seq}`);
    return ts ? hashscan('transaction', ts) : hashscan('topic', topic);
  }
  if (kind === 'topic' || kind === 'token' || kind === 'account') return hashscan(kind, id);
  if (kind === 'tx') return hashscan('transaction', mirrorTransactionId(id));
  return null;
}
