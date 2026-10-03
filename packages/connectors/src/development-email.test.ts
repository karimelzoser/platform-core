import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConnectorRegistry,
  developmentEmailConnector,
  parseInboundMessagingWebhook,
  parseMessagingDeliveryReceipt,
  providerBoundary,
  signDevelopmentEmailWebhook,
} from './index.js';

void test('development email fixture verifies, normalizes, syncs, and preserves idempotency', async () => {
  const inbound = {
    deliveryId: 'email-delivery-1',
    event: 'email.received',
    message: {
      id: 'email-message-1',
      from: 'customer@example.test',
      to: 'support@example.test',
      subject: 'Need help',
      text: 'Hello from email',
      occurredAt: '2026-10-03T00:00:00.000Z',
    },
  } as const;
  const rawBody = Buffer.from(JSON.stringify(inbound));

  assert.equal(
    await developmentEmailConnector.verifyWebhook({
      headers: new Headers({
        'x-platform-development-email-signature': signDevelopmentEmailWebhook(rawBody),
      }),
      rawBody,
    }),
    true,
  );
  assert.equal(
    await developmentEmailConnector.verifyWebhook({
      headers: new Headers({ 'x-platform-development-email-signature': 'invalid' }),
      rawBody,
    }),
    false,
  );

  const normalized = await developmentEmailConnector.normalizeWebhook({
    headers: new Headers(),
    body: inbound,
  });
  assert.deepEqual(parseInboundMessagingWebhook(normalized, ['EMAIL']), {
    kind: 'messaging.inbound_message',
    channel: 'EMAIL',
    providerConversationId: 'customer@example.test',
    providerMessageId: 'email-message-1',
    body: 'Hello from email',
    sentAt: '2026-10-03T00:00:00.000Z',
  });

  const receipt = await developmentEmailConnector.normalizeWebhook({
    headers: new Headers(),
    body: {
      deliveryId: 'email-delivery-2',
      event: 'email.delivered',
      messageId: 'email-message-2',
      mailbox: 'support@example.test',
      occurredAt: '2026-10-03T00:01:00.000Z',
    },
  });
  assert.deepEqual(parseMessagingDeliveryReceipt(receipt), {
    kind: 'messaging.delivery_receipt',
    providerMessageId: 'email-message-2',
    status: 'DELIVERED',
    occurredAt: '2026-10-03T00:01:00.000Z',
  });

  await developmentEmailConnector.validateConnection({
    settings: { allowDevelopmentFixture: true },
    secretReference: 'development://email/preview',
  });
  await assert.rejects(
    developmentEmailConnector.validateConnection({
      settings: { allowDevelopmentFixture: true },
      secretReference: 'development://api/preview',
    }),
    { code: 'AUTHENTICATION_FAILED' },
  );

  const connectionId = 'aaaaaaaa-7777-7777-7777-777777777777';
  assert.deepEqual(
    await developmentEmailConnector.discoverAssets?.({
      connectionId,
      settings: { allowDevelopmentFixture: true },
      secretReference: 'development://email/preview',
    }),
    [
      {
        assetType: 'email_mailbox',
        providerId: `development-email:${connectionId}`,
        name: 'Development Email Mailbox',
        state: 'ACTIVE',
        attributes: { developmentOnly: true },
      },
    ],
  );

  assert.deepEqual(
    await developmentEmailConnector.sync?.({
      connectionId,
      kind: 'INITIAL',
      cursor: { highWaterMark: '2026-10-01T00:00:00.000Z' },
      settings: { allowDevelopmentFixture: true },
      secretReference: 'development://email/preview',
    }),
    {
      cursor: {
        highWaterMark: '2026-10-01T00:00:00.000Z',
        developmentFixture: true,
        completed: true,
      },
      pages: 0,
      items: 0,
      hasMore: false,
    },
  );

  const webhook = await developmentEmailConnector.registerWebhook?.({
    connectionId,
    callbackUrl: 'https://preview.example.test/v1/webhooks/development-email/connection',
    settings: { allowDevelopmentFixture: true },
    secretReference: 'development://email/preview',
  });
  assert.match(webhook?.providerSubscriptionId ?? '', /^development-email-webhook-/u);

  const outbound = {
    connectionId,
    providerConversationId: 'customer@example.test',
    idempotencyKey: 'email-send-idempotency-key',
    body: 'Reply from PRENEURA',
    attachments: [],
  };
  const first = await developmentEmailConnector.sendMessage(outbound);
  const retry = await developmentEmailConnector.sendMessage(outbound);
  assert.equal(first.providerMessageId, retry.providerMessageId);
  assert.match(first.providerMessageId, /^development-email-/u);

  await assert.rejects(
    developmentEmailConnector.sendMessage({
      ...outbound,
      providerConversationId: 'not-an-email',
    }),
    { code: 'INVALID_REQUEST' },
  );
  await assert.rejects(
    developmentEmailConnector.sendMessage({
      ...outbound,
      attachments: [
        {
          storageKey: 'development/email-attachment',
          mediaType: 'FILE',
          contentType: 'application/pdf',
          fileName: 'document.pdf',
          byteSize: 1,
        },
      ],
    }),
    { code: 'UNSUPPORTED_OPERATION' },
  );

  const registry = new ConnectorRegistry();
  registry.register(developmentEmailConnector);
  assert.deepEqual(registry.keys(), ['development-email']);
  assert.equal(providerBoundary('email')?.implementationState, 'DEVELOPMENT_FIXTURE');
});
