import {
  CommandExecutor,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import { sql, withTenantTransaction } from '@platform/database';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiDatabaseService } from './api-database.service.js';

@Injectable()
export class MessagingService {
  public constructor(
    private readonly database: ApiDatabaseService,
    private readonly commands: CommandExecutor,
  ) {}

  public async listConversations(context: TenantRequestContext) {
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const response = await sql<{
        id: string;
        channel: string;
        status: string;
        mode: string;
        last_message_at: Date | null;
        customer_id: string | null;
      }>`select id, channel, status, mode, last_message_at, customer_id from messaging.conversations
        order by last_message_at desc nulls last, id desc limit 100`.execute(transaction);
      return response.rows.map((row) => ({
        id: row.id,
        channel: row.channel,
        status: row.status,
        mode: row.mode,
        lastMessageAt: row.last_message_at,
        customerId: row.customer_id,
      }));
    });
  }

  public async listTemplates(context: TenantRequestContext) {
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const response = await sql<{
        id: string;
        name: string;
        locale: 'en' | 'ar';
        channel: string | null;
        body: string;
        status: string;
      }>`select id, name, locale, channel, body, status from messaging.templates
        where status = 'ACTIVE' order by locale, name, id limit 200`.execute(transaction);
      return response.rows.map((template) => ({
        id: template.id,
        name: template.name,
        locale: template.locale,
        channel: template.channel,
        body: template.body,
        status: template.status,
      }));
    });
  }

  public async createTemplate(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: { name: string; locale: 'en' | 'ar'; channel: string | undefined; body: string },
  ): Promise<CommandResult<{ templateId: string }>> {
    const templateId = randomUUID();
    return this.commands.execute(
      {
        action: 'messaging.template.create',
        permission: 'messaging.templates.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'messaging.template', id: templateId }),
        event: { type: 'messaging.template.created', data: (_input, result) => result },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const inserted = await sql<{ id: string }>`insert into messaging.templates (
            id, tenant_id, name, locale, channel, body, created_by
          ) values (
            ${templateId}::uuid, ${context.tenantId}::uuid, ${input.name}, ${input.locale},
            ${input.channel ?? null}, ${input.body}, ${context.actorId}::uuid
          ) returning id`.execute(transaction);
          if (!inserted.rows[0]) throw new Error('Message template could not be created');
          return { templateId };
        },
      },
      { context, input, idempotencyKey },
    );
  }

  public async messages(context: TenantRequestContext, conversationId: string) {
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const response = await sql<{
        id: string;
        direction: string;
        sender_type: string;
        body: string;
        sent_at: Date;
        delivery_status: string | null;
      }>`select id, direction, sender_type, body, sent_at, delivery_status from messaging.messages
        where conversation_id = ${conversationId}::uuid order by sent_at asc, id asc limit 500`.execute(
        transaction,
      );
      return response.rows.map((row) => ({
        id: row.id,
        direction: row.direction,
        senderType: row.sender_type,
        body: row.body,
        sentAt: row.sent_at,
        deliveryStatus: row.delivery_status,
      }));
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

  public async assign(
    context: TenantRequestContext,
    idempotencyKey: string,
    conversationId: string,
    assigneeId: string,
  ): Promise<CommandResult<{ conversationId: string; assigneeId: string }>> {
    return this.commands.execute(
      {
        action: 'messaging.conversation.assign',
        permission: 'messaging.conversations.assign',
        risk: 'LOW',
        resource: () => ({ type: 'messaging.conversation', id: conversationId }),
        event: { type: 'messaging.conversation.assigned', data: (_input, result) => result },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const updated = await sql<{
            id: string;
          }>`update messaging.conversations set assigned_to = ${assigneeId}::uuid
          where id = ${conversationId}::uuid
            and exists (
              select 1 from identity.memberships
              where user_id = ${assigneeId}::uuid and status = 'ACTIVE'
            )
          returning id`.execute(transaction);
          if (!updated.rows[0])
            throw new Error('Conversation or active tenant assignee was not found');
          return { conversationId, assigneeId };
        },
      },
      { context, input: { conversationId, assigneeId }, idempotencyKey },
    );
  }

  public async setStatus(
    context: TenantRequestContext,
    idempotencyKey: string,
    conversationId: string,
    status: 'OPEN' | 'CLOSED',
  ): Promise<CommandResult<{ conversationId: string; status: string }>> {
    const action =
      status === 'CLOSED' ? 'messaging.conversation.close' : 'messaging.conversation.reopen';
    const eventType =
      status === 'CLOSED' ? 'messaging.conversation.closed' : 'messaging.conversation.reopened';
    return this.commands.execute(
      {
        action,
        permission: 'messaging.conversations.close',
        risk: 'MEDIUM',
        resource: () => ({ type: 'messaging.conversation', id: conversationId }),
        event: { type: eventType, data: (_input, result) => result },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const updated = await sql<{
            id: string;
          }>`update messaging.conversations set status = ${status}
          where id = ${conversationId}::uuid returning id`.execute(transaction);
          if (!updated.rows[0]) throw new Error('Conversation not found');
          return { conversationId, status };
        },
      },
      { context, input: { conversationId, status }, idempotencyKey },
    );
  }

  public async handover(
    context: TenantRequestContext,
    idempotencyKey: string,
    conversationId: string,
    mode: 'AI' | 'COPILOT' | 'HUMAN' | 'PAUSED',
  ): Promise<CommandResult<{ conversationId: string; mode: string }>> {
    return this.commands.execute(
      {
        action: 'messaging.conversation.handover',
        permission: 'messaging.conversations.handover',
        risk: 'MEDIUM',
        resource: () => ({ type: 'messaging.conversation', id: conversationId }),
        event: { type: 'messaging.conversation.handed_over', data: (_input, result) => result },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const updated = await sql<{
            id: string;
          }>`update messaging.conversations set mode = ${mode}
          where id = ${conversationId}::uuid returning id`.execute(transaction);
          if (!updated.rows[0]) throw new Error('Conversation not found');
          return { conversationId, mode };
        },
      },
      { context, input: { conversationId, mode }, idempotencyKey },
    );
  }

  public async send(
    context: TenantRequestContext,
    idempotencyKey: string,
    conversationId: string,
    body: string,
  ): Promise<CommandResult<{ messageId: string; conversationId: string }>> {
    const messageId = randomUUID();
    return this.commands.execute(
      {
        action: 'messaging.conversation.reply',
        permission: 'messaging.conversations.reply',
        risk: 'MEDIUM',
        resource: () => ({ type: 'messaging.message', id: messageId }),
        event: { type: 'messaging.message.dispatch_requested', data: (_input, result) => result },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const inserted = await sql<{ id: string }>`insert into messaging.messages (
            id, tenant_id, connection_id, conversation_id, direction, sender_type, body, delivery_status,
            next_delivery_attempt_at
          ) select ${messageId}::uuid, tenant_id, connection_id, id, 'OUTBOUND', 'USER', ${body},
            'PENDING', now() from messaging.conversations where id = ${conversationId}::uuid
              and connection_id is not null
              and provider_conversation_id is not null
          returning id`.execute(transaction);
          if (!inserted.rows[0])
            throw new Error('Conversation has no dispatchable provider connection');
          return { messageId, conversationId };
        },
      },
      { context, input: { conversationId, body }, idempotencyKey },
    );
  }
}
