import { connectorManifestSchema, type ConnectorManifest } from '@platform/contracts';
import { outboundAttachmentSchema } from '@platform/media';
import { z } from 'zod';

export const connectorErrorCodeSchema = z.enum([
  'AUTHENTICATION_FAILED',
  'INVALID_REQUEST',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'UNSUPPORTED_OPERATION',
  'UNKNOWN_PROVIDER_FAILURE',
]);

export type ConnectorErrorCode = z.infer<typeof connectorErrorCodeSchema>;

/** A bounded error that provider adapters may safely return to worker policy. */
export class ConnectorError extends Error {
  public override readonly name = 'ConnectorError';

  public constructor(
    public readonly code: ConnectorErrorCode,
    public readonly retryable: boolean,
  ) {
    super(code);
  }
}

export function toConnectorError(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) return error;
  return new ConnectorError('UNKNOWN_PROVIDER_FAILURE', true);
}

export const webhookEnvelopeSchema = z.object({
  deliveryId: z.string().min(1),
  eventType: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
  resource: z.object({ type: z.string().min(1), providerId: z.string().min(1) }),
  payload: z.record(z.unknown()),
});

export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>;

/**
 * The canonical payload an inbound messaging connector may emit. Raw provider
 * payloads stay in the delivery ledger; only this bounded shape reaches the
 * tenant messaging tables.
 */
export const inboundMessagingWebhookSchema = z.object({
  kind: z.literal('messaging.inbound_message'),
  channel: z.enum(['EMAIL', 'WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'WEB_CHAT', 'API']),
  providerConversationId: z.string().min(1).max(500),
  providerMessageId: z.string().min(1).max(500),
  body: z.string().min(1).max(20_000),
  sentAt: z.string().datetime().optional(),
  customerId: z.string().uuid().optional(),
});

export type InboundMessagingWebhook = z.infer<typeof inboundMessagingWebhookSchema>;

export function parseInboundMessagingWebhook(
  envelope: WebhookEnvelope,
): InboundMessagingWebhook | undefined {
  return inboundMessagingWebhookSchema.safeParse(envelope.payload).data;
}

/** A provider acknowledgement for a previously dispatched outbound message. */
export const messagingDeliveryReceiptSchema = z.object({
  kind: z.literal('messaging.delivery_receipt'),
  providerMessageId: z.string().min(1).max(500),
  status: z.enum(['SENT', 'DELIVERED', 'READ', 'FAILED']),
  occurredAt: z.string().datetime().optional(),
  error: z.string().min(1).max(2000).optional(),
});

export type MessagingDeliveryReceipt = z.infer<typeof messagingDeliveryReceiptSchema>;

export function parseMessagingDeliveryReceipt(
  envelope: WebhookEnvelope,
): MessagingDeliveryReceipt | undefined {
  return messagingDeliveryReceiptSchema.safeParse(envelope.payload).data;
}

/**
 * A connector-normalized, provider-verified communication consent event. The
 * worker records the authenticated webhook delivery as immutable evidence; a
 * browser or staff command cannot manufacture an opt-in state.
 */
export const verifiedConsentWebhookSchema = z.object({
  kind: z.literal('crm.communication_consent_verified'),
  customerId: z.string().uuid(),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'MESSENGER', 'INSTAGRAM', 'PUSH']),
  providerConsentId: z.string().min(1).max(500),
  occurredAt: z.string().datetime().optional(),
});

export type VerifiedConsentWebhook = z.infer<typeof verifiedConsentWebhookSchema>;

export function parseVerifiedConsentWebhook(
  envelope: WebhookEnvelope,
): VerifiedConsentWebhook | undefined {
  return verifiedConsentWebhookSchema.safeParse(envelope.payload).data;
}

export const outboundMessageRequestSchema = z.object({
  connectionId: z.string().uuid(),
  providerConversationId: z.string().min(1).max(500),
  idempotencyKey: z.string().min(1).max(256),
  body: z.string().min(1).max(20_000),
  attachments: z.array(outboundAttachmentSchema).max(10).default([]),
});

export type OutboundMessageRequest = z.infer<typeof outboundMessageRequestSchema>;

