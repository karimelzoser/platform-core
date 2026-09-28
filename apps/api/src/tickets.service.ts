import {
  CommandExecutor,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import { sql, withTenantTransaction, type PlatformTransaction } from '@platform/database';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiDatabaseService } from './api-database.service.js';

export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TicketResolutionStatus = 'OPEN' | 'RESOLVED';
export type TicketSlaStatus = 'OPEN' | 'PENDING';

export interface CreateTicketInput {
  title: string;
  customerId?: string;
  conversationId?: string;
  priority?: TicketPriority;
}

export interface UpdateTicketInput {
  title?: string;
  priority?: TicketPriority;
  customerId?: string | null;
  conversationId?: string | null;
}

export interface TicketSlaPolicyInput {
  name: string;
  priority: TicketPriority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  escalationMinutes?: number;
}

@Injectable()
export class TicketsService {
  public constructor(
    private readonly database: ApiDatabaseService,
    private readonly commands: CommandExecutor,
  ) {}

  public async list(context: TenantRequestContext) {
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const response = await sql<{
        id: string;
        title: string;
        status: string;
        priority: string;
        customer_id: string | null;
        conversation_id: string | null;
        assigned_to: string | null;
        created_at: Date;
      }>`select id, title, status, priority, customer_id, conversation_id, assigned_to, created_at
        from tickets.records order by created_at desc, id desc limit 100`.execute(transaction);
      return response.rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        priority: row.priority,
        customerId: row.customer_id,
        conversationId: row.conversation_id,
        assignedTo: row.assigned_to,
        createdAt: row.created_at,
      }));
    });
  }

  public async get(context: TenantRequestContext, ticketId: string) {
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const ticket = await sql<{
        id: string;
        title: string;
        status: string;
        priority: string;
        customer_id: string | null;
        conversation_id: string | null;
        assigned_to: string | null;
        resolved_at: Date | null;
        first_response_due_at: Date | null;
        resolution_due_at: Date | null;
        first_response_at: Date | null;
        sla_paused_at: Date | null;
        sla_policy_id: string | null;
        created_at: Date;
        updated_at: Date;
      }>`select id, title, status, priority, customer_id, conversation_id, assigned_to,
          resolved_at, first_response_due_at, resolution_due_at, first_response_at, sla_paused_at,
          sla_policy_id, created_at, updated_at
        from tickets.records where id = ${ticketId}::uuid`.execute(transaction);
      const record = ticket.rows[0];
      if (!record) return undefined;
      const comments = await sql<{
        id: string;
        author_id: string | null;
        body: string;
        visibility: string;
        created_at: Date;
      }>`select id, author_id, body, visibility, created_at from tickets.comments
        where ticket_id = ${ticketId}::uuid order by created_at asc, id asc`.execute(transaction);
      const slaEvents = await sql<{
        id: string;
        event_type: string;
        metadata: Record<string, unknown>;
        occurred_at: Date;
      }>`select id, event_type, metadata, occurred_at from tickets.sla_events
        where ticket_id = ${ticketId}::uuid order by occurred_at desc, id desc limit 100`.execute(
        transaction,
      );
      return {
        id: record.id,
        title: record.title,
        status: record.status,
        priority: record.priority,
        customerId: record.customer_id,
        conversationId: record.conversation_id,
        assignedTo: record.assigned_to,
        resolvedAt: record.resolved_at,
        firstResponseDueAt: record.first_response_due_at,
        resolutionDueAt: record.resolution_due_at,
        firstResponseAt: record.first_response_at,
        slaPausedAt: record.sla_paused_at,
        slaPolicyId: record.sla_policy_id,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
        comments: comments.rows.map((comment) => ({
          id: comment.id,
          authorId: comment.author_id,
          body: comment.body,
          visibility: comment.visibility,
          createdAt: comment.created_at,
        })),
        slaEvents: slaEvents.rows.map((event) => ({
          id: event.id,
          eventType: event.event_type,
          metadata: event.metadata,
          occurredAt: event.occurred_at,
        })),
      };
    });
  }

  public async listAssignees(context: TenantRequestContext) {
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const response = await sql<{
        id: string;
        email: string | null;
        first_name: string | null;
        last_name: string | null;
      }>`select user_record.id, user_record.email, user_record.first_name, user_record.last_name
        from identity.memberships as membership
        join identity.users as user_record on user_record.id = membership.user_id
        where membership.status = 'ACTIVE' and user_record.status = 'ACTIVE'
        order by coalesce(user_record.first_name, ''), coalesce(user_record.last_name, ''), user_record.id
        limit 100`.execute(transaction);
      return response.rows.map((row) => ({
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
      }));
    });
  }

  public async listSlaPolicies(context: TenantRequestContext) {
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const response = await sql<{
        id: string;
        name: string;
        priority: TicketPriority;
        first_response_minutes: number;
        resolution_minutes: number;
        escalation_minutes: number | null;
        active: boolean;
      }>`select id, name, priority, first_response_minutes, resolution_minutes,
          escalation_minutes, active from tickets.sla_policies
        order by active desc, priority, name, id`.execute(transaction);
      return response.rows.map((policy) => ({
        id: policy.id,
        name: policy.name,
        priority: policy.priority,
        firstResponseMinutes: policy.first_response_minutes,
        resolutionMinutes: policy.resolution_minutes,
        escalationMinutes: policy.escalation_minutes,
        active: policy.active,
      }));
    });
  }

  public async createSlaPolicy(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: TicketSlaPolicyInput,
    approvalId?: string,
    policyId?: string,
  ): Promise<CommandResult<{ slaPolicyId: string }>> {
    const slaPolicyId = policyId ?? randomUUID();
    return this.commands.execute(
      {
        action: 'tickets.sla_policy.create',
        permission: 'tickets.sla.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'ticket_sla_policy', id: slaPolicyId }),
        event: { type: 'tickets.sla_policy.created', data: (_input, result) => result },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const created = await sql<{ id: string }>`insert into tickets.sla_policies (
            id, tenant_id, name, priority, first_response_minutes, resolution_minutes, escalation_minutes
          ) values (
            ${slaPolicyId}::uuid, ${context.tenantId}::uuid, ${input.name}, ${input.priority},
            ${input.firstResponseMinutes}, ${input.resolutionMinutes}, ${input.escalationMinutes ?? null}
          ) returning id`.execute(transaction);
          if (!created.rows[0]) throw new Error('SLA policy could not be created');
          return { slaPolicyId };
        },
      },
      {
        context,
        input: {
          name: input.name,
          priority: input.priority,
          firstResponseMinutes: input.firstResponseMinutes,
          resolutionMinutes: input.resolutionMinutes,
          ...(input.escalationMinutes === undefined
            ? {}
            : { escalationMinutes: input.escalationMinutes }),
        },
        idempotencyKey,
        ...(approvalId ? { approvalId } : {}),
      },
    );
  }

  public async create(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateTicketInput,
  ): Promise<CommandResult<{ ticketId: string }>> {
    const ticketId = randomUUID();
    return this.commands.execute(
      {
        action: 'tickets.record.create',
        permission: 'tickets.create',
        risk: 'LOW',
        resource: () => ({ type: 'ticket', id: ticketId }),
        event: { type: 'tickets.record.created', data: (_input, result) => result },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const priority = input.priority ?? 'NORMAL';
          const created = await sql<{
            id: string;
            sla_policy_id: string | null;
          }>`insert into tickets.records (
            id, tenant_id, customer_id, conversation_id, title, priority, sla_policy_id,
            first_response_due_at, resolution_due_at
          ) select
            ${ticketId}::uuid, ${context.tenantId}::uuid, ${input.customerId ?? null}::uuid,
            ${input.conversationId ?? null}::uuid, ${input.title}, ${priority}, policy.id,
            case when policy.id is null then null
              else now() + make_interval(mins => policy.first_response_minutes) end,
            case when policy.id is null then null
              else now() + make_interval(mins => policy.resolution_minutes) end
          from (select 1) as input_row
          left join tickets.sla_policies as policy
            on policy.tenant_id = ${context.tenantId}::uuid
            and policy.priority = ${priority} and policy.active
          returning id, sla_policy_id`.execute(transaction);
          const ticket = created.rows[0];
          if (!ticket?.id) throw new Error('Ticket was not created');
          if (ticket.sla_policy_id) {
            await this.recordSlaEvent(
              transaction,
              context.tenantId,
              ticketId,
              'CLOCK_STARTED',
              'clock-started',
              {
                slaPolicyId: ticket.sla_policy_id,
              },
            );
          }
          return { ticketId };
        },
      },
      {
        context,
        input: {
          title: input.title,
          ...(input.customerId ? { customerId: input.customerId } : {}),
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          ...(input.priority ? { priority: input.priority } : {}),
        },
        idempotencyKey,
      },
    );
  }

  public async addComment(
    context: TenantRequestContext,
    idempotencyKey: string,
    ticketId: string,
    body: string,
    visibility: 'INTERNAL' | 'CUSTOMER_VISIBLE',
  ): Promise<CommandResult<{ ticketId: string; commentId: string }>> {
    return this.commands.execute(
      {
        action: 'tickets.record.comment',
        permission: 'tickets.update',
        risk: 'LOW',
        resource: () => ({ type: 'ticket', id: ticketId }),
        event: { type: 'tickets.comment.created', data: (_input, result) => result },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const created = await sql<{ id: string }>`insert into tickets.comments (
            tenant_id, ticket_id, author_id, body, visibility
          ) values (
            ${context.tenantId}::uuid, ${ticketId}::uuid, ${context.actorId}::uuid,
            ${body}, ${visibility}
          ) returning id`.execute(transaction);
          const commentId = created.rows[0]?.id;
          if (!commentId) throw new Error('Ticket was not found');
          if (visibility === 'CUSTOMER_VISIBLE') {
            const firstResponse = await sql<{ id: string }>`update tickets.records
              set first_response_at = now()
              where id = ${ticketId}::uuid and first_response_at is null
              returning id`.execute(transaction);
            if (firstResponse.rows[0]) {
              await this.recordSlaEvent(
                transaction,
                context.tenantId,
                ticketId,
                'FIRST_RESPONSE_MET',
                'first-response-met',
                { commentId },
              );
            }
          }
          return { ticketId, commentId };
        },
      },
      { context, input: { ticketId, body, visibility }, idempotencyKey },
    );
  }

  public async update(
    context: TenantRequestContext,
    idempotencyKey: string,
    ticketId: string,
    input: UpdateTicketInput,
  ): Promise<CommandResult<{ ticketId: string }>> {
    return this.commands.execute(
      {
        action: 'tickets.record.update',
        permission: 'tickets.update',
        risk: 'MEDIUM',
        resource: () => ({ type: 'ticket', id: ticketId }),
        event: { type: 'tickets.record.updated', data: (_input, result) => result },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const updated = await sql<{ id: string }>`update tickets.records set
            title = coalesce(${input.title ?? null}, title),
            priority = coalesce(${input.priority ?? null}, priority),
            customer_id = case when ${input.customerId !== undefined}
              then ${input.customerId ?? null}::uuid else customer_id end,
            conversation_id = case when ${input.conversationId !== undefined}
              then ${input.conversationId ?? null}::uuid else conversation_id end
            where id = ${ticketId}::uuid returning id`.execute(transaction);
          if (!updated.rows[0]) throw new Error('Ticket was not found');
          return { ticketId };
        },
      },
      { context, input: { ticketId, ...input }, idempotencyKey },
    );
  }

  public async assign(
    context: TenantRequestContext,
    idempotencyKey: string,
    ticketId: string,
    assigneeId: string | null,
  ): Promise<CommandResult<{ ticketId: string; assigneeId: string | null }>> {
    return this.commands.execute(
      {
        action: 'tickets.record.assign',
        permission: 'tickets.assign',
        risk: 'LOW',
        resource: () => ({ type: 'ticket', id: ticketId }),
        event: { type: 'tickets.record.assigned', data: (_input, result) => result },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const updated = await sql<{ id: string }>`update tickets.records
            set assigned_to = ${assigneeId}::uuid
            where id = ${ticketId}::uuid
              and (${assigneeId}::uuid is null or exists (
                select 1 from identity.memberships
                where user_id = ${assigneeId}::uuid and status = 'ACTIVE'
              )) returning id`.execute(transaction);
          if (!updated.rows[0]) throw new Error('Ticket or active tenant assignee was not found');
          return { ticketId, assigneeId };
        },
      },
      { context, input: { ticketId, assigneeId }, idempotencyKey },
    );
  }

  public async setResolution(
    context: TenantRequestContext,
    idempotencyKey: string,
    ticketId: string,
    status: TicketResolutionStatus,
  ): Promise<CommandResult<{ ticketId: string; status: TicketResolutionStatus }>> {
    const action = status === 'RESOLVED' ? 'tickets.record.resolve' : 'tickets.record.reopen';
    const eventType = status === 'RESOLVED' ? 'tickets.record.resolved' : 'tickets.record.reopened';
    return this.commands.execute(
      {
        action,
        permission: 'tickets.close',
        risk: 'MEDIUM',
        resource: () => ({ type: 'ticket', id: ticketId }),
        event: { type: eventType, data: (_input, result) => result },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const updated = await sql<{
            id: string;
            sla_policy_id: string | null;
          }>`update tickets.records set
            status = ${status},
            resolved_at = case when ${status} = 'RESOLVED' then now() else null end,
            sla_paused_seconds = sla_paused_seconds + case
              when ${status} = 'RESOLVED' and sla_paused_at is not null
                then extract(epoch from now() - sla_paused_at)::integer
              else 0 end,
            sla_paused_at = case when ${status} = 'RESOLVED' then null else sla_paused_at end
            where id = ${ticketId}::uuid returning id, sla_policy_id`.execute(transaction);
          const ticket = updated.rows[0];
          if (!ticket) throw new Error('Ticket was not found');
          if (status === 'RESOLVED' && ticket.sla_policy_id) {
            await this.recordSlaEvent(
              transaction,
              context.tenantId,
              ticketId,
              'RESOLUTION_MET',
              'resolution-met',
              {},
            );
          }
          return { ticketId, status };
        },
      },
      { context, input: { ticketId, status }, idempotencyKey },
    );
  }

  public async setSlaStatus(
    context: TenantRequestContext,
    idempotencyKey: string,
    ticketId: string,
    status: TicketSlaStatus,
  ): Promise<CommandResult<{ ticketId: string; status: TicketSlaStatus }>> {
    const pausing = status === 'PENDING';
    return this.commands.execute(
      {
        action: pausing ? 'tickets.record.pause' : 'tickets.record.resume',
        permission: 'tickets.update',
        risk: 'MEDIUM',
        resource: () => ({ type: 'ticket', id: ticketId }),
        event: {
          type: pausing ? 'tickets.record.paused' : 'tickets.record.resumed',
          data: (_input, result) => result,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const updated = pausing
            ? await sql<{ id: string; sla_policy_id: string | null }>`update tickets.records
                set status = 'PENDING', sla_paused_at = now()
                where id = ${ticketId}::uuid and status = 'OPEN' and sla_paused_at is null
                returning id, sla_policy_id`.execute(transaction)
            : await sql<{ id: string; sla_policy_id: string | null }>`update tickets.records
                set status = 'OPEN',
                    first_response_due_at = case when first_response_due_at is null then null
                      else first_response_due_at + (now() - sla_paused_at) end,
                    resolution_due_at = case when resolution_due_at is null then null
                      else resolution_due_at + (now() - sla_paused_at) end,
                    sla_paused_seconds = sla_paused_seconds + extract(epoch from now() - sla_paused_at)::integer,
                    sla_paused_at = null
                where id = ${ticketId}::uuid and status = 'PENDING' and sla_paused_at is not null
                returning id, sla_policy_id`.execute(transaction);
          const ticket = updated.rows[0];
          if (!ticket)
            throw new Error(
              pausing ? 'Only open tickets can be paused' : 'Only paused tickets can be resumed',
            );
          if (ticket.sla_policy_id) {
            await this.recordSlaEvent(
              transaction,
              context.tenantId,
              ticketId,
              pausing ? 'CLOCK_PAUSED' : 'CLOCK_RESUMED',
              `${pausing ? 'clock-paused' : 'clock-resumed'}:${idempotencyKey}`,
              {},
            );
          }
          return { ticketId, status };
        },
      },
      { context, input: { ticketId, status }, idempotencyKey },
    );
  }

  private async recordSlaEvent(
    transaction: PlatformTransaction,
    tenantId: string,
    ticketId: string,
    eventType:
      | 'CLOCK_STARTED'
      | 'CLOCK_PAUSED'
      | 'CLOCK_RESUMED'
      | 'FIRST_RESPONSE_MET'
      | 'RESOLUTION_MET',
    dedupeKey: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const inserted = await sql<{ id: string }>`insert into tickets.sla_events (
      tenant_id, ticket_id, event_type, dedupe_key, metadata
    ) values (
      ${tenantId}::uuid, ${ticketId}::uuid, ${eventType}, ${dedupeKey},
      ${JSON.stringify(metadata)}::jsonb
    ) on conflict (tenant_id, ticket_id, dedupe_key) do nothing returning id`.execute(transaction);
    if (!inserted.rows[0]) return;
    await sql`insert into platform.outbox_events (
      tenant_id, event_type, source, actor_type, resource_type, resource_id, data, dedupe_key
    ) values (
      ${tenantId}::uuid, ${`tickets.sla.${eventType.toLowerCase()}`}, 'tickets-service', 'USER',
      'ticket', ${ticketId}, ${JSON.stringify(metadata)}::jsonb,
      ${`tickets:sla:${ticketId}:${dedupeKey}`}
    )`.execute(transaction);
  }
}
