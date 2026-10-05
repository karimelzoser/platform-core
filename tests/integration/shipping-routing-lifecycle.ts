import assert from 'node:assert/strict';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import {
  ShippingRoutingInvariantError,
  ShippingRoutingService,
} from '../../apps/api/src/shipping-routing.service.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actorA = '11111111-1111-1111-1111-111111111111';
const actorB = '22222222-2222-2222-2222-222222222222';
const storeA = 'aaaaaaaa-0000-0000-0000-000000000501';
const shipmentA = 'aaaaaaaa-0000-0000-0000-000000000603';
const cityA = 'aaaaaaaa-0000-0000-0000-000000000612';
const zoneA = 'aaaaaaaa-0000-0000-0000-000000000614';

const permissions = ['shipping.shipments.read', 'shipping.shipments.manage'] as const;

function context(tenantId: string, actorId: string, suffix: string): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject: `shipping-routing-lifecycle-${suffix}`,
    requestId: `shipping-routing-lifecycle-${suffix}`,
    correlationId: `shipping-routing-lifecycle-${suffix}`,
    actorType: 'USER',
    permissions,
  };
}

async function main(): Promise<void> {
  const databaseService = new ApiDatabaseService();
  const database = databaseService.database;

  try {
    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for shipping routing integration');
    const commands = new CommandExecutor(
      database,
      new CommandAuthorizer(
        new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
      ),
    );
    const routing = new ShippingRoutingService(database, commands);
    const contextA = context(tenantA, actorA, 'a');
    const contextB = context(tenantB, actorB, 'b');

    const catalogA = await routing.getCatalog(contextA);
    assert.ok(
      catalogA.locations.some((location) => location['id'] === cityA),
      'Tenant A must see its canonical Cairo location',
    );
    assert.ok(
      catalogA.zones.some((zone) => zone['id'] === zoneA),
      'Tenant A must see its Cairo shipping zone',
    );
    assert.ok(catalogA.carrierMappings.length >= 1, 'Carrier location mapping must be exposed');
    assert.ok(catalogA.serviceZoneRules.length >= 1, 'Carrier service-zone rule must be exposed');

    const shipmentRouting = await routing.getShipmentRouting(contextA, shipmentA);
    assert.ok(shipmentRouting, 'Tenant A shipment routing must be visible');
    assert.equal(shipmentRouting.shipment['validationState'], 'MATCHED');
    assert.equal(shipmentRouting.shipment['cityLocationId'], cityA);
    assert.equal(shipmentRouting.shipment['zoneId'], zoneA);
    assert.equal(shipmentRouting.eligibility.eligible, true);
    assert.equal(shipmentRouting.eligibility.reason, 'ZONE_ALLOWED');
    assert.ok(shipmentRouting.labels.length >= 1, 'Derived label lifecycle must be visible');

    const replayInput = { storeId: storeA, shipmentId: shipmentA };
    const first = await routing.recalculateShipmentRouting(
      contextA,
      'shipping-routing-lifecycle-recalculate',
      replayInput,
    );
    const replay = await routing.recalculateShipmentRouting(
      contextA,
      'shipping-routing-lifecycle-recalculate',
      replayInput,
    );
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(replay.result.shipmentId, shipmentA);
    assert.equal(replay.result.validationState, 'MATCHED');
    assert.equal(replay.result.zoneId, zoneA);
    assert.equal(replay.result.eligible, true);

    const catalogB = await routing.getCatalog(contextB);
    assert.equal(
      catalogB.locations.some((location) => location['id'] === cityA),
      false,
      'Tenant B must not see Tenant A canonical location',
    );
    assert.equal(
      catalogB.zones.some((zone) => zone['id'] === zoneA),
      false,
      'Tenant B must not see Tenant A shipping zone',
    );
    assert.equal(
      await routing.getShipmentRouting(contextB, shipmentA),
      undefined,
      'Tenant B must not resolve Tenant A shipment routing',
    );

    await assert.rejects(
      () =>
        routing.recalculateShipmentRouting(
          contextB,
          'shipping-routing-lifecycle-cross-tenant',
          replayInput,
        ),
      (error: unknown) => error instanceof ShippingRoutingInvariantError,
      'Cross-tenant routing recalculation must fail closed',
    );

    process.stdout.write('Shipping routing application lifecycle verified\n');
  } finally {
    await databaseService.onModuleDestroy();
  }
}

await main();
