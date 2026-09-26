import {
  ConnectorRegistry,
  parseInboundMessagingWebhook,
  type WebhookEnvelope,
} from '@platform/connectors';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';

const maximumWebhookAttempts = 8;

interface ClaimedWebhookDelivery {
  id: string;
  tenant_id: string;
  connection_id: string;
  connector_key: string;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
  attempts: number;
  received_at: Date;
}

/**
 * Converts a connector-normalized inbound message into tenant-scoped inbox
 * data. It intentionally accepts only the canonical connector payload: all
 * other delivery types remain in the raw ledger for their owning module.
 */
export class MessagingWebhookProcessor {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly connectors: ConnectorRegistry,
    private readonly workerId: string,
  ) {}

  public async processBatch(batchSize = 25): Promise<number> {
    const claimed = await sql<ClaimedWebhookDelivery>`
      select delivery.*, connection.connector_key
      from integrations.claim_webhook_deliveries(${this.workerId}, ${batchSize}, 60) as delivery
      join integrations.connections as connection
        on connection.tenant_id = delivery.tenant_id and connection.id = delivery.connection_id
    `.execute(this.database);

    for (const delivery of claimed.rows) {
      try {
        await this.processDelivery(delivery);
      } catch (error) {
        await this.recordFailure(delivery, error);
      }
    }
    return claimed.rows.length;
  }

  private async processDelivery(delivery: ClaimedWebhookDelivery): Promise<void> {
    const connector = this.connectors.get(delivery.connector_key);
    const envelope = await connector.normalizeWebhook({
      headers: new Headers(Object.entries(delivery.headers)),
      body: delivery.payload,
    });
    const inbound = parseInboundMessagingWebhook(envelope);
    if (!inbound) {
      await this.reject(delivery, envelope);
      return;
    }

    await withTenantTransaction(
      this.database,
      {
        tenantId: delivery.tenant_id,
        actorId: null,
        subject: `worker:webhook:${delivery.connector_key}`,
        requestId: delivery.id,
      },
      async (transaction) => {
        const lease = await sql<{ id: string }>`select id from integrations.webhook_deliveries
          where id = ${delivery.id}::uuid and state = 'PROCESSING' and claimed_by = ${this.workerId}
          for update`.execute(transaction);
        if (!lease.rows[0]) return;

        const sentAt = inbound.sentAt ?? delivery.received_at.toISOString();
        const conversation = await sql<{ id: string }>`insert into messaging.conversations (
          tenant_id, connection_id, customer_id, channel, provider_conversation_id, last_message_at
        ) values (
          ${delivery.tenant_id}::uuid, ${delivery.connection_id}::uuid,
          ${inbound.customerId ?? null}::uuid, ${inbound.channel}, ${inbound.providerConversationId},
          ${sentAt}::timestamptz
        ) on conflict (tenant_id, connection_id, channel, provider_conversation_id)
        do update set
          customer_id = coalesce(messaging.conversations.customer_id, excluded.customer_id),
          last_message_at = greatest(
            coalesce(messaging.conversations.last_message_at, excluded.last_message_at),
            excluded.last_message_at
          ),
          updated_at = now()
        returning id`.execute(transaction);
        const conversationId = conversation.rows[0]?.id;
        if (!conversationId) throw new Error('Inbound conversation was not persisted');

        const message = await sql<{ id: string }>`insert into messaging.messages (
          tenant_id, connection_id, conversation_id, direction, sender_type, body,
          provider_message_id, sent_at, webhook_delivery_id
        ) values (
          ${delivery.tenant_id}::uuid, ${delivery.connection_id}::uuid, ${conversationId}::uuid,
          'INBOUND', 'CUSTOMER', ${inbound.body}, ${inbound.providerMessageId},
          ${sentAt}::timestamptz, ${delivery.id}::uuid
        ) on conflict (tenant_id, connection_id, provider_message_id) do nothing
        returning id`.execute(transaction);

        await sql`update integrations.webhook_deliveries
          set state = 'PROCESSED', processed_at = now(), normalized_event = ${JSON.stringify(envelope)}::jsonb,
              last_error = null, claimed_at = null, claimed_by = null
          where id = ${delivery.id}::uuid and state = 'PROCESSING' and claimed_by = ${this.workerId}`.execute(
          transaction,
        );

        const messageId = message.rows[0]?.id;
        if (!messageId) return;
        await sql`insert into platform.outbox_events (
          tenant_id, event_type, source, correlation_id, causation_id, actor_type,
          resource_type, resource_id, data, dedupe_key
        ) values (
          ${delivery.tenant_id}::uuid, 'messaging.message.received', 'messaging-webhook-worker',
          ${delivery.id}, ${delivery.id}, 'INTEGRATION', 'messaging.message', ${messageId},
          ${JSON.stringify({ conversationId, messageId, webhookDeliveryId: delivery.id })}::jsonb,
          ${`messaging:inbound:${messageId}`}
        )`.execute(transaction);
      },
    );
  }

  private async reject(delivery: ClaimedWebhookDelivery, envelope: WebhookEnvelope): Promise<void> {
    await this.finishWithoutMessage(delivery, 'REJECTED', envelope, 'Unsupported webhook event');
  }

  private async recordFailure(delivery: ClaimedWebhookDelivery, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown webhook processing error';
    await withTenantTransaction(
      this.database,
      {
        tenantId: delivery.tenant_id,
        actorId: null,
        subject: `worker:webhook:${delivery.connector_key}`,
        requestId: delivery.id,
      },
      async (transaction) => {
        const updated = await sql<{
          state: string;
          attempts: number;
        }>`update integrations.webhook_deliveries
          set state = case when attempts >= ${maximumWebhookAttempts} then 'DEAD_LETTER' else 'FAILED' end,
              last_error = left(${message}, 2000),
              next_attempt_at = now() + make_interval(secs => least(3600, 2 ^ least(attempts, 10))),
              claimed_at = null, claimed_by = null
          where id = ${delivery.id}::uuid and state = 'PROCESSING' and claimed_by = ${this.workerId}
          returning state, attempts`.execute(transaction);
        const result = updated.rows[0];
        if (result?.state !== 'DEAD_LETTER') return;
        await sql`insert into platform.dead_letters (
          tenant_id, source, event_type, source_event_id, payload, error_code, error_message, attempts
        ) values (
          ${delivery.tenant_id}::uuid, 'messaging-webhook-worker', 'integrations.webhook.received',
          ${delivery.id}, ${JSON.stringify(delivery.payload)}::jsonb, 'WEBHOOK_PROCESSING_MAX_ATTEMPTS',
          left(${message}, 2000), ${result.attempts}
        )`.execute(transaction);
      },
    );
  }

  private async finishWithoutMessage(
    delivery: ClaimedWebhookDelivery,
    state: 'REJECTED',
    envelope: WebhookEnvelope,
    error: string,
  ): Promise<void> {
    await withTenantTransaction(
      this.database,
      {
        tenantId: delivery.tenant_id,
        actorId: null,
        subject: `worker:webhook:${delivery.connector_key}`,
        requestId: delivery.id,
      },
      async (transaction) => {
        await sql`update integrations.webhook_deliveries
          set state = ${state}, processed_at = now(), normalized_event = ${JSON.stringify(envelope)}::jsonb,
              last_error = ${error}, claimed_at = null, claimed_by = null
          where id = ${delivery.id}::uuid and state = 'PROCESSING' and claimed_by = ${this.workerId}`.execute(
          transaction,
        );
      },
    );
  }
}
