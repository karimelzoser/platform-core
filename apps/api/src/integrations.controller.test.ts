import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.js';

const context = {
  tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
  actorId: 'bbbbbbbb-0000-0000-0000-000000000001',
  subject: 'preview-user',
  requestId: 'request-1',
  correlationId: 'request-1',
  permissions: [],
  actorType: 'USER' as const,
};

void test('integration connection endpoints require dedicated permissions', async () => {
  const controller = new IntegrationsController(
    { resolve: () => Promise.resolve(context) } as never,
    { list: () => Promise.resolve([]) } as never,
  );
  await assert.rejects(
    controller.list('Bearer token', context.tenantId, undefined),
    ForbiddenException,
  );
});
