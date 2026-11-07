import { config as loadEnv } from 'dotenv';
import { existsSync, mkdirSync } from 'node:fs';
import { ENV_PATH, chainConfig, dataDir } from '@zoro/blockchain/config';

// Chain settings, explorer links and the shared data directory come from the Blockchain package.
export { ENV_PATH, REPO_ROOT, ensAppUrl, etherscanBase, hashscan, hcsMessageUrl, isEnsConfigured, isHederaConfigured, mirrorBase } from '@zoro/blockchain/config';

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
  /** Public hosts accepted on /mcp. Render sets RENDER_EXTERNAL_HOSTNAME on every web service, so it is added automatically. */
  allowedHosts: [...env('ZORO_ALLOWED_HOSTS').split(','), env('RENDER_EXTERNAL_HOSTNAME')].map((h) => h.trim()).filter(Boolean),
  /** Browser origins, besides webOrigin, allowed to call the API cross-origin. Comma-separated; `*` matches one hostname segment. */
  corsOrigins: env('ZORO_CORS_ORIGINS').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean),
  /** Set on hosts whose disk is wiped on restart or redeploy (Render free instances): reported as a degraded dependency. */
  ephemeralStorage: bool('ZORO_EPHEMERAL_STORAGE', false),
  publicUrl: env('ZORO_PUBLIC_URL', 'http://localhost:3000'),
  refreshIntervalSec: Number(env('ZORO_REFRESH_INTERVAL_SEC', '60')),
  approvalWaitSec: Number(env('ZORO_APPROVAL_WAIT_SEC', '45')),
  /** How long the Attack Lab's scripted agent waits for a decision: long enough to complete a World ID Human Seal. */
  labApprovalWaitSec: Number(env('ZORO_LAB_APPROVAL_WAIT_SEC', '90')),
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
    // staging: World ID Simulator; sandbox: the World ID Sandbox app (TestFlight / Play testing); production: World App.
    environment: (env('WORLD_ENVIRONMENT', 'staging') as 'staging' | 'sandbox' | 'production'),
    verifyBase: env('WORLD_VERIFY_BASE', 'https://developer.world.org'),
    approvalTtlSec: Number(env('WORLD_APPROVAL_TTL_SEC', '300')),
  },
  orgName: env('ZORO_ORG_NAME', ''),
};

export const isWorldConfigured = () => Boolean(config.world.appId && config.world.rpId && config.world.signingKey);

const originPatterns = [config.webOrigin.replace(/\/+$/, ''), ...config.corsOrigins].map(
  (o) => new RegExp(`^${o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`, 'i'),
);
/** True when a browser origin may call the API cross-origin: the Console origin plus ZORO_CORS_ORIGINS, nothing broader. */
export const originAllowed = (origin: string) => originPatterns.some((p) => p.test(origin));

if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
