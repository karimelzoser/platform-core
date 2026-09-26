import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInboundMessagingWebhook, type WebhookEnvelope } from './index.js';

const envelope: WebhookEnvelope = {
  deliveryId: 'provider-delivery-1',
  eventType: 'message.created',
  resource: { type: 'message', providerId: 'provider-message-1' },
  payload: {
    kind: 'messaging.inbound_message',
    channel: 'WEB_CHAT',
    providerConversationId: 'provider-conversation-1',
    providerMessageId: 'provider-message-1',
    body: 'Hello from the customer',
  },
};

void test('parses a bounded canonical inbound messaging payload', () => {
  assert.deepEqual(parseInboundMessagingWebhook(envelope), {
    kind: 'messaging.inbound_message',
    channel: 'WEB_CHAT',
    providerConversationId: 'provider-conversation-1',
    providerMessageId: 'provider-message-1',
    body: 'Hello from the customer',
  });
});

void test('does not treat unrelated webhook payloads as inbound messages', () => {
  assert.equal(
    parseInboundMessagingWebhook({ ...envelope, payload: { kind: 'commerce.order.updated' } }),
    undefined,
  );
});
