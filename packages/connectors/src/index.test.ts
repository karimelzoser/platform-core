import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConnectorRegistry,
  ConnectorError,
  developmentWebChatConnector,
  parseMessagingDeliveryReceipt,
  parseVerifiedConsentWebhook,
  outboundMessageResultSchema,
  parseInboundMessagingWebhook,
  toConnectorError,
  type WebhookEnvelope,
} from './index.js';
import { signDevelopmentWebChatWebhook } from './development-web-chat.js';

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

void test('maps unknown provider failures to a safe retryable error', () => {
  const known = new ConnectorError('RATE_LIMITED', true);
  assert.equal(toConnectorError(known), known);
  const mapped = toConnectorError(new Error('provider response leaked'));
  assert.equal(mapped.name, 'ConnectorError');
  assert.equal(mapped.message, 'UNKNOWN_PROVIDER_FAILURE');
  assert.equal(mapped.code, 'UNKNOWN_PROVIDER_FAILURE');
  assert.equal(mapped.retryable, true);
});

void test('the development Web Chat fixture signs webhooks and preserves outbound idempotency', async () => {
  const rawBody = Buffer.from(JSON.stringify(envelope));
  assert.equal(
    await developmentWebChatConnector.verifyWebhook({
      headers: new Headers({
        'x-platform-development-signature': signDevelopmentWebChatWebhook(rawBody),
      }),
      rawBody,
    }),
    true,
  );
  assert.equal(
    await developmentWebChatConnector.verifyWebhook({ headers: new Headers(), rawBody }),
    false,
  );
  await developmentWebChatConnector.validateConnection({
    settings: { allowDevelopmentFixture: true },
    secretReference: 'development://web-chat/preview',
  });
  await assert.rejects(
    developmentWebChatConnector.validateConnection({
      settings: { allowDevelopmentFixture: true },
      secretReference: 'provider://not-development',
    }),
  );
  const request = {
    connectionId: 'aaaaaaaa-0000-0000-0000-000000000001',
    providerConversationId: 'development-conversation-1',
    idempotencyKey: 'message-idempotency-key',
    body: 'Hello from a fixture',
    attachments: [],
  };
  const first = await developmentWebChatConnector.sendMessage(request);
  const retry = await developmentWebChatConnector.sendMessage(request);
  assert.equal(first.providerMessageId, retry.providerMessageId);
  assert.deepEqual(
    await developmentWebChatConnector.discoverAssets?.({
      connectionId: request.connectionId,
      settings: { allowDevelopmentFixture: true },
      secretReference: 'development://web-chat/preview',
    }),
    [
      {
        assetType: 'web_chat_channel',
        providerId: `development-web-chat:${request.connectionId}`,
        name: 'Development Web Chat',
        state: 'ACTIVE',
        attributes: { developmentOnly: true },
      },
    ],
  );
  assert.deepEqual(
    await developmentWebChatConnector.sync?.({
      connectionId: request.connectionId,
      kind: 'INITIAL',
      cursor: { highWaterMark: '2026-01-01T00:00:00.000Z' },
      settings: { allowDevelopmentFixture: true },
      secretReference: 'development://web-chat/preview',
    }),
    {
      cursor: {
        highWaterMark: '2026-01-01T00:00:00.000Z',
        developmentFixture: true,
        completed: true,
      },
      pages: 0,
      items: 0,
      hasMore: false,
    },
  );
  const webhookSubscription = await developmentWebChatConnector.registerWebhook?.({
    connectionId: request.connectionId,
    callbackUrl: 'https://preview.example.test/v1/webhooks/development-web-chat/connection',
    settings: { allowDevelopmentFixture: true },
    secretReference: 'development://web-chat/preview',
  });
  assert.match(webhookSubscription?.providerSubscriptionId ?? '', /^development-webhook-/u);
  await developmentWebChatConnector.unregisterWebhook?.({
    connectionId: request.connectionId,
    callbackUrl: 'https://preview.example.test/v1/webhooks/development-web-chat/connection',
    settings: { allowDevelopmentFixture: true },
    secretReference: 'development://web-chat/preview',
    providerSubscriptionId: webhookSubscription?.providerSubscriptionId ?? 'missing',
  });

  const registry = new ConnectorRegistry();
  registry.register(developmentWebChatConnector);
  assert.deepEqual(registry.keys(), ['development-web-chat']);
});
