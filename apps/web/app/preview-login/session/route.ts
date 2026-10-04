import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  if (process.env.APP_ENV !== 'development') return new NextResponse(null, { status: 404 });

  const formData = await request.formData();
  const username = read(formData.get('username'));
  const password = read(formData.get('password'));
  const issuer = process.env.KEYCLOAK_ISSUER;
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const tenantId = process.env.PREVIEW_TENANT_ID;
  if (!username || !password || !issuer || !clientId || !tenantId)
    return redirectWithError(request, 'misconfigured');

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
    if (!response.ok) return redirectWithError(request, 'invalid_credentials');
    const body = (await response.json()) as { access_token?: unknown };
    if (typeof body.access_token !== 'string')
      return redirectWithError(request, 'invalid_credentials');

    const destination = new URL('/customers', request.url);
    const next = NextResponse.redirect(destination, 303);
    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure:
        process.env.PREVIEW_SECURE_COOKIES === 'true' || new URL(request.url).protocol === 'https:',
      path: '/',
    };
    next.cookies.set('platform_access_token', body.access_token, cookieOptions);
    next.cookies.set('platform_tenant_id', tenantId, cookieOptions);
    return next;
  } catch {
    return redirectWithError(request, 'keycloak_unavailable');
  }
}

function redirectWithError(request: Request, error: string) {
  const destination = new URL('/preview-login', request.url);
  destination.searchParams.set('error', error);
  return NextResponse.redirect(destination, 303);
}

function read(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
