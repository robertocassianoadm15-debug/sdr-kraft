import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url));
  res.cookies.set('sdr_auth', '', { maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax' });
  return res;
}
