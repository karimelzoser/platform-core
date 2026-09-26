import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import { MessagingController } from './messaging.controller.js';
import { MessagingService } from './messaging.service.js';

const conversationId = 'aaaaaaaa-0000-0000-0000-000000000101';

void test('conversation handover rejects a reader without handover permission', async () => {
  const controller = new MessagingController(
    {
      resolve: async () => ({
        tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        actorId: '11111111-1111-1111-1111-111111111111',
        subject: 'test-subject-a',
        requestId: 'handover-auth-test',
        correlationId: 'handover-auth-test',
        actorType: 'USER',
        permissions: ['messaging.conversations.read'],
      }),
    } as unknown as AuthenticatedContextService,
    {} as MessagingService,
  );

  await assert.rejects(
    controller.handover(
      conversationId,
      Buffer.from('{"mode":"HUMAN"}'),
      'Bearer test-token',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'handover-auth-test',
      'handover-idempotency-key',
    ),
    ForbiddenException,
  );
});
