import assert from 'node:assert/strict';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { CustomerService } from '@platform/crm';
import { sql, withTenantTransaction } from '@platform/database';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import { ApprovalService } from '../../apps/api/src/approval.service.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actorA = '11111111-1111-1111-1111-111111111111';
const actorB = '22222222-2222-2222-2222-222222222222';
const approverA = '44444444-4444-4444-4444-444444444444';

function context(
  tenantId: string,
  actorId: string,
  permissions: readonly string[],
  suffix: string,
): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject: `crm-lifecycle-${suffix}`,
    requestId: `crm-lifecycle-${suffix}`,
    correlationId: `crm-lifecycle-${suffix}`,
    actorType: 'USER',
    permissions,
  };
}

const customerPermissions = [
  'crm.customers.read',
  'crm.customers.write',
  'crm.customers.import',
  'crm.customers.export',
  'crm.customers.merge',
  'crm.tags.manage',
  'crm.segments.read',
  'crm.segments.manage',
] as const;
const contextA = context(tenantA, actorA, customerPermissions, 'a');
const contextB = context(tenantB, actorB, customerPermissions, 'b');
const approverContext: TenantRequestContext = {
  ...context(tenantA, approverA, ['policy.approvals.decide'], 'a-approver'),
  subject: 'crm-lifecycle-approver',
};

async function main(): Promise<void> {
  const databaseService = new ApiDatabaseService();
  const database = databaseService.database;
  try {
    // Identity closure intentionally permits an authenticated subject to create only
    // its own global identity row. The base tenant A/B owner memberships are seeded
    // by identity-fixtures.sql, so only the dedicated approval actor is created here.
    await withTenantTransaction(database, approverContext, async (transaction) => {
      await sql`insert into identity.users (id, keycloak_subject, email)
        values (${approverA}::uuid, 'crm-lifecycle-approver', 'crm-approver@example.test')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into identity.memberships (tenant_id, user_id, status)
        values (${tenantA}::uuid, ${approverA}::uuid, 'ACTIVE')
        on conflict (tenant_id, user_id) do nothing`.execute(transaction);
    });

    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for CRM integration');
    const commands = new CommandExecutor(
      database,
      new CommandAuthorizer(
        new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
      ),
    );
    const customers = new CustomerService(database, commands);
    const approvals = new ApprovalService(databaseService);

    const source = await customers.create(contextA, 'crm-lifecycle-source', {
      displayName: 'Source customer',
      contactPoints: [
        { channel: 'EMAIL', value: 'source-crm@example.test', isPrimary: true, isVerified: false },
      ],
    });
    const sourceReplay = await customers.create(contextA, 'crm-lifecycle-source', {
      displayName: 'Source customer',
      contactPoints: [
        { channel: 'EMAIL', value: 'source-crm@example.test', isPrimary: true, isVerified: false },
      ],
    });
    assert.equal(sourceReplay.replayed, true);
    assert.equal(sourceReplay.result.customerId, source.result.customerId);

    const target = await customers.create(contextA, 'crm-lifecycle-target', {
      displayName: 'Target customer',
      contactPoints: [
        { channel: 'PHONE', value: '+201002345678', isPrimary: true, isVerified: false },
      ],
    });
    const imported = await customers.importCustomers(contextB, 'crm-lifecycle-import-b', {
      customers: [
        {
          displayName: 'Quoted CSV import',
          companyName: 'Example, Incorporated',
          contactPoints: [
            {
              channel: 'EMAIL',
              value: 'quoted-import@example.test',
              label: 'Imported email',
              isPrimary: true,
              isVerified: false,
            },
          ],
        },
      ],
    });
    assert.equal(imported.result.customerIds.length, 1);
    assert.equal(await customers.detail(contextA, imported.result.customerIds[0] ?? ''), undefined);

    const tag = await customers.createTag(contextA, 'crm-lifecycle-tag', { name: 'Priority' });
    await customers.assignTag(contextA, 'crm-lifecycle-tag-assign', {
      customerId: source.result.customerId,
      tagId: tag.result.tagId,
    });
    const segment = await customers.createDynamicSegment(contextA, 'crm-lifecycle-segment', {
      name: 'Priority customers',
      allTagIds: [tag.result.tagId],
    });
    const evaluated = await customers.evaluateDynamicSegment(
      contextA,
      'crm-lifecycle-segment-evaluate',
      segment.result.segmentId,
    );
    assert.equal(evaluated.result.memberCount, 1);
    assert.equal(
      (await customers.listSegments(contextB)).some((item) => item.id === segment.result.segmentId),
      false,
    );

    const suppressed = await customers.suppressChannel(contextA, 'crm-lifecycle-opt-out', {
      customerId: source.result.customerId,
      channel: 'EMAIL',
      reason: 'Lifecycle verification',
    });
    assert.equal(suppressed.result.status, 'OPTED_OUT');

    const mergeApproval = await approvals.requestMerge(contextA, {
      sourceCustomerId: source.result.customerId,
      targetCustomerId: target.result.customerId,
      reason: 'Verified duplicate customer record',
    });
    await approvals.decide(approverContext, mergeApproval.approvalId, { decision: 'APPROVED' });
    const executableMerge = await approvals.executableMerge(contextA, mergeApproval.approvalId);
    const merged = await customers.merge(
      contextA,
      'crm-lifecycle-merge',
      executableMerge,
      mergeApproval.approvalId,
    );
    assert.equal(merged.result.sourceCustomerId, source.result.customerId);
    assert.equal(
      (await customers.list(contextA)).items.some((item) => item.id === source.result.customerId),
      false,
    );
    assert.equal((await customers.detail(contextA, target.result.customerId))?.status, 'ACTIVE');

    const exported = await customers.exportCustomers(contextA);
    assert.ok(exported.some((customer) => customer.id === target.result.customerId));
    await withTenantTransaction(database, contextA, async (transaction) => {
      const [audit, outbox] = await Promise.all([
        sql<{ count: string }>`select count(*)::text as count from platform.audit_log
          where action = 'crm.customer.merge' and resource_id = ${source.result.customerId}`.execute(
          transaction,
        ),
        sql<{ count: string }>`select count(*)::text as count from platform.outbox_events
          where event_type = 'crm.customer.merged' and resource_id = ${source.result.customerId}`.execute(
          transaction,
        ),
      ]);
      assert.equal(audit.rows[0]?.count, '1');
      assert.equal(outbox.rows[0]?.count, '1');
    });
    await withTenantTransaction(database, contextB, async (transaction) => {
      const hidden = await sql<{ id: string }>`select id from crm.customers
        where id = ${target.result.customerId}::uuid`.execute(transaction);
      assert.equal(hidden.rows.length, 0, 'Tenant B can read Tenant A customer');
    });
  } finally {
    await databaseService.onModuleDestroy();
  }
}

await main();
