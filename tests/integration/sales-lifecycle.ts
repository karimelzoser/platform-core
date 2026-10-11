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
const customerA = 'aaaaaaaa-0000-0000-0000-000000000821';
const customerB = 'bbbbbbbb-0000-0000-0000-000000000821';
const storeA = 'aaaaaaaa-0000-0000-0000-000000000822';
const wonOrderA = 'aaaaaaaa-0000-0000-0000-000000000823';

const salesPermissions = [
  'sales.leads.read',
  'sales.leads.create',
  'sales.leads.update',
  'sales.leads.assign',
  'sales.pipelines.read',
  'sales.pipelines.manage',
  'sales.opportunities.read',
  'sales.opportunities.manage',
  'sales.activities.read',
  'sales.activities.manage',
] as const;

function context(
  tenantId: string,
  actorId: string,
  suffix: string,
): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject: `sales-lifecycle-${suffix}`,
    requestId: `sales-lifecycle-${suffix}`,
    correlationId: `sales-lifecycle-${suffix}`,
    actorType: 'USER',
    permissions: salesPermissions,
  };
}

const contextA = context(tenantA, actorA, 'a');
const contextB = context(tenantB, actorB, 'b');

async function main(): Promise<void> {
  const databaseService = new ApiDatabaseService();
  const database = databaseService.database;
  try {
    await seedCanonicalDependencies(databaseService);
    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for Sales integration');
    const sales = new SalesService(
      database,
      new CommandExecutor(
        database,
        new CommandAuthorizer(
          new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
        ),
      ),
    );

    const pipelinesBefore = await sales.listPipelines(contextA);
    assert.equal(pipelinesBefore.length, 0);
    const pipeline = await sales.createPipeline(contextA, 'sales-pipeline-create', {
      name: 'Primary sales pipeline',
      isDefault: true,
      stages: [
        {
          code: 'QUALIFIED',
          name: 'Qualified',
          category: 'OPEN',
          sortOrder: 10,
          defaultProbabilityBasisPoints: 2500,
        },
        {
          code: 'PROPOSAL',
          name: 'Proposal',
          category: 'OPEN',
          sortOrder: 20,
          defaultProbabilityBasisPoints: 6000,
        },
        {
          code: 'WON',
          name: 'Won',
          category: 'WON',
          sortOrder: 90,
          defaultProbabilityBasisPoints: 10000,
        },
        {
          code: 'LOST',
          name: 'Lost',
          category: 'LOST',
          sortOrder: 100,
          defaultProbabilityBasisPoints: 0,
        },
      ],
    });
    const pipelineReplay = await sales.createPipeline(contextA, 'sales-pipeline-create', {
      name: 'Primary sales pipeline',
      isDefault: true,
      stages: [
        {
          code: 'QUALIFIED', name: 'Qualified', category: 'OPEN', sortOrder: 10,
          defaultProbabilityBasisPoints: 2500,
        },
        {
          code: 'PROPOSAL', name: 'Proposal', category: 'OPEN', sortOrder: 20,
          defaultProbabilityBasisPoints: 6000,
        },
        {
          code: 'WON', name: 'Won', category: 'WON', sortOrder: 90,
          defaultProbabilityBasisPoints: 10000,
        },
        {
          code: 'LOST', name: 'Lost', category: 'LOST', sortOrder: 100,
          defaultProbabilityBasisPoints: 0,
        },
      ],
    });
    assert.equal(pipelineReplay.replayed, true);
    assert.equal(pipelineReplay.result.pipelineId, pipeline.result.pipelineId);

    const pipelineView = (await sales.listPipelines(contextA))[0];
    assert.ok(pipelineView);
    const qualifiedStage = pipelineView.stages.find((stage) => stage.code === 'QUALIFIED');
    const proposalStage = pipelineView.stages.find((stage) => stage.code === 'PROPOSAL');
    const wonStage = pipelineView.stages.find((stage) => stage.code === 'WON');
    assert.ok(qualifiedStage && proposalStage && wonStage);

    const ownerMembershipId = await membershipId(databaseService, contextA, actorA);
    const lead = await sales.createLead(contextA, 'sales-lead-create', {
      customerId: customerA,
      source: 'integration-test',
      ownerMembershipId,
    });
    const leadReplay = await sales.createLead(contextA, 'sales-lead-create', {
      customerId: customerA,
      source: 'integration-test',
      ownerMembershipId,
    });
    assert.equal(leadReplay.replayed, true);
    assert.equal(leadReplay.result.leadId, lead.result.leadId);

    const qualified = await sales.qualifyLead(contextA, 'sales-lead-qualify', {
      leadId: lead.result.leadId,
      outcome: 'QUALIFIED',
      score: 87,
      grade: 'HIGH',
      signals: { budgetConfirmed: true, intent: 'high', source: 'integration-test' },
    });
    assert.equal(qualified.result.status, 'QUALIFIED');

    const opportunity = await sales.createOpportunity(contextA, 'sales-opportunity-create', {
      customerId: customerA,
      leadId: lead.result.leadId,
      pipelineId: pipeline.result.pipelineId,
      stageId: qualifiedStage.id,
      ownerMembershipId,
      name: 'Integration sale',
      expectedValueMinor: 250000,
      currency: 'EGP',
      expectedCloseDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    assert.equal(opportunity.result.status, 'OPEN');

    await assert.rejects(
      sales.createOpportunity(contextA, 'sales-opportunity-duplicate-lead', {
        customerId: customerA,
        leadId: lead.result.leadId,
        pipelineId: pipeline.result.pipelineId,
        stageId: qualifiedStage.id,
        name: 'Duplicate conversion',
        expectedValueMinor: 100,
        currency: 'EGP',
      }),
    );

    const moved = await sales.moveOpportunity(
      contextA,
      'sales-opportunity-move',
      opportunity.result.opportunityId,
      { stageId: proposalStage.id },
    );
    assert.equal(moved.result.probabilityBasisPoints, 6000);

    const activity = await sales.createActivity(contextA, 'sales-activity-create', {
      customerId: customerA,
      leadId: lead.result.leadId,
      opportunityId: opportunity.result.opportunityId,
      assignedMembershipId: ownerMembershipId,
      activityType: 'FOLLOW_UP',
      title: 'Review proposal with customer',
      body: 'Lifecycle verification task',
      dueAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const completed = await sales.completeActivity(
      contextA,
      'sales-activity-complete',
      activity.result.activityId,
    );
    assert.equal(completed.result.status, 'COMPLETED');

    const won = await sales.closeOpportunity(
      contextA,
      'sales-opportunity-win',
      opportunity.result.opportunityId,
      {
        outcome: 'WON',
        stageId: wonStage.id,
        wonStoreId: storeA,
        wonOrderId: wonOrderA,
      },
    );
    assert.equal(won.result.status, 'WON');
    const detail = await sales.getOpportunity(contextA, opportunity.result.opportunityId);
    assert.equal(detail?.status, 'WON');
    assert.equal(detail?.wonOrderId, wonOrderA);
    assert.equal(detail?.probabilityBasisPoints, 10000);
    assert.equal(detail?.activities[0]?.status, 'COMPLETED');
    assert.ok(detail?.timeline.some((event) => event.eventType === 'sales.opportunity_won'));

    assert.equal(
      (await sales.listOpportunities(contextB)).some(
        (item) => item.id === opportunity.result.opportunityId,
      ),
      false,
    );
    assert.equal(
      (await sales.listLeads(contextB)).some((item) => item.id === lead.result.leadId),
      false,
    );

    await withTenantTransaction(database, contextA, async (transaction) => {
      const [audit, outbox, timeline] = await Promise.all([
        sql<{ count: string }>`select count(*)::text as count from platform.audit_log
          where action = 'sales.opportunity.close'
            and resource_id = ${opportunity.result.opportunityId}`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from platform.outbox_events
          where event_type = 'sales.opportunity.closed'
            and resource_id = ${opportunity.result.opportunityId}`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from sales.timeline
          where opportunity_id = ${opportunity.result.opportunityId}::uuid`.execute(transaction),
      ]);
      assert.equal(audit.rows[0]?.count, '1');
      assert.equal(outbox.rows[0]?.count, '1');
      assert.ok(Number(timeline.rows[0]?.count ?? '0') >= 4);
    });
  } finally {
    await databaseService.onModuleDestroy();
  }
}

async function seedCanonicalDependencies(databaseService: ApiDatabaseService): Promise<void> {
  await withTenantTransaction(databaseService.database, contextA, async (transaction) => {
    await sql`insert into crm.customers (id, tenant_id, display_name, status, source)
      values (${customerA}::uuid, ${tenantA}::uuid, 'Sales Lifecycle Customer A', 'ACTIVE', 'integration-test')
      on conflict (id) do nothing`.execute(transaction);
    await sql`insert into commerce.stores (id, tenant_id, name, status, default_currency)
      values (${storeA}::uuid, ${tenantA}::uuid, 'Sales Lifecycle Store', 'ACTIVE', 'EGP')
      on conflict (id) do nothing`.execute(transaction);
    await sql`insert into commerce.orders (
        id, tenant_id, store_id, customer_id, order_number, status, financial_status,
        fulfillment_status, currency, subtotal_minor, total_minor, source, placed_at
      ) values (
        ${wonOrderA}::uuid, ${tenantA}::uuid, ${storeA}::uuid, ${customerA}::uuid,
        'SALES-WON-001', 'CONFIRMED', 'PAID', 'UNFULFILLED', 'EGP', 250000, 250000,
        'integration-test', now()
      ) on conflict (id) do nothing`.execute(transaction);
  });
  await withTenantTransaction(databaseService.database, contextB, async (transaction) => {
    await sql`insert into crm.customers (id, tenant_id, display_name, status, source)
      values (${customerB}::uuid, ${tenantB}::uuid, 'Sales Lifecycle Customer B', 'ACTIVE', 'integration-test')
      on conflict (id) do nothing`.execute(transaction);
  });
}

async function membershipId(
  databaseService: ApiDatabaseService,
  requestContext: TenantRequestContext,
  userId: string,
): Promise<string> {
  return withTenantTransaction(databaseService.database, requestContext, async (transaction) => {
    const result = await sql<{ id: string }>`select id from identity.memberships
      where user_id = ${userId}::uuid and status = 'ACTIVE'`.execute(transaction);
    const id = result.rows[0]?.id;
    assert.ok(id, 'Active membership fixture is required');
    return id;
  });
}

await main();
