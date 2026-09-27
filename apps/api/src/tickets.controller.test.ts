import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ticketId = 'aaaaaaaa-0000-0000-0000-000000000103';

function readerController(): TicketsController {
  return new TicketsController(
    {
      resolve: () =>
        Promise.resolve({
          tenantId,
          actorId: '11111111-1111-1111-1111-111111111111',
          subject: 'test-subject-a',
          requestId: 'ticket-auth-test',
          correlationId: 'ticket-auth-test',
          actorType: 'USER',
          permissions: ['tickets.read'],
        }),
    } as unknown as AuthenticatedContextService,
    {} as TicketsService,
  );
}

void test('ticket mutations reject a read-only tenant member', async () => {
  const controller = readerController();
  await assert.rejects(
    controller.assignees('Bearer test-token', tenantId, 'ticket-auth-test'),
    ForbiddenException,
  );
  await assert.rejects(
    controller.create(
      Buffer.from('{"title":"A ticket"}'),
      'Bearer test-token',
      tenantId,
      'ticket-auth-test',
      'ticket-create-key',
    ),
    ForbiddenException,
  );
  await assert.rejects(
    controller.addComment(
      ticketId,
      Buffer.from('{"body":"A note"}'),
      'Bearer test-token',
      tenantId,
      'ticket-auth-test',
      'ticket-comment-key',
    ),
    ForbiddenException,
  );
  await assert.rejects(
    controller.update(
      ticketId,
      Buffer.from('{"priority":"HIGH"}'),
      'Bearer test-token',
      tenantId,
      'ticket-auth-test',
      'ticket-update-key',
    ),
    ForbiddenException,
  );
  await assert.rejects(
    controller.assign(
      ticketId,
      Buffer.from('{"assigneeId":null}'),
      'Bearer test-token',
      tenantId,
      'ticket-auth-test',
      'ticket-assignment-key',
    ),
    ForbiddenException,
  );
  await assert.rejects(
    controller.resolution(
      ticketId,
      Buffer.from('{"status":"RESOLVED"}'),
      'Bearer test-token',
      tenantId,
      'ticket-auth-test',
      'ticket-resolution-key',
    ),
    ForbiddenException,
  );
});
