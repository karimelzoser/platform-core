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
      resolve: () =>
        Promise.resolve({
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

void test('conversation operations reject a reader without write permissions', async () => {
  const controller = new MessagingController(
    {
      resolve: () =>
        Promise.resolve({
          tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          actorId: '11111111-1111-1111-1111-111111111111',
          subject: 'test-subject-a',
          requestId: 'conversation-operation-auth-test',
          correlationId: 'conversation-operation-auth-test',
          actorType: 'USER',
          permissions: ['messaging.conversations.read'],
        }),
    } as unknown as AuthenticatedContextService,
    {} as MessagingService,
  );

  await assert.rejects(
    controller.assign(
      conversationId,
      Buffer.from('{"assigneeId":"11111111-1111-1111-1111-111111111111"}'),
      'Bearer test-token',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'conversation-operation-auth-test',
      'assignment-idempotency-key',
    ),
    ForbiddenException,
  );
  await assert.rejects(
    controller.status(
      conversationId,
      Buffer.from('{"status":"CLOSED"}'),
      'Bearer test-token',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'conversation-operation-auth-test',
      'status-idempotency-key',
    ),
    ForbiddenException,
  );
});

void test('message templates require their dedicated permissions', async () => {
  const controller = new MessagingController(
    {
      resolve: () =>
        Promise.resolve({
          tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          actorId: '11111111-1111-1111-1111-111111111111',
          subject: 'test-subject-a',
          requestId: 'template-auth-test',
          correlationId: 'template-auth-test',
          actorType: 'USER',
          permissions: ['messaging.conversations.read'],
        }),
    } as unknown as AuthenticatedContextService,
    {} as MessagingService,
  );

  await assert.rejects(
    controller.templates(
      'Bearer test-token',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'template-auth-test',
    ),
    ForbiddenException,
  );
  await assert.rejects(
    controller.createTemplate(
      Buffer.from('{"name":"Welcome","locale":"en","body":"Hello"}'),
      'Bearer test-token',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'template-auth-test',
      'template-idempotency-key',
    ),
    ForbiddenException,
  );
});
