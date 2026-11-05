/**
 * pnpm setup:hedera — create Zoro's Hedera resources and write their IDs to .env. Idempotent: existing IDs are kept.
 *
 *  • Registry topic (public verdicts, revocations, disputes, namespace claims)
 *  • Lab topic (Attack Lab records, labeled as simulations)
 *  • Organization topic (Merkle-root commitments over the local audit log)
 *  • Seal badge token (one NFT per sealed version, burned on revocation)
 *
 * Requires HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY (a funded testnet account from portal.hedera.com).
 */
import { chainConfig, hashscan, writeEnv } from '../src/config';
import { createBadgeToken, createTopic } from '../src/hedera';

if (!chainConfig.hedera.operatorId || !chainConfig.hedera.operatorKey) {
  console.error('Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in .env first (create a testnet account at https://portal.hedera.com).');
  process.exit(1);
}

const steps: [envKey: string, current: string, label: string, create: () => Promise<string>, kind: 'topic' | 'token'][] = [
  ['HEDERA_REGISTRY_TOPIC_ID', chainConfig.hedera.registryTopic, 'registry topic', () => createTopic('Zoro registry v1: public verdicts, revocations, disputes, namespace claims'), 'topic'],
  ['HEDERA_LAB_TOPIC_ID', chainConfig.hedera.labTopic, 'Attack Lab topic', () => createTopic('Zoro Attack Lab v1: simulation records (not real seals)'), 'topic'],
  ['HEDERA_ORG_TOPIC_ID', chainConfig.hedera.orgTopic, 'organization topic', () => createTopic('Zoro organization commitments v1: Merkle roots over a local audit log'), 'topic'],
  ['HEDERA_BADGE_TOKEN_ID', chainConfig.hedera.badgeToken, 'seal badge token', () => createBadgeToken(), 'token'],
];

console.log(`Hedera ${chainConfig.hedera.network} · operator ${chainConfig.hedera.operatorId}\n`);
for (const [key, current, label, create, kind] of steps) {
  if (current) {
    console.log(`✓ ${label} already configured: ${current}  ${hashscan(kind, current)}`);
    continue;
  }
  process.stdout.write(`… creating ${label} `);
  try {
    const id = await create();
    writeEnv({ [key]: id });
    console.log(`→ ${id}  ${hashscan(kind, id)}`);
  } catch (e) {
    console.log(`\n✗ failed: ${(e as Error).message}`);
    process.exit(1);
  }
}
console.log('\nDone. Restart the daemon (pnpm dev) to start anchoring verdicts.');
process.exit(0);
