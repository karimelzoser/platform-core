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
import { webhookEnvelopeSchema, type WebhookEnvelope } from './index.js';

const fixtureSecret = 'platform-development-api-fixture';
const signatureHeader = 'x-platform-development-api-signature';
const shippingActionTypes = [
  'shipping.shipment.create_label',
  'shipping.shipment.request_pickup',
  'shipping.shipment.cancel_shipment',
  'shipping.shipment.reschedule_delivery',
  'shipping.shipment.update_delivery_address',
] as const;
const shippingActionInputSchema = z.object({
  canonicalShipmentId: z.string().uuid(),
  canonicalOrderId: z.string().uuid(),
  fulfillmentId: z.string().uuid(),
  trackingNumber: z.string().nullable(),
  reason: z.string().trim().min(1).max(4_000).optional(),
  scheduledAt: z.string().datetime().optional(),
  destination: z.record(z.unknown()).optional(),
});

function signature(rawBody: Uint8Array): string {
  return createHmac('sha256', fixtureSecret).update(rawBody).digest('hex');
}

function fixedTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function deterministicId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

function executeShippingAction(input: ProviderActionRequest): ProviderActionResult {
  const actionType = z.enum(shippingActionTypes).parse(input.actionType);
  const action = shippingActionInputSchema.parse(input.input);
  if (actionType === 'shipping.shipment.cancel_shipment' && !action.reason)
    return invalidShippingAction('Cancellation requires a reason');
  if (actionType === 'shipping.shipment.reschedule_delivery' && !action.scheduledAt)
    return invalidShippingAction('Reschedule requires scheduledAt');
  if (actionType === 'shipping.shipment.update_delivery_address' && !action.destination)
    return invalidShippingAction('Address update requires destination');

  const externalShipmentId = deterministicId(
    'development-carrier-shipment',
    `${input.connectionId}:${action.canonicalShipmentId}`,
  );
  const trackingToken = createHash('sha256')
    .update(`${input.connectionId}:${action.canonicalShipmentId}`)
    .digest('hex')
    .slice(0, 14)
    .toUpperCase();
  return {
    providerActionId: deterministicId(
      'development-shipping-action',
      `${input.connectionId}:${input.idempotencyKey}:${actionType}`,
    ),
    result: {
      operation: actionType,
      canonicalShipmentId: action.canonicalShipmentId,
      canonicalOrderId: action.canonicalOrderId,
      externalShipmentId,
      ...(actionType === 'shipping.shipment.create_label'
        ? {
            trackingNumber: `DEV-${trackingToken}`,
            trackingUrl: `https://example.invalid/tracking/DEV-${trackingToken}`,
          }
        : {}),
      ...(action.scheduledAt ? { scheduledAt: action.scheduledAt } : {}),
      ...(action.destination ? { destination: action.destination } : {}),
      developmentOnly: true,
    },
    completedAt: new Date().toISOString(),
  };
}

function invalidShippingAction(message: string): never {
  throw new Error(`Invalid development shipping action: ${message}`);
}

/** A disposable API-channel emulator; it is never a production provider adapter. */
export const developmentApiConnector: MessagingConnector = {
  manifest: {
    key: 'development-api',
    version: '1.0.0',
    category: 'GENERIC',
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
  messagingChannels: ['API'],
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
  supportedActionTypes: ['development.api.echo', ...shippingActionTypes],
  executeAction(input: ProviderActionRequest): Promise<ProviderActionResult> {
    if ((shippingActionTypes as readonly string[]).includes(input.actionType))
      return Promise.resolve(executeShippingAction(input));
    if (input.actionType !== 'development.api.echo')
      return Promise.reject(new Error('Development API does not support this action type'));
    return Promise.resolve({
      providerActionId: deterministicId(
        'development-api-action',
        `${input.connectionId}:${input.idempotencyKey}`,
      ),
      result: { echoed: input.input, developmentOnly: true },
      completedAt: new Date().toISOString(),
    });
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
