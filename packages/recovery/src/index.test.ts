import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  recoveryIsTerminal,
  recoveryWorkflowId,
  recoveryWorkflowReferenceSchema,
} from './index.js';

void test('recovery workflow IDs preserve tenant/source identity and reject arbitrary IDs', () => {
  const source = 'aaaaaaaa-0000-0000-0000-000000000672';
  const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  assert.equal(recoveryWorkflowId(tenantA, source), `recovery:${tenantA}:${source}`);
  assert.notEqual(recoveryWorkflowId(tenantA, source), recoveryWorkflowId(tenantB, source));
  assert.throws(() => recoveryWorkflowId('arbitrary-tenant', source));
});

void test('only canonical terminal states finish expiry coordination', () => {
  for (const status of ['RECOVERED', 'EXPIRED', 'CANCELLED']) {
    assert.equal(recoveryIsTerminal(status), true);
  }
  for (const status of ['ELIGIBLE', 'ACTIVE', 'SUPPRESSED'])
    assert.equal(recoveryIsTerminal(status), false);
});

void test('workflow references require a committed event identity and contain no customer payload', () => {
  assert.equal(
    recoveryWorkflowReferenceSchema.safeParse({ workflowId: 'fabricated' }).success,
    false,
  );
  const reference = recoveryWorkflowReferenceSchema.parse({
    tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    opportunityId: 'aaaaaaaa-0000-0000-0000-000000000675',
    creationEventId: 'aaaaaaaa-0000-0000-0000-000000000676',
    workflowId: 'recovery:tenant:order',
    body: 'Unnecessary PII must not enter Temporal',
  });
  assert.equal('body' in reference, false);
});
