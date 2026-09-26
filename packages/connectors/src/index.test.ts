import assert from 'node:assert/strict';
import test from 'node:test';
import {
  outboundMessageResultSchema,
  parseInboundMessagingWebhook,
  type WebhookEnvelope,
} from './index.js';

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

void test('requires a bounded provider result for an outbound dispatch', () => {
  assert.deepEqual(
    outboundMessageResultSchema.parse({
      providerMessageId: 'provider-message-2',
      acceptedAt: '2026-09-26T12:00:00.000Z',
    }),
    {
      providerMessageId: 'provider-message-2',
      acceptedAt: '2026-09-26T12:00:00.000Z',
    },
  );
  assert.equal(
    outboundMessageResultSchema.safeParse({ providerMessageId: '', acceptedAt: 'not-a-date' })
      .success,
    false,
  );
});
