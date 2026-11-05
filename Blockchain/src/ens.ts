import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  stringToBytes,
  stringToHex,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, sepolia } from 'viem/chains';
import { labelhash, namehash, normalize } from 'viem/ens';
import { AUDITOR_KEYS, PUBLISHER_KEYS } from '@zoro/core';
import { loadAuditor } from './auditor';
import { chainCache } from './cache';
import { chainConfig, etherscanBase } from './config';

/**
 * ENSv2 Sepolia deployment (docs.ens.domains/learn/deployments#sepolia-ensv2). Overridable by env in case
 * ENS Labs redeploys. The Universal Resolver address is taken from viem's chain definition, as ENS recommends.
 */
export const ENSV2 = {
  ethRegistry: (process.env.ENSV2_ETH_REGISTRY || '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4') as Address,
  verifiableFactory: (process.env.ENSV2_VERIFIABLE_FACTORY || '0xda70306c98e97ece36f997a21368e53298572991') as Address,
  permissionedResolverImpl: (process.env.ENSV2_PERMISSIONED_RESOLVER_IMPL || '0x115eb53f0c60696633855f90b138178fb40b2b2c') as Address,
  userRegistryImpl: (process.env.ENSV2_USER_REGISTRY_IMPL || '0x9bd8a88719068d09ecee662f36c0e3856708366a') as Address,
};

// Permissioned Resolver roles (docs.ens.domains/ensv2/permissioned-resolver)
export const ROLE_SET_TEXT = 1n << 4n;
export const ROLE_LINK = 1n << 28n;
// Permissioned Registry roles (docs.ens.domains/ensv2/permissioned-registry)
export const REG_ROLE_REGISTRAR = 1n << 0n;
export const REG_ROLE_RENEW = 1n << 16n;
export const REG_ROLE_SET_SUBREGISTRY = 1n << 20n;
export const REG_ROLE_SET_RESOLVER = 1n << 24n;
/** Every role and admin role (each role occupies one nibble; admins are shifted by 128). */
export const ALL_ROLES = BigInt('0x' + '1'.repeat(64));

export const resolverAbi = parseAbi([
  'function setText(bytes name, string key, string value)',
  'function linkToNode(bytes sourceName, bytes32 targetNode)',
  'function multicall(bytes[] calls) returns (bytes[])',
  'function grantSetterRoles(bytes setter, address account) returns (bool)',
  'function grantRootRoles(uint256 roleBitmap, address account) returns (bool)',
  'function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)',
  'function roles(uint256 resource, address account) view returns (uint256)',
  'function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)',
]);
export const registryAbi = parseAbi([
  'function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256 tokenId)',
  'function setResolver(uint256 anyId, address resolver)',
  'function setSubregistry(uint256 anyId, address subregistry)',
  'function getResolver(string label) view returns (address)',
  'function getSubregistry(string label) view returns (address)',
  'function grantRootRoles(uint256 roleBitmap, address account) returns (bool)',
  'function initialize((address account, uint256 roleBitmap)[] grants)',
]);
export const factoryAbi = parseAbi([
  'function deployProxy(address implementation, uint256 salt, bytes data) returns (address)',
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
]);

export const chain = () => (chainConfig.ens.network === 'mainnet' ? mainnet : sepolia);
export const publicClient = () => createPublicClient({ chain: chain(), transport: http(chainConfig.ens.rpcUrl || undefined, { timeout: 20_000 }) });

const accountFrom = (k: string) => privateKeyToAccount((k.startsWith('0x') ? k : `0x${k}`) as Hex);
export const auditorWallet = () => createWalletClient({ account: loadAuditor().account, chain: chain(), transport: http(chainConfig.ens.rpcUrl || undefined) });
export const operatorWallet = () => {
  if (!chainConfig.ens.operatorKey) throw new Error('ENS_OPERATOR_PRIVATE_KEY is not configured');
  return createWalletClient({ account: accountFrom(chainConfig.ens.operatorKey), chain: chain(), transport: http(chainConfig.ens.rpcUrl || undefined) });
};

