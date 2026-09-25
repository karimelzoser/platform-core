import { createHash, randomUUID } from 'node:crypto';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConnectorRegistry } from '@platform/connectors';
import {
  createDatabase,
  destroyDatabase,
  sql,
  withTenantTransaction,
  type PlatformDatabase,
} from '@platform/database';
import { loadApiConfig } from './config.js';

export type WebhookIngressResult =
  | { kind: 'accepted'; deliveryId: string }
  | { kind: 'duplicate'; deliveryId: string }
  | { kind: 'unknown_connection' }
  | { kind: 'disabled_connection' }
  | { kind: 'invalid_signature' }
  | { kind: 'unknown_connector' };

interface ResolvedConnection {
  tenant_id: string;
  connection_id: string;
  connector_key: string;
  connection_status: string;
}

@Injectable()
export class WebhookIngressService implements OnModuleDestroy {
  private readonly database: PlatformDatabase = createDatabase(loadApiConfig().DATABASE_URL);

  public constructor(private readonly connectors: ConnectorRegistry) {}

  public async ingest(input: {
    connectorKey: string;
    connectionId: string;
    headers: Headers;
    rawBody: Uint8Array;
    payload: Record<string, unknown>;
    correlationId: string;
  }): Promise<WebhookIngressResult> {
    let connector;
    try {
      connector = this.connectors.get(input.connectorKey);
    } catch {
      return { kind: 'unknown_connector' };
    }
    const connection = await this.resolveConnection(input.connectorKey, input.connectionId);
    if (!connection) return { kind: 'unknown_connection' };
    if (connection.connection_status !== 'CONNECTED') return { kind: 'disabled_connection' };
    if (!(await connector.verifyWebhook({ headers: input.headers, rawBody: input.rawBody }))) {
      return { kind: 'invalid_signature' };
    }

    const identified = connector.identifyWebhook({ headers: input.headers, body: input.payload });
    const dedupeKey = createHash('sha256')
      .update(`${connection.connection_id}:${identified.deliveryId}`)
      .digest('hex');
    return withTenantTransaction(
      this.database,
      {
        tenantId: connection.tenant_id,
        actorId: null,
        subject: `webhook:${connection.connector_key}`,
        requestId: input.correlationId,
      },
      async (transaction) => {
        const inserted = await sql<{ id: string }>`insert into integrations.webhook_deliveries (
          tenant_id, connection_id, provider_delivery_id, event_type, signature_valid,
          headers, payload, dedupe_key
        ) values (
          ${connection.tenant_id}::uuid, ${connection.connection_id}::uuid,
          ${identified.deliveryId}, ${identified.eventType}, true,
          ${JSON.stringify(safeHeaders(input.headers))}::jsonb,
          ${JSON.stringify(input.payload)}::jsonb, ${dedupeKey}
        ) on conflict (tenant_id, connection_id, dedupe_key) do nothing returning id`.execute(
          transaction,
        );
        if (!inserted.rows[0])
          return { kind: 'duplicate' as const, deliveryId: identified.deliveryId };
        await sql`insert into platform.outbox_events (
          tenant_id, event_type, source, correlation_id, causation_id, actor_type,
          resource_type, resource_id, data, dedupe_key
        ) values (
          ${connection.tenant_id}::uuid, 'integrations.webhook.received', 'webhook-ingress',
          ${input.correlationId}, ${inserted.rows[0].id}, 'INTEGRATION', 'webhook_delivery',
          ${inserted.rows[0].id}, ${JSON.stringify({ deliveryId: inserted.rows[0].id })}::jsonb,
          ${`webhook:${inserted.rows[0].id}`}
        )`.execute(transaction);
        return { kind: 'accepted' as const, deliveryId: identified.deliveryId };
      },
    );
  }

  public async onModuleDestroy(): Promise<void> {
    await destroyDatabase(this.database);
  }

  private async resolveConnection(
    connectorKey: string,
    connectionId: string,
  ): Promise<ResolvedConnection | undefined> {
    const result =
      await sql<ResolvedConnection>`select * from integrations.resolve_webhook_connection(
      ${connectorKey}, ${connectionId}::uuid
    )`.execute(this.database);
    return result.rows[0];
  }
}

function safeHeaders(headers: Headers): Record<string, string> {
  const allowed = new Set([
    'content-type',
    'user-agent',
    'x-request-id',
    'x-github-delivery',
    'x-shopify-webhook-id',
    'x-meta-delivery-id',
  ]);
  return Object.fromEntries(
    [...headers.entries()].filter(([name]) => allowed.has(name.toLowerCase())),
  );
}

export function parseWebhookJson(rawBody: Uint8Array): Record<string, unknown> {
  const parsed: unknown = JSON.parse(Buffer.from(rawBody).toString('utf8'));
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Webhook payload must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export function correlationId(value: string | undefined): string {
  return value && value.length <= 128 ? value : randomUUID();
}
