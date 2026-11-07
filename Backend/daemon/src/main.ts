import { timingSafeEqual } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import './actions';
import './disputes';
import './publisher';
import './lockdown';
import { featuresApi } from './api/features';
import { handleHook } from './hooks';
import { hostJoinComplete, hostJoinStart, hostSync, memberSync } from './org';
import { checkPinnedUpdates } from './pins';
import { rateLimit } from './ratelimit';
import { checkAllServers } from './recall';
import { scanPermitted } from './onboarding';
import { startWatchdog, sweepWatchdog } from './watchdog';
import { gatewayToken } from './gateway/http';
import { consoleApi } from './api/console';
import { publicApi } from './api/public';
import { startAnchoring } from './anchors';
import { expireApprovals } from './approvals';
import { VERSION, config, isEnsConfigured, isHederaConfigured, isWorldConfigured, originAllowed } from './config';
import { measureDeterministic } from './corpus';
import { all } from './db';
import { gateway } from './gateway/gateway';
import { handleMcp } from './gateway/http';
import { expireHumanSeals } from './humanseal';
import { auditorAccount, auditorKeySource, consoleToken } from './keys';
import { lab } from './lab/lab';
import { watchForBypass } from './onboarding';
import { startOutbox } from './registry/outbox';
import { checkRegistry, pollLedger } from './registry/watch';
import { aiConfigured } from './sentinel/ai';
import { expireSeals } from './sentinel/runner';

const app = new Hono();
const startedAt = Date.now();

/**
 * Liveness for the hosting health check and the keep-alive ping. Answers from memory only: it never touches the
 * database, the chain or the auditor, so it stays fast and cannot fail because a dependency is slow.
 */
app.get('/healthz', (c) => c.json({ ok: true, version: VERSION, uptimeSec: Math.round((Date.now() - startedAt) / 1000) }, 200, { 'cache-control': 'no-store' }));

// The web app reaches the API through same-origin rewrites; direct browser calls are allowed only from its own origins.
const allowOrigin = (origin: string) => (originAllowed(origin) ? origin : null);
app.use('/api/public/*', cors({ origin: allowOrigin, allowMethods: ['GET', 'POST'] }));
// Abuse control for public endpoints: Lab runs spend AI quota and testnet funds, lookups hit the database.
app.use('/api/public/lab/start', rateLimit('lab-start', 6, 60));
app.use('/api/public/lab/reset', rateLimit('lab-reset', 6, 60));
app.use('/api/public/*', rateLimit('public', 240, 60));
app.use('/api/org/v1/*', rateLimit('org', 60, 60));
app.use('/api/auth/check', rateLimit('auth', 10, 60));
app.use('/api/console/*', cors({ origin: allowOrigin, credentials: true, allowHeaders: ['content-type', 'x-zoro-console-token'] }));

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Console access requires the local console token (§8.5), so another user on the machine cannot read activity. */
app.use('/api/console/*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const token = c.req.header('x-zoro-console-token') ?? getCookie(c, 'zoro_console') ?? c.req.query('token') ?? '';
  if (!safeEqual(token, consoleToken)) return c.json({ error: 'Console token required' }, 401);
  await next();
});

/** A malformed request body is the caller's mistake (400); anything else is ours (500) and is logged, not echoed. */
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  if (err instanceof SyntaxError && /JSON/i.test(err.message)) return c.json({ error: 'The request body is not valid JSON.' }, 400);
  console.error(`[zoro] ${c.req.method} ${c.req.path}:`, err);
  return c.json({ error: 'Internal error' }, 500);
});

app.get('/', (c) => c.json({ name: 'zoro-daemon', version: VERSION, console: `${config.webOrigin}/console`, mcp: `http://${config.host}:${config.port}/mcp` }));
app.route('/api/public', publicApi);
app.route('/api/console', consoleApi);
app.route('/api/console', featuresApi);

/** Claude Code PreToolUse hook: built-in tools, package and skill installs (authenticated with the gateway token). */
app.post('/hooks/claude-code', async (c) => {
  const token = c.req.header('x-zoro-gateway-token') ?? c.req.query('token') ?? '';
  if (!safeEqual(token, gatewayToken)) return c.json({ error: 'Gateway token required' }, 401);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  return c.json(await handleHook(body));
});

