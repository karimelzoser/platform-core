import assert from 'node:assert/strict';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { sql, withTenantTransaction } from '@platform/database';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import { ApprovalService } from '../../apps/api/src/approval.service.js';
import { TicketsService } from '../../apps/api/src/tickets.service.js';
import { TicketSlaProcessor } from '../../apps/worker/src/ticket-sla-processor.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const tenantAApprover = '33333333-3333-3333-3333-333333333333';
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
const contextAApprover: TenantRequestContext = {
  ...context(tenantA, tenantAApprover),
  subject: 'ticket-lifecycle-approver',
};

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
    const approvals = new ApprovalService(databaseService);
    // Identity closure intentionally permits a subject to insert only its own global
    // identity row. Seed the approver under that approver's subject instead of
    // weakening users_insert_self or bypassing RLS for an integration fixture.
    // The base tenant A/B memberships are owned by identity-fixtures.sql.
    await withTenantTransaction(database, contextAApprover, async (transaction) => {
      await sql`insert into identity.users (id, keycloak_subject, email)
        values (${tenantAApprover}::uuid, 'ticket-lifecycle-approver', 'approver@example.test')`.execute(
        transaction,
      );
      await sql`insert into identity.memberships (tenant_id, user_id, status)
        values (${tenantA}::uuid, ${tenantAApprover}::uuid, 'ACTIVE')`.execute(transaction);
      await sql`insert into crm.customers (id, tenant_id, display_name)
        values (${customerA}::uuid, ${tenantA}::uuid, 'Lifecycle customer A')`.execute(transaction);
    });
    await withTenantTransaction(database, contextB, async (transaction) => {
      await sql`insert into crm.customers (id, tenant_id, display_name)
        values (${customerB}::uuid, ${tenantB}::uuid, 'Lifecycle customer B')`.execute(transaction);
    });
    const slaRequester: TenantRequestContext = {
      ...contextA,
      permissions: [...contextA.permissions, 'tickets.sla.manage'],
    };
    const slaDecider: TenantRequestContext = {
      ...contextAApprover,
      permissions: ['policy.approvals.decide'],
    };
    const approval = await approvals.requestSlaPolicy(slaRequester, {
      name: 'High priority lifecycle',
      priority: 'HIGH',
      firstResponseMinutes: 5,
      resolutionMinutes: 5,
      escalationMinutes: 1,
    });
    await approvals.decide(slaDecider, approval.approvalId, { decision: 'APPROVED' });
    const executablePolicy = await approvals.executableSlaPolicy(slaRequester, approval.approvalId);
    const createdPolicy = await tickets.createSlaPolicy(
      slaRequester,
      'ticket-lifecycle-policy-a',
      executablePolicy.input,
      approval.approvalId,
      executablePolicy.slaPolicyId,
    );
    assert.equal(createdPolicy.result.slaPolicyId, executablePolicy.slaPolicyId);
    const tenantBPolicies = await tickets.listSlaPolicies(contextB);
    assert.equal(tenantBPolicies.length, 1);
    assert.equal(tenantBPolicies[0]?.id, 'bbbbbbbb-0000-0000-0000-000000000301');
    assert.ok(!tenantBPolicies.some((policy) => policy.id === executablePolicy.slaPolicyId));

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
    const createdDetail = await tickets.get(contextA, ticketA);
    assert.ok(createdDetail?.slaPolicyId);
    assert.ok(createdDetail.firstResponseDueAt);
    assert.ok(createdDetail.resolutionDueAt);
    assert.deepEqual(
      createdDetail.slaEvents.map((event) => event.eventType),
      ['CLOCK_STARTED'],
    );

    await assert.rejects(
      tickets.create(contextB, 'ticket-lifecycle-cross-link', {
        title: 'Invalid tenant link',
        conversationId: conversationA,
      }),
    );
    assert.equal(await tickets.get(contextB, ticketA), undefined);
    await assert.rejects(
      tickets.create(contextB, 'ticket-lifecycle-cross-customer', {
        title: 'Invalid tenant link',
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
    await tickets.addComment(
      contextA,
      'ticket-lifecycle-first-response-a',
      ticketA,
      'Customer-facing response',
      'CUSTOMER_VISIBLE',
    );
    await tickets.setSlaStatus(contextA, 'ticket-lifecycle-pause-a', ticketA, 'PENDING');
    const paused = await tickets.get(contextA, ticketA);
    assert.ok(paused);
    assert.equal(paused.status, 'PENDING');
    assert.ok(paused.slaPausedAt);
    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`update tickets.records set sla_paused_at = now() - interval '30 seconds'
        where id = ${ticketA}::uuid`.execute(transaction);
    });
    await tickets.setSlaStatus(contextA, 'ticket-lifecycle-resume-a', ticketA, 'OPEN');
    const resumed = await tickets.get(contextA, ticketA);
    assert.ok(resumed);
    assert.equal(resumed.status, 'OPEN');
    assert.equal(resumed.slaPausedAt, null);
    assert.ok(resumed.firstResponseAt);
    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`update tickets.records
        set resolution_due_at = now() - interval '2 minutes'
        where id = ${ticketA}::uuid`.execute(transaction);
    });
    const slaProcessor = new TicketSlaProcessor(database);
    assert.equal(await slaProcessor.processBatch(), 1);
    assert.equal(await slaProcessor.processBatch(), 0);
    const breached = await tickets.get(contextA, ticketA);
    assert.ok(breached);
    assert.ok(breached.slaEvents.some((event) => event.eventType === 'RESOLUTION_BREACHED'));
    assert.ok(breached.slaEvents.some((event) => event.eventType === 'ESCALATED'));
    await tickets.setResolution(contextA, 'ticket-lifecycle-resolve-a', ticketA, 'RESOLVED');
    const resolved = await tickets.get(contextA, ticketA);
    assert.ok(resolved);
    assert.equal(resolved.status, 'RESOLVED');
    assert.ok(resolved.resolvedAt);
    assert.equal(resolved.assignedTo, contextA.actorId);
    assert.equal(resolved.comments.length, 2);
    assert.deepEqual(
      resolved.comments.map((comment) => comment.visibility),
      ['INTERNAL', 'CUSTOMER_VISIBLE'],
    );
    await tickets.setResolution(contextA, 'ticket-lifecycle-reopen-a', ticketA, 'OPEN');
    const reopened = await tickets.get(contextA, ticketA);
    assert.ok(reopened);
    assert.equal(reopened.status, 'OPEN');
    assert.equal(reopened.resolvedAt, null);
    assert.equal(reopened.title, 'Investigate A updated');
    assert.equal(reopened.priority, 'URGENT');
    assert.equal(reopened.customerId, customerA);

    const archiveApproval = await approvals.requestSlaPolicyArchive(slaRequester, {
      slaPolicyId: createdPolicy.result.slaPolicyId,
    });
    await approvals.decide(slaDecider, archiveApproval.approvalId, { decision: 'APPROVED' });
    const archive = await approvals.executableSlaPolicyArchive(
      slaRequester,
      archiveApproval.approvalId,
    );
    await tickets.archiveSlaPolicy(
      slaRequester,
      'ticket-lifecycle-policy-archive-a',
      archive.slaPolicyId,
      archiveApproval.approvalId,
    );
    assert.equal(
      (await tickets.listSlaPolicies(slaRequester)).find(
        (policy) => policy.id === createdPolicy.result.slaPolicyId,
      )?.active,
      false,
    );

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
          'tickets.comment.created',
          'tickets.record.paused',
          'tickets.record.resumed',
          'tickets.record.resolved',
          'tickets.record.reopened',
          'tickets.sla.clock_started',
          'tickets.sla.clock_paused',
          'tickets.sla.clock_resumed',
          'tickets.sla.first_response_met',
          'tickets.sla.resolution_breached',
          'tickets.sla.escalated',
          'tickets.sla.resolution_met',
        ]),
      );
      const audits = await sql<{ count: number }>`select count(*)::integer as count
        from platform.audit_log where resource_id = ${ticketA}`.execute(transaction);
      assert.equal(audits.rows[0]?.count, 9);
    });
  } finally {
    await databaseService.onModuleDestroy();
  }
}

void main();
