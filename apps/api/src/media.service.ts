import { Injectable } from '@nestjs/common';
import {
  LocalMediaStore,
  mediaReferenceSchema,
  outboundAttachmentSchema,
  type OutboundAttachment,
} from '@platform/media';
import { randomUUID } from 'node:crypto';

@Injectable()
export class MediaService {
  public constructor(private readonly store: LocalMediaStore) {}

  public async registerLocalBytes(input: {
    tenantId: string;
    mediaType: OutboundAttachment['mediaType'];
    contentType: string;
    fileName: string;
    bytes: Uint8Array;
  }): Promise<OutboundAttachment> {
    const fileName = input.fileName.replaceAll(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255) || 'upload';
    const attachment = outboundAttachmentSchema.parse({
      storageKey: `uploads/${randomUUID()}-${fileName}`,
      mediaType: input.mediaType,
      contentType: input.contentType,
      fileName,
      byteSize: input.bytes.byteLength,
    });
    const reference = mediaReferenceSchema.parse({ ...attachment, tenantId: input.tenantId });
    await this.store.write(reference, input.bytes);
    return attachment;
  }
}
