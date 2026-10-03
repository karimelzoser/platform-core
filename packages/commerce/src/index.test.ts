import assert from 'node:assert/strict';
import test from 'node:test';
import { CommerceInvariantError, commerceProviderEntityTypeSchema } from './index.js';

void test('commerce provider entity types remain an explicit canonical allowlist', () => {
  const expected = [
    'STORE',
    'PRODUCT',
    'VARIANT',
    'INVENTORY_LOCATION',
    'ORDER',
    'PAYMENT',
    'FULFILLMENT',
  ] as const;

  for (const entityType of expected)
    assert.equal(commerceProviderEntityTypeSchema.parse(entityType), entityType);

  assert.equal(commerceProviderEntityTypeSchema.safeParse('SHOPIFY_ORDER').success, false);
  assert.equal(commerceProviderEntityTypeSchema.safeParse('REFUND').success, false);
});

void test('commerce invariant failures expose a stable domain error type', () => {
  const error = new CommerceInvariantError('invalid commerce relationship');
  assert.equal(error.name, 'CommerceInvariantError');
  assert.equal(error.message, 'invalid commerce relationship');
});
