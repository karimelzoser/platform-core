import {
  sql,
  withTenantTransaction,
  type PlatformDatabase,
  type PlatformTransaction,
} from '@platform/database';

interface DueTicket {
  id: string;
  tenant_id: string;
}

interface TicketSlaClock {
  id: string;
  status: string;
  first_response_at: Date | null;
  first_response_due_at: Date | null;
  resolution_due_at: Date | null;
  escalation_minutes: number | null;
}

type SlaEventType = 'FIRST_RESPONSE_BREACHED' | 'RESOLUTION_BREACHED' | 'ESCALATED';

/**
 * Evaluates durable ticket clocks after the ticket transaction commits. The
 * claim function only identifies candidates; each write re-enters a tenant
 * transaction and uses a per-ticket dedupe key, so retries are harmless.
 */
export class TicketSlaProcessor {
  public constructor(private readonly database: PlatformDatabase) {}

  public async processBatch(batchSize = 100): Promise<number> {
    const due =
      await sql<DueTicket>`select * from tickets.claim_due_sla_tickets(${batchSize})`.execute(
        this.database,
      );
    for (const ticket of due.rows) await this.evaluate(ticket);
    return due.rows.length;
  }

  private async evaluate(ticket: DueTicket): Promise<void> {
    await withTenantTransaction(
      this.database,
      {
        tenantId: ticket.tenant_id,
        actorId: null,
        subject: 'worker:ticket-sla',
        requestId: `ticket-sla:${ticket.id}`,
      },
      async (transaction) => {
        const result = await sql<TicketSlaClock>`select record.id, record.status,
            record.first_response_at, record.first_response_due_at, record.resolution_due_at,
            policy.escalation_minutes
          from tickets.records as record
          left join tickets.sla_policies as policy
            on policy.tenant_id = record.tenant_id and policy.id = record.sla_policy_id
          where record.id = ${ticket.id}::uuid and record.sla_paused_at is null
          for update`.execute(transaction);
        const clock = result.rows[0];
        if (!clock || !['OPEN', 'PENDING'].includes(clock.status)) return;

        await sql`update tickets.records set sla_last_evaluated_at = now()
          where id = ${ticket.id}::uuid`.execute(transaction);
        if (
          !clock.first_response_at &&
          clock.first_response_due_at &&
          clock.first_response_due_at <= new Date()
        ) {
          await this.recordEvent(
            transaction,
            ticket,
            'FIRST_RESPONSE_BREACHED',
            'first-response-breached',
            {
              dueAt: clock.first_response_due_at.toISOString(),
            },
          );
        }
        if (clock.resolution_due_at && clock.resolution_due_at <= new Date()) {
          await this.recordEvent(
            transaction,
            ticket,
            'RESOLUTION_BREACHED',
            'resolution-breached',
            { dueAt: clock.resolution_due_at.toISOString() },
          );
          if (
            clock.escalation_minutes !== null &&
            clock.resolution_due_at.getTime() + clock.escalation_minutes * 60_000 <= Date.now()
          ) {
            await this.recordEvent(transaction, ticket, 'ESCALATED', 'resolution-escalated', {
              breachedAt: clock.resolution_due_at.toISOString(),
              escalationMinutes: clock.escalation_minutes,
            });
          }
        }
      },
    );
  }

  private async recordEvent(
    transaction: PlatformTransaction,
    ticket: DueTicket,
    eventType: SlaEventType,
    dedupeKey: string,
    metadata: Record<string, unknown>,
  ): Promise<boolean> {
    const event = await sql<{ id: string }>`insert into tickets.sla_events (
      tenant_id, ticket_id, event_type, dedupe_key, metadata
    ) values (
      ${ticket.tenant_id}::uuid, ${ticket.id}::uuid, ${eventType}, ${dedupeKey},
      ${JSON.stringify(metadata)}::jsonb
    ) on conflict (tenant_id, ticket_id, dedupe_key) do nothing returning id`.execute(transaction);
    if (!event.rows[0]) return false;
    await sql`insert into platform.outbox_events (
      tenant_id, event_type, source, actor_type, resource_type, resource_id, data, dedupe_key
    ) values (
      ${ticket.tenant_id}::uuid, ${`tickets.sla.${eventType.toLowerCase()}`},
      'ticket-sla-worker', 'SYSTEM', 'ticket', ${ticket.id}, ${JSON.stringify(metadata)}::jsonb,
      ${`tickets:sla:${ticket.id}:${dedupeKey}`}
    )`.execute(transaction);
    return true;
  }
}
