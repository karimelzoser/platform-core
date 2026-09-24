import { connectorManifestSchema, type ConnectorManifest } from '@platform/contracts';
import { z } from 'zod';

export const webhookEnvelopeSchema = z.object({
  deliveryId: z.string().min(1),
  eventType: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
  resource: z.object({ type: z.string().min(1), providerId: z.string().min(1) }),
  payload: z.record(z.unknown()),
});

export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>;

export interface Connector {
  readonly manifest: ConnectorManifest;
  verifyWebhook(input: { headers: Headers; rawBody: Uint8Array }): Promise<boolean>;
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
