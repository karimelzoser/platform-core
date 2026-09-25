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
