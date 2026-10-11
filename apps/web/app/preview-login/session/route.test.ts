import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from './route.js';

void test('hosted login redirects and secure cookies use the configured public origin', async (t) => {
  configurePreview(t);
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json({ access_token: 'synthetic-unit-test-token' })),
  );
  const result = await POST(loginRequest('https://preview.example.test'));
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), 'https://preview.example.test/customers');
  assert.match(result.headers.get('set-cookie') ?? '', /Secure/iu);
  assert.match(result.headers.get('set-cookie') ?? '', /HttpOnly/iu);
});

void test('off-origin credential posts are rejected before Keycloak is contacted', async (t) => {
  configurePreview(t);
  let contacted = false;
  t.mock.method(globalThis, 'fetch', () => {
    contacted = true;
    throw new Error('Credential exchange must not execute');
  });
  const result = await POST(loginRequest('https://attacker.example.test'));
  assert.equal(result.status, 403);
  assert.equal(contacted, false);
});

void test('credential failures return to the public preview login page', async (t) => {
  configurePreview(t);
  t.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(null, { status: 401 })));
  const result = await POST(loginRequest('https://preview.example.test'));
  assert.equal(result.status, 303);
  assert.equal(
    result.headers.get('location'),
    'https://preview.example.test/preview-login?error=invalid_credentials',
  );
});

function loginRequest(origin: string): Request {
  const body = new FormData();
  body.set('username', 'synthetic-preview-user');
  body.set('password', 'synthetic-preview-password');
  return new Request('http://0.0.0.0:8080/preview-login/session', {
    method: 'POST',
    headers: { origin },
    body,
  });
}

function configurePreview(t: { after: (cleanup: () => void) => void }): void {
  const values = {
    APP_ENV: 'development',
    APP_PUBLIC_URL: 'https://preview.example.test',
    KEYCLOAK_ISSUER: 'http://keycloak.example.test/realms/platform',
    KEYCLOAK_CLIENT_ID: 'platform-web',
    PREVIEW_TENANT_ID: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  });
}
