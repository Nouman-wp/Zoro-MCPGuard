import { config as loadEnv } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Repository root (Blockchain/src → ../..). Every package reads the one .env at the root. */
export const REPO_ROOT = path.resolve(here, '../..');
export const ENV_PATH = path.join(REPO_ROOT, '.env');
loadEnv({ path: ENV_PATH, quiet: true });

const env = (k: string, d = '') => (process.env[k] ?? d).trim();
const bool = (k: string, d: boolean) => {
  const v = env(k);
  return v === '' ? d : /^(1|true|yes|on)$/i.test(v);
};

/**
 * Local data (database, auditor key, tokens) lives in the per-user application-data folder, never inside the
 * repository: repositories often sit in synced folders (OneDrive, Dropbox), which lock SQLite files and would copy
 * secrets off the machine. Shared with the backend, which keeps its database here too.
 */
function defaultDataDir() {
  const home = os.homedir();
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Zoro');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Zoro');
  return path.join(process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share'), 'zoro');
}
export const dataDir = path.resolve(env('ZORO_DATA_DIR') || defaultDataDir());

export const chainConfig = {
  /** Signs verdict attestations and holds the ENS record roles. Generated in the data directory if empty. */
  auditorKey: env('ZORO_AUDITOR_PRIVATE_KEY'),
  ens: {
    network: (env('ENS_NETWORK', 'sepolia') as 'sepolia' | 'mainnet'),
    rpcUrl: env('ENS_RPC_URL', 'https://ethereum-sepolia-rpc.publicnode.com'),
    root: env('ZORO_ENS_ROOT').toLowerCase(),
    operatorKey: env('ENS_OPERATOR_PRIVATE_KEY'),
    resolver: env('ZORO_ENS_RESOLVER'),
    registry: env('ZORO_ENS_REGISTRY'),
    /** Resolver of the Attack Lab namespace (lab.<root>); written by pnpm setup:ens. */
    labResolver: env('ZORO_ENS_LAB_RESOLVER'),
    cacheTtlSec: Number(env('ENS_CACHE_TTL_SEC', '600')),
    publishLab: bool('ZORO_PUBLISH_LAB', true),
  },
  hedera: {
    network: env('HEDERA_NETWORK', 'testnet') as 'testnet' | 'mainnet' | 'previewnet',
    operatorId: env('HEDERA_OPERATOR_ID'),
    operatorKey: env('HEDERA_OPERATOR_KEY'),
    keyType: env('HEDERA_KEY_TYPE', 'auto') as 'auto' | 'ecdsa' | 'ed25519' | 'der',
    registryTopic: env('HEDERA_REGISTRY_TOPIC_ID'),
    labTopic: env('HEDERA_LAB_TOPIC_ID'),
    orgTopic: env('HEDERA_ORG_TOPIC_ID'),
    badgeToken: env('HEDERA_BADGE_TOKEN_ID'),
    mirrorUrl: env('HEDERA_MIRROR_URL'),
    pollSec: Number(env('HEDERA_POLL_SEC', '8')),
  },
};

export const mirrorBase = () =>
  chainConfig.hedera.mirrorUrl || `https://${chainConfig.hedera.network === 'mainnet' ? 'mainnet-public' : chainConfig.hedera.network}.mirrornode.hedera.com`;
export const hashscan = (kind: 'topic' | 'transaction' | 'token' | 'account', id: string) => `https://hashscan.io/${chainConfig.hedera.network}/${kind}/${id}`;
/**
 * HashScan link to one topic message. HashScan has no page per topic message (`/topic/<id>/message/<seq>` is a 404): a
 * message is shown as the transaction at its consensus timestamp. Without the timestamp, link the topic itself.
 */
export const hcsMessageUrl = (topic: string, consensusTimestamp?: string | null) =>
  consensusTimestamp ? hashscan('transaction', consensusTimestamp) : hashscan('topic', topic);
export const etherscanBase = () => (chainConfig.ens.network === 'mainnet' ? 'https://etherscan.io' : 'https://sepolia.etherscan.io');
export const ensAppUrl = (name: string) => `${chainConfig.ens.network === 'mainnet' ? 'https://app.ens.domains' : 'https://sepolia.app.ens.domains'}/${name}`;

export const isEnsConfigured = () => Boolean(chainConfig.ens.root && chainConfig.ens.resolver);
export const isHederaConfigured = () => Boolean(chainConfig.hedera.operatorId && chainConfig.hedera.operatorKey && chainConfig.hedera.registryTopic);

/** Update or append KEY=value lines in the repo .env (used by setup scripts). */
export function writeEnv(values: Record<string, string>) {
  let text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text}${text.endsWith('\n') || text === '' ? '' : '\n'}${k}=${v}\n`;
    process.env[k] = v;
  }
  writeFileSync(ENV_PATH, text);
}
