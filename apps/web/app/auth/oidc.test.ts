import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authorizationUrl,
  callbackUrl,
  jwtExpiresAt,
  logoutUrl,
  oidcRuntime,
  pkceChallenge,
} from './oidc';

test('builds Authorization Code + PKCE request against the public issuer', () => {
  const runtime = oidcRuntime({
    APP_PUBLIC_URL: 'https://app.example.test',
    KEYCLOAK_ISSUER: 'https://auth.example.test/realms/platform',
    KEYCLOAK_INTERNAL_ISSUER: 'http://keycloak:8080/realms/platform',
    KEYCLOAK_CLIENT_ID: 'platform-web',
  } as NodeJS.ProcessEnv);
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.equal(pkceChallenge(verifier), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.equal(callbackUrl(runtime).toString(), 'https://app.example.test/auth/callback');
  const url = authorizationUrl(runtime, 'state-value', verifier);
  assert.equal(url.origin, 'https://auth.example.test');
  assert.equal(url.pathname, '/realms/platform/protocol/openid-connect/auth');
  assert.equal(url.searchParams.get('client_id'), 'platform-web');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 'state-value');
});

test('keeps public issuer separate from private token endpoint issuer', () => {
  const runtime = oidcRuntime({
    APP_PUBLIC_URL: 'https://app.example.test',
    KEYCLOAK_ISSUER: 'https://auth.example.test/realms/platform',
    KEYCLOAK_INTERNAL_ISSUER: 'http://keycloak:8080/realms/platform',
    KEYCLOAK_CLIENT_ID: 'platform-web',
  } as NodeJS.ProcessEnv);
  assert.equal(runtime.publicIssuer.toString(), 'https://auth.example.test/realms/platform');
  assert.equal(runtime.internalIssuer.toString(), 'http://keycloak:8080/realms/platform');
  const logout = logoutUrl(runtime, 'id-token');
  assert.equal(logout.origin, 'https://auth.example.test');
  assert.equal(logout.searchParams.get('id_token_hint'), 'id-token');
  assert.equal(logout.searchParams.get('post_logout_redirect_uri'), 'https://app.example.test/');
});

test('reads token expiry only as refresh timing metadata', () => {
  const payload = Buffer.from(JSON.stringify({ exp: 2_000_000_000 }), 'utf8').toString('base64url');
  assert.equal(jwtExpiresAt(`header.${payload}.signature`), 2_000_000_000);
  assert.equal(jwtExpiresAt('not-a-jwt'), undefined);
});

test('requires deployment identity configuration', () => {
  assert.throws(() => oidcRuntime({} as NodeJS.ProcessEnv), /APP_PUBLIC_URL is required/);
});
