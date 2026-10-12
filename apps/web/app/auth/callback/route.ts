import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE,
  ID_COOKIE,
  REFRESH_COOKIE,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  exchangeAuthorizationCode,
  oidcRuntime,
  secureCookie,
} from '../oidc';

export async function GET(request: NextRequest) {
  let runtime;
  try {
    runtime = oidcRuntime();
  } catch {
    return new NextResponse('Production identity is not configured.', { status: 503 });
  }

  const state = request.nextUrl.searchParams.get('state');
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const verifier = request.cookies.get(VERIFIER_COOKIE)?.value;

  if (error) return failure(runtime.publicOrigin, `Identity provider error: ${error}`);
  if (!state || !expectedState || state !== expectedState || !code || !verifier) {
    return failure(runtime.publicOrigin, 'Authentication state could not be verified.');
  }

  try {
    const tokens = await exchangeAuthorizationCode(runtime, code, verifier);
    const response = NextResponse.redirect(new URL('/organizations', runtime.publicOrigin), 303);
    const baseCookie = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: secureCookie(runtime),
      path: '/',
    };
    response.cookies.set(AUTH_COOKIE, tokens.access_token, {
      ...baseCookie,
      maxAge: Math.max(60, tokens.expires_in),
    });
    if (tokens.refresh_token) {
      response.cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
        ...baseCookie,
        maxAge: Math.max(300, tokens.refresh_expires_in ?? 1800),
      });
    }
    if (tokens.id_token) {
      response.cookies.set(ID_COOKIE, tokens.id_token, {
        ...baseCookie,
        maxAge: Math.max(60, tokens.refresh_expires_in ?? tokens.expires_in),
      });
    }
    clearTransientCookies(response);
    return response;
  } catch {
    return failure(runtime.publicOrigin, 'Authentication token exchange failed.');
  }
}

function failure(origin: URL, message: string) {
  const target = new URL('/', origin);
  target.searchParams.set('auth_error', message);
  const response = NextResponse.redirect(target, 303);
  clearTransientCookies(response);
  return response;
}

function clearTransientCookies(response: NextResponse): void {
  response.cookies.set(STATE_COOKIE, '', { path: '/auth', maxAge: 0 });
  response.cookies.set(VERIFIER_COOKIE, '', { path: '/auth', maxAge: 0 });
}
