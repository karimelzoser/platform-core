'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export interface PreviewLoginState {
  error?: string;
}

export async function previewLogin(
  _state: PreviewLoginState,
  formData: FormData,
): Promise<PreviewLoginState> {
  if (process.env.APP_ENV !== 'development')
    return { error: 'Preview login is available only in development.' };
  const username = read(formData.get('username'));
  const password = read(formData.get('password'));
  const issuer = process.env.KEYCLOAK_ISSUER;
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const tenantId = process.env.PREVIEW_TENANT_ID;
  if (!username || !password || !issuer || !clientId || !tenantId)
    return { error: 'Preview authentication is not configured.' };
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
    if (!response.ok) return { error: 'Invalid development credentials.' };
    const body = (await response.json()) as { access_token?: unknown };
    if (typeof body.access_token !== 'string')
      return { error: 'Keycloak returned an invalid token.' };
    const store = await cookies();
    store.set('platform_access_token', body.access_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });
    store.set('platform_tenant_id', tenantId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });
  } catch {
    return { error: 'Development Keycloak is unavailable.' };
  }
  redirect('/customers');
}
function read(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
