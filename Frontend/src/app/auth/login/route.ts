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
    return NextResponse.json({ error: 'The Zoro daemon is not reachable. Start it with pnpm dev.' }, { status: 503 });
  }
  if (!ok) return NextResponse.json({ error: 'That token is not valid for this Zoro daemon.' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set('zoro_console', token, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
