import assert from 'node:assert/strict';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { sql, withTenantTransaction } from '@platform/database';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import { TicketsService } from '../../apps/api/src/tickets.service.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const conversationA = 'aaaaaaaa-0000-0000-0000-000000000101';
const conversationB = 'bbbbbbbb-0000-0000-0000-000000000101';
const customerA = 'aaaaaaaa-0000-0000-0000-000000000201';
const customerB = 'bbbbbbbb-0000-0000-0000-000000000201';

function context(tenantId: string, actorId: string): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject: `ticket-lifecycle-${tenantId}`,
    requestId: `ticket-lifecycle-${tenantId}`,
    correlationId: `ticket-lifecycle-${tenantId}`,
    actorType: 'USER',
    permissions: [
      'tickets.read',
      'tickets.create',
      'tickets.update',
      'tickets.assign',
      'tickets.close',
    ],
  };
}

const contextA = context(tenantA, '11111111-1111-1111-1111-111111111111');
const contextB = context(tenantB, '22222222-2222-2222-2222-222222222222');

async function main(): Promise<void> {
  const databaseService = new ApiDatabaseService();
  const database = databaseService.database;
  try {
    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for ticket integration');
    const commands = new CommandExecutor(
      database,
      new CommandAuthorizer(
        new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
      ),
    );
    const tickets = new TicketsService(databaseService, commands);
    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`insert into identity.memberships (tenant_id, user_id, status)
        values (${tenantA}::uuid, ${contextA.actorId}::uuid, 'ACTIVE')`.execute(transaction);
      await sql`insert into crm.customers (id, tenant_id, display_name)
        values (${customerA}::uuid, ${tenantA}::uuid, 'Lifecycle customer A')`.execute(transaction);
    });
    await withTenantTransaction(database, contextB, async (transaction) => {
      await sql`insert into identity.memberships (tenant_id, user_id, status)
        values (${tenantB}::uuid, ${contextB.actorId}::uuid, 'ACTIVE')`.execute(transaction);
      await sql`insert into crm.customers (id, tenant_id, display_name)
        values (${customerB}::uuid, ${tenantB}::uuid, 'Lifecycle customer B')`.execute(transaction);
    });

    const createdA = await tickets.create(contextA, 'ticket-lifecycle-create-a', {
      title: 'Investigate A',
      customerId: customerA,
      conversationId: conversationA,
      priority: 'HIGH',
    });
    const replayA = await tickets.create(contextA, 'ticket-lifecycle-create-a', {
      title: 'Investigate A',
      customerId: customerA,
      conversationId: conversationA,
      priority: 'HIGH',
    });
    assert.equal(replayA.replayed, true);
    assert.equal(replayA.result.ticketId, createdA.result.ticketId);
    const ticketA = createdA.result.ticketId;

    await assert.rejects(
      tickets.create(contextB, 'ticket-lifecycle-cross-link', {
        title: 'Invalid tenant link',
        conversationId: conversationA,
      }),
    );
    assert.equal(await tickets.get(contextB, ticketA), undefined);
    await assert.rejects(
      tickets.create(contextB, 'ticket-lifecycle-cross-customer', {
        title: 'Invalid customer link',
        customerId: customerA,
      }),
    );
    await assert.rejects(
      tickets.addComment(
        contextB,
        'ticket-lifecycle-cross-comment',
        ticketA,
        'Not mine',
        'INTERNAL',
      ),
    );

    await tickets.update(contextA, 'ticket-lifecycle-update-a', ticketA, {
      title: 'Investigate A updated',
      priority: 'URGENT',
    });
    await tickets.assign(contextA, 'ticket-lifecycle-assign-a', ticketA, contextA.actorId ?? null);
    await assert.rejects(
      tickets.assign(
        contextA,
        'ticket-lifecycle-cross-assignee',
        ticketA,
        contextB.actorId ?? null,
      ),
    );
    await tickets.addComment(
      contextA,
      'ticket-lifecycle-comment-a',
      ticketA,
      'Private note',
      'INTERNAL',
    );
    await tickets.setResolution(contextA, 'ticket-lifecycle-resolve-a', ticketA, 'RESOLVED');
    const resolved = await tickets.get(contextA, ticketA);
    assert.ok(resolved);
    assert.equal(resolved.status, 'RESOLVED');
    assert.ok(resolved.resolvedAt);
    assert.equal(resolved.assignedTo, contextA.actorId);
    assert.equal(resolved.comments.length, 1);
    await tickets.setResolution(contextA, 'ticket-lifecycle-reopen-a', ticketA, 'OPEN');
    const reopened = await tickets.get(contextA, ticketA);
    assert.ok(reopened);
    assert.equal(reopened.status, 'OPEN');
    assert.equal(reopened.resolvedAt, null);
    assert.equal(reopened.title, 'Investigate A updated');
    assert.equal(reopened.priority, 'URGENT');
    assert.equal(reopened.customerId, customerA);

    await assert.rejects(
      tickets.update(contextA, 'ticket-lifecycle-cross-conversation', ticketA, {
        conversationId: conversationB,
      }),
    );
    assert.equal((await tickets.get(contextA, ticketA))?.conversationId, conversationA);
    await assert.rejects(
      tickets.update(contextA, 'ticket-lifecycle-cross-customer-update', ticketA, {
        customerId: customerB,
      }),
    );
    assert.equal((await tickets.get(contextA, ticketA))?.customerId, customerA);

    await withTenantTransaction(database, contextA, async (transaction) => {
      const events = await sql<{ event_type: string }>`select event_type from platform.outbox_events
        where resource_id = ${ticketA} order by occurred_at`.execute(transaction);
      assert.deepEqual(
        new Set(events.rows.map((event) => event.event_type)),
        new Set([
          'tickets.record.created',
          'tickets.record.updated',
          'tickets.record.assigned',
          'tickets.record.resolved',
          'tickets.record.reopened',
        ]),
      );
      const audits = await sql<{ count: number }>`select count(*)::integer as count
        from platform.audit_log where resource_id = ${ticketA}`.execute(transaction);
      assert.equal(audits.rows[0]?.count, 6);
    });
  } finally {
    await databaseService.onModuleDestroy();
  }
}

void main();
