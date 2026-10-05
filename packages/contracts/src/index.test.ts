import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approvalActionDigest,
  boundedDimensionsSchema,
  correlationContextSchema,
  operationalErrorSchema,
  usageRecordSchema,
} from './index.js';

const action = {
  action: 'orders.cancel',
  permission: 'orders.cancel',
  risk: 'HIGH' as const,
  resource: { type: 'order', id: 'ord_42', tenantId: '58c5ae93-e2a5-4b4b-a5c3-2fa17cc7fc97' },
  input: { reason: 'customer_request', orderId: 'ord_42' },
};

void test('approval action digest is key-order independent and payload-bound', () => {
  assert.equal(
    approvalActionDigest(action),
    approvalActionDigest({ ...action, input: { orderId: 'ord_42', reason: 'customer_request' } }),
  );
  assert.notEqual(
    approvalActionDigest(action),
    approvalActionDigest({ ...action, input: { reason: 'fraud' } }),
  );
});

void test('bounded dimensions reject nested and oversized telemetry payloads', () => {
  assert.deepEqual(boundedDimensionsSchema.parse({ outcome: 'accepted', retryable: false }), {
    outcome: 'accepted',
    retryable: false,
  });
  assert.equal(boundedDimensionsSchema.safeParse({ nested: { secret: 'nope' } }).success, false);
  assert.equal(boundedDimensionsSchema.safeParse({ value: 'x'.repeat(257) }).success, false);
});

void test('correlation and operational errors expose bounded safe context', () => {
  assert.equal(
    correlationContextSchema.safeParse({
      requestId: 'req-1',
      correlationId: 'cor-1',
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
    }).success,
    true,
  );
  assert.equal(
    operationalErrorSchema.safeParse({
      code: 'PROVIDER_TIMEOUT',
      category: 'TIMEOUT',
      retryable: true,
      correlationId: 'cor-1',
      safeDetails: { provider: 'development-api', attempt: 2 },
    }).success,
    true,
  );
});

void test('usage record cost semantics are explicit and retry identity is bounded', () => {
  const base = {
    id: '58c5ae93-e2a5-4b4b-a5c3-2fa17cc7fc97',
    tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    meterKey: 'integrations.provider_action.attempt',
    meterVersion: 1,
    quantity: 1,
    unit: 'attempt',
    occurredAt: '2026-10-06T00:00:00.000Z',
    sourceType: 'PROVIDER_ACTION',
    sourceId: 'action-1',
    resourceType: 'provider_action',
    resourceId: 'action-1',
    providerKey: 'development-api',
    correlationId: 'cor-action-1',
    idempotencyKey: 'action-1-attempt-1',
    boundedMetadata: { action_type: 'CREATE_LABEL', outcome: 'succeeded' },
  };

  assert.equal(usageRecordSchema.safeParse(base).success, true);
  assert.equal(
    usageRecordSchema.safeParse({
      ...base,
      estimatedCost: 0.01,
      costCurrency: 'USD',
      costState: 'ESTIMATED',
    }).success,
    true,
  );
  assert.equal(
    usageRecordSchema.safeParse({ ...base, estimatedCost: 0.01, costState: 'ESTIMATED' }).success,
    false,
  );
  assert.equal(
    usageRecordSchema.safeParse({ ...base, estimatedCost: 0.01, costCurrency: 'USD' }).success,
    false,
  );
});
