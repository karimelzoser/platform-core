import assert from 'node:assert/strict';
import test from 'node:test';
import { OpaClient } from './index.js';

void test('OPA outages fail closed', async () => {
  const client = new OpaClient({
    endpoint: new URL('http://opa.invalid/v1/data/platform/authorization/decision'),
    fetcher: () => Promise.reject(new Error('down')),
  });
  const decision = await client.decide({});
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, 'opa_unavailable');
});
