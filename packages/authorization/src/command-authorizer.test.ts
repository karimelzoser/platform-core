import assert from 'node:assert/strict';
import test from 'node:test';
import { approvalActionDigest } from '@platform/contracts';
import { CommandAuthorizer } from './command-authorizer.js';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const action = {
  action: 'orders.cancel',
  permission: 'orders.cancel',
  risk: 'HIGH' as const,
  resource: { type: 'order', id: 'order-1', tenantId },
  input: { reason: 'customer_request' },
};
const subject = {
  id: 'user-1',
  tenantId,
  permissions: ['orders.cancel'],
  authenticated: true as const,
};
const authorizer = new CommandAuthorizer(
  {
    decide: () =>
      Promise.resolve({
        allow: false,
        requires_approval: true,
        reason: 'approval_required',
        policy_version: 'test',
      }),
  },
  () => new Date('2026-09-25T00:00:00.000Z'),
);

void test('requires approval for high-risk commands and binds its exact action', async () => {
  assert.deepEqual(await authorizer.authorize(subject, action), {
    kind: 'APPROVAL_REQUIRED',
    reason: 'approval_required',
  });
  assert.deepEqual(
    await authorizer.authorize(subject, action, {
      id: 'approval-1',
      actionDigest: approvalActionDigest(action),
      status: 'APPROVED',
      expiresAt: new Date('2026-09-26T00:00:00.000Z'),
    }),
    { kind: 'ALLOWED', approvalId: 'approval-1' },
  );
  assert.deepEqual(
    await authorizer.authorize(
      subject,
      { ...action, input: { reason: 'fraud' } },
      {
        id: 'approval-1',
        actionDigest: approvalActionDigest(action),
        status: 'APPROVED',
        expiresAt: new Date('2026-09-26T00:00:00.000Z'),
      },
    ),
    { kind: 'DENIED', reason: 'approval_digest_mismatch' },
  );
  assert.deepEqual(
    await authorizer.authorize(subject, action, {
      id: 'approval-requested',
      actionDigest: approvalActionDigest(action),
      status: 'REQUESTED',
      expiresAt: new Date('2026-09-26T00:00:00.000Z'),
    }),
    { kind: 'DENIED', reason: 'approval_not_approved' },
  );
  assert.deepEqual(
    await authorizer.authorize(subject, action, {
      id: 'approval-expired',
      actionDigest: approvalActionDigest(action),
      status: 'APPROVED',
      expiresAt: new Date('2026-09-24T00:00:00.000Z'),
    }),
    { kind: 'DENIED', reason: 'approval_expired' },
  );
});
