import { NextRequest, NextResponse } from 'next/server';

const ACCESS = 'platform_access_token';
const REFRESH = 'platform_refresh_token';
const ID = 'platform_id_token';

const publicPaths = new Set(['/', '/health', '/preview-login']);

export async function middleware(request: NextRequest) {
  if (process.env.APP_ENV === 'development') return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (
    publicPaths.has(path) ||
    path.startsWith('/auth/') ||
    path.startsWith('/_next/') ||
    path === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS)?.value;
  const refreshToken = request.cookies.get(REFRESH)?.value;
  const expiresAt = accessToken ? jwtExpiry(accessToken) : undefined;
  const now = Math.floor(Date.now() / 1000);
  if (accessToken && expiresAt !== undefined && expiresAt > now + 60) return NextResponse.next();

  if (!refreshToken) return loginRedirect(request);

  const issuer = process.env.KEYCLOAK_INTERNAL_ISSUER ?? process.env.KEYCLOAK_ISSUER;
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  if (!issuer || !clientId) return loginRedirect(request);

  try {
    const response = await fetch(new URL('protocol/openid-connect/token', withSlash(issuer)), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      }),
      cache: 'no-store',
    });
    if (!response.ok) return loginRedirect(request, true);
    const body = (await response.json()) as {
      access_token?: unknown;
      expires_in?: unknown;
      refresh_token?: unknown;
      refresh_expires_in?: unknown;
      id_token?: unknown;
    };
    if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
      return loginRedirect(request, true);
    }
    const next = NextResponse.next();
    const secure = request.nextUrl.protocol === 'https:' || process.env.APP_ENV === 'production';
    const cookie = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };
    next.cookies.set(ACCESS, body.access_token, {
      ...cookie,
      maxAge: Math.max(60, body.expires_in),
    });
    if (typeof body.refresh_token === 'string') {
      next.cookies.set(REFRESH, body.refresh_token, {
        ...cookie,
        maxAge:
          typeof body.refresh_expires_in === 'number'
            ? Math.max(300, body.refresh_expires_in)
            : 1800,
      });
    }
    if (typeof body.id_token === 'string') {
      next.cookies.set(ID, body.id_token, {
        ...cookie,
        maxAge:
          typeof body.refresh_expires_in === 'number'
            ? Math.max(60, body.refresh_expires_in)
            : Math.max(60, body.expires_in),
      });
    }
    return next;
  } catch {
    return loginRedirect(request, true);
  }
}

function loginRedirect(request: NextRequest, clearSession = false) {
  const login = request.nextUrl.clone();
  login.pathname = '/auth/login';
  login.search = '';
  const response = NextResponse.redirect(login, 303);
  if (clearSession) {
    response.cookies.delete(ACCESS);
    response.cookies.delete(REFRESH);
    response.cookies.delete(ID);
    response.cookies.delete('platform_tenant_id');
  }
  return response;
}

function jwtExpiry(token: string): number | undefined {
  const encoded = token.split('.')[1];
  if (!encoded) return undefined;
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp)
      ? payload.exp
      : undefined;
  } catch {
    return undefined;
  }
}

function withSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
