import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { CommerceService } from '@platform/commerce';
import {
  OrderWorkflowInvariantError,
  OrderWorkflowService,
} from '@platform/commerce/order-workflows';
import {
  ConnectorRegistry,
  developmentShopifyPublicAppConnector,
} from '@platform/connectors';
import { approvalActionDigest, type ApprovalAction } from '@platform/contracts';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import { ProviderActionProcessor } from '../../apps/worker/src/provider-action-processor.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actorA = '11111111-1111-1111-1111-111111111111';
const actorB = '22222222-2222-2222-2222-222222222222';
const approverA = '66666666-6666-6666-6666-666666666666';
const connectionA = 'aaaaaaaa-0000-0000-0000-000000000730';
const secretA = 'aaaaaaaa-0000-0000-0000-000000000731';

const permissions = [
  'commerce.stores.manage',
  'commerce.products.read',
  'commerce.products.manage',
  'commerce.orders.read',
  'commerce.orders.create',
  'commerce.orders.update',
  'commerce.orders.confirm',
  'commerce.orders.cancel',
  'integrations.sync.execute',
] as const;

function context(tenantId: string, actorId: string, suffix: string): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject: `order-workflow-lifecycle-${suffix}`,
    requestId: `order-workflow-lifecycle-${suffix}`,
    correlationId: `order-workflow-lifecycle-${suffix}`,
    actorType: 'USER',
    permissions,
  };
}

const contextA = context(tenantA, actorA, 'a');
const contextB = context(tenantB, actorB, 'b');

async function approvedEvidence(
  database: PlatformDatabase,
  requestContext: TenantRequestContext,
  action: ApprovalAction,
): Promise<string> {
  const approvalId = randomUUID();
  await withTenantTransaction(database, requestContext, async (transaction) => {
    await sql`insert into policy.approval_requests (
      id, tenant_id, requested_by, action, permission, risk, resource_type,
      resource_id, action_digest, request_snapshot, policy_reason, status,
      decided_by, decided_at, expires_at
    ) values (
      ${approvalId}::uuid, ${requestContext.tenantId}::uuid,
      ${requestContext.actorId ?? null}::uuid, ${action.action}, ${action.permission},
      ${action.risk}, ${action.resource.type}, ${action.resource.id},
      ${approvalActionDigest(action)}, ${JSON.stringify(action)}::jsonb,
      'order_workflow_lifecycle_approved_fixture', 'APPROVED', ${approverA}::uuid,
      now(), now() + interval '1 hour'
    )`.execute(transaction);
  });
  return approvalId;
}