// Organization server: members join with a World ID proof and sync their inventory. Server-to-server, no browser CORS.
app.post('/api/org/v1/join/start', async (c) => {
  const b = await c.req.json<{ invite?: string }>().catch(() => ({} as { invite?: string }));
  try {
    return c.json(hostJoinStart(String(b.invite ?? '')));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
app.post('/api/org/v1/join/complete', async (c) => {
  const b = await c.req.json<{ invite: string; sealId: string; result: Record<string, unknown>; name: string; device: Record<string, string> }>();
  try {
    return c.json(await hostJoinComplete({ invite: b.invite, sealId: b.sealId, result: b.result ?? {}, name: b.name ?? '', device: b.device ?? {} }));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
app.post('/api/org/v1/sync', async (c) => {
  const auth = c.req.header('authorization') ?? '';
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const r = hostSync(auth.replace(/^Bearer\s+/i, ''), body);
  return r.status === 200 ? c.json(r.body) : c.json({ error: r.error }, r.status);
});
app.all('/mcp', (c) => handleMcp(c.req.raw));
app.post('/api/auth/check', async (c) => {
  const { token } = await c.req.json<{ token: string }>().catch(() => ({ token: '' }));
  return c.json({ ok: safeEqual(token ?? '', consoleToken) });
});

async function boot() {
  await gateway.init();
  lab.init();
  startOutbox();
  startAnchoring();
  measureDeterministic();

  const every = (ms: number, fn: () => unknown) => setInterval(() => void Promise.resolve().then(fn).catch(() => undefined), ms).unref();
  every(5_000, () => {
    expireApprovals();
    expireHumanSeals();
  });
  every(60_000, () =>
    expireSeals((fp) => {
      // Re-audit expired seals for every live server that still runs that version (§3.2).
      for (const l of all<{ server_id: string; kind: 'tool' | 'prompt' | 'resource_template'; name: string }>('SELECT server_id, kind, name FROM live WHERE fingerprint = ?', fp)) {
        try {
          gateway.reaudit(l.server_id, l.kind, l.name);
        } catch {
          /* server gone */
        }
      }
    }),
  );
  every(config.hedera.pollSec * 1000, pollLedger);
  every(30_000, checkRegistry);
  every(5 * 60_000, watchForBypass);
  // Settings watchdog (needs the user's permission to read client configs), organization sync, supply-chain checks.
  if (scanPermitted()) startWatchdog();
  every(30_000, () => {
    if (scanPermitted()) {
      startWatchdog();
      sweepWatchdog();
    }
  });
  every(60_000, memberSync);
  every(6 * 3_600_000, checkPinnedUpdates);
  every(12 * 3_600_000, checkAllServers);
  setTimeout(() => void memberSync(), 5_000).unref();
  setTimeout(() => void checkAllServers().catch(() => undefined), 60_000).unref();
  void pollLedger();

  serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    const line = '─'.repeat(64);
    console.log(`\n${line}\n  Zoro daemon ${VERSION}  ·  http://${info.address}:${info.port}\n${line}`);
    console.log(`  Console login : ${config.consoleToken ? `${config.webOrigin}/console/login (token from ZORO_CONSOLE_TOKEN)` : `${config.webOrigin}/console/login?token=${consoleToken}`}`);
    console.log(`  MCP endpoint  : http://127.0.0.1:${info.port}/mcp  (gateway token in ${config.dataDir}/gateway.token)`);
    console.log(`  Auditor       : ${auditorAccount.address} (${auditorKeySource === 'generated' ? 'generated locally' : 'from ZORO_AUDITOR_PRIVATE_KEY'})`);
    console.log(`  AI review     : ${aiConfigured() ? config.sentinel.model : config.sentinel.requireAi ? 'not configured — clean versions stay pending' : 'not configured — development mode'}`);
    console.log(`  ENSv2         : ${isEnsConfigured() ? `${config.ens.network} · ${config.ens.root}` : 'not configured'}`);
    console.log(`  Hedera        : ${isHederaConfigured() ? `${config.hedera.network} · ${config.hedera.registryTopic}` : 'not configured'}`);
    console.log(`  World ID      : ${isWorldConfigured() ? config.world.environment : 'not configured'}`);
    console.log(`  Data          : ${config.dataDir}\n${line}\n`);
  });
}

void boot();

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, async () => {
    for (const up of gateway.upstreams.values()) await up.stop().catch(() => undefined);
    process.exit(0);
  });
