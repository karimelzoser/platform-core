import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type {
  IntegrationSyncRequest,
  IntegrationSyncResult,
  MessagingConnector,
  OutboundMessageRequest,
  ProviderActionRequest,
  ProviderActionResult,
  ProviderAsset,
} from './index.js';
import { ConnectorError, webhookEnvelopeSchema, type WebhookEnvelope } from './index.js';

const fixtureSecret = 'platform-development-messenger-platform-fixture';
const signatureHeader = 'x-hub-signature-256';

const messengerWebhookSchema = z.object({
  object: z.literal('page'),
  entry: z
    .array(
      z.object({
        id: z.string().min(1).max(500),
        messaging: z
          .array(
            z.object({
              sender: z.object({ id: z.string().min(1).max(500) }),
              recipient: z.object({ id: z.string().min(1).max(500) }),
              timestamp: z.number().int().nonnegative().optional(),
              message: z
                .object({ mid: z.string().min(1).max(500), text: z.string().min(1).max(20_000) })
                .optional(),
              delivery: z
                .object({
                  mids: z.array(z.string().min(1).max(500)).length(1),
                  watermark: z.number().int().nonnegative().optional(),
                })
                .optional(),
            }),
          )
          .length(1),
      }),
    )
    .length(1),
});

function signature(rawBody: Uint8Array): string {
  return `sha256=${createHmac('sha256', fixtureSecret).update(rawBody).digest('hex')}`;
}

function fixedTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function occurredAt(timestamp: number | undefined): string | undefined {
  return timestamp === undefined ? undefined : new Date(timestamp).toISOString();
}

function normalizeMessengerWebhook(body: unknown): WebhookEnvelope {
  const webhook = messengerWebhookSchema.parse(body);
  const entry = webhook.entry[0];
  const event = entry?.messaging[0];
  if (!entry || !event || (event.message && event.delivery) || (!event.message && !event.delivery))
    throw new ConnectorError('INVALID_REQUEST', false);

  if (event.message) {
    return webhookEnvelopeSchema.parse({
      deliveryId: `messenger:${entry.id}:message:${event.message.mid}`,
      eventType: 'messenger.message.received',
      occurredAt: occurredAt(event.timestamp),
      resource: { type: 'facebook_page', providerId: event.recipient.id },
      payload: {
        kind: 'messaging.inbound_message',
        channel: 'MESSENGER',
        providerConversationId: event.sender.id,
        providerMessageId: event.message.mid,
        body: event.message.text,
        sentAt: occurredAt(event.timestamp),
      },
    });
  }

  const delivery = event.delivery;
  const providerMessageId = delivery?.mids[0];
  if (!providerMessageId) throw new ConnectorError('INVALID_REQUEST', false);
  return webhookEnvelopeSchema.parse({
    deliveryId: `messenger:${entry.id}:delivery:${providerMessageId}`,
    eventType: 'messenger.message.delivered',
    occurredAt: occurredAt(delivery.watermark ?? event.timestamp),
    resource: { type: 'facebook_page', providerId: event.recipient.id },
    payload: {
      kind: 'messaging.delivery_receipt',
      providerMessageId,
      status: 'DELIVERED',
      occurredAt: occurredAt(delivery.watermark ?? event.timestamp),
    },
  });
}

export function buildMessengerTextRequest(input: { recipientId: string; body: string }): {
  recipient: { id: string };
  messaging_type: 'RESPONSE';
  message: { text: string };
} {
  return {
    recipient: { id: z.string().min(1).max(500).parse(input.recipientId) },
    messaging_type: 'RESPONSE',
    message: { text: z.string().min(1).max(20_000).parse(input.body) },
  };
}

/** A Meta-shaped Messenger emulator, enabled only outside production. */
export const developmentMessengerPlatformConnector: MessagingConnector = {
  manifest: {
    key: 'development-messenger-platform',
    version: '1.0.0',
    category: 'MESSAGING',
    capabilities: [
      'messaging.inbound',
      'messaging.outbound',
      'webhooks',
      'sync',
      'provider.actions',
    ],
    credentialSchema: { type: 'development-fixture' },
    settingsSchema: { type: 'object', required: ['allowDevelopmentFixture'] },
  },
  messagingChannels: ['MESSENGER'],
  verifyWebhook({ headers, rawBody }): Promise<boolean> {
    const provided = headers.get(signatureHeader);
    return Promise.resolve(
      typeof provided === 'string' && fixedTimeEquals(provided, signature(rawBody)),
    );
  },
  identifyWebhook({ body }): { deliveryId: string; eventType: string } {
    const envelope = normalizeMessengerWebhook(body);
    return { deliveryId: envelope.deliveryId, eventType: envelope.eventType };
  },
  normalizeWebhook({ body }): Promise<WebhookEnvelope> {
    return Promise.resolve(normalizeMessengerWebhook(body));
  },
  validateConnection({ settings, secretReference }): Promise<void> {
    if (
      settings.allowDevelopmentFixture !== true ||
      !secretReference.startsWith('development://messenger-platform/')
    )
      return Promise.reject(
        new Error('Messenger fixture requires its explicit development fixture reference'),
      );
    return Promise.resolve();
  },
  health(): Promise<{ latencyMs: number }> {
    return Promise.resolve({ latencyMs: 0 });
  },
  discoverAssets(input): Promise<readonly ProviderAsset[]> {
    return Promise.resolve([
      {
        assetType: 'facebook_page',
        providerId: `development-messenger-page:${input.connectionId}`,
        name: 'Development Messenger page',
        state: 'ACTIVE',
        attributes: { developmentOnly: true },
      },
    ]);
  },
  sync(input: IntegrationSyncRequest): Promise<IntegrationSyncResult> {
    return Promise.resolve({
      cursor: { ...input.cursor, developmentFixture: true, completed: true },
      pages: 0,
      items: 0,
      hasMore: false,
    });
  },
  registerWebhook(input) {
    return Promise.resolve({
      providerSubscriptionId: `development-messenger-webhook-${createHash('sha256')
        .update(`${input.connectionId}:${input.callbackUrl}`)
        .digest('hex')
        .slice(0, 32)}`,
    });
  },
  unregisterWebhook() {
    return Promise.resolve();
  },
  supportedActionTypes: ['development.messenger_platform.echo'],
  executeAction(input: ProviderActionRequest): Promise<ProviderActionResult> {
    if (input.actionType !== 'development.messenger_platform.echo')
      return Promise.reject(new Error('Messenger fixture does not support this action type'));
    return Promise.resolve({
      providerActionId: `development-messenger-action-${createHash('sha256')
        .update(`${input.connectionId}:${input.idempotencyKey}`)
        .digest('hex')
        .slice(0, 32)}`,
      result: { echoed: input.input, developmentOnly: true },
      completedAt: new Date().toISOString(),
    });
  },
  sendMessage(input: OutboundMessageRequest) {
    if (input.attachments.length > 0)
      return Promise.reject(new ConnectorError('UNSUPPORTED_OPERATION', false));
    buildMessengerTextRequest({
      recipientId: input.providerConversationId,
      body: input.body,
    });
    return Promise.resolve({
      providerMessageId: `development-messenger-${createHash('sha256')
        .update(`${input.connectionId}:${input.idempotencyKey}`)
        .digest('hex')
        .slice(0, 32)}`,
      acceptedAt: new Date().toISOString(),
    });
  },
};

export function signDevelopmentMessengerPlatformWebhook(rawBody: Uint8Array): string {
  return signature(rawBody);
}
