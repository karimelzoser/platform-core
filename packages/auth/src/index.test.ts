import assert from 'node:assert/strict';
import test from 'node:test';
import { authAssuranceFromClaims, bearerToken } from './index.js';

void test('accepts only a single bearer token', () => {
  assert.equal(
    bearerToken('Bearer eyJhbGciOiJSUzI1NiJ9.payload.signature'),
    'eyJhbGciOiJSUzI1NiJ9.payload.signature',
  );
  assert.throws(() => bearerToken('Basic credentials'));
  assert.throws(() => bearerToken(undefined));
});

void test('derives MFA assurance only from explicit authentication methods', () => {
  assert.deepEqual(
    authAssuranceFromClaims({ sub: 'subject', amr: ['pwd', 'otp'], acr: '2' }),
    { mfaSatisfied: true, methods: ['pwd', 'otp'], acr: '2' },
  );
  assert.deepEqual(authAssuranceFromClaims({ sub: 'subject', amr: ['pwd'] }), {
    mfaSatisfied: false,
    methods: ['pwd'],
  });
});
