import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { CommerceService } from '@platform/commerce';
import { approvalActionDigest, type ApprovalAction } from '@platform/contracts';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import { ReturnsInvariantError, ReturnsService } from '../../apps/api/src/returns.service.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actorA = '11111111-1111-1111-1111-111111111111';
const actorB = '22222222-2222-2222-2222-222222222222';
const approverA = '12121212-1212-1212-1212-121212121212';
const storeA = 'aaaaaaaa-0000-0000-0000-000000000501';
const productA = 'aaaaaaaa-0000-0000-0000-000000000502';
const variantA = 'aaaaaaaa-0000-0000-0000-000000000503';
const connectionA = 'aaaaaaaa-0000-0000-0000-000000000002';

const permissions = [
  'commerce.orders.read',
  'commerce.orders.create',
  'commerce.orders.update',
  'commerce.payments.read',
  'commerce.payments.manage',
  'commerce.refunds.issue',
  'integrations.sync.execute',
  'returns.read',
  'returns.create',
  'returns.approve',
  'returns.manage',
] as const;

function context(
  tenantId: string,
  actorId: string,
  suffix: string,
  actorPermissions: readonly string[] = permissions,
): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject: `returns-lifecycle-${suffix}`,
    requestId: `returns-lifecycle-${suffix}`,
    correlationId: `returns-lifecycle-${suffix}`,
    actorType: 'USER',
    permissions: actorPermissions,
  };
}

