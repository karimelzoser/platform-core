import { connectorManifestSchema, type ConnectorManifest } from '@platform/contracts';
import { outboundAttachmentSchema } from '@platform/media';
import { z } from 'zod';

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
}
