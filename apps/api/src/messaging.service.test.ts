import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type CommandDefinition,
  type CommandExecutor,
  type CommandRequest,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import { ApiDatabaseService } from './api-database.service.js';
import { MessagingService } from './messaging.service.js';

const context: TenantRequestContext = {
  tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  actorId: '11111111-1111-1111-1111-111111111111',
  subject: 'test-subject-a',
  requestId: 'messaging-handover-test',
  correlationId: 'messaging-handover-test',
  actorType: 'USER',
  permissions: ['messaging.conversations.handover'],
};

type HandoverInput = { conversationId: string; mode: 'AI' | 'COPILOT' | 'HUMAN' | 'PAUSED' };
type HandoverResult = { conversationId: string; mode: string };

void test('conversation handover declares an audited, idempotent outbox command', async () => {
  let captured:
    | {
        definition: CommandDefinition<HandoverInput, HandoverResult>;
        request: CommandRequest<HandoverInput>;
      }
    | undefined;
  const execute = (
    definition: CommandDefinition<HandoverInput, HandoverResult>,
    request: CommandRequest<HandoverInput>,
  ): Promise<CommandResult<HandoverResult>> => {
    captured = { definition, request };
    return Promise.resolve({
      result: { conversationId: request.input.conversationId, mode: request.input.mode },
      status: 200,
      replayed: false,
    });
  };
  const service = new MessagingService(
    {} as ApiDatabaseService,
    { execute } as unknown as CommandExecutor,
  );

  const result = await service.handover(
    context,
    'handover-idempotency-key',
    'aaaaaaaa-0000-0000-0000-000000000101',
    'HUMAN',
  );

  assert.deepEqual(result, {
    result: { conversationId: 'aaaaaaaa-0000-0000-0000-000000000101', mode: 'HUMAN' },
    status: 200,
    replayed: false,
  });
  assert.ok(captured);
  assert.equal(captured.definition.action, 'messaging.conversation.handover');
  assert.equal(captured.definition.permission, 'messaging.conversations.handover');
  assert.equal(captured.definition.risk, 'MEDIUM');
  assert.equal(captured.request.idempotencyKey, 'handover-idempotency-key');
  assert.deepEqual(captured.definition.resource(captured.request.input), {
    type: 'messaging.conversation',
    id: 'aaaaaaaa-0000-0000-0000-000000000101',
  });
  assert.deepEqual(captured.definition.audit?.afterState?.(captured.request.input, result.result), {
    conversationId: 'aaaaaaaa-0000-0000-0000-000000000101',
    mode: 'HUMAN',
  });
  assert.deepEqual(captured.definition.event, {
    type: 'messaging.conversation.handed_over',
    data: captured.definition.event.data,
  });
  assert.deepEqual(captured.definition.event.data(captured.request.input, result.result), {
    conversationId: 'aaaaaaaa-0000-0000-0000-000000000101',
    mode: 'HUMAN',
  });
});