const contextA = context(tenantA, actorA, 'a');
const contextB = context(tenantB, actorB, 'b');
const approverContext: TenantRequestContext = {
  ...context(tenantA, approverA, 'approver', ['policy.approvals.decide']),
  subject: 'returns-lifecycle-approver',
};

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
      'returns_lifecycle_approved_fixture', 'APPROVED', ${approverA}::uuid,
      now(), now() + interval '1 hour'
    )`.execute(transaction);
  });
  return approvalId;
}

async function approveHighRisk(
  database: PlatformDatabase,
  input: {
    action: string;
    permission: string;
    risk: 'HIGH' | 'CRITICAL';
    resourceType: string;
    resourceId: string;
    input: Record<string, unknown>;
  },
): Promise<string> {
  return approvedEvidence(database, contextA, {
    action: input.action,
    permission: input.permission,
    risk: input.risk,
    resource: { type: input.resourceType, id: input.resourceId, tenantId: tenantA },
    input: input.input,
  });
}

async function main(): Promise<void> {
  const databaseService = new ApiDatabaseService();
  const database = databaseService.database;
  try {
    await withTenantTransaction(database, approverContext, async (transaction) => {
      await sql`insert into identity.users (id, keycloak_subject, email)
        values (${approverA}::uuid, 'returns-lifecycle-approver', 'returns-approver@example.test')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into identity.memberships (tenant_id, user_id, status)
        values (${tenantA}::uuid, ${approverA}::uuid, 'ACTIVE')
        on conflict (tenant_id, user_id) do nothing`.execute(transaction);
    });
    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`update integrations.connections set status = 'CONNECTED', updated_at = now()
        where id = ${connectionA}::uuid`.execute(transaction);
    });

    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for returns integration');
    const commands = new CommandExecutor(
      database,
      new CommandAuthorizer(
        new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
      ),
    );
    const commerce = new CommerceService(database, commands);
    const returns = new ReturnsService(database, commands);

    const policyInput = {
      storeId: storeA,
      name: 'Lifecycle returns policy',
      returnWindowDays: 30,
      requireInspection: true,
      allowExchange: true,
      allowStoreCredit: true,
    };
    const policyApproval = await approveHighRisk(database, {
      action: 'returns.policy.upsert',
      permission: 'returns.manage',
      risk: 'HIGH',
      resourceType: 'returns.policy',
      resourceId: storeA,
      input: policyInput,
    });
    await returns.upsertPolicy(contextA, 'returns-policy-lifecycle', policyInput, policyApproval);

    const createdOrder = await commerce.createOrder(contextA, 'returns-order', {
      storeId: storeA,
      orderNumber: `RETURNS-${Date.now().toString(36)}`,
      currency: 'EGP',
      source: 'integration-test',
      placedAt: new Date().toISOString(),
      metadata: { returnsLifecycle: true },
      lines: [
        {
          productId: productA,
          variantId: variantA,
          sku: 'RLS-A-SKU',
          title: 'Returnable lifecycle product',
          quantity: 2,
          unitPriceMinor: 1_000,
          metadata: {},
        },
      ],
    });
    const orderId = createdOrder.result.orderId;
    const orderLineId = createdOrder.result.lineIds[0];
    assert.ok(orderLineId);
    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`update commerce.orders
        set status = 'CONFIRMED', financial_status = 'PAID', updated_at = now()
        where id = ${orderId}::uuid`.execute(transaction);
    });
    const payment = await commerce.recordPayment(contextA, 'returns-payment', {
      storeId: storeA,
      orderId,
      kind: 'SALE',
      status: 'CAPTURED',
      amountMinor: 2_000,
      currency: 'EGP',
      processedAt: new Date().toISOString(),
      metadata: { returnsLifecycle: true },
    });
    await commerce.mapProviderResource(contextA, 'returns-order-map', {
      storeId: storeA,
      connectionId: connectionA,
      entityType: 'ORDER',
      canonicalId: orderId,
      externalId: `external-${orderId}`,
      metadata: { returnsLifecycle: true },
    });
    await commerce.mapProviderResource(contextA, 'returns-payment-map', {
      storeId: storeA,
      connectionId: connectionA,
      entityType: 'PAYMENT',
      canonicalId: payment.result.paymentId,
      externalId: `external-${payment.result.paymentId}`,
      metadata: { returnsLifecycle: true },
    });

    const requestInput = {
      storeId: storeA,
      orderId,
      kind: 'RETURN' as const,
      reasonCode: 'DAMAGED',
      customerNote: 'Lifecycle damaged item',
      lines: [{ orderLineId, quantity: 1 }],
    };
    const requested = await returns.createRequest(contextA, 'returns-request', requestInput);
    const replay = await returns.createRequest(contextA, 'returns-request', requestInput);
    assert.equal(replay.replayed, true);
    assert.equal(replay.result.requestId, requested.result.requestId);
    await assert.rejects(
      returns.createRequest(contextA, 'returns-over-allocation', {
        ...requestInput,
        lines: [{ orderLineId, quantity: 2 }],
      }),
      ReturnsInvariantError,
    );

    const reviewInput = { requestId: requested.result.requestId, decision: 'APPROVE' as const };
    const reviewApproval = await approveHighRisk(database, {
      action: 'returns.request.review',
      permission: 'returns.approve',
      risk: 'HIGH',
      resourceType: 'returns.request',
      resourceId: requested.result.requestId,
      input: reviewInput,
    });
    await returns.reviewRequest(contextA, 'returns-review', reviewInput, reviewApproval);

    let detail = await returns.get(contextA, requested.result.requestId);
    assert.ok(detail);
    const returnLineId = detail.lines[0]?.id;
    assert.ok(returnLineId);
    const inspectionInput = {
      requestId: requested.result.requestId,
      lines: [
        {
          lineId: returnLineId,
          receivedQuantity: 1,
          acceptedQuantity: 1,
          inspectionStatus: 'ACCEPTED' as const,
          conditionCode: 'DAMAGED',
          restockDisposition: 'QUARANTINE' as const,
        },
      ],
    };
    const inspectionApproval = await approveHighRisk(database, {
      action: 'returns.request.inspect',
      permission: 'returns.manage',
      risk: 'HIGH',
      resourceType: 'returns.request',
      resourceId: requested.result.requestId,
      input: inspectionInput,
    });
    await returns.receiveAndInspect(
      contextA,
      'returns-inspection',
      inspectionInput,
      inspectionApproval,
    );

    const refundInput = {
      requestId: requested.result.requestId,
      sourcePaymentId: payment.result.paymentId,
      connectionId: connectionA,
      amountMinor: 1_000,
      currency: 'EGP',
      reason: 'Accepted damaged return',
    };
    await assert.rejects(
      returns.issueRefund(contextA, 'returns-refund-no-approval', refundInput),
      /approval/i,
    );
    const refundApproval = await approveHighRisk(database, {
      action: 'commerce.refund.issue',
      permission: 'commerce.refunds.issue',
      risk: 'CRITICAL',
      resourceType: 'returns.request',
      resourceId: requested.result.requestId,
      input: refundInput,
    });
    const queuedRefund = await returns.issueRefund(
      contextA,
      'returns-refund-approved',
      refundInput,
      refundApproval,
    );
    assert.equal(queuedRefund.result.status, 'QUEUED');
    await assert.rejects(
      returns.issueRefund(
        contextA,
        'returns-refund-over-allocation',
        { ...refundInput, amountMinor: 1_001 },
        refundApproval,
      ),
      /approval|refund/i,
    );
    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`update integrations.provider_actions
        set state = 'SUCCEEDED', provider_action_id = 'provider-refund-lifecycle',
            result = '{"ok":true}'::jsonb, finished_at = now(), updated_at = now()
        where id = ${queuedRefund.result.providerActionId}::uuid`.execute(transaction);
    });
    const reconciled = await returns.reconcileRefund(
      contextA,
      'returns-refund-reconcile',
      queuedRefund.result.refundId,
    );
    assert.equal(reconciled.result.status, 'SUCCEEDED');
    detail = await returns.get(contextA, requested.result.requestId);
    assert.equal(detail?.refunds[0]?.status, 'SUCCEEDED');
    await returns.resolveRequest(contextA, 'returns-resolve', requested.result.requestId);

    const orderAfterRefund = await commerce.getOrder(contextA, orderId);
    assert.equal(orderAfterRefund?.financialStatus, 'PARTIALLY_REFUNDED');
    await withTenantTransaction(database, contextA, async (transaction) => {
      const refundPayment = await sql<{ kind: string; amount_minor: string }>`
        select kind, amount_minor::text from commerce.payments
        where id = ${queuedRefund.result.refundId}::uuid
      `.execute(transaction);
      assert.equal(refundPayment.rows[0]?.kind, 'REFUND');
      assert.equal(refundPayment.rows[0]?.amount_minor, '1000');
    });

    const exchangeOrder = await commerce.createOrder(contextA, 'returns-exchange-order', {
      storeId: storeA,
      orderNumber: `EXCHANGE-${Date.now().toString(36)}`,
      currency: 'EGP',
      source: 'integration-test',
      placedAt: new Date().toISOString(),
      metadata: { returnsLifecycle: true },
      lines: [
        {
          productId: productA,
          variantId: variantA,
          sku: 'RLS-A-SKU',
          title: 'Exchange lifecycle product',
          quantity: 1,
          unitPriceMinor: 1_000,
          metadata: {},
        },
      ],
    });
    const exchangeLineId = exchangeOrder.result.lineIds[0];
    assert.ok(exchangeLineId);
    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`update commerce.orders set status = 'CONFIRMED', updated_at = now()
        where id = ${exchangeOrder.result.orderId}::uuid`.execute(transaction);
    });
    const exchangeRequest = await returns.createRequest(contextA, 'returns-exchange-request', {
      storeId: storeA,
      orderId: exchangeOrder.result.orderId,
      kind: 'EXCHANGE',
      reasonCode: 'SIZE_CHANGE',
      lines: [{ orderLineId: exchangeLineId, quantity: 1, exchangeVariantId: variantA }],
    });
    const exchangeReviewInput = {
      requestId: exchangeRequest.result.requestId,
      decision: 'APPROVE' as const,
    };
    const exchangeReviewApproval = await approveHighRisk(database, {
      action: 'returns.request.review',
      permission: 'returns.approve',
      risk: 'HIGH',
      resourceType: 'returns.request',
      resourceId: exchangeRequest.result.requestId,
      input: exchangeReviewInput,
    });
    await returns.reviewRequest(
      contextA,
      'returns-exchange-review',
      exchangeReviewInput,
      exchangeReviewApproval,
    );
    const exchangeDetail = await returns.get(contextA, exchangeRequest.result.requestId);
    const exchangeRequestLineId = exchangeDetail?.lines[0]?.id;
    assert.ok(exchangeRequestLineId);
    const exchangeInspectionInput = {
      requestId: exchangeRequest.result.requestId,
      lines: [
        {
          lineId: exchangeRequestLineId,
          receivedQuantity: 1,
          acceptedQuantity: 1,
          inspectionStatus: 'ACCEPTED' as const,
          conditionCode: 'GOOD',
          restockDisposition: 'RESTOCK' as const,
        },
      ],
    };
    const exchangeInspectionApproval = await approveHighRisk(database, {
      action: 'returns.request.inspect',
      permission: 'returns.manage',
      risk: 'HIGH',
      resourceType: 'returns.request',
      resourceId: exchangeRequest.result.requestId,
      input: exchangeInspectionInput,
    });
    await returns.receiveAndInspect(
      contextA,
      'returns-exchange-inspection',
      exchangeInspectionInput,
      exchangeInspectionApproval,
    );
    const createExchangeInput = {
      requestId: exchangeRequest.result.requestId,
      priceAdjustmentMinor: 0,
      currency: 'EGP',
    };
    const wrongCurrencyExchangeInput = { ...createExchangeInput, currency: 'USD' };
    const wrongCurrencyExchangeApproval = await approveHighRisk(database, {
      action: 'returns.exchange.create',
      permission: 'returns.approve',
      risk: 'HIGH',
      resourceType: 'returns.request',
      resourceId: exchangeRequest.result.requestId,
      input: wrongCurrencyExchangeInput,
    });
    await assert.rejects(
      returns.createExchange(
        contextA,
        'returns-exchange-wrong-currency',
        wrongCurrencyExchangeInput,
        wrongCurrencyExchangeApproval,
      ),
      /currency/i,
    );
    const createExchangeApproval = await approveHighRisk(database, {
      action: 'returns.exchange.create',
      permission: 'returns.approve',
      risk: 'HIGH',
      resourceType: 'returns.request',
      resourceId: exchangeRequest.result.requestId,
      input: createExchangeInput,
    });
    const exchange = await returns.createExchange(
      contextA,
      'returns-exchange-create',
      createExchangeInput,
      createExchangeApproval,
    );
    assert.equal(exchange.result.status, 'APPROVED');

    const replacementOrder = await commerce.createOrder(contextA, 'returns-replacement-order', {
      storeId: storeA,
      orderNumber: `REPLACEMENT-${Date.now().toString(36)}`,
      currency: 'EGP',
      source: 'returns-exchange',
      metadata: { returnRequestId: exchangeRequest.result.requestId },
      lines: [
        {
          productId: productA,
          variantId: variantA,
          sku: 'RLS-A-SKU',
          title: 'Replacement lifecycle product',
          quantity: 1,
          unitPriceMinor: 1_000,
          metadata: {},
        },
      ],
    });
    await returns.fulfillExchange(contextA, 'returns-exchange-fulfill', {
      exchangeId: exchange.result.exchangeId,
      replacementOrderId: replacementOrder.result.orderId,
    });
    await returns.resolveRequest(
      contextA,
      'returns-exchange-resolve',
      exchangeRequest.result.requestId,
    );
    const resolvedExchange = await returns.get(contextA, exchangeRequest.result.requestId);
    assert.equal(resolvedExchange?.status, 'RESOLVED');
    assert.equal(resolvedExchange?.exchanges[0]?.status, 'FULFILLED');
    assert.equal(
      resolvedExchange?.exchanges[0]?.replacementOrderId,
      replacementOrder.result.orderId,
    );

    assert.equal(
      (await returns.list(contextB)).some((item) => item.id === requested.result.requestId),
      false,
    );
    await withTenantTransaction(database, contextA, async (transaction) => {
      const [audit, outbox] = await Promise.all([
        sql<{ count: string }>`select count(*)::text as count from platform.audit_log
          where action = 'returns.request.create'
            and resource_id = ${requested.result.requestId}`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from platform.outbox_events
          where event_type = 'returns.request.created'
            and resource_id = ${requested.result.requestId}`.execute(transaction),
      ]);
      assert.equal(audit.rows[0]?.count, '1');
      assert.equal(outbox.rows[0]?.count, '1');
    });
  } finally {
    await databaseService.onModuleDestroy();
  }
}

await main();
