import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('zoro_console', '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return res;
}
