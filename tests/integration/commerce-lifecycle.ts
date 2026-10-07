import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { CommerceInvariantError, CommerceService } from '@platform/commerce';
import { approvalActionDigest, type ApprovalAction } from '@platform/contracts';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actorA = '11111111-1111-1111-1111-111111111111';
const actorB = '22222222-2222-2222-2222-222222222222';
const approverA = '66666666-6666-6666-6666-666666666666';
const connectionA = 'aaaaaaaa-0000-0000-0000-000000000602';
const connectionB = 'bbbbbbbb-0000-0000-0000-000000000602';

const commercePermissions = [
  'commerce.stores.manage',
  'commerce.products.read',
  'commerce.products.manage',
  'commerce.inventory.read',
  'commerce.inventory.manage',
  'commerce.orders.read',
  'commerce.orders.create',
  'commerce.orders.update',
  'commerce.payments.read',
  'commerce.payments.manage',
  'commerce.fulfillments.read',
  'commerce.fulfillments.record',
  'integrations.sync.execute',
] as const;

function context(tenantId: string, actorId: string, suffix: string): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject: `commerce-lifecycle-${suffix}`,
    requestId: `commerce-lifecycle-${suffix}`,
    correlationId: `commerce-lifecycle-${suffix}`,
    actorType: 'USER',
    permissions: commercePermissions,
  };
}

