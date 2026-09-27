import { Injectable } from '@nestjs/common';
import {
  LocalMediaStore,
  mediaReferenceSchema,
  outboundAttachmentSchema,
  type OutboundAttachment,
} from '@platform/media';
import { randomUUID } from 'node:crypto';
import { sql, withTenantTransaction } from '@platform/database';
import type { TenantRequestContext } from '@platform/command-execution';
import { ApiDatabaseService } from './api-database.service.js';

@Injectable()
export class MediaService {
  public constructor(
    private readonly store: LocalMediaStore,
    private readonly database: ApiDatabaseService,
  ) {}

  public async registerLocalBytes(
    context: TenantRequestContext,
    input: {
      mediaType: OutboundAttachment['mediaType'];
      contentType: string;
      fileName: string;
      bytes: Uint8Array;
    },
  ): Promise<OutboundAttachment> {
    const fileName = input.fileName.replaceAll(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255) || 'upload';
    const attachment = outboundAttachmentSchema.parse({
      storageKey: `uploads/${randomUUID()}-${fileName}`,
      mediaType: input.mediaType,
      contentType: input.contentType,
      fileName,
      byteSize: input.bytes.byteLength,
    });
    const reference = mediaReferenceSchema.parse({ ...attachment, tenantId: context.tenantId });
    await this.store.write(reference, input.bytes);
    try {
      await withTenantTransaction(this.database.database, context, async (transaction) => {
        await sql`insert into messaging.media_uploads (
          tenant_id, storage_key, media_type, content_type, file_name, byte_size
        ) values (
          ${context.tenantId}::uuid, ${attachment.storageKey}, ${attachment.mediaType},
          ${attachment.contentType}, ${attachment.fileName}, ${attachment.byteSize}
        )`.execute(transaction);
        await sql`insert into platform.audit_log (
          tenant_id, actor_type, actor_id, action, resource_type, resource_id,
          request_id, correlation_id, after_state
        ) values (
          ${context.tenantId}::uuid, ${context.actorType}, ${context.actorId}::uuid,
          'messaging.media.upload', 'messaging.media', ${attachment.storageKey},
          ${context.requestId}, ${context.correlationId},
          ${JSON.stringify({ mediaType: attachment.mediaType, contentType: attachment.contentType, fileName: attachment.fileName, byteSize: attachment.byteSize })}::jsonb
        )`.execute(transaction);
      });
    } catch (error) {
      await this.store.remove(reference);
      throw error;
    }
    return attachment;
  }
}
