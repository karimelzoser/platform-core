import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeContactPoint } from './index.js';

void test('customer contact normalization canonicalizes email and E.164 phone identities', () => {
  assert.equal(
    normalizeContactPoint({
      channel: 'EMAIL',
      value: ' Ada@Example.COM ',
      isPrimary: true,
      isVerified: false,
    }).normalizedValue,
    'ada@example.com',
  );
  assert.equal(
    normalizeContactPoint({
      channel: 'PHONE',
      value: '+20 (10) 1234-5678',
      isPrimary: false,
      isVerified: true,
    }).normalizedValue,
    '+201012345678',
  );
  assert.throws(
    () =>
      normalizeContactPoint({
        channel: 'WHATSAPP',
        value: '01012345678',
        isPrimary: false,
        isVerified: false,
      }),
    /E.164/,
  );
});