async function main(): Promise<void> {
  const databaseService = new ApiDatabaseService();
  const database = databaseService.database;
  try {
    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`insert into identity.users (id, keycloak_subject, email)
        values (${approverA}::uuid, 'order-workflow-approver', 'order-workflow-approver@example.test')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into identity.memberships (tenant_id, user_id, status)
        values (${tenantA}::uuid, ${actorA}::uuid, 'ACTIVE'),
          (${tenantA}::uuid, ${approverA}::uuid, 'ACTIVE')
        on conflict (tenant_id, user_id) do nothing`.execute(transaction);
      await sql`insert into integrations.connector_definitions (
        key, version, category, display_name, manifest, enabled
      ) values (
        'development-shopify-public-app', '1.0.0', 'COMMERCE',
        'Development Shopify Public App', '{"developmentOnly":true}'::jsonb, true
      ) on conflict (key) do nothing`.execute(transaction);
      await sql`insert into integrations.secret_references (
        id, tenant_id, provider, reference, key_version, state, metadata
      ) values (
        ${secretA}::uuid, ${tenantA}::uuid, 'development-shopify-public-app',
        'development://shopify-public-app/order-workflow-lifecycle', 'test-v1',
        'ACTIVE', '{"developmentOnly":true}'::jsonb
      ) on conflict (id) do nothing`.execute(transaction);
      await sql`insert into integrations.connections (
        id, tenant_id, connector_key, secret_reference_id, display_name, status,
        settings, capabilities
      ) values (
        ${connectionA}::uuid, ${tenantA}::uuid, 'development-shopify-public-app',
        ${secretA}::uuid, 'Order Workflow Shopify Fixture', 'CONNECTED',
        '{"allowDevelopmentFixture":true,"shopDomain":"order-workflow-preview.myshopify.com","apiVersion":"2026-10"}'::jsonb,
        '["provider.actions"]'::jsonb
      ) on conflict (id) do update set
        secret_reference_id = excluded.secret_reference_id,
        status = 'CONNECTED', settings = excluded.settings, capabilities = excluded.capabilities`.execute(
        transaction,
      );
    });
    await withTenantTransaction(database, contextB, async (transaction) => {
      await sql`insert into identity.memberships (tenant_id, user_id, status)
        values (${tenantB}::uuid, ${actorB}::uuid, 'ACTIVE')
        on conflict (tenant_id, user_id) do nothing`.execute(transaction);
    });

    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for order workflow integration');
    const commands = new CommandExecutor(
      database,
      new CommandAuthorizer(
        new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
      ),
    );
    const commerce = new CommerceService(database, commands);
    const workflows = new OrderWorkflowService(database, commands);

    const store = await commerce.createStore(contextA, 'order-workflow-store', {
      name: 'Order Workflow Lifecycle Store',
      defaultCurrency: 'EGP',
      timezone: 'Africa/Cairo',
      metadata: { integrationTest: true },
    });
    const product = await commerce.createProduct(contextA, 'order-workflow-product', {
      storeId: store.result.storeId,
      title: 'Order Workflow Product',
      metadata: {},
      variants: [
        {
          title: 'Default',
          sku: 'ORDER-WORKFLOW-SKU',
          trackInventory: false,
          priceMinor: 8_500,
          currency: 'EGP',
          metadata: {},
        },
      ],
    });
    const variantId = product.result.variantIds[0];
    assert.ok(variantId);

    const createOrder = async (idempotencyKey: string, orderNumber: string) =>
      commerce.createOrder(contextA, idempotencyKey, {
        storeId: store.result.storeId,
        orderNumber,
        currency: 'EGP',
        source: 'integration-test',
        metadata: {},
        lines: [
          {
            productId: product.result.productId,
            variantId,
            sku: 'ORDER-WORKFLOW-SKU',
            title: 'Order Workflow Product',
            quantity: 1,
            unitPriceMinor: 8_500,
            metadata: {},
          },
        ],
      });

    const original = await createOrder('order-workflow-original', 'ORDER-WORKFLOW-1001');
    const duplicate = await createOrder('order-workflow-duplicate', 'ORDER-WORKFLOW-1002');

    for (const [index, orderId] of [original.result.orderId, duplicate.result.orderId].entries()) {
      const requested = await workflows.requestModification(
        contextA,
        `order-workflow-identity-${String(index)}`,
        {
          storeId: store.result.storeId,
          orderId,
          patch: {
            customerEmail: 'same-buyer@example.test',
            customerPhone: '+20 100 555 0101',
          },
          reason: 'Normalize duplicate-detection identity fixture',
        },
      );
      await workflows.reviewModification(contextA, `order-workflow-identity-review-${String(index)}`, {
        storeId: store.result.storeId,
        orderId,
        requestId: requested.result.requestId,
        decision: 'APPROVE',
      });
    }

    const duplicateEvaluation = await workflows.evaluateDuplicates(
      contextA,
      'order-workflow-duplicate-evaluate',
      {
        storeId: store.result.storeId,
        orderId: duplicate.result.orderId,
        lookbackDays: 5,
        threshold: 60,
      },
    );
    assert.equal(duplicateEvaluation.result.duplicateState, 'POSSIBLE_DUPLICATE');
    assert.equal(duplicateEvaluation.result.candidateCount, 1);
    let workflow = await workflows.get(contextA, duplicate.result.orderId);
    assert.ok(workflow);
    const duplicateCandidate = workflow.duplicates[0];
    assert.ok(duplicateCandidate);
    assert.equal(duplicateCandidate.candidateOrderId, original.result.orderId);
    assert.ok(duplicateCandidate.score >= 60);

    await workflows.reviewDuplicate(contextA, 'order-workflow-duplicate-confirm', {
      storeId: store.result.storeId,
      orderId: duplicate.result.orderId,
      candidateId: original.result.orderId,
      decision: 'CONFIRM_DUPLICATE',
    });
    await assert.rejects(
      workflows.requestConfirmation(contextA, 'order-workflow-blocked-confirm', {
        storeId: store.result.storeId,
        orderId: duplicate.result.orderId,
      }),
      OrderWorkflowInvariantError,
    );
    await workflows.reviewDuplicate(contextA, 'order-workflow-duplicate-dismiss', {
      storeId: store.result.storeId,
      orderId: duplicate.result.orderId,
      candidateId: original.result.orderId,
      decision: 'DISMISS',
    });

    const confirmation = await workflows.requestConfirmation(
      contextA,
      'order-workflow-confirm-request',
      {
        storeId: store.result.storeId,
        orderId: duplicate.result.orderId,
      },
    );
    const confirmationReplay = await workflows.requestConfirmation(
      contextA,
      'order-workflow-confirm-request',
      {
        storeId: store.result.storeId,
        orderId: duplicate.result.orderId,
      },
    );
    assert.equal(confirmationReplay.replayed, true);
    assert.equal(confirmationReplay.result.attempts, confirmation.result.attempts);
    await workflows.recordConfirmationResponse(contextA, 'order-workflow-confirm-response', {
      storeId: store.result.storeId,
      orderId: duplicate.result.orderId,
      response: 'CONFIRMED',
    });

    await commerce.mapProviderResource(contextA, 'order-workflow-provider-map', {
      storeId: store.result.storeId,
      connectionId: connectionA,
      entityType: 'ORDER',
      canonicalId: duplicate.result.orderId,
      externalId: 'gid://shopify/Order/order-workflow-1002',
      metadata: { integrationTest: true },
    });

    const providerInput = {
      storeId: store.result.storeId,
      orderId: duplicate.result.orderId,
      connectionId: connectionA,
      operation: 'CONFIRM' as const,
    };
    const providerApproval = await approvedEvidence(database, contextA, {
      action: 'commerce.order.provider.confirm',
      permission: 'commerce.orders.confirm',
      risk: 'HIGH',
      resource: { type: 'commerce.order', id: duplicate.result.orderId, tenantId: tenantA },
      input: providerInput,
    });
    const queuedProvider = await workflows.queueProviderAction(
      contextA,
      'order-workflow-provider-confirm',
      providerInput,
      providerApproval,
    );
    workflow = await workflows.get(contextA, duplicate.result.orderId);
    assert.equal(workflow?.providerSyncState, 'PENDING');

    const registry = new ConnectorRegistry();
    registry.register(developmentShopifyPublicAppConnector);
    const providerProcessor = new ProviderActionProcessor(database, registry, 'order-workflow-test-worker');
    assert.equal(await providerProcessor.processBatch(25), 1);
    workflow = await workflows.get(contextA, duplicate.result.orderId);
    assert.equal(workflow?.providerSyncState, 'IN_SYNC');
    assert.equal(
      workflow?.providerActions.find(
        (action) => action.providerActionId === queuedProvider.result.providerActionId,
      )?.state,
      'SUCCEEDED',
    );

    const cancellable = await createOrder('order-workflow-cancellable', 'ORDER-WORKFLOW-1003');
    const cancellationRequest = await workflows.requestCancellation(
      contextA,
      'order-workflow-cancel-request',
      {
        storeId: store.result.storeId,
        orderId: cancellable.result.orderId,
        reason: 'Customer requested cancellation before payment and fulfillment',
      },
    );
    const cancellationInput = {
      storeId: store.result.storeId,
      orderId: cancellable.result.orderId,
      requestId: cancellationRequest.result.requestId,
      decision: 'APPROVE' as const,
    };
    const cancellationApproval = await approvedEvidence(database, contextA, {
      action: 'commerce.order.cancellation.review',
      permission: 'commerce.orders.cancel',
      risk: 'HIGH',
      resource: { type: 'commerce.order', id: cancellable.result.orderId, tenantId: tenantA },
      input: cancellationInput,
    });
    await workflows.reviewCancellation(
      contextA,
      'order-workflow-cancel-review',
      cancellationInput,
      cancellationApproval,
    );
    const cancelled = await commerce.getOrder(contextA, cancellable.result.orderId);
    assert.equal(cancelled?.status, 'CANCELLED');

    const paidOrder = await createOrder('order-workflow-paid', 'ORDER-WORKFLOW-1004');
    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`update commerce.orders set financial_status = 'PAID'
        where id = ${paidOrder.result.orderId}::uuid`.execute(transaction);
    });
    await assert.rejects(
      workflows.requestCancellation(contextA, 'order-workflow-paid-cancel-blocked', {
        storeId: store.result.storeId,
        orderId: paidOrder.result.orderId,
        reason: 'This must be routed through refund or void workflow',
      }),
      OrderWorkflowInvariantError,
    );

    assert.equal(await workflows.get(contextB, duplicate.result.orderId), undefined);
    await withTenantTransaction(database, contextB, async (transaction) => {
      const [workflowRows, providerRows] = await Promise.all([
        sql<{ id: string }>`select order_id as id from commerce.order_workflows
          where order_id = ${duplicate.result.orderId}::uuid`.execute(transaction),
        sql<{ id: string }>`select provider_action_id as id from commerce.order_provider_actions
          where provider_action_id = ${queuedProvider.result.providerActionId}::uuid`.execute(transaction),
      ]);
      assert.equal(workflowRows.rows.length, 0, 'Tenant B can read Tenant A workflow state');
      assert.equal(providerRows.rows.length, 0, 'Tenant B can read Tenant A provider action link');
    });

    await withTenantTransaction(database, contextA, async (transaction) => {
      const [providerState, approvalState, timeline, audit, outbox] = await Promise.all([
        sql<{ state: string }>`select state from integrations.provider_actions
          where id = ${queuedProvider.result.providerActionId}::uuid`.execute(transaction),
        sql<{ status: string }>`select status from policy.approval_requests
          where id = ${providerApproval}::uuid`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from commerce.order_timeline
          where order_id = ${duplicate.result.orderId}::uuid
            and event_type in (
              'commerce.order.duplicates_evaluated',
              'commerce.order.confirmation_requested',
              'commerce.order.confirmation_confirmed',
              'commerce.order.provider_action_queued',
              'commerce.order.provider_action_succeeded'
            )`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from platform.audit_log
          where resource_id = ${duplicate.result.orderId}
            and action like 'commerce.order.%'`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from platform.outbox_events
          where resource_id = ${duplicate.result.orderId}
            and event_type like 'commerce.order.%'`.execute(transaction),
      ]);
      assert.equal(providerState.rows[0]?.state, 'SUCCEEDED');
      assert.equal(approvalState.rows[0]?.status, 'EXECUTED');
      assert.ok(Number(timeline.rows[0]?.count ?? '0') >= 5);
      assert.ok(Number(audit.rows[0]?.count ?? '0') >= 5);
      assert.ok(Number(outbox.rows[0]?.count ?? '0') >= 5);
    });
  } finally {
    await databaseService.onModuleDestroy();
  }
}

await main();
