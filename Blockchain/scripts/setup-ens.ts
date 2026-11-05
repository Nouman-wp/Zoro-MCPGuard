/**
 * pnpm setup:ens — wire Zoro's registry into an ENSv2 name you own on Sepolia. Idempotent.
 *
 *  1. Checks ZORO_ENS_ROOT (e.g. yourname.eth) and that ENS_OPERATOR_PRIVATE_KEY can act for it.
 *  2. Deploys a UserRegistry for the root through the ENSv2 VerifiableFactory and sets it as the subregistry,
 *     so server namespaces (server.yourname.eth) become real, non-transferable subnames.
 *  3. Deploys a Permissioned Resolver for the root and sets it. The operator holds every role; the Auditor
 *     (ZORO_AUDITOR_PRIVATE_KEY, or the key generated in the data directory) gets ROLE_SET_TEXT and ROLE_LINK only.
 *  4. Publishes the auditor address on the root (zoro.auditor) and registers the Lab namespace (lab.yourname.eth).
 *
 * Replacing an existing resolver on the root would hide its current records, so it requires --replace-resolver.
 */
import { keccak256, stringToHex, type Address } from 'viem';
import { normalize } from 'viem/ens';
import { loadAuditor } from '../src/auditor';
import { chainConfig, etherscanBase, writeEnv } from '../src/config';
import {
  ALL_ROLES,
  ENSV2,
  ROLE_LINK,
  ROLE_SET_TEXT,
  deployResolverProxy,
  deployUserRegistry,
  dnsEncode,
  ensLabelhash,
  operatorWallet,
  publicClient,
  registerNamespace,
  registryAbi,
  resolverAbi,
} from '../src/ens';

const ZERO = '0x0000000000000000000000000000000000000000';
const { account: auditorAccount, source: auditorKeySource } = loadAuditor();
const replaceResolver = process.argv.includes('--replace-resolver');

const root = chainConfig.ens.root;
if (!root || !/^[a-z0-9-]+\.eth$/.test(root)) {
  console.error('Set ZORO_ENS_ROOT to a second-level .eth name you own on ENSv2 Sepolia (for example zoro-yourteam.eth).');
  console.error('Register one in the ENS app on Sepolia (https://sepolia.app.ens.domains) first.');
  process.exit(1);
}
if (!chainConfig.ens.operatorKey) {
  console.error('Set ENS_OPERATOR_PRIVATE_KEY to the key of the account that owns the root name.');
  process.exit(1);
}

const pc = publicClient();
const wallet = operatorWallet();
const label = root.slice(0, -'.eth'.length);
const anyId = ensLabelhash(label);
const tx = (h: string) => `${etherscanBase()}/tx/${h}`;

console.log(`ENSv2 ${chainConfig.ens.network} · root ${root}`);
console.log(`operator ${wallet.account.address} · auditor ${auditorAccount.address} (${auditorKeySource === 'generated' ? 'generated locally' : 'from ZORO_AUDITOR_PRIVATE_KEY'})\n`);

const balance = await pc.getBalance({ address: wallet.account.address });
if (balance === 0n) {
  console.error('The operator account has no Sepolia ETH for gas. Fund it from a Sepolia faucet and run this again.');
  process.exit(1);
}

// 1. Subregistry for the root (server namespaces live here).
let registry = (await pc.readContract({ address: ENSV2.ethRegistry, abi: registryAbi, functionName: 'getSubregistry', args: [label] })) as Address;
if (registry && registry !== ZERO) console.log(`✓ subregistry already set: ${registry}`);
else {
  process.stdout.write('… deploying UserRegistry for the root ');
  const d = await deployUserRegistry(wallet, root);
  registry = d.address;
  console.log(`→ ${registry}  ${tx(d.tx)}`);
  process.stdout.write('… setting it as the root subregistry ');
  const h = await wallet.writeContract({ address: ENSV2.ethRegistry, abi: registryAbi, functionName: 'setSubregistry', args: [anyId, registry] });
  const r = await pc.waitForTransactionReceipt({ hash: h, timeout: 180_000 });
  if (r.status !== 'success') throw new Error(`setSubregistry reverted: ${tx(h)} — does the operator own ${root}?`);
  console.log(`✓ ${tx(h)}`);
}
writeEnv({ ZORO_ENS_REGISTRY: registry });
chainConfig.ens.registry = registry;

