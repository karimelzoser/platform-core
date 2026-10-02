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

const fixtureSecret = 'platform-development-instagram-messaging-fixture';
const signatureHeader = 'x-hub-signature-256';

const instagramWebhookSchema = z.object({
  object: z.literal('instagram'),
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

function normalizeInstagramWebhook(body: unknown): WebhookEnvelope {
  const webhook = instagramWebhookSchema.parse(body);
  const entry = webhook.entry[0];
  const event = entry?.messaging[0];
  if (!entry || !event || (event.message && event.delivery) || (!event.message && !event.delivery))
    throw new ConnectorError('INVALID_REQUEST', false);

  if (event.message) {
    return webhookEnvelopeSchema.parse({
      deliveryId: `instagram:${entry.id}:message:${event.message.mid}`,
      eventType: 'instagram.message.received',
      occurredAt: occurredAt(event.timestamp),
      resource: { type: 'instagram_account', providerId: event.recipient.id },
      payload: {
        kind: 'messaging.inbound_message',
        channel: 'INSTAGRAM',
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
    deliveryId: `instagram:${entry.id}:delivery:${providerMessageId}`,
    eventType: 'instagram.message.delivered',
    occurredAt: occurredAt(delivery.watermark ?? event.timestamp),
    resource: { type: 'instagram_account', providerId: event.recipient.id },
    payload: {
      kind: 'messaging.delivery_receipt',
      providerMessageId,
      status: 'DELIVERED',
      occurredAt: occurredAt(delivery.watermark ?? event.timestamp),
    },
  });
}

/** Builds the bounded text request shape for a future Meta Graph transport. */
export function buildInstagramTextRequest(input: { recipientId: string; body: string }): {
  recipient: { id: string };
  message: { text: string };
} {
  return {
    recipient: { id: z.string().min(1).max(500).parse(input.recipientId) },
    message: { text: z.string().min(1).max(20_000).parse(input.body) },
  };
}

/** A Meta-shaped Instagram emulator, enabled only outside production. */
export const developmentInstagramMessagingConnector: MessagingConnector = {
  manifest: {
    key: 'development-instagram-messaging',
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
  messagingChannels: ['INSTAGRAM'],
  verifyWebhook({ headers, rawBody }): Promise<boolean> {
    const provided = headers.get(signatureHeader);
    return Promise.resolve(
      typeof provided === 'string' && fixedTimeEquals(provided, signature(rawBody)),
    );
  },
  identifyWebhook({ body }): { deliveryId: string; eventType: string } {
    const envelope = normalizeInstagramWebhook(body);
    return { deliveryId: envelope.deliveryId, eventType: envelope.eventType };
  },
  normalizeWebhook({ body }): Promise<WebhookEnvelope> {
    return Promise.resolve(normalizeInstagramWebhook(body));
  },
  validateConnection({ settings, secretReference }): Promise<void> {
    if (
      settings.allowDevelopmentFixture !== true ||
      !secretReference.startsWith('development://instagram-messaging/')
    )
      return Promise.reject(
        new Error('Instagram fixture requires its explicit development fixture reference'),
      );
    return Promise.resolve();
  },
  health(): Promise<{ latencyMs: number }> {
    return Promise.resolve({ latencyMs: 0 });
  },
  discoverAssets(input): Promise<readonly ProviderAsset[]> {
    return Promise.resolve([
      {
        assetType: 'instagram_account',
        providerId: `development-instagram:${input.connectionId}`,
        name: 'Development Instagram account',
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
      providerSubscriptionId: `development-instagram-webhook-${createHash('sha256')
        .update(`${input.connectionId}:${input.callbackUrl}`)
        .digest('hex')
        .slice(0, 32)}`,
    });
  },
  unregisterWebhook() {
    return Promise.resolve();
  },
  supportedActionTypes: ['development.instagram_messaging.echo'],
  executeAction(input: ProviderActionRequest): Promise<ProviderActionResult> {
    if (input.actionType !== 'development.instagram_messaging.echo')
      return Promise.reject(new Error('Instagram fixture does not support this action type'));
    return Promise.resolve({
      providerActionId: `development-instagram-action-${createHash('sha256')
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
    buildInstagramTextRequest({ recipientId: input.providerConversationId, body: input.body });
    return Promise.resolve({
      providerMessageId: `development-instagram-${createHash('sha256')
        .update(`${input.connectionId}:${input.idempotencyKey}`)
        .digest('hex')
        .slice(0, 32)}`,
      acceptedAt: new Date().toISOString(),
    });
  },
};

export function signDevelopmentInstagramMessagingWebhook(rawBody: Uint8Array): string {
  return signature(rawBody);
}
