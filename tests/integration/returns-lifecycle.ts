import assert from 'node:assert/strict';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { sql, withTenantTransaction } from '@platform/database';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import { ApprovalService } from '../../apps/api/src/approval.service.js';
import { ReturnsApprovalService } from '../../apps/api/src/returns-approval.service.js';
import { ReturnsService } from '../../apps/api/src/returns.service.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actorA = '11111111-1111-1111-1111-111111111111';
const actorB = '22222222-2222-2222-2222-222222222222';
const approverA = '12121212-1212-1212-1212-121212121212';
const storeA = 'aaaaaaaa-0000-0000-0000-000000000701';
const productA = 'aaaaaaaa-0000-0000-0000-000000000702';
const variantA = 'aaaaaaaa-0000-0000-0000-000000000703';
const locationA = 'aaaaaaaa-0000-0000-0000-000000000704';
const orderA = 'aaaaaaaa-0000-0000-0000-000000000705';
const orderLineA = 'aaaaaaaa-0000-0000-0000-000000000706';
const paymentA = 'aaaaaaaa-0000-0000-0000-000000000707';
const fulfillmentA = 'aaaaaaaa-0000-0000-0000-000000000708';
const connectionA = 'aaaaaaaa-0000-0000-0000-000000000709';
const mappingA = 'aaaaaaaa-0000-0000-0000-000000000710';
const policyA = 'aaaaaaaa-0000-0000-0000-000000000711';
const replacementVariantA = 'aaaaaaaa-0000-0000-0000-000000000712';

const permissions = [
  'returns.read',
  'returns.create',
  'returns.approve',
  'returns.manage',
  'commerce.refunds.issue',
  'commerce.inventory.manage',
] as const;

function context(
  tenantId: string,
  actorId: string,
  subject: string,
  actorPermissions: readonly string[],
): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject,
    requestId: subject,
    correlationId: subject,
    actorType: 'USER',
    permissions: actorPermissions,
  };
}

const contextA = context(tenantA, actorA, 'returns-lifecycle-a', permissions);
const contextB = context(tenantB, actorB, 'returns-lifecycle-b', permissions);
const approverContext = context(
  tenantA,
  approverA,
  'returns-lifecycle-approver',
  ['policy.approvals.read', 'policy.approvals.decide'],
);