// 2. Permissioned Resolver for the root, with the Auditor role separated from the operator.
let resolver = (await pc.readContract({ address: ENSV2.ethRegistry, abi: registryAbi, functionName: 'getResolver', args: [label] })) as Address;
const ours = chainConfig.ens.resolver && resolver && resolver.toLowerCase() === chainConfig.ens.resolver.toLowerCase();
if (ours) console.log(`✓ root resolver already set: ${resolver}`);
else {
  if (resolver && resolver !== ZERO && !replaceResolver) {
    console.error(`\n${root} already uses resolver ${resolver}. Setting Zoro's resolver would hide its current records.`);
    console.error('Use a name dedicated to Zoro, or run again with --replace-resolver.');
    process.exit(1);
  }
  process.stdout.write('… deploying Permissioned Resolver for the root ');
  const d = await deployResolverProxy(wallet, `zoro:${root}`, [
    { account: wallet.account.address, roleBitmap: ALL_ROLES },
    { account: auditorAccount.address, roleBitmap: ROLE_SET_TEXT | ROLE_LINK },
  ]);
  resolver = d.address;
  console.log(`→ ${resolver}  ${tx(d.tx)}`);
  process.stdout.write('… setting it as the root resolver ');
  const h = await wallet.writeContract({ address: ENSV2.ethRegistry, abi: registryAbi, functionName: 'setResolver', args: [anyId, resolver] });
  const r = await pc.waitForTransactionReceipt({ hash: h, timeout: 180_000 });
  if (r.status !== 'success') throw new Error(`setResolver reverted: ${tx(h)}`);
  console.log(`✓ ${tx(h)}`);
}
writeEnv({ ZORO_ENS_RESOLVER: resolver });
chainConfig.ens.resolver = resolver;

// 3. Publish the auditor identity on the root, so anyone can find which key signs verdicts.
const current = await pc.getEnsText({ name: normalize(root), key: 'zoro.auditor' }).catch(() => null);
if (current?.toLowerCase() === auditorAccount.address.toLowerCase()) console.log(`✓ zoro.auditor already published`);
else {
  process.stdout.write('… publishing zoro.auditor on the root ');
  const h = await wallet.writeContract({ address: resolver, abi: resolverAbi, functionName: 'setText', args: [dnsEncode(root), 'zoro.auditor', auditorAccount.address] });
  await pc.waitForTransactionReceipt({ hash: h, timeout: 180_000 });
  console.log(`✓ ${tx(h)}`);
}

// 4. Lab namespace (lab.<root>), so Attack Lab records are always distinguishable from real seals.
process.stdout.write('… registering the Lab namespace ');
const lab = await registerNamespace('lab', true);
writeEnv({ ZORO_ENS_LAB_RESOLVER: lab.resolver });
chainConfig.ens.labResolver = lab.resolver;
console.log(`✓ lab.${root} → resolver ${lab.resolver}${lab.txs.length ? `  ${lab.txs.map(tx).join('  ')}` : ' (already registered)'}`);

const auditorBalance = await pc.getBalance({ address: auditorAccount.address });
console.log(`\nDone. Auditor role check: resolver hasRoles(zoro.verdict) for ${auditorAccount.address} = ${await pc.readContract({ address: resolver, abi: resolverAbi, functionName: 'hasRoles', args: [BigInt(keccak256(stringToHex('zoro.verdict'))), ROLE_SET_TEXT, auditorAccount.address] })}`);
if (auditorBalance === 0n) console.log(`⚠ The auditor account ${auditorAccount.address} has no Sepolia ETH. Fund it: the auditor pays gas for verdict records.`);
console.log('Restart the daemon (pnpm dev) to start publishing verdicts.');
process.exit(0);
