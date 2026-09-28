import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseMessagingDeliveryReceipt,
  parseVerifiedConsentWebhook,
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

void test('parses a bounded canonical outbound delivery receipt', () => {
  assert.deepEqual(
    parseMessagingDeliveryReceipt({
      ...envelope,
      payload: {
        kind: 'messaging.delivery_receipt',
        providerMessageId: 'provider-message-2',
        status: 'DELIVERED',
        occurredAt: '2026-09-26T12:00:00.000Z',
      },
    }),
    {
      kind: 'messaging.delivery_receipt',
      providerMessageId: 'provider-message-2',
      status: 'DELIVERED',
      occurredAt: '2026-09-26T12:00:00.000Z',
    },
  );
  assert.equal(
    parseMessagingDeliveryReceipt({ ...envelope, payload: { kind: 'messaging.delivery_receipt' } }),
    undefined,
  );
});

void test('does not treat unrelated webhook payloads as inbound messages', () => {
  assert.equal(
    parseInboundMessagingWebhook({ ...envelope, payload: { kind: 'commerce.order.updated' } }),
    undefined,
  );
});

void test('parses only a bounded provider-verified communication consent payload', () => {
  assert.deepEqual(
    parseVerifiedConsentWebhook({
      ...envelope,
      payload: {
        kind: 'crm.communication_consent_verified',
        customerId: 'aaaaaaaa-0000-0000-0000-000000000401',
        channel: 'EMAIL',
        providerConsentId: 'provider-consent-1',
      },
    }),
    {
      kind: 'crm.communication_consent_verified',
      customerId: 'aaaaaaaa-0000-0000-0000-000000000401',
      channel: 'EMAIL',
      providerConsentId: 'provider-consent-1',
    },
  );
  assert.equal(
    parseVerifiedConsentWebhook({
      ...envelope,
      payload: { kind: 'crm.communication_consent_verified', channel: 'EMAIL' },
    }),
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
