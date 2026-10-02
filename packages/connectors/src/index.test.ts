import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConnectorRegistry,
  ConnectorError,
  developmentApiConnector,
  developmentWebChatConnector,
  parseMessagingDeliveryReceipt,
  parseVerifiedConsentWebhook,
  outboundMessageResultSchema,
  parseInboundMessagingWebhook,
  toConnectorError,
  type WebhookEnvelope,
} from './index.js';
import { signDevelopmentWebChatWebhook } from './development-web-chat.js';
import { signDevelopmentApiWebhook } from './development-api.js';

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
    parseMessagingDeliveryReceipt({
      ...envelope,
      payload: {
        kind: 'messaging.delivery_receipt',
        providerMessageId: 'provider-message-2',
        status: 'FAILED',
        error: 'Provider error retained only in the delivery ledger',
      },
    })?.error,
    'Provider error retained only in the delivery ledger',
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
  assert.equal(parseInboundMessagingWebhook(envelope, ['API']), undefined);
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
  assert.equal(new ConnectorError('RATE_LIMITED', true, 120).retryAfterSeconds, 120);
  assert.equal(new ConnectorError('RATE_LIMITED', true, 3_601).retryAfterSeconds, null);
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
  registry.register(developmentApiConnector);
  registry.register(developmentWebChatConnector);
  assert.deepEqual(registry.keys(), ['development-api', 'development-web-chat']);
});

void test('the development API fixture has an isolated signature and deterministic outbound identity', async () => {
  const rawBody = Buffer.from(JSON.stringify(envelope));
  assert.equal(
    await developmentApiConnector.verifyWebhook({
      headers: new Headers({
        'x-platform-development-api-signature': signDevelopmentApiWebhook(rawBody),
      }),
      rawBody,
    }),
    true,
  );
  await developmentApiConnector.validateConnection({
    settings: { allowDevelopmentFixture: true },
    secretReference: 'development://api/preview',
  });
  await assert.rejects(
    developmentApiConnector.validateConnection({
      settings: { allowDevelopmentFixture: true },
      secretReference: 'development://web-chat/preview',
    }),
  );
  const request = {
    connectionId: 'aaaaaaaa-0000-0000-0000-000000000001',
    providerConversationId: 'development-api-conversation-1',
    idempotencyKey: 'api-message-idempotency-key',
    body: 'Hello from the API fixture',
    attachments: [],
  };
  const first = await developmentApiConnector.sendMessage(request);
  const retry = await developmentApiConnector.sendMessage(request);
  assert.equal(first.providerMessageId, retry.providerMessageId);
  assert.notEqual(
    first.providerMessageId,
    (await developmentWebChatConnector.sendMessage(request)).providerMessageId,
  );
  const action = await developmentApiConnector.executeAction?.({
    connectionId: request.connectionId,
    actionType: 'development.api.echo',
    idempotencyKey: 'api-action-idempotency-key',
    input: { safe: 'fixture data' },
    settings: { allowDevelopmentFixture: true },
    secretReference: 'development://api/preview',
  });
  assert.match(action?.providerActionId ?? '', /^development-api-action-/u);
  assert.deepEqual(action?.result, { echoed: { safe: 'fixture data' }, developmentOnly: true });
  if (!developmentApiConnector.executeAction)
    assert.fail('Development API fixture must expose typed provider actions');
  await assert.rejects(
    developmentApiConnector.executeAction({
      connectionId: request.connectionId,
      actionType: 'commerce.order.cancel',
      idempotencyKey: 'invalid-api-action',
      input: {},
      settings: { allowDevelopmentFixture: true },
      secretReference: 'development://api/preview',
    }),
  );
});

void test('development channel emulators satisfy the common provider lifecycle contract', async () => {
  const rawBody = Buffer.from(JSON.stringify(envelope));
  const fixtures = [
    {
      connector: developmentWebChatConnector,
      reference: 'development://web-chat/preview',
      signature: signDevelopmentWebChatWebhook(rawBody),
      header: 'x-platform-development-signature',
    },
    {
      connector: developmentApiConnector,
      reference: 'development://api/preview',
      signature: signDevelopmentApiWebhook(rawBody),
      header: 'x-platform-development-api-signature',
    },
  ];
  for (const fixture of fixtures) {
    await fixture.connector.validateConnection({
      settings: { allowDevelopmentFixture: true },
      secretReference: fixture.reference,
    });
    assert.equal(
      await fixture.connector.verifyWebhook({
        headers: new Headers({ [fixture.header]: fixture.signature }),
        rawBody,
      }),
      true,
    );
    assert.equal(await fixture.connector.verifyWebhook({ headers: new Headers(), rawBody }), false);
    assert.deepEqual(
      await fixture.connector.normalizeWebhook({ headers: new Headers(), body: envelope }),
      envelope,
    );
    const assets = await fixture.connector.discoverAssets?.({
      connectionId: 'aaaaaaaa-0000-0000-0000-000000000001',
      settings: { allowDevelopmentFixture: true },
      secretReference: fixture.reference,
    });
    assert.equal(assets?.length, 1);
    if (!fixture.connector.sync) assert.fail('Fixture must support synchronization');
    const sync = await fixture.connector.sync({
      connectionId: 'aaaaaaaa-0000-0000-0000-000000000001',
      kind: 'RECONCILIATION',
      cursor: { highWaterMark: '2026-09-29T00:00:00.000Z' },
      settings: { allowDevelopmentFixture: true },
      secretReference: fixture.reference,
    });
    assert.equal(sync.hasMore, false);
    assert.equal(sync.cursor.completed, true);
  }
});
