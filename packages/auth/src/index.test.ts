import assert from 'node:assert/strict';
import test from 'node:test';
import { bearerToken } from './index.js';

void test('accepts only a single bearer token', () => {
  assert.equal(
    bearerToken('Bearer eyJhbGciOiJSUzI1NiJ9.payload.signature'),
    'eyJhbGciOiJSUzI1NiJ9.payload.signature',
  );
  assert.throws(() => bearerToken('Basic credentials'));
  assert.throws(() => bearerToken(undefined));
});
