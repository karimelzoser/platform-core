import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE,
  ID_COOKIE,
  REFRESH_COOKIE,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  logoutUrl,
  oidcRuntime,
} from '../oidc';

export function GET(request: NextRequest) {
  let destination = new URL('/', request.url);
  try {
    const runtime = oidcRuntime();
    destination = logoutUrl(runtime, request.cookies.get(ID_COOKIE)?.value);
  } catch {
    // Clearing the local session is still safe when the provider is unavailable.
  }
  const response = NextResponse.redirect(destination, 303);
  for (const cookie of [AUTH_COOKIE, REFRESH_COOKIE, ID_COOKIE]) {
    response.cookies.delete(cookie);
  }
  response.cookies.set(STATE_COOKIE, '', { path: '/auth', maxAge: 0 });
  response.cookies.set(VERIFIER_COOKIE, '', { path: '/auth', maxAge: 0 });
  response.cookies.delete('platform_tenant_id');
  return response;
}
