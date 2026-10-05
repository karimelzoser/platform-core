import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { CommerceService } from '@platform/commerce';
import { ConnectorRegistry, developmentApiConnector } from '@platform/connectors';
import { approvalActionDigest, type ApprovalAction } from '@platform/contracts';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import { ShippingService } from '../../apps/api/src/shipping.service.js';
import { ProviderActionProcessor } from '../../apps/worker/src/provider-action-processor.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actorA = '11111111-1111-1111-1111-111111111111';
const actorB = '22222222-2222-2222-2222-222222222222';
const approverA = '77777777-7777-7777-7777-777777777777';
const connectionA = 'aaaaaaaa-0000-0000-0000-000000000810';
const secretA = 'aaaaaaaa-0000-0000-0000-000000000811';

const permissions = [
  'commerce.stores.manage',
  'commerce.products.read',
  'commerce.products.manage',
  'commerce.orders.read',
  'commerce.orders.create',
  'shipping.shipments.read',
  'shipping.shipments.manage',
  'shipping.tracking.record',
  'shipping.rescue.manage',
  'shipping.provider.execute',
] as const;

function context(tenantId: string, actorId: string, suffix: string): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject: `shipping-lifecycle-${suffix}`,
    requestId: `shipping-lifecycle-${suffix}`,
    correlationId: `shipping-lifecycle-${suffix}`,
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
      'shipping_lifecycle_approved_fixture', 'APPROVED', ${approverA}::uuid,
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
        values (${approverA}::uuid, 'shipping-lifecycle-approver', 'shipping-approver@example.test')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into identity.memberships (tenant_id, user_id, status)
        values (${tenantA}::uuid, ${actorA}::uuid, 'ACTIVE'),
          (${tenantA}::uuid, ${approverA}::uuid, 'ACTIVE')
        on conflict (tenant_id, user_id) do nothing`.execute(transaction);
      await sql`insert into integrations.connector_definitions (
        key, version, category, display_name, manifest, enabled
      ) values (
        'development-api', '1.0.0', 'GENERIC', 'Development API',
        '{"developmentOnly":true}'::jsonb, true
      ) on conflict (key) do nothing`.execute(transaction);
      await sql`insert into integrations.secret_references (
        id, tenant_id, provider, reference, key_version, state, metadata
      ) values (
        ${secretA}::uuid, ${tenantA}::uuid, 'development-api',
        'development://api/shipping-lifecycle', 'test-v1', 'ACTIVE',
        '{"developmentOnly":true}'::jsonb
      ) on conflict (id) do nothing`.execute(transaction);
      await sql`insert into integrations.connections (
        id, tenant_id, connector_key, secret_reference_id, display_name, status,
        settings, capabilities
      ) values (
        ${connectionA}::uuid, ${tenantA}::uuid, 'development-api', ${secretA}::uuid,
        'Shipping Development Carrier', 'CONNECTED',
        '{"allowDevelopmentFixture":true}'::jsonb,
        '["provider.actions"]'::jsonb
      ) on conflict (id) do update set
        secret_reference_id = excluded.secret_reference_id,
        status = 'CONNECTED', settings = excluded.settings,
        capabilities = excluded.capabilities`.execute(transaction);
    });

    await withTenantTransaction(database, contextB, async (transaction) => {
      await sql`insert into identity.memberships (tenant_id, user_id, status)
        values (${tenantB}::uuid, ${actorB}::uuid, 'ACTIVE')
        on conflict (tenant_id, user_id) do nothing`.execute(transaction);
    });

    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for shipping integration');
    const commands = new CommandExecutor(
      database,
      new CommandAuthorizer(
        new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
      ),
    );
    const commerce = new CommerceService(database, commands);
    const shipping = new ShippingService(database, commands);

    const store = await commerce.createStore(contextA, 'shipping-lifecycle-store', {
      name: 'Shipping Lifecycle Store',
      defaultCurrency: 'EGP',
      timezone: 'Africa/Cairo',
      metadata: { integrationTest: true },
    });
    const product = await commerce.createProduct(contextA, 'shipping-lifecycle-product', {
      storeId: store.result.storeId,
      title: 'Shipping Lifecycle Product',
      metadata: {},
      variants: [
        {
          title: 'Default',
          sku: 'SHIPPING-LIFECYCLE-SKU',
          trackInventory: false,
          priceMinor: 12_500,
          currency: 'EGP',
          metadata: {},
        },
      ],
    });
    const variantId = product.result.variantIds[0];
    assert.ok(variantId);

    const order = await commerce.createOrder(contextA, 'shipping-lifecycle-order', {
      storeId: store.result.storeId,
      orderNumber: 'SHIPPING-LIFECYCLE-1001',
      currency: 'EGP',
      source: 'integration-test',
      metadata: {},
      lines: [
        {
          productId: product.result.productId,
          variantId,
          sku: 'SHIPPING-LIFECYCLE-SKU',
          title: 'Shipping Lifecycle Product',
          quantity: 2,
          unitPriceMinor: 12_500,
          metadata: {},
        },
      ],
    });

    const fulfillmentId = randomUUID();
    const orderLineId = await withTenantTransaction(database, contextA, async (transaction) => {
      const lines = await sql<{ id: string }>`select id from commerce.order_lines
        where tenant_id = ${tenantA}::uuid
          and store_id = ${store.result.storeId}::uuid
          and order_id = ${order.result.orderId}::uuid
        order by created_at, id
        limit 1`.execute(transaction);
      const lineId = lines.rows[0]?.id;
      assert.ok(lineId, 'Order line must exist before fulfillment');

      await sql`insert into commerce.fulfillments (
        id, tenant_id, store_id, order_id, status, metadata
      ) values (
        ${fulfillmentId}::uuid, ${tenantA}::uuid, ${store.result.storeId}::uuid,
        ${order.result.orderId}::uuid, 'IN_PROGRESS', '{"integrationTest":true}'::jsonb
      )`.execute(transaction);
      await sql`insert into commerce.fulfillment_lines (
        tenant_id, store_id, order_id, fulfillment_id, order_line_id, quantity
      ) values (
        ${tenantA}::uuid, ${store.result.storeId}::uuid, ${order.result.orderId}::uuid,
        ${fulfillmentId}::uuid, ${lineId}::uuid, 2
      )`.execute(transaction);
      return lineId;
    });

    const carrier = await shipping.createCarrierAccount(
      contextA,
      'shipping-lifecycle-carrier-account',
      {
        connectionId: connectionA,
        carrierKey: 'development-api',
        accountLabel: 'Shipping Lifecycle Carrier',
        displayName: 'Development Shipping Carrier',
        metadata: { integrationTest: true },
      },
    );
    const carrierService = await shipping.createCarrierService(
      contextA,
      'shipping-lifecycle-carrier-service',
      {
        carrierAccountId: carrier.result.carrierAccountId,
        serviceCode: 'STANDARD',
        name: 'Standard Delivery',
        domestic: true,
        international: false,
        metadata: { integrationTest: true },
      },
    );

    const shipmentInput = {
      storeId: store.result.storeId,
      orderId: order.result.orderId,
      fulfillmentId,
      carrierAccountId: carrier.result.carrierAccountId,
      carrierServiceId: carrierService.result.carrierServiceId,
      destination: {
        name: 'Shipping Test Buyer',
        line1: '1 Integration Street',
        city: 'Cairo',
        countryCode: 'EG',
        phone: '+201005550101',
      },
      declaredValueMinor: 25_000,
      declaredValueCurrency: 'EGP',
      metadata: { integrationTest: true },
      lines: [{ orderLineId, quantity: 2 }],
      packages: [{ weightGrams: 1_200, metadata: { integrationTest: true } }],
    };
    const shipment = await shipping.createShipment(
      contextA,
      'shipping-lifecycle-shipment',
      shipmentInput,
    );
    const replay = await shipping.createShipment(
      contextA,
      'shipping-lifecycle-shipment',
      shipmentInput,
    );
    assert.equal(replay.replayed, true);
    assert.equal(replay.result.shipmentId, shipment.result.shipmentId);
    assert.equal(replay.result.packageIds[0], shipment.result.packageIds[0]);

    const providerInput = {
      storeId: store.result.storeId,
      shipmentId: shipment.result.shipmentId,
      operation: 'CREATE_LABEL' as const,
    };
    const providerApproval = await approvedEvidence(database, contextA, {
      action: 'shipping.shipment.provider.create_label',
      permission: 'shipping.provider.execute',
      risk: 'HIGH',
      resource: {
        type: 'shipping.shipment',
        id: shipment.result.shipmentId,
        tenantId: tenantA,
      },
      input: providerInput,
    });
    const queuedProvider = await shipping.queueProviderAction(
      contextA,
      'shipping-lifecycle-create-label',
      providerInput,
      providerApproval,
    );

    let shipmentState = await withTenantTransaction(database, contextA, async (transaction) => {
      const result = await sql<{ status: string; provider_sync_state: string }>`
        select status, provider_sync_state
        from shipping.shipments
        where id = ${shipment.result.shipmentId}::uuid
      `.execute(transaction);
      return result.rows[0];
    });
    assert.equal(shipmentState?.status, 'LABEL_PENDING');
    assert.equal(shipmentState?.provider_sync_state, 'PENDING');

    const registry = new ConnectorRegistry();
    registry.register(developmentApiConnector);
    const providerProcessor = new ProviderActionProcessor(
      database,
      registry,
      'shipping-lifecycle-worker',
    );
    assert.ok((await providerProcessor.processBatch(25)) >= 1);

    const providerState = await withTenantTransaction(database, contextA, async (transaction) => {
      const [shipmentRows, actionRows, referenceRows] = await Promise.all([
        sql<{
          status: string;
          provider_sync_state: string;
          tracking_number: string | null;
          tracking_url: string | null;
        }>`select status, provider_sync_state, tracking_number, tracking_url
          from shipping.shipments
          where id = ${shipment.result.shipmentId}::uuid`.execute(transaction),
        sql<{ state: string }>`select state from shipping.shipment_provider_actions
          where provider_action_id = ${queuedProvider.result.providerActionId}::uuid`.execute(
          transaction,
        ),
        sql<{ external_id: string }>`select external_id from shipping.provider_references
          where canonical_id = ${shipment.result.shipmentId}::uuid
            and entity_type = 'SHIPMENT'`.execute(transaction),
      ]);
      return {
        shipment: shipmentRows.rows[0],
        action: actionRows.rows[0],
        reference: referenceRows.rows[0],
      };
    });
    assert.equal(providerState.shipment?.status, 'LABEL_CREATED');
    assert.equal(providerState.shipment?.provider_sync_state, 'IN_SYNC');
    assert.match(providerState.shipment?.tracking_number ?? '', /^DEV-[A-F0-9]{14}$/u);
    assert.match(
      providerState.shipment?.tracking_url ?? '',
      /^https:\/\/example\.invalid\/tracking\//u,
    );
    assert.equal(providerState.action?.state, 'SUCCEEDED');
    assert.ok(providerState.reference?.external_id);

    const packageId = shipment.result.packageIds[0];
    assert.ok(packageId);
    await shipping.recordTrackingEvent(contextA, 'shipping-lifecycle-in-transit', {
      storeId: store.result.storeId,
      shipmentId: shipment.result.shipmentId,
      packageId,
      eventType: 'IN_TRANSIT',
      normalizedStatus: 'IN_TRANSIT',
      description: 'Shipment is moving through the carrier network',
      occurredAt: '2026-10-05T00:20:00.000Z',
      sourceType: 'INTEGRATION',
      externalEventId: 'shipping-lifecycle-event-1',
      dedupeKey: 'shipping-lifecycle-event-1',
      data: { integrationTest: true },
    });
    await shipping.recordTrackingEvent(contextA, 'shipping-lifecycle-older-label', {
      storeId: store.result.storeId,
      shipmentId: shipment.result.shipmentId,
      packageId,
      eventType: 'LABEL_CREATED',
      normalizedStatus: 'LABEL_CREATED',
      description: 'Delayed old provider event',
      occurredAt: '2026-10-05T00:10:00.000Z',
      sourceType: 'INTEGRATION',
      externalEventId: 'shipping-lifecycle-event-old',
      dedupeKey: 'shipping-lifecycle-event-old',
      data: { integrationTest: true },
    });
    shipmentState = await withTenantTransaction(database, contextA, async (transaction) => {
      const result = await sql<{ status: string; package_status: string }>`
        select shipment.status, package.status as package_status
        from shipping.shipments as shipment
        join shipping.packages as package
          on package.tenant_id = shipment.tenant_id
         and package.shipment_id = shipment.id
        where shipment.id = ${shipment.result.shipmentId}::uuid
          and package.id = ${packageId}::uuid
      `.execute(transaction);
      return result.rows[0];
    });
    assert.equal(shipmentState?.status, 'IN_TRANSIT');
    assert.equal(shipmentState?.package_status, 'IN_TRANSIT');

    const failedDeliveryInput = {
      storeId: store.result.storeId,
      shipmentId: shipment.result.shipmentId,
      packageId,
      eventType: 'DELIVERY_FAILED' as const,
      normalizedStatus: 'EXCEPTION' as const,
      rawCode: 'CUSTOMER_UNREACHABLE',
      description: 'Customer could not be reached at the delivery address',
      locationName: 'Cairo',
      countryCode: 'EG',
      occurredAt: '2026-10-05T00:30:00.000Z',
      sourceType: 'INTEGRATION' as const,
      externalEventId: 'shipping-lifecycle-event-failed',
      dedupeKey: 'shipping-lifecycle-event-failed',
      data: { integrationTest: true },
    };
    const failedDelivery = await shipping.recordTrackingEvent(
      contextA,
      'shipping-lifecycle-delivery-failed',
      failedDeliveryInput,
    );
    assert.equal(failedDelivery.result.duplicate, false);
    assert.ok(failedDelivery.result.rescueCaseId);

    const duplicateTracking = await shipping.recordTrackingEvent(
      contextA,
      'shipping-lifecycle-delivery-failed-duplicate',
      failedDeliveryInput,
    );
    assert.equal(duplicateTracking.result.duplicate, true);
    assert.equal(duplicateTracking.result.trackingEventId, failedDelivery.result.trackingEventId);

    const rescueCaseId = failedDelivery.result.rescueCaseId;
    assert.ok(rescueCaseId);
    let rescueState = await withTenantTransaction(database, contextA, async (transaction) => {
      const result = await sql<{ state: string; priority: string }>`
        select state, priority from shipping.rescue_cases
        where id = ${rescueCaseId}::uuid
      `.execute(transaction);
      return result.rows[0];
    });
    assert.equal(rescueState?.state, 'CONTACT_REQUIRED');
    assert.equal(rescueState?.priority, 'HIGH');

    await shipping.updateRescueCase(contextA, 'shipping-lifecycle-rescue-contacted', {
      storeId: store.result.storeId,
      rescueCaseId,
      state: 'CONTACTED',
      summary: 'Buyer contacted and delivery details verified',
    });
    await shipping.updateRescueCase(contextA, 'shipping-lifecycle-rescue-resolved', {
      storeId: store.result.storeId,
      rescueCaseId,
      state: 'RESOLVED',
      summary: 'Delivery rescue completed',
    });
    rescueState = await withTenantTransaction(database, contextA, async (transaction) => {
      const result = await sql<{ state: string; resolved_at: Date | null }>`
        select state, resolved_at from shipping.rescue_cases
        where id = ${rescueCaseId}::uuid
      `.execute(transaction);
      return result.rows[0];
    });
    assert.equal(rescueState?.state, 'RESOLVED');
    assert.ok(rescueState?.resolved_at);

    assert.equal(await shipping.getShipment(contextB, shipment.result.shipmentId), undefined);
    await withTenantTransaction(database, contextB, async (transaction) => {
      const [shipments, actions, rescues] = await Promise.all([
        sql<{ id: string }>`select id from shipping.shipments
          where id = ${shipment.result.shipmentId}::uuid`.execute(transaction),
        sql<{ id: string }>`select provider_action_id as id
          from shipping.shipment_provider_actions
          where provider_action_id = ${queuedProvider.result.providerActionId}::uuid`.execute(
          transaction,
        ),
        sql<{ id: string }>`select id from shipping.rescue_cases
          where id = ${rescueCaseId}::uuid`.execute(transaction),
      ]);
      assert.equal(shipments.rows.length, 0, 'Tenant B can read Tenant A shipment');
      assert.equal(actions.rows.length, 0, 'Tenant B can read Tenant A provider action');
      assert.equal(rescues.rows.length, 0, 'Tenant B can read Tenant A rescue case');
    });

    await withTenantTransaction(database, contextA, async (transaction) => {
      const [trackingCount, timelineCount, auditCount, outboxCount] = await Promise.all([
        sql<{ count: string }>`select count(*)::text as count from shipping.tracking_events
          where shipment_id = ${shipment.result.shipmentId}::uuid`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from shipping.shipment_timeline
          where shipment_id = ${shipment.result.shipmentId}::uuid`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from platform.audit_log
          where resource_id = ${shipment.result.shipmentId}`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from platform.outbox_events
          where resource_id = ${shipment.result.shipmentId}`.execute(transaction),
      ]);
      assert.equal(Number(trackingCount.rows[0]?.count ?? 0), 3);
      assert.ok(Number(timelineCount.rows[0]?.count ?? 0) >= 7);
      assert.ok(Number(auditCount.rows[0]?.count ?? 0) >= 3);
      assert.ok(Number(outboxCount.rows[0]?.count ?? 0) >= 3);
    });

    process.stdout.write('Shipping lifecycle integration passed.\n');
  } finally {
    await databaseService.onModuleDestroy();
  }
}

await main();
