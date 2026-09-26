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

export interface CreateTicketInput {
  title: string;
  customerId?: string;
  conversationId?: string;
  priority?: TicketPriority;
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
}
