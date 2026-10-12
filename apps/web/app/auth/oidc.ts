import { createHash, randomBytes } from 'node:crypto';

export const AUTH_COOKIE = 'platform_access_token';
export const REFRESH_COOKIE = 'platform_refresh_token';
export const ID_COOKIE = 'platform_id_token';
export const STATE_COOKIE = 'platform_oidc_state';
export const VERIFIER_COOKIE = 'platform_oidc_verifier';

export interface OidcRuntime {
  publicOrigin: URL;
  publicIssuer: URL;
  internalIssuer: URL;
  clientId: string;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  id_token?: string;
}

export function oidcRuntime(environment: NodeJS.ProcessEnv = process.env): OidcRuntime {
  const publicOrigin = requiredUrl(environment.APP_PUBLIC_URL, 'APP_PUBLIC_URL');
  const publicIssuer = requiredUrl(environment.KEYCLOAK_ISSUER, 'KEYCLOAK_ISSUER');
  const internalIssuer = requiredUrl(
    environment.KEYCLOAK_INTERNAL_ISSUER ?? environment.KEYCLOAK_ISSUER,
    'KEYCLOAK_INTERNAL_ISSUER',
  );
  const clientId = environment.KEYCLOAK_CLIENT_ID?.trim();
  if (!clientId) throw new Error('KEYCLOAK_CLIENT_ID is required');
  return { publicOrigin, publicIssuer, internalIssuer, clientId };
}

export function randomOpaque(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

export function callbackUrl(runtime: OidcRuntime): URL {
  return new URL('/auth/callback', runtime.publicOrigin);
}

export function authorizationUrl(runtime: OidcRuntime, state: string, verifier: string): URL {
  const url = new URL('protocol/openid-connect/auth', withSlash(runtime.publicIssuer));
  url.searchParams.set('client_id', runtime.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('redirect_uri', callbackUrl(runtime).toString());
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', pkceChallenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return url;
}

export async function exchangeAuthorizationCode(
  runtime: OidcRuntime,
  code: string,
  verifier: string,
): Promise<TokenResponse> {
  return tokenRequest(runtime, {
    grant_type: 'authorization_code',
    client_id: runtime.clientId,
    code,
    code_verifier: verifier,
    redirect_uri: callbackUrl(runtime).toString(),
  });
}

export async function refreshAccessToken(
  runtime: OidcRuntime,
  refreshToken: string,
): Promise<TokenResponse> {
  return tokenRequest(runtime, {
    grant_type: 'refresh_token',
    client_id: runtime.clientId,
    refresh_token: refreshToken,
  });
}

export function logoutUrl(runtime: OidcRuntime, idToken?: string): URL {
  const url = new URL('protocol/openid-connect/logout', withSlash(runtime.publicIssuer));
  url.searchParams.set('client_id', runtime.clientId);
  url.searchParams.set('post_logout_redirect_uri', runtime.publicOrigin.toString());
  if (idToken) url.searchParams.set('id_token_hint', idToken);
  return url;
}

export function secureCookie(runtime: OidcRuntime): boolean {
  return runtime.publicOrigin.protocol === 'https:' || process.env.APP_ENV === 'production';
}

export function jwtExpiresAt(token: string): number | undefined {
  const [, encoded] = token.split('.');
  if (!encoded) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

async function tokenRequest(
  runtime: OidcRuntime,
  form: Record<string, string>,
): Promise<TokenResponse> {
  const response = await fetch(
    new URL('protocol/openid-connect/token', withSlash(runtime.internalIssuer)),
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
      cache: 'no-store',
    },
  );
  if (!response.ok) throw new Error(`OIDC token endpoint returned ${String(response.status)}`);
  const body = (await response.json()) as Partial<TokenResponse>;
  if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
    throw new Error('OIDC token response is incomplete');
  }
  return body as TokenResponse;
}

function requiredUrl(value: string | undefined, name: string): URL {
  if (!value?.trim()) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${name} must be HTTP(S)`);
  return url;
}

function withSlash(url: URL): string {
  return url.toString().endsWith('/') ? url.toString() : `${url.toString()}/`;
}
