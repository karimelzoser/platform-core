import assert from 'node:assert/strict';
import test from 'node:test';
import { requestFingerprint, sanitizeForAudit } from './index.js';

void test('request fingerprints are stable across object key order', () => {
  assert.equal(
    requestFingerprint({ customerId: 'a', update: { name: 'Ada', city: 'Cairo' } }),
    requestFingerprint({ update: { city: 'Cairo', name: 'Ada' }, customerId: 'a' }),
  );
});

void test('audit sanitization recursively redacts credential-shaped fields', () => {
  assert.deepEqual(
    sanitizeForAudit({
      authorization: 'Bearer private',
      profile: { password: 'hidden', displayName: 'Ada' },
    }),
    { authorization: '[REDACTED]', profile: { password: '[REDACTED]', displayName: 'Ada' } },
  );
});

void test('idempotency fingerprints distinguish changed expiry dates', () => {
  const original = { expiresAt: new Date('2026-10-12T10:00:00.000Z') };
  assert.equal(
    requestFingerprint(original),
    requestFingerprint({ expiresAt: '2026-10-12T10:00:00.000Z' }),
  );
  assert.notEqual(
    requestFingerprint(original),
    requestFingerprint({ expiresAt: new Date('2026-10-13T10:00:00.000Z') }),
  );
  assert.throws(() => requestFingerprint({ expiresAt: new Date('invalid') }));
});
