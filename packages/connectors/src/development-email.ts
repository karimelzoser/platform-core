import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ConnectorError } from './index.js';
import type {
  IntegrationSyncRequest,
  IntegrationSyncResult,
  MessagingConnector,
  OutboundMessageRequest,
  ProviderAsset,
  WebhookEnvelope,
} from './index.js';

const fixtureSecret = 'platform-development-email-fixture';
const signatureHeader = 'x-platform-development-email-signature';

const inboundEmailSchema = z.object({
  deliveryId: z.string().min(1).max(500),
  event: z.literal('email.received'),
  message: z.object({
    id: z.string().min(1).max(500),
    from: z.string().email().max(500),
    to: z.string().email().max(500),
    subject: z.string().max(998).default(''),
    text: z.string().min(1).max(20_000),
    occurredAt: z.string().datetime().optional(),
  }),
});

const emailReceiptSchema = z.object({
  deliveryId: z.string().min(1).max(500),
  event: z.enum(['email.sent', 'email.delivered', 'email.read', 'email.failed']),
  messageId: z.string().min(1).max(500),
  mailbox: z.string().email().max(500),
  occurredAt: z.string().datetime().optional(),
  error: z.string().min(1).max(2_000).optional(),
});

function signature(rawBody: Uint8Array): string {
  return createHmac('sha256', fixtureSecret).update(rawBody).digest('hex');
}

function fixedTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function messageIdentity(connectionId: string, idempotencyKey: string): string {
  return createHash('sha256')
    .update(`${connectionId}:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Provider-agnostic email transport emulator for disposable development and CI.
 * It deliberately performs no SMTP/API network calls and is never registered
 * by a production runtime.
 */
export const developmentEmailConnector: MessagingConnector = {
  manifest: {
    key: 'development-email',
    version: '1.0.0',
    category: 'EMAIL',
    capabilities: ['messaging.inbound', 'messaging.outbound', 'webhooks', 'sync'],
    credentialSchema: { type: 'development-fixture' },
    settingsSchema: { type: 'object', required: ['allowDevelopmentFixture'] },
  },
  messagingChannels: ['EMAIL'],
  verifyWebhook({ headers, rawBody }): Promise<boolean> {
    const provided = headers.get(signatureHeader);
    return Promise.resolve(
      typeof provided === 'string' && fixedTimeEquals(provided, signature(rawBody)),
    );
  },
  identifyWebhook({ body }): { deliveryId: string; eventType: string } {
    const inbound = inboundEmailSchema.safeParse(body);
    if (inbound.success)
      return { deliveryId: inbound.data.deliveryId, eventType: inbound.data.event };
    const receipt = emailReceiptSchema.parse(body);
    return { deliveryId: receipt.deliveryId, eventType: receipt.event };
  },
  normalizeWebhook({ body }): Promise<WebhookEnvelope> {
    const inbound = inboundEmailSchema.safeParse(body);
    if (inbound.success) {
      const value = inbound.data;
      return Promise.resolve({
        deliveryId: value.deliveryId,
        eventType: value.event,
        occurredAt: value.message.occurredAt,
        resource: { type: 'email_mailbox', providerId: value.message.to },
        payload: {
          kind: 'messaging.inbound_message',
          channel: 'EMAIL',
          providerConversationId: value.message.from,
          providerMessageId: value.message.id,
          body: value.message.text,
          ...(value.message.occurredAt ? { sentAt: value.message.occurredAt } : {}),
        },
      });
    }

    const receipt = emailReceiptSchema.parse(body);
    const status =
      receipt.event === 'email.read'
        ? 'READ'
        : receipt.event === 'email.delivered'
          ? 'DELIVERED'
          : receipt.event === 'email.failed'
            ? 'FAILED'
            : 'SENT';
    return Promise.resolve({
      deliveryId: receipt.deliveryId,
      eventType: receipt.event,
      occurredAt: receipt.occurredAt,
      resource: { type: 'email_mailbox', providerId: receipt.mailbox },
      payload: {
        kind: 'messaging.delivery_receipt',
        providerMessageId: receipt.messageId,
        status,
        ...(receipt.occurredAt ? { occurredAt: receipt.occurredAt } : {}),
        ...(receipt.error ? { error: receipt.error } : {}),
      },
    });
  },
  validateConnection({ settings, secretReference }): Promise<void> {
    if (
      settings.allowDevelopmentFixture !== true ||
      !secretReference.startsWith('development://email/')
    )
      return Promise.reject(
        new ConnectorError('AUTHENTICATION_FAILED', false),
      );
    return Promise.resolve();
  },
  health(): Promise<{ latencyMs: number }> {
    return Promise.resolve({ latencyMs: 0 });
  },
  discoverAssets(input): Promise<readonly ProviderAsset[]> {
    return Promise.resolve([
      {
        assetType: 'email_mailbox',
        providerId: `development-email:${input.connectionId}`,
        name: 'Development Email Mailbox',
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
      providerSubscriptionId: `development-email-webhook-${createHash('sha256')
        .update(`${input.connectionId}:${input.callbackUrl}`)
        .digest('hex')
        .slice(0, 32)}`,
    });
  },
  unregisterWebhook() {
    return Promise.resolve();
  },
  sendMessage(input: OutboundMessageRequest) {
    if (input.attachments.length > 0)
      return Promise.reject(new ConnectorError('UNSUPPORTED_OPERATION', false));
    const recipient = z.string().email().safeParse(input.providerConversationId);
    if (!recipient.success)
      return Promise.reject(new ConnectorError('INVALID_REQUEST', false));
    return Promise.resolve({
      providerMessageId: `development-email-${messageIdentity(
        input.connectionId,
        input.idempotencyKey,
      )}`,
      acceptedAt: new Date().toISOString(),
    });
  },
};

export function signDevelopmentEmailWebhook(rawBody: Uint8Array): string {
  return signature(rawBody);
}
