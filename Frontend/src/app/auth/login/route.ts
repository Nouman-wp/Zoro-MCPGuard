import { NextResponse } from 'next/server';

const daemon = process.env.ZORO_DAEMON_URL ?? `http://127.0.0.1:${process.env.ZORO_PORT ?? '7420'}`;

/** Exchange the console token (printed by the daemon) for an httpOnly cookie that the API rewrites forward. */
export async function POST(req: Request) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });
  let ok = false;
  try {
    const r = await fetch(`${daemon}/api/auth/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store' });
    ok = ((await r.json()) as { ok?: boolean }).ok === true;
  } catch {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(req.url).hostname);
    return NextResponse.json({ error: local ? 'The Zoro daemon is not reachable. Start it with pnpm dev.' : 'The Zoro backend is not reachable right now. If it was asleep it takes about a minute to start; try again shortly.' }, { status: 503 });
  }
  if (!ok) return NextResponse.json({ error: 'That token is not valid for this Zoro daemon.' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  // Behind a hosting proxy the request URL can read http://, so the forwarded protocol decides.
  const https = (req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')).split(',')[0].trim() === 'https';
  res.cookies.set('zoro_console', token, { httpOnly: true, secure: https, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
