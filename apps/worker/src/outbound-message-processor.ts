import {
  outboundMessageResultSchema,
  type Connector,
  type ConnectorRegistry,
  type MessagingConnector,
} from '@platform/connectors';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';

const maximumDeliveryAttempts = 8;

interface ClaimedOutboundMessage {
  id: string;
  tenant_id: string;
  connection_id: string;
  conversation_id: string;
  body: string;
  delivery_attempts: number;
}

interface DispatchRoute {
  connectorKey: string;
  providerConversationId: string;
  attachments: Array<{
    storageKey: string;
    mediaType: 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO';
    contentType: string;
    fileName: string;
    byteSize: number;
  }>;
}

function isMessagingConnector(connector: Connector): connector is MessagingConnector {
  return 'sendMessage' in connector && typeof connector.sendMessage === 'function';
}

/**
 * Dispatches only durable, committed outbound messages. Provider calls happen
 * between tenant transactions; the lease and provider idempotency key make a
 * retry safe when a worker is interrupted after the external call succeeds.
 */
export class OutboundMessageProcessor {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly connectors: ConnectorRegistry,
    private readonly workerId: string,
  ) {}

  public async processBatch(batchSize = 25): Promise<number> {
    const claimed = await sql<ClaimedOutboundMessage>`
      select * from messaging.claim_outbound_messages(${this.workerId}, ${batchSize}, 60)
    `.execute(this.database);

    for (const message of claimed.rows) {
      try {
        await this.dispatch(message);
      } catch (error) {
        await this.recordFailure(message, error);
      }
    }
    return claimed.rows.length;
  }

  private async dispatch(message: ClaimedOutboundMessage): Promise<void> {
    const route = await this.resolveRoute(message);
    const connector = this.connectors.get(route.connectorKey);
    if (!isMessagingConnector(connector))
      throw new Error(`Connector ${route.connectorKey} cannot dispatch messaging messages`);

    const result = outboundMessageResultSchema.parse(
      await connector.sendMessage({
        connectionId: message.connection_id,
        providerConversationId: route.providerConversationId,
        idempotencyKey: message.id,
        body: message.body,
        attachments: route.attachments,
      }),
    );
    await this.recordSent(message, result.providerMessageId, result.acceptedAt, route.connectorKey);
  }

  private async resolveRoute(message: ClaimedOutboundMessage): Promise<DispatchRoute> {
    return withTenantTransaction(
      this.database,
      {
        tenantId: message.tenant_id,
        actorId: null,
        subject: 'worker:outbound-message',
        requestId: message.id,
      },
      async (transaction) => {
        const route = await sql<{
          connector_key: string;
          provider_conversation_id: string | null;
        }>`select connection.connector_key, conversation.provider_conversation_id
          from messaging.messages as message
          join messaging.conversations as conversation
            on conversation.tenant_id = message.tenant_id
            and conversation.id = message.conversation_id
          join integrations.connections as connection
            on connection.tenant_id = message.tenant_id
            and connection.id = message.connection_id
          where message.id = ${message.id}::uuid
            and message.delivery_claimed_by = ${this.workerId}
          for share`.execute(transaction);
        const claimedRoute = route.rows[0];
        if (!claimedRoute?.provider_conversation_id)
          throw new Error('Outbound message has no dispatchable provider conversation');
        const attachments = await sql<{
          storage_key: string;
          media_type: 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO';
          content_type: string;
          file_name: string;
          byte_size: string;
        }>`select storage_key, media_type, content_type, file_name, byte_size
          from messaging.message_attachments where message_id = ${message.id}::uuid
          order by id limit 10`.execute(transaction);
        return {
          connectorKey: claimedRoute.connector_key,
          providerConversationId: claimedRoute.provider_conversation_id,
          attachments: attachments.rows.map((attachment) => ({
            storageKey: attachment.storage_key,
            mediaType: attachment.media_type,
            contentType: attachment.content_type,
            fileName: attachment.file_name,
            byteSize: Number(attachment.byte_size),
          })),
        };
      },
    );
  }

  private async recordSent(
    message: ClaimedOutboundMessage,
    providerMessageId: string,
    acceptedAt: string,
    connectorKey: string,
  ): Promise<void> {
    await withTenantTransaction(
      this.database,
      {
        tenantId: message.tenant_id,
        actorId: null,
        subject: `worker:outbound-message:${connectorKey}`,
        requestId: message.id,
      },
      async (transaction) => {
        const updated = await sql<{ id: string }>`update messaging.messages
          set delivery_status = 'SENT', provider_message_id = ${providerMessageId},
              sent_at = ${acceptedAt}::timestamptz, last_delivery_error = null,
              next_delivery_attempt_at = null, delivery_claimed_by = null, delivery_claimed_at = null
          where id = ${message.id}::uuid and delivery_claimed_by = ${this.workerId}
          returning id`.execute(transaction);
        if (!updated.rows[0]) return;
        await sql`insert into platform.outbox_events (
          tenant_id, event_type, source, correlation_id, causation_id, actor_type,
          resource_type, resource_id, data, dedupe_key
        ) values (
          ${message.tenant_id}::uuid, 'messaging.message.sent', 'messaging-outbound-worker',
          ${message.id}, ${message.id}, 'INTEGRATION', 'messaging.message', ${message.id},
          ${JSON.stringify({ providerMessageId, connectorKey })}::jsonb,
          ${`messaging:outbound:sent:${message.id}`}
        )`.execute(transaction);
      },
    );
  }

  private async recordFailure(message: ClaimedOutboundMessage, error: unknown): Promise<void> {
    const failure =
      error instanceof Error ? error.message : 'Unknown outbound message delivery error';
    await withTenantTransaction(
      this.database,
      {
        tenantId: message.tenant_id,
        actorId: null,
        subject: 'worker:outbound-message',
        requestId: message.id,
      },
      async (transaction) => {
        const updated = await sql<{
          delivery_status: string;
          delivery_attempts: number;
        }>`update messaging.messages
          set delivery_status = case
                when delivery_attempts >= ${maximumDeliveryAttempts} then 'DEAD_LETTER'
                else 'FAILED'
              end,
              last_delivery_error = left(${failure}, 2000),
              next_delivery_attempt_at = case
                when delivery_attempts >= ${maximumDeliveryAttempts} then null
                else now() + make_interval(secs => least(3600, 2 ^ least(delivery_attempts, 10)))
              end,
              delivery_claimed_by = null, delivery_claimed_at = null
          where id = ${message.id}::uuid and delivery_claimed_by = ${this.workerId}
          returning delivery_status, delivery_attempts`.execute(transaction);
        const result = updated.rows[0];
        if (result?.delivery_status !== 'DEAD_LETTER') return;
        await sql`insert into platform.dead_letters (
          tenant_id, source, event_type, source_event_id, payload, error_code, error_message, attempts
        ) values (
          ${message.tenant_id}::uuid, 'messaging-outbound-worker', 'messaging.message.dispatch_requested',
          ${message.id}, ${JSON.stringify({ connectionId: message.connection_id, conversationId: message.conversation_id })}::jsonb,
          'OUTBOUND_MESSAGE_MAX_ATTEMPTS', left(${failure}, 2000), ${result.delivery_attempts}
        )`.execute(transaction);
        await sql`insert into platform.outbox_events (
          tenant_id, event_type, source, correlation_id, causation_id, actor_type,
          resource_type, resource_id, data, dedupe_key
        ) values (
          ${message.tenant_id}::uuid, 'messaging.message.dead_lettered', 'messaging-outbound-worker',
          ${message.id}, ${message.id}, 'INTEGRATION', 'messaging.message', ${message.id},
          ${JSON.stringify({ attempts: result.delivery_attempts })}::jsonb,
          ${`messaging:outbound:dead-letter:${message.id}`}
        )`.execute(transaction);
      },
    );
  }
}
