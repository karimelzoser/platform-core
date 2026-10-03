import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ConnectorError } from './index.js';
import type {
  Connector,
  IntegrationSyncRequest,
  IntegrationSyncResult,
  ProviderActionRequest,
  ProviderActionResult,
  ProviderAsset,
  WebhookEnvelope,
} from './index.js';

const fixtureSecret = 'platform-development-shopify-fixture';
const signatureHeader = 'x-shopify-hmac-sha256';

const shopifySettingsSchema = z.object({
  allowDevelopmentFixture: z.literal(true),
  shopDomain: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/u),
  apiVersion: z.string().regex(/^20\d{2}-((01)|(04)|(07)|(10))$/u).optional(),
});

function signature(rawBody: Uint8Array): string {
  return createHmac('sha256', fixtureSecret).update(rawBody).digest('base64');
}

function fixedTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function deterministicId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

function eventResource(topic: string, body: Record<string, unknown>): WebhookEnvelope['resource'] {
  const providerId = typeof body.id === 'string' || typeof body.id === 'number' ? String(body.id) : 'unknown';
  if (topic.startsWith('orders/')) return { type: 'shopify_order', providerId };
  if (topic.startsWith('customers/')) return { type: 'shopify_customer', providerId };
  if (topic.startsWith('products/')) return { type: 'shopify_product', providerId };
  if (topic.startsWith('fulfillments/')) return { type: 'shopify_fulfillment', providerId };
  return { type: 'shopify_shop', providerId };
}

/** Development-only Shopify public-app contract fixture; performs no Shopify network calls. */
export const developmentShopifyPublicAppConnector: Connector = {
  manifest: {
    key: 'development-shopify-public-app',
    version: '1.0.0',
    category: 'COMMERCE',
    capabilities: [
      'connection.onboarding',
      'webhooks',
      'sync',
      'provider.assets',
      'provider.actions',
    ],
    credentialSchema: { type: 'development-fixture' },
    settingsSchema: { type: 'object', required: ['allowDevelopmentFixture', 'shopDomain'] },
  },
  verifyWebhook({ headers, rawBody }): Promise<boolean> {
    const provided = headers.get(signatureHeader);
    return Promise.resolve(
      typeof provided === 'string' && fixedTimeEquals(provided, signature(rawBody)),
    );
  },
  identifyWebhook({ headers }): { deliveryId: string; eventType: string } {
    const deliveryId = headers.get('x-shopify-webhook-id');
    const eventType = headers.get('x-shopify-topic');
    if (!deliveryId || !eventType) throw new ConnectorError('INVALID_REQUEST', false);
    return { deliveryId, eventType };
  },
  normalizeWebhook({ headers, body }): Promise<WebhookEnvelope> {
    const { deliveryId, eventType } = this.identifyWebhook({ headers, body });
    const parsedBody = z.record(z.unknown()).parse(body);
    return Promise.resolve({
      deliveryId,
      eventType: `shopify.${eventType.replaceAll('/', '.')}`,
      resource: eventResource(eventType, parsedBody),
      payload: {
        kind: 'commerce.provider_event',
        provider: 'shopify',
        topic: eventType,
        data: parsedBody,
      },
    });
  },
  validateConnection({ settings, secretReference }): Promise<void> {
    if (!shopifySettingsSchema.safeParse(settings).success || !secretReference.startsWith('development://shopify-public-app/'))
      return Promise.reject(new ConnectorError('AUTHENTICATION_FAILED', false));
    return Promise.resolve();
  },
  health(): Promise<{ latencyMs: number }> {
    return Promise.resolve({ latencyMs: 0 });
  },
  discoverAssets(input): Promise<readonly ProviderAsset[]> {
    const settings = shopifySettingsSchema.parse(input.settings);
    return Promise.resolve([
      {
        assetType: 'shopify_shop',
        providerId: settings.shopDomain,
        name: settings.shopDomain,
        state: 'ACTIVE',
        attributes: {
          developmentOnly: true,
          apiVersion: settings.apiVersion ?? 'configurable',
        },
      },
    ]);
  },
  sync(input: IntegrationSyncRequest): Promise<IntegrationSyncResult> {
    return Promise.resolve({
      cursor: {
        ...input.cursor,
        developmentFixture: true,
        syncKind: input.kind,
        completed: true,
      },
      pages: 0,
      items: 0,
      hasMore: false,
    });
  },
  registerWebhook(input) {
    return Promise.resolve({
      providerSubscriptionId: deterministicId(
        'development-shopify-webhook',
        `${input.connectionId}:${input.callbackUrl}`,
      ),
    });
  },
  unregisterWebhook() {
    return Promise.resolve();
  },
  supportedActionTypes: ['development.shopify.echo'],
  executeAction(input: ProviderActionRequest): Promise<ProviderActionResult> {
    if (input.actionType !== 'development.shopify.echo')
      return Promise.reject(new ConnectorError('UNSUPPORTED_OPERATION', false));
    return Promise.resolve({
      providerActionId: deterministicId(
        'development-shopify-action',
        `${input.connectionId}:${input.idempotencyKey}`,
      ),
      result: { echoed: input.input, developmentOnly: true },
      completedAt: new Date().toISOString(),
    });
  },
};

export function signDevelopmentShopifyWebhook(rawBody: Uint8Array): string {
  return signature(rawBody);
}
