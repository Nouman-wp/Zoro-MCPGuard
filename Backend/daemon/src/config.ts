import { config as loadEnv } from 'dotenv';
import { existsSync, mkdirSync } from 'node:fs';
import { ENV_PATH, chainConfig, dataDir } from '@zoro/blockchain/config';

// Chain settings, explorer links and the shared data directory come from the Blockchain package.
export { ENV_PATH, REPO_ROOT, ensAppUrl, etherscanBase, hashscan, isEnsConfigured, isHederaConfigured, mirrorBase } from '@zoro/blockchain/config';

loadEnv({ path: ENV_PATH, quiet: true });

const env = (k: string, d = '') => (process.env[k] ?? d).trim();
const bool = (k: string, d: boolean) => {
  const v = env(k);
  return v === '' ? d : /^(1|true|yes|on)$/i.test(v);
};

export const VERSION = '0.1.0';

export const config = {
  port: Number(env('ZORO_PORT') || env('PORT') || '7420'), // PORT is what hosting platforms set
  host: env('ZORO_HOST', '127.0.0.1'),
  /** Per-user application-data folder (database, auditor key, tokens); never inside the repository. */
  dataDir,
  webOrigin: env('ZORO_WEB_ORIGIN', 'http://localhost:3000'),
  /** Hosted deployments: fixed tokens survive restarts on platforms whose disk is wiped, and the public host is allowed on /mcp. */
  consoleToken: env('ZORO_CONSOLE_TOKEN'),
  gatewayToken: env('ZORO_GATEWAY_TOKEN'),
  allowedHosts: env('ZORO_ALLOWED_HOSTS').split(',').map((h) => h.trim()).filter(Boolean),
  publicUrl: env('ZORO_PUBLIC_URL', 'http://localhost:3000'),
  refreshIntervalSec: Number(env('ZORO_REFRESH_INTERVAL_SEC', '60')),
  approvalWaitSec: Number(env('ZORO_APPROVAL_WAIT_SEC', '45')),
  approvalWindowSec: Number(env('ZORO_APPROVAL_WINDOW_SEC', '900')),
  anchorIntervalSec: Number(env('ZORO_ANCHOR_INTERVAL_SEC', '900')),
  maxDefinitionBytes: Number(env('ZORO_MAX_DEFINITION_BYTES', '65536')),
  /** OpenAI-compatible AI provider; Groq's free tier by default. */
  ai: {
    apiKey: env('GROQ_API_KEY') || env('AI_API_KEY'),
    baseUrl: env('AI_BASE_URL', 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
    askModel: env('ASK_MODEL', 'openai/gpt-oss-120b'),
    guardModel: env('ASK_GUARD_MODEL', 'openai/gpt-oss-20b'),
  },
  sentinel: {
    apiKeyPresent: (env('GROQ_API_KEY') || env('AI_API_KEY')) !== '',
    model: env('SENTINEL_MODEL', 'openai/gpt-oss-120b'),
    requireAi: bool('SENTINEL_REQUIRE_AI', true),
    sealLifetimeDays: Number(env('SENTINEL_SEAL_LIFETIME_DAYS', '28')),
    dualReviewHighImpact: bool('SENTINEL_DUAL_REVIEW', true),
  },
  /** Same objects as the Blockchain package's config, so updates made by either side are seen by both. */
  ens: chainConfig.ens,
  hedera: chainConfig.hedera,
  world: {
    appId: env('WORLD_APP_ID'),
    rpId: env('WORLD_RP_ID'),
    signingKey: env('WORLD_SIGNING_KEY'),
    environment: (env('WORLD_ENVIRONMENT', 'staging') as 'staging' | 'production'),
    verifyBase: env('WORLD_VERIFY_BASE', 'https://developer.world.org'),
    approvalTtlSec: Number(env('WORLD_APPROVAL_TTL_SEC', '300')),
  },
  orgName: env('ZORO_ORG_NAME', ''),
};

export const isWorldConfigured = () => Boolean(config.world.appId && config.world.rpId && config.world.signingKey);

if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