async function approve(
  requester: ReturnsApprovalService,
  approvals: ApprovalService,
  returns: ReturnsService,
  kind: 'DECISION' | 'EXCHANGE' | 'REFUND' | 'RESTOCK',
  returnId: string,
  input: Record<string, unknown>,
): Promise<string> {
  const request = await requester.request(contextA, returnId, kind, input);
  await approvals.decide(approverContext, request.approvalId, { decision: 'APPROVED' });
  assert.ok(await returns.detail(contextA, returnId));
  return request.approvalId;
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
      await sql`insert into integrations.connections (
          id, tenant_id, connector_key, display_name, status
        ) values (${connectionA}::uuid, ${tenantA}::uuid, 'test-connector',
          'Returns Lifecycle Provider', 'CONNECTED')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into commerce.stores (id, tenant_id, name, default_currency)
        values (${storeA}::uuid, ${tenantA}::uuid, 'Returns Lifecycle Store', 'EGP')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into commerce.products (id, tenant_id, store_id, title)
        values (${productA}::uuid, ${tenantA}::uuid, ${storeA}::uuid, 'Returns Lifecycle Product')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into commerce.variants (
          id, tenant_id, store_id, product_id, title, sku, price_minor, currency
        ) values (${variantA}::uuid, ${tenantA}::uuid, ${storeA}::uuid, ${productA}::uuid,
          'Original', 'RETURNS-LIFECYCLE-ORIGINAL', 2000, 'EGP')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into commerce.variants (
          id, tenant_id, store_id, product_id, title, sku, price_minor, currency
        ) values (${replacementVariantA}::uuid, ${tenantA}::uuid, ${storeA}::uuid, ${productA}::uuid,
          'Replacement', 'RETURNS-LIFECYCLE-REPLACEMENT', 2000, 'EGP')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into commerce.inventory_locations (id, tenant_id, store_id, name)
        values (${locationA}::uuid, ${tenantA}::uuid, ${storeA}::uuid, 'Returns Lifecycle Warehouse')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into commerce.inventory_levels (
          tenant_id, store_id, location_id, variant_id, on_hand, committed, incoming
        ) values (${tenantA}::uuid, ${storeA}::uuid, ${locationA}::uuid, ${variantA}::uuid, 5, 0, 0)
        on conflict (tenant_id, location_id, variant_id) do update set on_hand = 5, committed = 0`.execute(
        transaction,
      );
      await sql`insert into commerce.orders (
          id, tenant_id, store_id, order_number, status, financial_status, fulfillment_status,
          currency, subtotal_minor, total_minor, placed_at
        ) values (${orderA}::uuid, ${tenantA}::uuid, ${storeA}::uuid, 'RETURNS-1001',
          'CONFIRMED', 'PAID', 'FULFILLED', 'EGP', 4000, 4000, now())
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into commerce.order_lines (
          id, tenant_id, store_id, order_id, product_id, variant_id, sku, title,
          quantity, unit_price_minor, total_minor
        ) values (${orderLineA}::uuid, ${tenantA}::uuid, ${storeA}::uuid, ${orderA}::uuid,
          ${productA}::uuid, ${variantA}::uuid, 'RETURNS-LIFECYCLE-ORIGINAL',
          'Returns Lifecycle Product', 2, 2000, 4000)
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into commerce.payments (
          id, tenant_id, store_id, order_id, kind, status, amount_minor, currency, processed_at
        ) values (${paymentA}::uuid, ${tenantA}::uuid, ${storeA}::uuid, ${orderA}::uuid,
          'SALE', 'CAPTURED', 4000, 'EGP', now())
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into commerce.fulfillments (
          id, tenant_id, store_id, order_id, status, fulfilled_at
        ) values (${fulfillmentA}::uuid, ${tenantA}::uuid, ${storeA}::uuid, ${orderA}::uuid,
          'FULFILLED', now()) on conflict (id) do nothing`.execute(transaction);
      await sql`insert into commerce.fulfillment_lines (
          tenant_id, store_id, fulfillment_id, order_id, order_line_id, quantity
        ) values (${tenantA}::uuid, ${storeA}::uuid, ${fulfillmentA}::uuid,
          ${orderA}::uuid, ${orderLineA}::uuid, 2)
        on conflict (tenant_id, fulfillment_id, order_line_id) do nothing`.execute(transaction);
      await sql`insert into commerce.provider_mappings (
          id, tenant_id, store_id, connection_id, entity_type, canonical_id, external_id
        ) values (${mappingA}::uuid, ${tenantA}::uuid, ${storeA}::uuid, ${connectionA}::uuid,
          'ORDER', ${orderA}::uuid, 'provider-order-returns-1001')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into returns.policies (
          id, tenant_id, store_id, name, return_window_days, require_fulfilled,
          allow_exchanges, require_inspection, allow_restock
        ) values (${policyA}::uuid, ${tenantA}::uuid, ${storeA}::uuid,
          'Returns Lifecycle Policy', 30, true, true, true, true)
        on conflict (id) do nothing`.execute(transaction);
    });

    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for returns integration');
    const commands = new CommandExecutor(
      database,
      new CommandAuthorizer(
        new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
      ),
    );
    const returns = new ReturnsService(database, commands);
    const returnsApprovals = new ReturnsApprovalService(databaseService);
    const approvals = new ApprovalService(databaseService);

    const eligibility = await returns.eligibility(contextA, orderA);
    assert.equal(eligibility.eligible, true);
    assert.equal(eligibility.lines[0]?.returnableQuantity, 2);

    const createInput = {
      orderId: orderA,
      reasonCode: 'DEFECTIVE',
      customerNote: 'One unit refund, one unit exchange.',
      lines: [
        {
          orderLineId: orderLineA,
          quantity: 1,
          reasonCode: 'DEFECTIVE',
          requestedResolution: 'REFUND' as const,
          proposedRefundMinor: 2000,
        },
        {
          orderLineId: orderLineA,
          quantity: 1,
          reasonCode: 'WRONG_ITEM',
          requestedResolution: 'EXCHANGE' as const,
          proposedRefundMinor: 2000,
        },
      ],
    };
    const created = await returns.create(contextA, 'returns-lifecycle-create', createInput);
    const replay = await returns.create(contextA, 'returns-lifecycle-create', createInput);
    assert.equal(replay.replayed, true);
    assert.equal(replay.result.returnId, created.result.returnId);
    const returnId = created.result.returnId;

    assert.equal((await returns.list(contextB)).items.some((item) => item.id === returnId), false);
    assert.equal(await returns.detail(contextB, returnId), undefined);

    const decisionInput = { decision: 'APPROVE' as const, reason: 'Eligible return' };
    const decisionApproval = await approve(
      returnsApprovals,
      approvals,
      returns,
      'DECISION',
      returnId,
      decisionInput,
    );
    const decided = await returns.decide(
      contextA,
      returnId,
      'returns-lifecycle-approve',
      decisionInput,
      decisionApproval,
    );
    assert.equal(decided.result.status, 'APPROVED');

    await returns.markReceived(contextA, returnId, 'returns-lifecycle-received');
    const beforeInspection = await returns.detail(contextA, returnId);
    assert.ok(beforeInspection);
    const refundLine = beforeInspection.lines.find((line) => line.requestedResolution === 'REFUND');
    const exchangeLine = beforeInspection.lines.find((line) => line.requestedResolution === 'EXCHANGE');
    assert.ok(refundLine && exchangeLine);

    const inspected = await returns.inspect(contextA, returnId, 'returns-lifecycle-inspection', {
      note: 'Both units accepted.',
      lines: [
        {
          returnLineId: refundLine.id,
          acceptedQuantity: 1,
          rejectedQuantity: 0,
          condition: 'DEFECTIVE',
        },
        {
          returnLineId: exchangeLine.id,
          acceptedQuantity: 1,
          rejectedQuantity: 0,
          condition: 'NEW',
        },
      ],
    });
    assert.equal(inspected.result.status, 'INSPECTED');

    const refundInput = {
      amountMinor: 2000,
      currency: 'EGP',
      reason: 'Accepted defective item',
      paymentId: paymentA,
    };
    const refundApproval = await approve(
      returnsApprovals,
      approvals,
      returns,
      'REFUND',
      returnId,
      refundInput,
    );
    const refund = await returns.requestRefund(
      contextA,
      returnId,
      'returns-lifecycle-refund',
      refundInput,
      refundApproval,
    );
    assert.equal(refund.result.status, 'QUEUED');
    assert.ok(refund.result.providerActionId);

    const exchangeInput = {
      lines: [
        {
          returnLineId: exchangeLine.id,
          replacementVariantId: replacementVariantA,
          quantity: 1,
          unitPriceDeltaMinor: 0,
        },
      ],
    };
    const exchangeApproval = await approve(
      returnsApprovals,
      approvals,
      returns,
      'EXCHANGE',
      returnId,
      exchangeInput,
    );
    const exchange = await returns.createExchange(
      contextA,
      returnId,
      'returns-lifecycle-exchange',
      exchangeInput,
      exchangeApproval,
    );
    assert.equal(exchange.result.status, 'APPROVED');

    const restockInput = {
      returnLineId: refundLine.id,
      locationId: locationA,
      quantity: 1,
      note: 'Accepted unit returned to stock.',
    };
    const restockApproval = await approve(
      returnsApprovals,
      approvals,
      returns,
      'RESTOCK',
      returnId,
      restockInput,
    );
    await returns.restock(
      contextA,
      returnId,
      'returns-lifecycle-restock',
      restockInput,
      restockApproval,
    );

    await withTenantTransaction(database, contextA, async (transaction) => {
      const [inventory, providerAction, usage, audit, outbox, timeline] = await Promise.all([
        sql<{ on_hand: number }>`select on_hand from commerce.inventory_levels
          where location_id = ${locationA}::uuid and variant_id = ${variantA}::uuid`.execute(transaction),
        sql<{ state: string }>`select state from integrations.provider_actions
          where id = ${refund.result.providerActionId}::uuid`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from platform.usage_records
          where meter_key = 'returns.refund.queued' and resource_id = ${refund.result.refundId}`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from platform.audit_log
          where action = 'returns.request.create' and resource_id = ${returnId}`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from platform.outbox_events
          where event_type = 'returns.request.created' and resource_id = ${returnId}`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from returns.timeline
          where return_id = ${returnId}::uuid`.execute(transaction),
      ]);
      assert.equal(inventory.rows[0]?.on_hand, 6);
      assert.equal(providerAction.rows[0]?.state, 'QUEUED');
      assert.equal(usage.rows[0]?.count, '1');
      assert.equal(audit.rows[0]?.count, '1');
      assert.equal(outbox.rows[0]?.count, '1');
      assert.ok(Number(timeline.rows[0]?.count ?? '0') >= 6);
    });

    const detail = await returns.detail(contextA, returnId);
    assert.ok(detail);
    assert.equal(detail.refunds.length, 1);
    assert.equal(detail.exchanges.length, 1);
    assert.equal(detail.restocks.length, 1);
  } finally {
    await databaseService.onModuleDestroy();
  }
}

await main();