/** DNS wire-format encoding, as the Permissioned Resolver setters expect (not a namehash). */
export function dnsEncode(name: string): Hex {
  const labels = normalize(name).split('.');
  const parts: number[] = [];
  for (const l of labels) {
    const b = stringToBytes(l);
    if (b.length > 63) throw new Error(`label too long: ${l}`);
    parts.push(b.length, ...b);
  }
  parts.push(0);
  return toHex(new Uint8Array(parts));
}

export const textResource = (key: string) => BigInt(keccak256(stringToHex(key)));
export const txUrl = (hash: string) => `${etherscanBase()}/tx/${hash}`;
export const addressUrl = (a: string) => `${etherscanBase()}/address/${a}`;

export async function deployResolverProxy(wallet: ReturnType<typeof operatorWallet>, saltTag: string, grants: { account: Address; roleBitmap: bigint }[]): Promise<{ address: Address; tx: Hex }> {
  const pc = publicClient();
  const salt = BigInt(keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }], [keccak256(stringToHex('OwnedResolver')), wallet.account.address, BigInt(keccak256(stringToHex(saltTag)))])));
  const data = encodeFunctionData({ abi: resolverAbi, functionName: 'initialize', args: [grants, []] });
  const hash = await wallet.writeContract({ address: ENSV2.verifiableFactory, abi: factoryAbi, functionName: 'deployProxy', args: [ENSV2.permissionedResolverImpl, salt, data] });
  const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== 'success') throw new Error(`resolver deployment reverted (${txUrl(hash)})`);
  const [log] = parseEventLogs({ abi: factoryAbi, eventName: 'ProxyDeployed', logs: receipt.logs });
  if (!log) throw new Error('ProxyDeployed event not found');
  return { address: log.args.proxyAddress, tx: hash };
}

export async function deployUserRegistry(wallet: ReturnType<typeof operatorWallet>, parentName: string): Promise<{ address: Address; tx: Hex }> {
  const pc = publicClient();
  const salt = BigInt(keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }], [keccak256(stringToHex('UserRegistry')), namehash(parentName), 0n])));
  const data = encodeFunctionData({ abi: registryAbi, functionName: 'initialize', args: [[{ account: wallet.account.address, roleBitmap: ALL_ROLES }]] });
  const hash = await wallet.writeContract({ address: ENSV2.verifiableFactory, abi: factoryAbi, functionName: 'deployProxy', args: [ENSV2.userRegistryImpl, salt, data] });
  const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== 'success') throw new Error(`registry deployment reverted (${txUrl(hash)})`);
  const [log] = parseEventLogs({ abi: factoryAbi, eventName: 'ProxyDeployed', logs: receipt.logs });
  if (!log) throw new Error('ProxyDeployed event not found');
  return { address: log.args.proxyAddress, tx: hash };
}

/** Resolver that holds the records of a namespace: its own resolver once registered, otherwise the root resolver (wildcard). */
export function resolverForNamespace(label: string): Address {
  return (chainCache().get(`ens:resolver:${label}`) || (label === 'lab' ? chainConfig.ens.labResolver : '') || chainConfig.ens.resolver) as Address;
}

/**
 * Register a server namespace (server.root) as a real, non-transferable subname with its own Permissioned Resolver.
 * The Auditor gets text and link roles on that resolver; the publisher later gets only the descriptive keys.
 */
