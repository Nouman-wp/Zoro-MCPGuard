import {
  AccountId,
  Client,
  PrivateKey,
  TokenBurnTransaction,
  TokenCreateTransaction,
  TokenId,
  TokenMintTransaction,
  TokenSupplyType,
  TokenType,
  TopicCreateTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import { chainConfig, hcsMessageUrl, mirrorBase } from './config';

let client: Client | null = null;
let operatorKey: PrivateKey | null = null;

export function parseHederaKey(raw: string, type = chainConfig.hedera.keyType): PrivateKey {
  const s = raw.trim();
  if (type === 'der' || /^30[0-9a-f]{2}/i.test(s.replace(/^0x/, '')) && s.replace(/^0x/, '').length > 64) return PrivateKey.fromStringDer(s.replace(/^0x/, ''));
  if (type === 'ed25519') return PrivateKey.fromStringED25519(s.replace(/^0x/, ''));
  return PrivateKey.fromStringECDSA(s.replace(/^0x/, ''));
}

export function hederaClient(): { client: Client; key: PrivateKey; operator: AccountId } {
  if (!chainConfig.hedera.operatorId || !chainConfig.hedera.operatorKey) throw new Error('Hedera operator is not configured (HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY).');
  if (!client) {
    operatorKey = parseHederaKey(chainConfig.hedera.operatorKey);
    client = Client.forName(chainConfig.hedera.network).setOperator(AccountId.fromString(chainConfig.hedera.operatorId), operatorKey);
  }
  return { client, key: operatorKey!, operator: AccountId.fromString(chainConfig.hedera.operatorId) };
}

export interface SubmitResult {
  topic: string;
  sequence: number;
  consensusTimestamp: string;
  transactionId: string;
  url: string;
}

export async function submitTopicMessage(topic: string, message: string): Promise<SubmitResult> {
  if (Buffer.byteLength(message) > 1024) throw new Error(`ledger message is ${Buffer.byteLength(message)} bytes; the limit for one chunk is 1024`);
  const { client } = hederaClient();
  const resp = await new TopicMessageSubmitTransaction().setTopicId(TopicId.fromString(topic)).setMessage(message).execute(client);
  const receipt = await resp.getReceipt(client);
  const record = await resp.getRecord(client);
  const sequence = Number(receipt.topicSequenceNumber?.toString() ?? '0');
  const ts = record.consensusTimestamp;
  const consensusTimestamp = `${ts.seconds.toString()}.${String(ts.nanos.toString()).padStart(9, '0')}`;
  const transactionId = resp.transactionId.toString();
  return { topic, sequence, consensusTimestamp, transactionId, url: hcsMessageUrl(topic, consensusTimestamp) };
}

export async function createTopic(memo: string): Promise<string> {
  const { client, key } = hederaClient();
  const tx = await new TopicCreateTransaction().setTopicMemo(memo).setSubmitKey(key.publicKey).setAdminKey(key.publicKey).execute(client);
  const receipt = await tx.getReceipt(client);
  return receipt.topicId!.toString();
}

export async function createBadgeToken(): Promise<string> {
  const { client, key, operator } = hederaClient();
  const tx = await new TokenCreateTransaction()
    .setTokenName('Zoro Seal Badge')
    .setTokenSymbol('ZSEAL')
    .setTokenMemo('One badge per sealed MCP tool version. Burned on revocation.')
    .setTokenType(TokenType.NonFungibleUnique)
    .setDecimals(0)
    .setInitialSupply(0)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(operator)
    .setAdminKey(key.publicKey)
    .setSupplyKey(key.publicKey)
    .setWipeKey(key.publicKey)
    .setFreezeKey(key.publicKey)
    .freezeWith(client)
    .sign(key);
  const resp = await tx.execute(client);
  const receipt = await resp.getReceipt(client);
  return receipt.tokenId!.toString();
}

/** Mint one badge whose metadata is the version fingerprint (66 bytes, under the 100-byte limit). */
export async function mintBadge(token: string, fingerprint: string): Promise<{ serial: number; transactionId: string }> {
  const { client } = hederaClient();
  const resp = await new TokenMintTransaction().setTokenId(TokenId.fromString(token)).addMetadata(Buffer.from(fingerprint)).execute(client);
  const receipt = await resp.getReceipt(client);
  return { serial: Number(receipt.serials[0].toString()), transactionId: resp.transactionId.toString() };
}

/** Revocation burns the badge, so a revoked version can never keep showing a valid badge (§4.7). */
export async function burnBadge(token: string, serial: number): Promise<{ transactionId: string }> {
  const { client } = hederaClient();
  const resp = await new TokenBurnTransaction().setTokenId(TokenId.fromString(token)).setSerials([serial]).execute(client);
  await resp.getReceipt(client);
  return { transactionId: resp.transactionId.toString() };
}

// --- Mirror node (public reads; used by gateways independently of Zoro's own servers, FR-R7) ---

export interface MirrorMessage {
  consensus_timestamp: string;
  message: string;
  sequence_number: number;
  running_hash: string;
  payer_account_id: string;
}

export async function mirrorTopicMessages(topic: string, afterSeq: number, limit = 100): Promise<MirrorMessage[]> {
  // Sequence numbers start at 1 and the Mirror Node rejects `gt:0` with a 400, so ask for `gte:<next>` instead.
  const url = `${mirrorBase()}/api/v1/topics/${topic}/messages?order=asc&limit=${limit}&sequencenumber=gte:${Math.max(1, afterSeq + 1)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`mirror node ${r.status}`);
  const body = (await r.json()) as { messages: MirrorMessage[] };
  return body.messages ?? [];
}

export async function mirrorNft(token: string, serial: number): Promise<{ deleted: boolean; account_id: string | null; metadata: string } | null> {
  const r = await fetch(`${mirrorBase()}/api/v1/tokens/${token}/nfts/${serial}`, { signal: AbortSignal.timeout(10_000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`mirror node ${r.status}`);
  return (await r.json()) as { deleted: boolean; account_id: string | null; metadata: string };
}

export async function mirrorTopicInfo(topic: string) {
  const r = await fetch(`${mirrorBase()}/api/v1/topics/${topic}`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`mirror node ${r.status}`);
  return (await r.json()) as { topic_id: string; memo: string; created_timestamp: string };
}
