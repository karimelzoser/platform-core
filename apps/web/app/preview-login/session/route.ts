import { NextResponse } from 'next/server';
import { previewPublicOrigin, previewRequestOriginAllowed } from '../public-origin';

export async function POST(request: Request) {
  if (process.env.APP_ENV !== 'development') return new NextResponse(null, { status: 404 });

  let publicOrigin: URL;
  try {
    publicOrigin = previewPublicOrigin(request.url, {
      APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
      RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN,
      CODESPACE_NAME: process.env.CODESPACE_NAME,
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:
        process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN,
    });
  } catch {
    return new NextResponse('Preview public origin is not configured.', { status: 503 });
  }
  if (!previewRequestOriginAllowed(request.headers.get('origin'), publicOrigin)) {
    return new NextResponse('Invalid preview request origin.', { status: 403 });
  }

  const formData = await request.formData();
  const username = read(formData.get('username'));
  const password = read(formData.get('password'));
  const issuer = process.env.KEYCLOAK_ISSUER;
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const tenantId = process.env.PREVIEW_TENANT_ID;
  if (!username || !password || !issuer || !clientId || !tenantId)
    return redirectWithError(publicOrigin, 'misconfigured');

  try {
    const response = await fetch(new URL('protocol/openid-connect/token', `${issuer}/`), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: clientId,
        username,
        password,
      }),
    });
    if (!response.ok) return redirectWithError(publicOrigin, 'invalid_credentials');
    const body = (await response.json()) as { access_token?: unknown };
    if (typeof body.access_token !== 'string')
      return redirectWithError(publicOrigin, 'invalid_credentials');

    const destination = new URL('/customers', publicOrigin);
    const next = NextResponse.redirect(destination, 303);
    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.PREVIEW_SECURE_COOKIES === 'true' || publicOrigin.protocol === 'https:',
      path: '/',
    };
    next.cookies.set('platform_access_token', body.access_token, cookieOptions);
    next.cookies.set('platform_tenant_id', tenantId, cookieOptions);
    return next;
  } catch {
    return redirectWithError(publicOrigin, 'keycloak_unavailable');
  }
}

function redirectWithError(publicOrigin: URL, error: string) {
  const destination = new URL('/preview-login', publicOrigin);
  destination.searchParams.set('error', error);
  return NextResponse.redirect(destination, 303);
}

function read(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
