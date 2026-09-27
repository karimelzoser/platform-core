import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

void test('media upload rejects a reader without reply permission', async () => {
  const controller = new MediaController(
    {
      resolve: () =>
        Promise.resolve({
          tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          actorId: '11111111-1111-1111-1111-111111111111',
          subject: 'test-subject-a',
          requestId: 'media-auth-test',
          correlationId: 'media-auth-test',
          actorType: 'USER',
          permissions: ['messaging.conversations.read'],
        }),
    } as unknown as AuthenticatedContextService,
    {} as MediaService,
  );

  await assert.rejects(
    controller.upload(
      Buffer.from(
        JSON.stringify({
          mediaType: 'IMAGE',
          contentType: 'image/png',
          fileName: 'test.png',
          bytesBase64: Buffer.from('test').toString('base64'),
        }),
      ),
      'Bearer test-token',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'media-auth-test',
    ),
    ForbiddenException,
  );
});
