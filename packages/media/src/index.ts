import path from 'node:path';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
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

/** Development storage boundary. Production can replace this with an S3-compatible adapter. */
export class LocalMediaStore {
  public constructor(private readonly root: string) {}

  public async write(reference: MediaReference, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength !== reference.byteSize)
      throw new Error('Media byte size does not match reference');
    const target = localMediaPath(this.root, reference);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }

  public read(reference: MediaReference): Promise<Buffer> {
    return readFile(localMediaPath(this.root, reference));
  }

  public remove(reference: MediaReference): Promise<void> {
    return unlink(localMediaPath(this.root, reference));
  }
}
