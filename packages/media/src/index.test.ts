import assert from 'node:assert/strict';
import test from 'node:test';
import { localMediaPath, mediaReferenceSchema } from './index.js';

const reference = mediaReferenceSchema.parse({
  tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  storageKey: 'inbox/image.png',
  mediaType: 'IMAGE',
  contentType: 'image/png',
  fileName: 'image.png',
  byteSize: 1024,
});

void test('maps a tenant-owned local media reference below its tenant root', () => {
  assert.match(localMediaPath('C:/platform-media', reference), /platform-media[\\/]aaaaaaaa-/);
});

void test('rejects a local media traversal key', () => {
  assert.throws(() =>
    localMediaPath('C:/platform-media', { ...reference, storageKey: '../escape' }),
  );
});
