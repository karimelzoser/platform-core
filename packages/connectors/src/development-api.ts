import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type {
  IntegrationSyncRequest,
  IntegrationSyncResult,
  MessagingConnector,
  OutboundMessageRequest,
  ProviderAsset,
} from './index.js';
import { webhookEnvelopeSchema, type WebhookEnvelope } from './index.js';

const fixtureSecret = 'platform-development-api-fixture';
const signatureHeader = 'x-platform-development-api-signature';

function signature(rawBody: Uint8Array): string {
  return createHmac('sha256', fixtureSecret).update(rawBody).digest('hex');
}

function fixedTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

/** A disposable API-channel emulator; it is never a production provider adapter. */
export const developmentApiConnector: MessagingConnector = {
  manifest: {
    key: 'development-api',
    version: '1.0.0',
    category: 'GENERIC',
    capabilities: ['messaging.inbound', 'messaging.outbound', 'webhooks', 'sync'],
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
      !secretReference.startsWith('development://api/')
    )
      return Promise.reject(
        new Error('Development API requires its explicit development fixture reference'),
      );
    return Promise.resolve();
  },
  health(): Promise<{ latencyMs: number }> {
    return Promise.resolve({ latencyMs: 0 });
  },
  discoverAssets(input): Promise<readonly ProviderAsset[]> {
    return Promise.resolve([
      {
        assetType: 'api_channel',
        providerId: `development-api:${input.connectionId}`,
        name: 'Development API Channel',
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
      providerSubscriptionId: `development-api-webhook-${createHash('sha256')
        .update(`${input.connectionId}:${input.callbackUrl}`)
        .digest('hex')
        .slice(0, 32)}`,
    });
  },
  unregisterWebhook() {
    return Promise.resolve();
  },
  sendMessage(input: OutboundMessageRequest) {
    const providerMessageId = `development-api-${createHash('sha256')
      .update(`${input.connectionId}:${input.idempotencyKey}`)
      .digest('hex')
      .slice(0, 32)}`;
    return Promise.resolve({ providerMessageId, acceptedAt: new Date().toISOString() });
  },
};

export function signDevelopmentApiWebhook(rawBody: Uint8Array): string {
  return signature(rawBody);
}