const contextA = context(tenantA, actorA, 'a');
const contextB = context(tenantB, actorB, 'b');
const approverContext = context(tenantA, approverA, 'approver');

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
      'commerce_lifecycle_approved_fixture', 'APPROVED', ${approverA}::uuid,
      now(), now() + interval '1 hour'
    )`.execute(transaction);
  });
  return approvalId;
}

async function main(): Promise<void> {
  const databaseService = new ApiDatabaseService();
  const database = databaseService.database;
  try {
    // Identity closure permits a subject to create only its own global user row.
    // Base tenant owner memberships are already seeded by identity-fixtures.sql.
    await withTenantTransaction(database, approverContext, async (transaction) => {
      await sql`insert into identity.users (id, keycloak_subject, email)
        values (${approverA}::uuid, 'commerce-lifecycle-approver', 'commerce-approver@example.test')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into identity.memberships (tenant_id, user_id, status)
        values (${tenantA}::uuid, ${approverA}::uuid, 'ACTIVE')
        on conflict (tenant_id, user_id) do nothing`.execute(transaction);
    });
    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`insert into integrations.connections (
        id, tenant_id, connector_key, display_name, status
      ) values (
        ${connectionA}::uuid, ${tenantA}::uuid, 'test-connector',
        'Commerce Lifecycle A', 'CONNECTED'
      ) on conflict (id) do nothing`.execute(transaction);
    });
    await withTenantTransaction(database, contextB, async (transaction) => {
      await sql`insert into integrations.connections (
        id, tenant_id, connector_key, display_name, status
      ) values (
        ${connectionB}::uuid, ${tenantB}::uuid, 'test-connector',
        'Commerce Lifecycle B', 'CONNECTED'
      ) on conflict (id) do nothing`.execute(transaction);
    });

    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for commerce integration');
    const commands = new CommandExecutor(
      database,
      new CommandAuthorizer(
        new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
      ),
    );
    const commerce = new CommerceService(database, commands);

    const storeAInput = {
      name: 'Lifecycle Store A',
      defaultCurrency: 'EGP',
      timezone: 'Africa/Cairo',
      metadata: { test: true },
    } as const;
    const storeA = await commerce.createStore(contextA, 'commerce-store-a', storeAInput);
    const storeAReplay = await commerce.createStore(contextA, 'commerce-store-a', storeAInput);
    assert.equal(storeAReplay.replayed, true);
    assert.equal(storeAReplay.result.storeId, storeA.result.storeId);

    const storeB = await commerce.createStore(contextB, 'commerce-store-b', {
      name: 'Lifecycle Store B',
      defaultCurrency: 'EGP',
      metadata: {},
    });
    assert.ok(
      (await commerce.listStores(contextA)).some((store) => store.id === storeA.result.storeId),
    );
    assert.equal(
      (await commerce.listStores(contextA)).some((store) => store.id === storeB.result.storeId),
      false,
    );
    assert.equal(
      (await commerce.listStores(contextB)).some((store) => store.id === storeA.result.storeId),
      false,
    );

    const productA = await commerce.createProduct(contextA, 'commerce-product-a', {
      storeId: storeA.result.storeId,
      title: 'Lifecycle Product A',
      vendor: 'PRENEURA Test',
      metadata: {},
      variants: [
        {
          title: 'Default',
          sku: 'LIFECYCLE-A-SKU',
          trackInventory: true,
          priceMinor: 12_500,
          currency: 'EGP',
          metadata: {},
        },
      ],
    });
    const variantA = productA.result.variantIds[0];
    assert.ok(variantA);
    assert.ok(
      (await commerce.listProducts(contextA, storeA.result.storeId)).items.some(
        (product) => product.id === productA.result.productId && product.variantCount === 1,
      ),
    );

    const locationInput = {
      storeId: storeA.result.storeId,
      name: 'Lifecycle Warehouse A',
      metadata: {},
    };
    const locationAction: ApprovalAction = {
      action: 'commerce.inventory_location.create',
      permission: 'commerce.inventory.manage',
      risk: 'HIGH',
      resource: { type: 'commerce.store', id: storeA.result.storeId, tenantId: tenantA },
      input: locationInput,
    };
    const locationApproval = await approvedEvidence(database, contextA, locationAction);
    const locationA = await commerce.createInventoryLocation(
      contextA,
      'commerce-location-a',
      locationInput,
      locationApproval,
    );

    const inventoryInput = {
      storeId: storeA.result.storeId,
      locationId: locationA.result.locationId,
      variantId: variantA,
      onHand: 25,
      committed: 4,
      incoming: 3,
      metadata: {},
    };
    const inventoryAction: ApprovalAction = {
      action: 'commerce.inventory.set',
      permission: 'commerce.inventory.manage',
      risk: 'HIGH',
      resource: {
        type: 'commerce.inventory_level',
        id: `${locationA.result.locationId}:${variantA}`,
        tenantId: tenantA,
      },
      input: inventoryInput,
    };
    const inventoryApproval = await approvedEvidence(database, contextA, inventoryAction);
    const inventory = await commerce.setInventoryLevel(
      contextA,
      'commerce-inventory-a',
      inventoryInput,
      inventoryApproval,
    );
    assert.equal(inventory.result.available, 21);
    const inventoryReplay = await commerce.setInventoryLevel(
      contextA,
      'commerce-inventory-a',
      inventoryInput,
    );
    assert.equal(inventoryReplay.replayed, true);
    assert.equal(inventoryReplay.result.available, 21);

    const orderInput = {
      storeId: storeA.result.storeId,
      orderNumber: 'LIFECYCLE-A-1001',
      currency: 'EGP',
      source: 'platform',
      shippingMinor: 500,
      metadata: { channel: 'integration-test' },
      lines: [
        {
          productId: productA.result.productId,
          variantId: variantA,
          sku: 'LIFECYCLE-A-SKU',
          title: 'Lifecycle Product A',
          quantity: 2,
          unitPriceMinor: 12_500,
          discountMinor: 1_000,
          taxMinor: 3_360,
          metadata: {},
        },
      ],
      discounts: [{ code: 'TEST500', amountMinor: 500, metadata: {} }],
      taxes: [],
    };
    const orderA = await commerce.createOrder(contextA, 'commerce-order-a', orderInput);
    assert.equal(orderA.result.totalMinor, 27_360);
    const orderReplay = await commerce.createOrder(contextA, 'commerce-order-a', orderInput);
    assert.equal(orderReplay.replayed, true);
    assert.equal(orderReplay.result.orderId, orderA.result.orderId);
    assert.equal(await commerce.getOrder(contextB, orderA.result.orderId), undefined);

    await assert.rejects(
      commerce.createOrder(contextB, 'commerce-cross-catalog-b', {
        storeId: storeB.result.storeId,
        orderNumber: 'INVALID-CROSS-TENANT',
        currency: 'EGP',
        lines: [
          {
            productId: productA.result.productId,
            variantId: variantA,
            title: 'Cross-tenant product',
            quantity: 1,
            unitPriceMinor: 1,
          },
        ],
      }),
      CommerceInvariantError,
    );

    await assert.rejects(
      commerce.recordPayment(contextA, 'commerce-payment-wrong-currency', {
        storeId: storeA.result.storeId,
        orderId: orderA.result.orderId,
        kind: 'SALE',
        status: 'CAPTURED',
        amountMinor: 27_360,
        currency: 'USD',
        metadata: {},
      }),
      CommerceInvariantError,
    );
    const paymentA = await commerce.recordPayment(contextA, 'commerce-payment-a', {
      storeId: storeA.result.storeId,
      orderId: orderA.result.orderId,
      kind: 'SALE',
      status: 'CAPTURED',
      amountMinor: 27_360,
      currency: 'EGP',
      paymentMethodType: 'cash_on_delivery',
      processedAt: '2026-10-03T06:00:00.000Z',
      metadata: {},
    });

    const fulfillmentA = await commerce.createFulfillment(contextA, 'commerce-fulfillment-a', {
      storeId: storeA.result.storeId,
      orderId: orderA.result.orderId,
      status: 'FULFILLED',
      fulfilledAt: '2026-10-03T06:05:00.000Z',
      metadata: {},
      lines: [{ orderLineId: orderA.result.lineIds[0] ?? '', quantity: 2 }],
    });

    const mappedOrder = await commerce.mapProviderResource(contextA, 'commerce-map-order-a', {
      storeId: storeA.result.storeId,
      connectionId: connectionA,
      entityType: 'ORDER',
      canonicalId: orderA.result.orderId,
      externalId: 'shopify-order-lifecycle-a',
      metadata: { fixture: true },
    });
    assert.ok(mappedOrder.result.mappingId);
    assert.deepEqual(
      await commerce.resolveProviderMapping(contextA, {
        connectionId: connectionA,
        entityType: 'ORDER',
        externalId: 'shopify-order-lifecycle-a',
      }),
      { canonicalId: orderA.result.orderId, storeId: storeA.result.storeId },
    );
    assert.equal(
      await commerce.resolveProviderMapping(contextB, {
        connectionId: connectionB,
        entityType: 'ORDER',
        externalId: 'shopify-order-lifecycle-a',
      }),
      undefined,
    );
    await assert.rejects(
      commerce.mapProviderResource(contextB, 'commerce-cross-map-b', {
        storeId: storeA.result.storeId,
        connectionId: connectionB,
        entityType: 'ORDER',
        canonicalId: orderA.result.orderId,
        externalId: 'invalid-cross-tenant-order',
      }),
      CommerceInvariantError,
    );

    const detail = await commerce.getOrder(contextA, orderA.result.orderId);
    assert.ok(detail);
    assert.equal(detail.totalMinor, '27360');
    assert.equal(detail.lines.length, 1);
    assert.equal(detail.payments[0]?.id, paymentA.result.paymentId);
    assert.equal(detail.fulfillments[0]?.id, fulfillmentA.result.fulfillmentId);

    await withTenantTransaction(database, contextA, async (transaction) => {
      const [audit, outbox, timeline, approval, inventoryRow, failedPayment] = await Promise.all([
        sql<{ count: string }>`select count(*)::text as count from platform.audit_log
          where action = 'commerce.order.create' and resource_id = ${orderA.result.orderId}`.execute(
          transaction,
        ),
        sql<{ count: string }>`select count(*)::text as count from platform.outbox_events
          where event_type = 'commerce.order.created' and resource_id = ${orderA.result.orderId}`.execute(
          transaction,
        ),
        sql<{ count: string }>`select count(*)::text as count from commerce.order_timeline
          where order_id = ${orderA.result.orderId}::uuid`.execute(transaction),
        sql<{ status: string }>`select status from policy.approval_requests
          where id = ${inventoryApproval}::uuid`.execute(transaction),
        sql<{ available: number }>`select available from commerce.inventory_levels
          where location_id = ${locationA.result.locationId}::uuid and variant_id = ${variantA}::uuid`.execute(
          transaction,
        ),
        sql<{ count: string }>`select count(*)::text as count from platform.audit_log
          where action = 'commerce.payment.record'
            and after_state ->> 'currency' = 'USD'`.execute(transaction),
      ]);
      assert.equal(audit.rows[0]?.count, '1');
      assert.equal(outbox.rows[0]?.count, '1');
      assert.equal(timeline.rows[0]?.count, '3');
      assert.equal(approval.rows[0]?.status, 'EXECUTED');
      assert.equal(inventoryRow.rows[0]?.available, 21);
      assert.equal(
        failedPayment.rows[0]?.count,
        '0',
        'Failed payment command emitted audit evidence',
      );
    });

    await withTenantTransaction(database, contextB, async (transaction) => {
      const hidden = await sql<{ id: string }>`select id from commerce.orders
        where id = ${orderA.result.orderId}::uuid`.execute(transaction);
      assert.equal(hidden.rows.length, 0, 'Tenant B can directly read Tenant A order');
    });
  } finally {
    await databaseService.onModuleDestroy();
  }
}

await main();
