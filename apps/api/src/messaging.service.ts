import {
  CommandExecutor,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import { sql, withTenantTransaction } from '@platform/database';
import { Injectable } from '@nestjs/common';
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

  public async messages(context: TenantRequestContext, conversationId: string) {
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const response = await sql<{
        id: string;
        direction: string;
        sender_type: string;
        body: string;
        sent_at: Date;
      }>`select id, direction, sender_type, body, sent_at from messaging.messages
        where conversation_id = ${conversationId}::uuid order by sent_at asc, id asc limit 500`.execute(
        transaction,
      );
      return response.rows.map((row) => ({
        id: row.id,
        direction: row.direction,
        senderType: row.sender_type,
        body: row.body,
        sentAt: row.sent_at,
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
          where id = ${conversationId}::uuid returning id`.execute(transaction);
          if (!updated.rows[0]) throw new Error('Conversation not found');
          return { conversationId, assigneeId };
        },
      },
      { context, input: { conversationId, assigneeId }, idempotencyKey },
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
}
