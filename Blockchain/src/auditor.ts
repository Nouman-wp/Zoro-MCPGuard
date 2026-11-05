import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { recoverMessageAddress, type Hex, type PrivateKeyAccount } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { attestationMessage, verdictHash, type Attestation, type VerdictPackage } from '@zoro/core';
import { chainConfig, dataDir } from './config';

export interface Auditor {
  account: PrivateKeyAccount;
  privateKey: Hex;
  source: 'env' | 'generated';
}

let auditor: Auditor | null = null;

/**
 * The Auditor identity: ZORO_AUDITOR_PRIVATE_KEY, or a key generated once in the data directory and reused after.
 * Loaded on first use, so importing this package has no side effects.
 */
export function loadAuditor(): Auditor {
  if (auditor) return auditor;
  const file = path.join(dataDir, 'auditor.key');
  let privateKey: Hex;
  let source: Auditor['source'];
  if (chainConfig.auditorKey) {
    privateKey = (chainConfig.auditorKey.startsWith('0x') ? chainConfig.auditorKey : `0x${chainConfig.auditorKey}`) as Hex;
    source = 'env';
  } else if (existsSync(file)) {
    privateKey = readFileSync(file, 'utf8').trim() as Hex;
    source = 'generated';
  } else {
    mkdirSync(dataDir, { recursive: true });
    privateKey = generatePrivateKey();
    writeFileSync(file, privateKey, { mode: 0o600 });
    source = 'generated';
  }
  auditor = { account: privateKeyToAccount(privateKey), privateKey, source };
  return auditor;
}

/** Sign a verdict package (FR-A5). The attestation binds fingerprint, auditor configuration and the verdict hash. */
export async function attest(pkg: VerdictPackage): Promise<Attestation> {
  const { account } = loadAuditor();
  const hash = verdictHash(pkg);
  const message = attestationMessage(hash);
  const signature = await account.signMessage({ message });
  return { scheme: 'eip191-keccak256', auditor: account.address, verdictHash: hash, message, signature, signedAt: new Date().toISOString(), confidentialCompute: null };
}

export async function verifyAttestation(pkg: VerdictPackage): Promise<{ ok: boolean; recovered: string | null; hashMatches: boolean }> {
  if (!pkg.attestation) return { ok: false, recovered: null, hashMatches: false };
  const hash = verdictHash(pkg);
  const hashMatches = hash === pkg.attestation.verdictHash;
  try {
    const recovered = await recoverMessageAddress({ message: attestationMessage(pkg.attestation.verdictHash), signature: pkg.attestation.signature as Hex });
    return { ok: hashMatches && recovered.toLowerCase() === pkg.attestation.auditor.toLowerCase(), recovered, hashMatches };
  } catch {
    return { ok: false, recovered: null, hashMatches };
  }
}
