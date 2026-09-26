import type { TenantRequestContext } from '@platform/command-execution';
import { sql, withTenantTransaction } from '@platform/database';
import { Injectable } from '@nestjs/common';
import { ApiDatabaseService } from './api-database.service.js';

@Injectable()
export class MessagingService {
  public constructor(private readonly database: ApiDatabaseService) {}

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
}