export async function registerNamespace(label: string, lab: boolean): Promise<{ resolver: Address; txs: string[] }> {
  const wallet = operatorWallet();
  if (!chainConfig.ens.registry) throw new Error('ZORO_ENS_REGISTRY is not configured; run pnpm setup:ens');
  const pc = publicClient();
  const parentLabel = lab ? null : label;
  const registryLabel = lab ? 'lab' : label;
  const auditor = loadAuditor().account.address;
  const existing = (await pc.readContract({ address: chainConfig.ens.registry as Address, abi: registryAbi, functionName: 'getResolver', args: [registryLabel] })) as Address;
  if (existing && existing !== '0x0000000000000000000000000000000000000000') {
    chainCache().set(`ens:resolver:${lab ? 'lab' : label}`, existing);
    return { resolver: existing, txs: [] };
  }
  const { address, tx } = await deployResolverProxy(wallet, `zoro:${registryLabel}.${chainConfig.ens.root}`, [
    { account: wallet.account.address, roleBitmap: ALL_ROLES },
    { account: auditor, roleBitmap: ROLE_SET_TEXT | ROLE_LINK },
  ]);
  // Owner keeps resolver control; ROLE_CAN_TRANSFER_ADMIN and ROLE_SET_SUBREGISTRY are withheld (non-transferable, no sub-subnames).
  const roleBitmap = REG_ROLE_SET_RESOLVER | (REG_ROLE_SET_RESOLVER << 128n) | REG_ROLE_RENEW;
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 86_400);
  const hash = await wallet.writeContract({ address: chainConfig.ens.registry as Address, abi: registryAbi, functionName: 'register', args: [registryLabel, wallet.account.address, '0x0000000000000000000000000000000000000000', address, roleBitmap, expiry] });
  const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== 'success') throw new Error(`namespace registration reverted (${txUrl(hash)})`);
  chainCache().set(`ens:resolver:${lab ? 'lab' : parentLabel}`, address);
  return { resolver: address, txs: [tx, hash] };
}

/** Write a version's Auditor records and alias `current` to it, in one transaction from the Auditor account. */
export async function writeVersionRecords(input: { resolver: Address; versionName: string; currentName: string | null; records: Record<string, string> }): Promise<{ tx: Hex }> {
  const wallet = auditorWallet();
  const pc = publicClient();
  const name = dnsEncode(input.versionName);
  const calls: Hex[] = Object.entries(input.records).map(([k, v]) => encodeFunctionData({ abi: resolverAbi, functionName: 'setText', args: [name, k, v] }));
  if (input.currentName) calls.push(encodeFunctionData({ abi: resolverAbi, functionName: 'linkToNode', args: [dnsEncode(input.currentName), namehash(normalize(input.versionName))] }));
  const hash = await wallet.writeContract({ address: input.resolver, abi: resolverAbi, functionName: 'multicall', args: [calls] });
  const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== 'success') throw new Error(`record write reverted (${txUrl(hash)})`);
  return { tx: hash };
}

/** Grant a publisher the descriptive keys only — they can own their name and still never write a verdict. */
export async function grantPublisherKeys(resolver: Address, publisher: Address): Promise<string[]> {
  const wallet = operatorWallet();
  const pc = publicClient();
  const txs: string[] = [];
  for (const key of PUBLISHER_KEYS) {
    const setter = encodeFunctionData({ abi: resolverAbi, functionName: 'setText', args: ['0x00', key, ''] });
    const hash = await wallet.writeContract({ address: resolver, abi: resolverAbi, functionName: 'grantSetterRoles', args: [setter, publisher] });
    await pc.waitForTransactionReceipt({ hash, timeout: 180_000 });
    txs.push(hash);
  }
  return txs;
}

export interface EnsReadResult {
  name: string;
  resolver: string | null;
  records: Record<string, string | null>;
  auditorRole: boolean | null;
  error: string | null;
}

/** Read every Auditor key through the Universal Resolver (follows wildcard resolution and record links). */
export async function readVersionRecords(name: string, auditorAddress: string): Promise<EnsReadResult> {
  const pc = publicClient();
  try {
    const normalized = normalize(name);
    const resolver = await pc.getEnsResolver({ name: normalized }).catch(() => null);
    const entries = await Promise.all(AUDITOR_KEYS.map(async (k) => [k, await pc.getEnsText({ name: normalized, key: k }).catch(() => null)] as const));
    let auditorRole: boolean | null = null;
    if (resolver) {
      auditorRole = (await pc
        .readContract({ address: resolver, abi: resolverAbi, functionName: 'hasRoles', args: [textResource('zoro.verdict'), ROLE_SET_TEXT, auditorAddress as Address] })
        .catch(() => null)) as boolean | null;
    }
    return { name: normalized, resolver, records: Object.fromEntries(entries), auditorRole, error: null };
  } catch (e) {
    return { name, resolver: null, records: {}, auditorRole: null, error: (e as Error).message };
  }
}

export const ensLabelhash = (label: string) => BigInt(labelhash(label));
