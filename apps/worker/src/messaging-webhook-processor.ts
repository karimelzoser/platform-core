import {
  ConnectorRegistry,
  parseInboundMessagingWebhook,
  parseMessagingDeliveryReceipt,
  parseVerifiedConsentWebhook,
  type MessagingConnector,
  type Connector,
  type WebhookEnvelope,
} from '@platform/connectors';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';

const maximumWebhookAttempts = 8;

interface ClaimedWebhookDelivery {
  id: string;
  tenant_id: string;
  connection_id: string;
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
      select * from integrations.claim_webhook_deliveries(${this.workerId}, ${batchSize}, 60)
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
    const connectorKey = await this.resolveConnectorKey(delivery);
    const connector = this.connectors.get(connectorKey);
    const envelope = await connector.normalizeWebhook({
      headers: new Headers(Object.entries(delivery.headers)),
      body: delivery.payload,
    });
    const inbound = parseInboundMessagingWebhook(envelope, messagingChannels(connector));
    if (inbound) return this.persistInbound(delivery, connectorKey, envelope, inbound);
    const receipt = parseMessagingDeliveryReceipt(envelope);
    if (receipt) return this.persistDeliveryReceipt(delivery, connectorKey, envelope, receipt);
    const consent = parseVerifiedConsentWebhook(envelope);
    if (consent) return this.persistVerifiedConsent(delivery, connectorKey, envelope, consent);
    await this.reject(delivery, connectorKey, envelope);
  }

  private async persistVerifiedConsent(
    delivery: ClaimedWebhookDelivery,
    connectorKey: string,
    envelope: WebhookEnvelope,
    consent: NonNullable<ReturnType<typeof parseVerifiedConsentWebhook>>,
  ): Promise<void> {
    await withTenantTransaction(
      this.database,
      {
        tenantId: delivery.tenant_id,
        actorId: null,
        subject: `worker:webhook:${connectorKey}`,
        requestId: delivery.id,
      },
      async (transaction) => {
        const lease = await sql<{ id: string }>`select id from integrations.webhook_deliveries
          where id = ${delivery.id}::uuid and state = 'PROCESSING' and claimed_by = ${this.workerId}
          for update`.execute(transaction);
        if (!lease.rows[0]) return;
        const customer = await sql<{ id: string }>`select id from crm.customers
          where id = ${consent.customerId}::uuid and status = 'ACTIVE'`.execute(transaction);
        if (!customer.rows[0])
          throw new Error('Active customer was not found for verified consent');

        const occurredAt = consent.occurredAt ?? delivery.received_at.toISOString();
        const evidence = await sql<{ id: string }>`insert into crm.communication_consent_evidence (
          tenant_id, customer_id, channel, webhook_delivery_id, provider_consent_id, occurred_at, metadata
        ) values (
          ${delivery.tenant_id}::uuid, ${consent.customerId}::uuid, ${consent.channel},
          ${delivery.id}::uuid, ${consent.providerConsentId}, ${occurredAt}::timestamptz,
          ${JSON.stringify({ connectorKey })}::jsonb
        ) on conflict (tenant_id, customer_id, channel, provider_consent_id) do nothing returning id`.execute(
          transaction,
        );
        const evidenceId = evidence.rows[0]?.id;
        if (evidenceId) {
          await sql`insert into crm.communication_preferences (
            tenant_id, customer_id, channel, status, source, captured_at, suppressed_until, reason, metadata
          ) values (
            ${delivery.tenant_id}::uuid, ${consent.customerId}::uuid, ${consent.channel},
            'OPTED_IN', 'provider_webhook', ${occurredAt}::timestamptz, null,
            'Verified provider consent event',
            ${JSON.stringify({ evidenceType: 'VERIFIED_PROVIDER_WEBHOOK', webhookDeliveryId: delivery.id })}::jsonb
          ) on conflict (tenant_id, customer_id, channel) do update set
            status = case when crm.communication_preferences.captured_at is null
              or crm.communication_preferences.captured_at <= excluded.captured_at
              then 'OPTED_IN' else crm.communication_preferences.status end,
            source = case when crm.communication_preferences.captured_at is null
              or crm.communication_preferences.captured_at <= excluded.captured_at
              then excluded.source else crm.communication_preferences.source end,
            captured_at = greatest(crm.communication_preferences.captured_at, excluded.captured_at),
            suppressed_until = case when crm.communication_preferences.captured_at is null
              or crm.communication_preferences.captured_at <= excluded.captured_at
              then null else crm.communication_preferences.suppressed_until end,
            reason = case when crm.communication_preferences.captured_at is null
              or crm.communication_preferences.captured_at <= excluded.captured_at
              then excluded.reason else crm.communication_preferences.reason end,
            metadata = case when crm.communication_preferences.captured_at is null
              or crm.communication_preferences.captured_at <= excluded.captured_at
              then excluded.metadata else crm.communication_preferences.metadata end,
            updated_at = now()`.execute(transaction);
        }
        await sql`update integrations.webhook_deliveries
          set state = 'PROCESSED', processed_at = now(), normalized_event = ${JSON.stringify(envelope)}::jsonb,
              last_error = null, claimed_at = null, claimed_by = null
          where id = ${delivery.id}::uuid and state = 'PROCESSING' and claimed_by = ${this.workerId}`.execute(
          transaction,
        );
        if (!evidenceId) return;
        await sql`insert into platform.audit_log (
          tenant_id, actor_type, action, resource_type, resource_id, request_id, correlation_id, metadata
        ) values (
          ${delivery.tenant_id}::uuid, 'INTEGRATION', 'crm.customer.communication.verified_opt_in',
          'crm.customer', ${consent.customerId}, ${delivery.id}, ${delivery.id},
          ${JSON.stringify({ evidenceId, webhookDeliveryId: delivery.id, channel: consent.channel })}::jsonb
        )`.execute(transaction);
        await sql`insert into platform.outbox_events (
          tenant_id, event_type, source, correlation_id, causation_id, actor_type,
          resource_type, resource_id, data, dedupe_key
        ) values (
          ${delivery.tenant_id}::uuid, 'crm.customer.communication.opted_in', 'crm-consent-webhook-worker',
          ${delivery.id}, ${delivery.id}, 'INTEGRATION', 'crm.customer', ${consent.customerId},
          ${JSON.stringify({ customerId: consent.customerId, channel: consent.channel, evidenceId })}::jsonb,
          ${`crm:consent:${evidenceId}`}
        )`.execute(transaction);
      },
    );
  }

  private async persistInbound(
    delivery: ClaimedWebhookDelivery,
    connectorKey: string,
    envelope: WebhookEnvelope,
    inbound: NonNullable<ReturnType<typeof parseInboundMessagingWebhook>>,
  ): Promise<void> {
    await withTenantTransaction(
      this.database,
      {
        tenantId: delivery.tenant_id,
        actorId: null,
        subject: `worker:webhook:${connectorKey}`,
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

  private async persistDeliveryReceipt(
    delivery: ClaimedWebhookDelivery,
    connectorKey: string,
    envelope: WebhookEnvelope,
    receipt: NonNullable<ReturnType<typeof parseMessagingDeliveryReceipt>>,
  ): Promise<void> {
    await withTenantTransaction(
      this.database,
      {
        tenantId: delivery.tenant_id,
        actorId: null,
        subject: `worker:webhook:${connectorKey}`,
        requestId: delivery.id,
      },
      async (transaction) => {
        const lease = await sql<{ id: string }>`select id from integrations.webhook_deliveries
          where id = ${delivery.id}::uuid and state = 'PROCESSING' and claimed_by = ${this.workerId}
          for update`.execute(transaction);
        if (!lease.rows[0]) return;

        const occurredAt = receipt.occurredAt ?? delivery.received_at.toISOString();
        const updated = await sql<{ id: string; delivery_status: string }>`update messaging.messages
          set delivery_status = case
                when delivery_status = 'READ' then 'READ'
                when ${receipt.status} = 'READ' then 'READ'
                when delivery_status = 'DELIVERED' then 'DELIVERED'
                when ${receipt.status} = 'DELIVERED' then 'DELIVERED'
                when ${receipt.status} = 'SENT' then 'SENT'
                when ${receipt.status} = 'FAILED' then 'FAILED'
                else delivery_status
              end,
              delivered_at = case
                when ${receipt.status} in ('DELIVERED', 'READ')
                  then coalesce(delivered_at, ${occurredAt}::timestamptz)
                else delivered_at
              end,
              last_delivery_error = case
                -- A provider's raw receipt remains in the authenticated delivery
                -- ledger; tenant message state stores only a bounded code.
                when ${receipt.status} = 'FAILED' then 'PROVIDER_DELIVERY_FAILED'
                else last_delivery_error
              end,
              next_delivery_attempt_at = case
                when ${receipt.status} = 'FAILED' then null
                else next_delivery_attempt_at
              end
          where connection_id = ${delivery.connection_id}::uuid
            and provider_message_id = ${receipt.providerMessageId}
          returning id, delivery_status`.execute(transaction);
        await sql`update integrations.webhook_deliveries
          set state = 'PROCESSED', processed_at = now(), normalized_event = ${JSON.stringify(envelope)}::jsonb,
              last_error = null, claimed_at = null, claimed_by = null
          where id = ${delivery.id}::uuid and state = 'PROCESSING' and claimed_by = ${this.workerId}`.execute(
          transaction,
        );
        const message = updated.rows[0];
        if (!message) return;
        await sql`insert into platform.outbox_events (
          tenant_id, event_type, source, correlation_id, causation_id, actor_type,
          resource_type, resource_id, data, dedupe_key
        ) values (
          ${delivery.tenant_id}::uuid, 'messaging.message.delivery_updated', 'messaging-webhook-worker',
          ${delivery.id}, ${delivery.id}, 'INTEGRATION', 'messaging.message', ${message.id},
          ${JSON.stringify({ status: message.delivery_status, providerMessageId: receipt.providerMessageId })}::jsonb,
          ${`messaging:receipt:${delivery.id}`}
        )`.execute(transaction);
      },
    );
  }

  private async resolveConnectorKey(delivery: ClaimedWebhookDelivery): Promise<string> {
    return withTenantTransaction(
      this.database,
      {
        tenantId: delivery.tenant_id,
        actorId: null,
        subject: 'worker:webhook',
        requestId: delivery.id,
      },
      async (transaction) => {
        const connection = await sql<{ connector_key: string }>`select connector_key
          from integrations.connections where id = ${delivery.connection_id}::uuid`.execute(
          transaction,
        );
        const connectorKey = connection.rows[0]?.connector_key;
        if (!connectorKey) throw new Error('Webhook connection was not found for claimed delivery');
        return connectorKey;
      },
    );
  }

  private async reject(
    delivery: ClaimedWebhookDelivery,
    connectorKey: string,
    envelope: WebhookEnvelope,
  ): Promise<void> {
    await this.finishWithoutMessage(
      delivery,
      connectorKey,
      'REJECTED',
      envelope,
      'Unsupported webhook event',
    );
  }

  private async recordFailure(delivery: ClaimedWebhookDelivery, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown webhook processing error';
    await withTenantTransaction(
      this.database,
      {
        tenantId: delivery.tenant_id,
        actorId: null,
        subject: 'worker:webhook',
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
    connectorKey: string,
    state: 'REJECTED',
    envelope: WebhookEnvelope,
    error: string,
  ): Promise<void> {
    await withTenantTransaction(
      this.database,
      {
        tenantId: delivery.tenant_id,
        actorId: null,
        subject: `worker:webhook:${connectorKey}`,
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

function messagingChannels(
  connector: Connector,
): readonly MessagingConnector['messagingChannels'][number][] {
  if (!('messagingChannels' in connector) || !Array.isArray(connector.messagingChannels)) return [];
  return connector.messagingChannels;
}
