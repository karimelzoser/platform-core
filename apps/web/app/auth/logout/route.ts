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

export async function GET(request: NextRequest) {
  let destination = new URL('/', request.url);
  try {
    const runtime = oidcRuntime();
    destination = logoutUrl(runtime, request.cookies.get(ID_COOKIE)?.value);
  } catch {
    // Clearing the local session is still safe when the provider is unavailable.
  }
  const response = NextResponse.redirect(destination, 303);
  for (const cookie of [AUTH_COOKIE, REFRESH_COOKIE, ID_COOKIE, STATE_COOKIE, VERIFIER_COOKIE]) {
    response.cookies.delete(cookie);
  }
  response.cookies.delete('platform_tenant_id');
  return response;
}
