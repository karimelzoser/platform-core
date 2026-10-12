import { NextResponse } from 'next/server';
import {
  STATE_COOKIE,
  VERIFIER_COOKIE,
  authorizationUrl,
  oidcRuntime,
  randomOpaque,
  secureCookie,
} from '../oidc';

export async function GET() {
  if (process.env.APP_ENV === 'development') {
    return NextResponse.redirect(new URL('/preview-login', process.env.APP_PUBLIC_URL ?? 'http://localhost:3000'));
  }
  try {
    const runtime = oidcRuntime();
    const state = randomOpaque();
    const verifier = randomOpaque(48);
    const response = NextResponse.redirect(authorizationUrl(runtime, state, verifier), 303);
    const cookie = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: secureCookie(runtime),
      path: '/auth',
      maxAge: 600,
    };
    response.cookies.set(STATE_COOKIE, state, cookie);
    response.cookies.set(VERIFIER_COOKIE, verifier, cookie);
    return response;
  } catch {
    return new NextResponse('Production identity is not configured.', { status: 503 });
  }
}