export const outboundMessageResultSchema = z.object({
  providerMessageId: z.string().min(1).max(500),
  acceptedAt: z.string().datetime(),
});

export type OutboundMessageResult = z.infer<typeof outboundMessageResultSchema>;

export const providerAssetSchema = z.object({
  assetType: z.string().min(1).max(100),
  providerId: z.string().min(1).max(500),
  name: z.string().min(1).max(500).optional(),
  state: z.string().min(1).max(100).default('ACTIVE'),
  attributes: z.record(z.unknown()).default({}),
});

export type ProviderAsset = z.infer<typeof providerAssetSchema>;

export const integrationSyncRequestSchema = z.object({
  connectionId: z.string().uuid(),
  kind: z.enum(['INITIAL', 'INCREMENTAL', 'BACKFILL', 'RECONCILIATION', 'MANUAL']),
  cursor: z.record(z.unknown()).default({}),
  settings: z.record(z.unknown()).default({}),
  secretReference: z.string().min(1).max(500),
});

export type IntegrationSyncRequest = z.infer<typeof integrationSyncRequestSchema>;

export const integrationSyncResultSchema = z.object({
  cursor: z.record(z.unknown()).default({}),
  pages: z.number().int().min(0).max(10_000),
  items: z.number().int().min(0).max(1_000_000),
  hasMore: z.boolean(),
});

export type IntegrationSyncResult = z.infer<typeof integrationSyncResultSchema>;

export const webhookSubscriptionRequestSchema = z.object({
  connectionId: z.string().uuid(),
  callbackUrl: z.string().url().max(2_000),
  settings: z.record(z.unknown()).default({}),
  secretReference: z.string().min(1).max(500),
});

export type WebhookSubscriptionRequest = z.infer<typeof webhookSubscriptionRequestSchema>;

export const webhookSubscriptionResultSchema = z.object({
  providerSubscriptionId: z.string().min(1).max(500),
});

export type WebhookSubscriptionResult = z.infer<typeof webhookSubscriptionResultSchema>;

export interface Connector {
  readonly manifest: ConnectorManifest;
  verifyWebhook(input: { headers: Headers; rawBody: Uint8Array }): Promise<boolean>;
  identifyWebhook(input: { headers: Headers; body: unknown }): {
    deliveryId: string;
    eventType: string;
  };
  normalizeWebhook(input: { headers: Headers; body: unknown }): Promise<WebhookEnvelope>;
  validateConnection(input: {
    settings: Record<string, unknown>;
    secretReference: string;
  }): Promise<void>;
  health(input: {
    settings: Record<string, unknown>;
    secretReference: string;
  }): Promise<{ latencyMs: number }>;
  discoverAssets?(input: {
    connectionId: string;
    settings: Record<string, unknown>;
    secretReference: string;
  }): Promise<readonly ProviderAsset[]>;
  sync?(input: IntegrationSyncRequest): Promise<IntegrationSyncResult>;
  registerWebhook?(input: WebhookSubscriptionRequest): Promise<WebhookSubscriptionResult>;
  unregisterWebhook?(
    input: WebhookSubscriptionRequest & { providerSubscriptionId: string },
  ): Promise<void>;
}

/** Provider adapters that can dispatch a persisted outbound inbox message. */
export interface MessagingConnector extends Connector {
  sendMessage(input: OutboundMessageRequest): Promise<OutboundMessageResult>;
}

/** Connector registration performs schema validation before a provider adapter can run. */
export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();

  public register(connector: Connector): void {
    const manifest = connectorManifestSchema.parse(connector.manifest);
    if (this.connectors.has(manifest.key))
      throw new Error(`Connector already registered: ${manifest.key}`);
    this.connectors.set(manifest.key, connector);
  }

  public get(key: string): Connector {
    const connector = this.connectors.get(key);
    if (!connector) throw new Error(`Unknown connector: ${key}`);
    return connector;
  }

  public keys(): readonly string[] {
    return [...this.connectors.keys()].sort();
  }
}

export {
  developmentWebChatConnector,
  signDevelopmentWebChatWebhook,
} from './development-web-chat.js';
