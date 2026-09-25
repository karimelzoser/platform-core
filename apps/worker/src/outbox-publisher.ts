import { sql, type PlatformDatabase } from '@platform/database';
import { StringCodec, type NatsConnection } from 'nats';

const codec = StringCodec();

interface ClaimedOutboxEvent {
  id: string;
  tenant_id: string;
  event_type: string;
  event_version: number;
  source: string;
  correlation_id: string | null;
  causation_id: string | null;
  actor_type: 'USER' | 'AI' | 'SYSTEM' | 'SERVICE' | 'INTEGRATION';
  actor_id: string | null;
  resource_type: string;
  resource_id: string;
  data: Record<string, unknown>;
}

export class OutboxPublisher {
  public constructor(
    private readonly db: PlatformDatabase,
    private readonly nats: NatsConnection,
    private readonly workerId: string,
  ) {}

  public async publishBatch(batchSize = 25): Promise<number> {
    const claimed = await sql<ClaimedOutboxEvent>`
      select * from platform.claim_outbox_events(${this.workerId}, ${batchSize}, 60)
    `.execute(this.db);
    const jetstream = this.nats.jetstream();

    for (const event of claimed.rows) {
      try {
        const envelope = {
          id: event.id,
          type: event.event_type,
          version: event.event_version,
          tenantId: event.tenant_id,
          occurredAt: new Date().toISOString(),
          source: event.source,
          correlationId: event.correlation_id ?? undefined,
          causationId: event.causation_id ?? undefined,
          actor: { type: event.actor_type, id: event.actor_id ?? undefined },
          resource: { type: event.resource_type, id: event.resource_id },
          data: event.data,
        };
        await jetstream.publish(
          `platform.${event.event_type}.v${String(event.event_version)}`,
          codec.encode(JSON.stringify(envelope)),
          { msgID: event.id },
        );
        await sql`select platform.mark_outbox_published(${event.id}::uuid, ${this.workerId})`.execute(
          this.db,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown NATS publishing error';
        await sql`select platform.record_outbox_failure(${event.id}::uuid, ${this.workerId}, ${message}, 8)`.execute(
          this.db,
        );
      }
    }
    return claimed.rows.length;
  }
}
