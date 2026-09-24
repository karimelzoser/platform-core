import assert from 'node:assert/strict';
import test from 'node:test';
import { approvalActionDigest } from './index.js';

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
