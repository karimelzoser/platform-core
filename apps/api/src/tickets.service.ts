import {
  CommandExecutor,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import { sql, withTenantTransaction } from '@platform/database';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiDatabaseService } from './api-database.service.js';

export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TicketResolutionStatus = 'OPEN' | 'RESOLVED';

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
        created_at: Date;
        updated_at: Date;
      }>`select id, title, status, priority, customer_id, conversation_id, assigned_to,
          resolved_at, created_at, updated_at
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
      return {
        id: record.id,
        title: record.title,
        status: record.status,
        priority: record.priority,
        customerId: record.customer_id,
        conversationId: record.conversation_id,
        assignedTo: record.assigned_to,
        resolvedAt: record.resolved_at,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
        comments: comments.rows.map((comment) => ({
          id: comment.id,
          authorId: comment.author_id,
          body: comment.body,
          visibility: comment.visibility,
          createdAt: comment.created_at,
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
          const created = await sql<{ id: string }>`insert into tickets.records (
            id, tenant_id, customer_id, conversation_id, title, priority
          ) values (
            ${ticketId}::uuid, ${context.tenantId}::uuid, ${input.customerId ?? null}::uuid,
            ${input.conversationId ?? null}::uuid, ${input.title}, ${input.priority ?? 'NORMAL'}
          ) returning id`.execute(transaction);
          if (!created.rows[0]?.id) throw new Error('Ticket was not created');
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
          const updated = await sql<{ id: string }>`update tickets.records set
            status = ${status},
            resolved_at = case when ${status} = 'RESOLVED' then now() else null end
            where id = ${ticketId}::uuid returning id`.execute(transaction);
          if (!updated.rows[0]) throw new Error('Ticket was not found');
          return { ticketId, status };
        },
      },
      { context, input: { ticketId, status }, idempotencyKey },
    );
  }
}
