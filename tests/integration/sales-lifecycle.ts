import assert from 'node:assert/strict';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { sql, withTenantTransaction } from '@platform/database';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import { SalesService } from '../../apps/api/src/sales.service.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actorA = '11111111-1111-1111-1111-111111111111';
const actorB = '22222222-2222-2222-2222-222222222222';
const customerA = 'aaaaaaaa-0000-0000-0000-000000000901';
const customerB = 'bbbbbbbb-0000-0000-0000-000000000901';

const salesPermissions = [
  'sales.leads.read',
  'sales.leads.create',
  'sales.leads.update',
  'sales.leads.assign',
  'sales.pipelines.read',
  'sales.pipelines.manage',
  'sales.opportunities.read',
  'sales.opportunities.manage',
] as const;

function context(tenantId: string, actorId: string, subject: string): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject,
    requestId: `sales-${subject}`,
    correlationId: `sales-${subject}`,
    actorType: 'USER',
    permissions: salesPermissions,
  };
}

async function main(): Promise<void> {
  const databaseService = new ApiDatabaseService();
  const database = databaseService.database;
  const contextA = context(tenantA, actorA, 'test-subject-a');
  const contextB = context(tenantB, actorB, 'test-subject-b');
  try {
    for (const [ctx, customerId, name] of [
      [contextA, customerA, 'Sales lifecycle customer A'],
      [contextB, customerB, 'Sales lifecycle customer B'],
    ] as const) {
      await withTenantTransaction(database, ctx, async (transaction) => {
        await sql`insert into crm.customers (id, tenant_id, display_name)
          values (${customerId}::uuid, ${ctx.tenantId}::uuid, ${name})
          on conflict (id) do update set display_name = excluded.display_name, updated_at = now()`.execute(
          transaction,
        );
      });
    }

    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for Sales integration');
    const commands = new CommandExecutor(
      database,
      new CommandAuthorizer(
        new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
      ),
    );
    const sales = new SalesService(database, commands);

    const pipeline = await sales.createPipeline(contextA, 'sales-pipeline-a', {
      name: 'Direct sales',
      isDefault: true,
      stages: [
        { name: 'Qualified', probabilityBps: 2500, terminalKind: 'OPEN' },
        { name: 'Proposal', probabilityBps: 6000, terminalKind: 'OPEN' },
        { name: 'Won', probabilityBps: 10000, terminalKind: 'WON' },
        { name: 'Lost', probabilityBps: 0, terminalKind: 'LOST' },
      ],
    });
    const pipelineReplay = await sales.createPipeline(contextA, 'sales-pipeline-a', {
      name: 'Direct sales',
      isDefault: true,
      stages: [
        { name: 'Qualified', probabilityBps: 2500, terminalKind: 'OPEN' },
        { name: 'Proposal', probabilityBps: 6000, terminalKind: 'OPEN' },
        { name: 'Won', probabilityBps: 10000, terminalKind: 'WON' },
        { name: 'Lost', probabilityBps: 0, terminalKind: 'LOST' },
      ],
    });
    assert.equal(pipelineReplay.replayed, true);
    assert.equal(pipelineReplay.result.pipelineId, pipeline.result.pipelineId);

    const lead = await sales.createLead(contextA, 'sales-lead-a', {
      customerId: customerA,
      source: 'integration-test',
    });
    const qualified = await sales.qualifyLead(contextA, 'sales-qualify-a', lead.result.leadId, {
      score: 88,
      grade: 'HOT',
      status: 'QUALIFIED',
      notes: 'Budget, authority and timing confirmed',
    });
    assert.equal(qualified.result.status, 'QUALIFIED');
    assert.equal(qualified.result.score, 88);

    const opportunity = await sales.createOpportunity(contextA, 'sales-opportunity-a', {
      customerId: customerA,
      leadId: lead.result.leadId,
      pipelineId: pipeline.result.pipelineId,
      stageId: pipeline.result.stageIds[0] ?? '',
      name: 'Annual platform contract',
      currencyCode: 'EGP',
      expectedValueMinor: 7500000,
      expectedCloseDate: '2026-12-15',
    });
    const dashboardAfterConversion = await sales.dashboard(contextA);
    const convertedLead = dashboardAfterConversion.leads.find(
      (item) => item.id === lead.result.leadId,
    );
    assert.equal(convertedLead?.status, 'CONVERTED');

    const moved = await sales.moveOpportunity(
      contextA,
      'sales-move-a',
      opportunity.result.opportunityId,
      {
        stageId: pipeline.result.stageIds[1] ?? '',
        reason: 'Commercial proposal delivered',
      },
    );
    assert.equal(moved.result.probabilityBps, 6000);

    const activity = await sales.addActivity(contextA, 'sales-activity-a', {
      customerId: customerA,
      opportunityId: opportunity.result.opportunityId,
      type: 'TASK',
      subject: 'Follow up on commercial proposal',
      dueAt: '2026-12-01T08:00:00.000Z',
    });
    const completed = await sales.completeActivity(
      contextA,
      'sales-activity-complete-a',
      activity.result.activityId,
    );
    assert.equal(completed.result.status, 'DONE');

    const closed = await sales.closeOpportunity(
      contextA,
      'sales-close-a',
      opportunity.result.opportunityId,
      {
        status: 'LOST',
        stageId: pipeline.result.stageIds[3] ?? '',
        reason: 'Budget deferred to next fiscal period',
      },
    );
    assert.equal(closed.result.status, 'LOST');

    const dashboardA = await sales.dashboard(contextA);
    assert.ok(
      dashboardA.opportunities.some(
        (item) => item.id === opportunity.result.opportunityId && item.status === 'LOST',
      ),
    );
    assert.ok(dashboardA.activities.some((item) => item.id === activity.result.activityId));

    const dashboardB = await sales.dashboard(contextB);
    assert.equal(
      dashboardB.pipelines.some((item) => item.id === pipeline.result.pipelineId),
      false,
      'Tenant B can read Tenant A sales pipeline',
    );
    assert.equal(
      dashboardB.leads.some((item) => item.id === lead.result.leadId),
      false,
      'Tenant B can read Tenant A sales lead',
    );
    assert.equal(
      dashboardB.opportunities.some((item) => item.id === opportunity.result.opportunityId),
      false,
      'Tenant B can read Tenant A sales opportunity',
    );

    await assert.rejects(
      sales.createLead(contextB, 'sales-cross-tenant-lead', {
        customerId: customerA,
        source: 'invalid-cross-tenant',
      }),
    );

    await withTenantTransaction(database, contextA, async (transaction) => {
      const [audit, outbox, history] = await Promise.all([
        sql<{ count: string }>`select count(*)::text as count from platform.audit_log
          where action in (
            'sales.pipeline.create', 'sales.lead.create', 'sales.lead.qualify',
            'sales.opportunity.create', 'sales.opportunity.stage.update',
            'sales.activity.create', 'sales.activity.complete', 'sales.opportunity.lose'
          )`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from platform.outbox_events
          where event_type like 'sales.%'`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from sales.opportunity_stage_history
          where opportunity_id = ${opportunity.result.opportunityId}::uuid`.execute(transaction),
      ]);
      assert.ok(Number(audit.rows[0]?.count ?? '0') >= 8);
      assert.ok(Number(outbox.rows[0]?.count ?? '0') >= 8);
      assert.equal(history.rows[0]?.count, '3');
    });
  } finally {
    await databaseService.onModuleDestroy();
  }
}

await main();
