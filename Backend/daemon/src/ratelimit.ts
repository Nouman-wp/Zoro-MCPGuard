import type { Context, Next } from 'hono';

/**
 * Per-client fixed-window rate limits for public endpoints (Attack Lab, Verify lookups, organization joins and the
 * console-token check). In memory: a restart resets the windows, which is fine for abuse control.
 */

const buckets = new Map<string, { count: number; reset: number }>();

export const clientIp = (c: Context) =>
  (c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || 'local').slice(0, 64);

export function rateLimit(name: string, max: number, windowSec: number) {
  return async (c: Context, next: Next) => {
    const key = `${name}:${clientIp(c)}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.reset) {
      b = { count: 0, reset: now + windowSec * 1000 };
      buckets.set(key, b);
    }
    b.count++;
    if (b.count > max) {
      const retry = Math.ceil((b.reset - now) / 1000);
      c.header('retry-after', String(retry));
      return c.json({ error: `Too many requests. Try again in ${retry}s.`, retryAfterSec: retry }, 429);
    }
    await next();
  };
}

// Drop expired windows now and then so the map cannot grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}, 60_000).unref();
