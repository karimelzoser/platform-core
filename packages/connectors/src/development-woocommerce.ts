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

const fixtureSecret = 'platform-development-woocommerce-fixture';
const signatureHeader = 'x-wc-webhook-signature';

const wooSettingsSchema = z.object({
  allowDevelopmentFixture: z.literal(true),
  storeUrl: z.string().url().refine((value) => value.startsWith('https://'), 'HTTPS required'),
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
  if (topic.startsWith('order.')) return { type: 'woocommerce_order', providerId };
  if (topic.startsWith('customer.')) return { type: 'woocommerce_customer', providerId };
  if (topic.startsWith('product.')) return { type: 'woocommerce_product', providerId };
  return { type: 'woocommerce_store', providerId };
}

/** Development-only WooCommerce lifecycle fixture; performs no store network calls. */
export const developmentWooCommerceConnector: Connector = {
  manifest: {
    key: 'development-woocommerce',
    version: '1.0.0',
    category: 'COMMERCE',
    capabilities: ['webhooks', 'sync', 'provider.assets', 'provider.actions'],
    credentialSchema: { type: 'development-fixture' },
    settingsSchema: { type: 'object', required: ['allowDevelopmentFixture', 'storeUrl'] },
  },
  verifyWebhook({ headers, rawBody }): Promise<boolean> {
    const provided = headers.get(signatureHeader);
    return Promise.resolve(
      typeof provided === 'string' && fixedTimeEquals(provided, signature(rawBody)),
    );
  },
  identifyWebhook({ headers }): { deliveryId: string; eventType: string } {
    const deliveryId = headers.get('x-wc-webhook-delivery-id');
    const eventType = headers.get('x-wc-webhook-topic');
    if (!deliveryId || !eventType) throw new ConnectorError('INVALID_REQUEST', false);
    return { deliveryId, eventType };
  },
  normalizeWebhook({ headers, body }): Promise<WebhookEnvelope> {
    const { deliveryId, eventType } = this.identifyWebhook({ headers, body });
    const parsedBody = z.record(z.unknown()).parse(body);
    return Promise.resolve({
      deliveryId,
      eventType: `woocommerce.${eventType}`,
      resource: eventResource(eventType, parsedBody),
      payload: {
        kind: 'commerce.provider_event',
        provider: 'woocommerce',
        topic: eventType,
        data: parsedBody,
      },
    });
  },
  validateConnection({ settings, secretReference }): Promise<void> {
    if (!wooSettingsSchema.safeParse(settings).success || !secretReference.startsWith('development://woocommerce/'))
      return Promise.reject(new ConnectorError('AUTHENTICATION_FAILED', false));
    return Promise.resolve();
  },
  health(): Promise<{ latencyMs: number }> {
    return Promise.resolve({ latencyMs: 0 });
  },
  discoverAssets(input): Promise<readonly ProviderAsset[]> {
    const settings = wooSettingsSchema.parse(input.settings);
    return Promise.resolve([
      {
        assetType: 'woocommerce_store',
        providerId: settings.storeUrl,
        name: settings.storeUrl,
        state: 'ACTIVE',
        attributes: { developmentOnly: true },
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
        'development-woocommerce-webhook',
        `${input.connectionId}:${input.callbackUrl}`,
      ),
    });
  },
  unregisterWebhook() {
    return Promise.resolve();
  },
  supportedActionTypes: ['development.woocommerce.echo'],
  executeAction(input: ProviderActionRequest): Promise<ProviderActionResult> {
    if (input.actionType !== 'development.woocommerce.echo')
      return Promise.reject(new ConnectorError('UNSUPPORTED_OPERATION', false));
    return Promise.resolve({
      providerActionId: deterministicId(
        'development-woocommerce-action',
        `${input.connectionId}:${input.idempotencyKey}`,
      ),
      result: { echoed: input.input, developmentOnly: true },
      completedAt: new Date().toISOString(),
    });
  },
};

export function signDevelopmentWooCommerceWebhook(rawBody: Uint8Array): string {
  return signature(rawBody);
}
