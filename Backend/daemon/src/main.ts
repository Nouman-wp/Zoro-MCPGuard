import { timingSafeEqual } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import './actions';
import './disputes';
import './publisher';
import { consoleApi } from './api/console';
import { publicApi } from './api/public';
import { startAnchoring } from './anchors';
import { expireApprovals } from './approvals';
import { VERSION, config, isEnsConfigured, isHederaConfigured, isWorldConfigured } from './config';
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

app.use('/api/public/*', cors({ origin: '*', allowMethods: ['GET', 'POST'] }));
app.use('/api/console/*', cors({ origin: config.webOrigin, credentials: true, allowHeaders: ['content-type', 'x-zoro-console-token'] }));

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
