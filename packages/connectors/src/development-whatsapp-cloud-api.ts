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

const fixtureSecret = 'platform-development-whatsapp-cloud-api-fixture';
const signatureHeader = 'x-hub-signature-256';

const metaValueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string().min(1).max(500) }),
  messages: z
    .array(
      z.object({
        id: z.string().min(1).max(500),
        from: z.string().min(1).max(500),
        timestamp: z.string().regex(/^\d+$/u).optional(),
        type: z.literal('text'),
        text: z.object({ body: z.string().min(1).max(20_000) }),
      }),
    )
    .max(1)
    .optional(),
  statuses: z
    .array(
      z.object({
        id: z.string().min(1).max(500),
        status: z.enum(['sent', 'delivered', 'read', 'failed']),
        timestamp: z.string().regex(/^\d+$/u).optional(),
        errors: z
          .array(z.object({ title: z.string().min(1).max(2_000) }))
          .max(1)
          .optional(),
      }),
    )
    .max(1)
    .optional(),
});

const metaWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z
    .array(
      z.object({
        id: z.string().min(1).max(500),
        changes: z
          .array(z.object({ field: z.literal('messages'), value: metaValueSchema }))
          .length(1),
      }),
    )
    .length(1),
});

const phoneNumberSchema = z.string().regex(/^\+[1-9]\d{6,14}$/u);

function signature(rawBody: Uint8Array): string {
  return `sha256=${createHmac('sha256', fixtureSecret).update(rawBody).digest('hex')}`;
}

function fixedTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function occurredAt(timestamp: string | undefined): string | undefined {
  if (!timestamp) return undefined;
  const milliseconds = Number(timestamp) * 1_000;
  return Number.isSafeInteger(milliseconds) ? new Date(milliseconds).toISOString() : undefined;
}

function parseMetaWebhook(body: unknown): z.infer<typeof metaWebhookSchema> {
  return metaWebhookSchema.parse(body);
}

function normalizeMetaWebhook(body: unknown): WebhookEnvelope {
  const webhook = parseMetaWebhook(body);
  const entry = webhook.entry[0];
  if (!entry) throw new ConnectorError('INVALID_REQUEST', false);
  const change = entry.changes[0];
  if (!change) throw new ConnectorError('INVALID_REQUEST', false);
  const value = change.value;
  const message = value.messages?.[0];
  const status = value.statuses?.[0];
  if ((message && status) || (!message && !status))
    throw new ConnectorError('INVALID_REQUEST', false);

  if (message) {
    return webhookEnvelopeSchema.parse({
      deliveryId: `whatsapp:${entry.id}:message:${message.id}`,
      eventType: 'whatsapp.message.received',
      occurredAt: occurredAt(message.timestamp),
      resource: { type: 'whatsapp_phone_number', providerId: value.metadata.phone_number_id },
      payload: {
        kind: 'messaging.inbound_message',
        channel: 'WHATSAPP',
        providerConversationId: message.from,
        providerMessageId: message.id,
        body: message.text.body,
        sentAt: occurredAt(message.timestamp),
      },
    });
  }

  if (!status) throw new ConnectorError('INVALID_REQUEST', false);
  const states = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' } as const;
  return webhookEnvelopeSchema.parse({
    deliveryId: `whatsapp:${entry.id}:status:${status.id}:${status.status}`,
    eventType: 'whatsapp.message.status',
    occurredAt: occurredAt(status.timestamp),
    resource: { type: 'whatsapp_phone_number', providerId: value.metadata.phone_number_id },
    payload: {
      kind: 'messaging.delivery_receipt',
      providerMessageId: status.id,
      status: states[status.status],
      occurredAt: occurredAt(status.timestamp),
      ...(status.errors?.[0] ? { error: status.errors[0].title } : {}),
    },
  });
}

/** Builds the bounded request shape used by a future production transport. */
export function buildWhatsAppTextRequest(input: { to: string; body: string }): {
  messaging_product: 'whatsapp';
  to: string;
  type: 'text';
  text: { body: string };
} {
  return {
    messaging_product: 'whatsapp',
    to: phoneNumberSchema.parse(input.to).slice(1),
    type: 'text',
    text: { body: z.string().min(1).max(20_000).parse(input.body) },
  };
}

/**
 * A Meta-shaped WhatsApp Cloud API emulator. It verifies Meta's HMAC header
 * and normalizes one bounded webhook event per delivery, but never contacts
 * Meta or accepts production credentials.
 */
export const developmentWhatsAppCloudApiConnector: MessagingConnector = {
  manifest: {
    key: 'development-whatsapp-cloud-api',
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
  messagingChannels: ['WHATSAPP'],
  verifyWebhook({ headers, rawBody }): Promise<boolean> {
    const provided = headers.get(signatureHeader);
    return Promise.resolve(
      typeof provided === 'string' && fixedTimeEquals(provided, signature(rawBody)),
    );
  },
  identifyWebhook({ body }): { deliveryId: string; eventType: string } {
    const envelope = normalizeMetaWebhook(body);
    return { deliveryId: envelope.deliveryId, eventType: envelope.eventType };
  },
  normalizeWebhook({ body }): Promise<WebhookEnvelope> {
    return Promise.resolve(normalizeMetaWebhook(body));
  },
  validateConnection({ settings, secretReference }): Promise<void> {
    if (
      settings.allowDevelopmentFixture !== true ||
      !secretReference.startsWith('development://whatsapp-cloud-api/')
    )
      return Promise.reject(
        new Error('WhatsApp fixture requires its explicit development fixture reference'),
      );
    return Promise.resolve();
  },
  health(): Promise<{ latencyMs: number }> {
    return Promise.resolve({ latencyMs: 0 });
  },
  discoverAssets(input): Promise<readonly ProviderAsset[]> {
    return Promise.resolve([
      {
        assetType: 'whatsapp_phone_number',
        providerId: `development-whatsapp-phone:${input.connectionId}`,
        name: 'Development WhatsApp phone number',
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
      providerSubscriptionId: `development-whatsapp-webhook-${createHash('sha256')
        .update(`${input.connectionId}:${input.callbackUrl}`)
        .digest('hex')
        .slice(0, 32)}`,
    });
  },
  unregisterWebhook() {
    return Promise.resolve();
  },
  supportedActionTypes: ['development.whatsapp_cloud_api.echo'],
  executeAction(input: ProviderActionRequest): Promise<ProviderActionResult> {
    if (input.actionType !== 'development.whatsapp_cloud_api.echo')
      return Promise.reject(new Error('WhatsApp fixture does not support this action type'));
    return Promise.resolve({
      providerActionId: `development-whatsapp-action-${createHash('sha256')
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
    buildWhatsAppTextRequest({ to: input.providerConversationId, body: input.body });
    return Promise.resolve({
      providerMessageId: `development-whatsapp-${createHash('sha256')
        .update(`${input.connectionId}:${input.idempotencyKey}`)
        .digest('hex')
        .slice(0, 32)}`,
      acceptedAt: new Date().toISOString(),
    });
  },
};

export function signDevelopmentWhatsAppCloudApiWebhook(rawBody: Uint8Array): string {
  return signature(rawBody);
}
