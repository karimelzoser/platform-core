import assert from 'node:assert/strict';
import test from 'node:test';
import { correlationId, parseWebhookJson } from './webhook-ingress.service.js';

void test('webhook JSON parser only accepts object payloads', () => {
  assert.deepEqual(parseWebhookJson(Buffer.from('{"event":"updated"}')), { event: 'updated' });
  assert.throws(() => parseWebhookJson(Buffer.from('[]')), /JSON object/);
  assert.throws(() => parseWebhookJson(Buffer.from('{')), SyntaxError);
});

void test('correlation IDs are bounded and generated when unavailable', () => {
  assert.equal(correlationId('correlation-1'), 'correlation-1');
  assert.match(correlationId(undefined), /^[0-9a-f-]{36}$/);
  assert.match(correlationId('a'.repeat(129)), /^[0-9a-f-]{36}$/);
});
