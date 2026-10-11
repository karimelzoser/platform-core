import assert from 'node:assert/strict';
import test from 'node:test';
import { previewPublicOrigin, previewRequestOriginAllowed } from './public-origin.js';

void test('Railway redirects use configured public domain instead of the container listener', () => {
  const origin = previewPublicOrigin('http://0.0.0.0:8080/preview-login/session', {
    RAILWAY_PUBLIC_DOMAIN: 'preview.example.test',
  });
  assert.equal(new URL('/customers', origin).href, 'https://preview.example.test/customers');
});

void test('Codespaces and loopback redirects retain their deployment origins', () => {
  assert.equal(
    previewPublicOrigin('http://0.0.0.0:3000/preview-login/session', {
      CODESPACE_NAME: 'disposable-space',
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev',
    }).origin,
    'https://disposable-space-3000.app.github.dev',
  );
  assert.equal(
    previewPublicOrigin('http://127.0.0.1:3000/preview-login/session', {}).origin,
    'http://127.0.0.1:3000',
  );
});

void test('explicit public origin takes precedence and cannot encode credentials or redirects', () => {
  assert.equal(
    previewPublicOrigin('http://0.0.0.0:8080/preview-login/session', {
      APP_PUBLIC_URL: 'https://configured.example.test',
      RAILWAY_PUBLIC_DOMAIN: 'different.example.test',
    }).origin,
    'https://configured.example.test',
  );
  for (const value of [
    'https://user:password@example.test',
    'http://public.example.test',
    'https://example.test/elsewhere',
    'https://example.test?redirect=https://attacker.test',
    'https://0.0.0.0:8080',
  ]) {
    assert.throws(() => previewPublicOrigin('http://localhost:3000/', { APP_PUBLIC_URL: value }));
  }
  assert.throws(() => previewPublicOrigin('http://0.0.0.0:8080/', {}));
  assert.throws(() =>
    previewPublicOrigin('http://0.0.0.0:8080/', { RAILWAY_PUBLIC_DOMAIN: 'attacker.test/path' }),
  );
});

void test('preview credential exchange rejects off-origin browser requests', () => {
  const expected = new URL('https://preview.example.test');
  assert.equal(previewRequestOriginAllowed('https://preview.example.test', expected), true);
  assert.equal(previewRequestOriginAllowed('https://attacker.example.test', expected), false);
  assert.equal(previewRequestOriginAllowed('null', expected), false);
  assert.equal(previewRequestOriginAllowed('https://preview.example.test/path', expected), false);
});
