import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { MessagingConnector, OutboundMessageRequest, ProviderAsset } from './index.js';
import { webhookEnvelopeSchema, type WebhookEnvelope } from './index.js';

const developmentWebhookSecret = 'platform-development-web-chat-fixture';
const signatureHeader = 'x-platform-development-signature';

function signature(rawBody: Uint8Array): string {
  return createHmac('sha256', developmentWebhookSecret).update(rawBody).digest('hex');
}

function fixedTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

/**
 * A deterministic emulator used only by disposable development and test
 * environments. It is deliberately not registered in production and never
 * accepts provider credentials or reaches an external network.
 */
export const developmentWebChatConnector: MessagingConnector = {
  manifest: {
    key: 'development-web-chat',
    version: '1.0.0',
    category: 'MESSAGING',
    capabilities: ['messaging.inbound', 'messaging.outbound', 'webhooks'],
    credentialSchema: { type: 'development-fixture' },
    settingsSchema: { type: 'object', required: ['allowDevelopmentFixture'] },
  },

  verifyWebhook({ headers, rawBody }): Promise<boolean> {
    const provided = headers.get(signatureHeader);
    return Promise.resolve(
      typeof provided === 'string' && fixedTimeEquals(provided, signature(rawBody)),
    );
  },

  identifyWebhook({ body }): { deliveryId: string; eventType: string } {
    const envelope = webhookEnvelopeSchema.parse(body);
    return { deliveryId: envelope.deliveryId, eventType: envelope.eventType };
  },

  normalizeWebhook({ body }): Promise<WebhookEnvelope> {
    return Promise.resolve(webhookEnvelopeSchema.parse(body));
  },

  validateConnection({ settings, secretReference }): Promise<void> {
    if (
      settings.allowDevelopmentFixture !== true ||
      !secretReference.startsWith('development://web-chat/')
    )
      return Promise.reject(
        new Error('Development Web Chat requires its explicit development fixture reference'),
      );
    return Promise.resolve();
  },

  health(): Promise<{ latencyMs: number }> {
    return Promise.resolve({ latencyMs: 0 });
  },

  discoverAssets(input): Promise<readonly ProviderAsset[]> {
    return Promise.resolve([
      {
        assetType: 'web_chat_channel',
        providerId: `development-web-chat:${input.connectionId}`,
        name: 'Development Web Chat',
        state: 'ACTIVE',
        attributes: { developmentOnly: true },
      },
    ]);
  },

  sendMessage(input: OutboundMessageRequest) {
    const providerMessageId = `development-${createHash('sha256')
      .update(`${input.connectionId}:${input.idempotencyKey}`)
      .digest('hex')
      .slice(0, 32)}`;
    return Promise.resolve({ providerMessageId, acceptedAt: new Date().toISOString() });
  },
};

export function signDevelopmentWebChatWebhook(rawBody: Uint8Array): string {
  return signature(rawBody);
}
