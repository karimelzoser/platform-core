import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { LocalMediaStore, localMediaPath, mediaReferenceSchema } from './index.js';

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

void test('writes and reads only the declared bounded media bytes', async () => {
  const root = await mkdtemp(path.join(process.cwd(), 'media-test-'));
  try {
    const stored = { ...reference, byteSize: 3 };
    const store = new LocalMediaStore(root);
    await store.write(stored, new Uint8Array([1, 2, 3]));
    assert.deepEqual(await store.read(stored), Buffer.from([1, 2, 3]));
    await assert.rejects(store.write(stored, new Uint8Array([1, 2])));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
