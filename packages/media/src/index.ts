import path from 'node:path';
import { z } from 'zod';

export const outboundAttachmentSchema = z.object({
  storageKey: z.string().min(1).max(1000),
  mediaType: z.enum(['IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO']),
  contentType: z.string().min(1).max(255),
  fileName: z.string().min(1).max(255),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
});
export type OutboundAttachment = z.infer<typeof outboundAttachmentSchema>;
export const mediaReferenceSchema = outboundAttachmentSchema.extend({
  tenantId: z.string().uuid(),
});
export type MediaReference = z.infer<typeof mediaReferenceSchema>;
export function localMediaPath(root: string, reference: MediaReference): string {
  const tenantRoot = path.resolve(root, reference.tenantId);
  const target = path.resolve(tenantRoot, reference.storageKey);
  if (!target.startsWith(`${tenantRoot}${path.sep}`))
    throw new Error('Invalid local media storage key');
  return target;
}
