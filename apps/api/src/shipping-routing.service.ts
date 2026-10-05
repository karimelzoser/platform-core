import { randomUUID } from 'node:crypto';
import {
  CommandExecutor,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import {
  sql,
  withTenantTransaction,
  type PlatformDatabase,
  type PlatformTransaction,
} from '@platform/database';
import { z } from 'zod';

const uuidSchema = z.string().uuid();
const metadataSchema = z.record(z.unknown()).default({});
const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/u);
const locationLevelSchema = z.enum(['COUNTRY', 'REGION', 'CITY', 'DISTRICT']);

const createLocationSchema = z
  .object({
    parentId: uuidSchema.optional(),
    level: locationLevelSchema,
    countryCode: countryCodeSchema,
    code: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(300),
    aliases: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
    metadata: metadataSchema,
  })
  .superRefine((input, context) => {
    if (input.level === 'COUNTRY' && input.parentId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentId'],
        message: 'COUNTRY locations cannot have a parent',
      });
    }
    if (input.level !== 'COUNTRY' && !input.parentId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentId'],
        message: `${input.level} locations require a parent`,
      });
    }
    if (input.level === 'COUNTRY' && input.code.toUpperCase() !== input.countryCode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['code'],
        message: 'COUNTRY location code must equal countryCode',
      });
    }
  });
export type CreateShippingLocationInput = z.input<typeof createLocationSchema>;

const createZoneSchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(300),
  priority: z.number().int().min(0).max(1_000_000).default(100),
  metadata: metadataSchema,
});
export type CreateShippingZoneInput = z.input<typeof createZoneSchema>;

const assignZoneLocationSchema = z.object({
  zoneId: uuidSchema,
  locationId: uuidSchema,
  includeDescendants: z.boolean().default(true),
});
export type AssignShippingZoneLocationInput = z.input<typeof assignZoneLocationSchema>;

const upsertCarrierLocationMappingSchema = z.object({
  carrierAccountId: uuidSchema,
  locationId: uuidSchema,
  externalCode: z.string().trim().min(1).max(300),
  externalName: z.string().trim().min(1).max(500).optional(),
  metadata: metadataSchema,
});
export type UpsertCarrierLocationMappingInput = z.input<typeof upsertCarrierLocationMappingSchema>;

const setServiceZoneRuleSchema = z.object({
  carrierAccountId: uuidSchema,
  carrierServiceId: uuidSchema,
  zoneId: uuidSchema,
  eligibility: z.enum(['ALLOWED', 'BLOCKED']),
  metadata: metadataSchema,
});
export type SetShippingServiceZoneRuleInput = z.input<typeof setServiceZoneRuleSchema>;

const normalizedDestinationSchema = z.object({
  name: z.string().trim().min(1).max(300),
  company: z.string().trim().min(1).max(300).optional(),
  line1: z.string().trim().min(1).max(500),
  line2: z.string().trim().min(1).max(500).optional(),
  district: z.string().trim().min(1).max(300).optional(),
  city: z.string().trim().min(1).max(300),
  region: z.string().trim().min(1).max(300).optional(),
  postalCode: z.string().trim().min(1).max(100).optional(),
  countryCode: countryCodeSchema,
  phone: z.string().trim().min(1).max(64).optional(),
});

const reviewShipmentAddressSchema = z.object({
  storeId: uuidSchema,
  shipmentId: uuidSchema,
  normalizedDestination: normalizedDestinationSchema,
  validationState: z.enum(['MATCHED', 'MANUAL_REVIEW']).default('MATCHED'),
  confidence: z.number().min(0).max(1).default(1),
  countryLocationId: uuidSchema,
  regionLocationId: uuidSchema.optional(),
  cityLocationId: uuidSchema.optional(),
  districtLocationId: uuidSchema.optional(),
  zoneId: uuidSchema.optional(),
});
export type ReviewShippingAddressInput = z.input<typeof reviewShipmentAddressSchema>;

const recalculateShipmentRoutingSchema = z.object({
  storeId: uuidSchema,
  shipmentId: uuidSchema,
});
export type RecalculateShippingRoutingInput = z.input<typeof recalculateShipmentRoutingSchema>;

interface LocationRow {
  id: string;
  parent_id: string | null;
  level: 'COUNTRY' | 'REGION' | 'CITY' | 'DISTRICT';
  country_code: string;
  code: string;
  name: string;
  aliases: unknown;
  status: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface ZoneRow {
  id: string;
  code: string;
  name: string;
  priority: number;
  status: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface ServiceEligibilityRow {
  eligible: boolean;
  reason: string;
  resolved_zone_id: string | null;
}

interface ShipmentRoutingRow {
  id: string;
  store_id: string;
  carrier_account_id: string | null;
  carrier_service_id: string | null;
  destination: Record<string, unknown>;
  normalized_destination: Record<string, unknown>;
  address_validation_state: string;
  address_validation_confidence: string | number | null;
  address_validation_source: string;
  country_location_id: string | null;
  region_location_id: string | null;
  city_location_id: string | null;
  district_location_id: string | null;
  zone_id: string | null;
  terminal_reason_code: string | null;
  terminal_reason_text: string | null;
  terminal_at: Date | null;
}

export class ShippingRoutingInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ShippingRoutingInvariantError';
  }
}

export class ShippingRoutingService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async createLocation(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateShippingLocationInput,
    approvalId?: string,
  ): Promise<CommandResult<{ locationId: string }>> {
    const validated = createLocationSchema.parse(input);
    const locationId = randomUUID();

    return this.commands.execute(
      {
        action: 'shipping.routing.location.create',
        permission: 'shipping.shipments.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'shipping.location', id: locationId }),
        event: {
          type: 'shipping.location.created',
          data: () => ({
            locationId,
            level: validated.level,
            countryCode: validated.countryCode,
            code: validated.code,
          }),
          dedupeKey: () => `shipping:location:created:${locationId}`,
        },
        audit: {
          afterState: () => ({
            locationId,
            parentId: validated.parentId ?? null,
            level: validated.level,
            countryCode: validated.countryCode,
            code: validated.code,
            name: validated.name,
          }),
        },
        execute: async (transaction) => {
          if (validated.parentId) {
            const parent = await sql<{ level: string; country_code: string }>`
              select level, country_code
              from shipping.locations
              where tenant_id = ${context.tenantId}::uuid
                and id = ${validated.parentId}::uuid
                and status = 'ACTIVE'
            `.execute(transaction);
            const expectedParent: Record<string, string> = {
              REGION: 'COUNTRY',
              CITY: 'REGION',
              DISTRICT: 'CITY',
            };
            if (!parent.rows[0]) {
              throw new ShippingRoutingInvariantError('Active parent location was not found');
            }
            if (parent.rows[0].level !== expectedParent[validated.level]) {
              throw new ShippingRoutingInvariantError(
                `${validated.level} must be a child of ${expectedParent[validated.level] ?? 'none'}`,
              );
            }
            if (parent.rows[0].country_code !== validated.countryCode) {
              throw new ShippingRoutingInvariantError(
                'Location countryCode must match its parent location',
              );
            }
          }

          await sql`
            insert into shipping.locations (
              id, tenant_id, parent_id, level, country_code, code, name,
              aliases, metadata
            ) values (
              ${locationId}::uuid,
              ${context.tenantId}::uuid,
              ${validated.parentId ?? null}::uuid,
              ${validated.level},
              ${validated.countryCode},
              ${validated.code},
              ${validated.name},
              ${JSON.stringify(validated.aliases)}::jsonb,
              ${JSON.stringify(validated.metadata)}::jsonb
            )
          `.execute(transaction);
          await this.recalculateTenantShipments(
            transaction,
            context.tenantId,
            validated.countryCode,
          );
          return { locationId };
        },
      },
      {
        context,
        input: validated,
        idempotencyKey,
        ...(approvalId ? { approvalId } : {}),
      },
    );
  }

  public async createZone(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateShippingZoneInput,
    approvalId?: string,
  ): Promise<CommandResult<{ zoneId: string }>> {
    const validated = createZoneSchema.parse(input);
    const zoneId = randomUUID();

    return this.commands.execute(
      {
        action: 'shipping.routing.zone.create',
        permission: 'shipping.shipments.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'shipping.zone', id: zoneId }),
        event: {
          type: 'shipping.zone.created',
          data: () => ({ zoneId, code: validated.code }),
          dedupeKey: () => `shipping:zone:created:${zoneId}`,
        },
        audit: {
          afterState: () => ({
            zoneId,
            code: validated.code,
            name: validated.name,
            priority: validated.priority,
          }),
        },
        execute: async (transaction) => {
          await sql`
            insert into shipping.zones (
              id, tenant_id, code, name, priority, metadata
            ) values (
              ${zoneId}::uuid,
              ${context.tenantId}::uuid,
              ${validated.code},
              ${validated.name},
              ${validated.priority},
              ${JSON.stringify(validated.metadata)}::jsonb
            )
          `.execute(transaction);
          return { zoneId };
        },
      },
      {
        context,
        input: validated,
        idempotencyKey,
        ...(approvalId ? { approvalId } : {}),
      },
    );
  }

  public async assignZoneLocation(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: AssignShippingZoneLocationInput,
  ): Promise<CommandResult<{ zoneId: string; locationId: string }>> {
    const validated = assignZoneLocationSchema.parse(input);

    return this.commands.execute(
      {
        action: 'shipping.routing.zone_location.assign',
        permission: 'shipping.shipments.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'shipping.zone', id: validated.zoneId }),
        event: {
          type: 'shipping.zone.location_assigned',
          data: () => validated,
          dedupeKey: () => `shipping:zone-location:${validated.zoneId}:${validated.locationId}`,
        },
        audit: { afterState: () => validated },
        execute: async (transaction) => {
          const dependency = await sql<{ zone_ok: boolean; location_ok: boolean }>`
            select
              exists(
                select 1 from shipping.zones
                where tenant_id = ${context.tenantId}::uuid
                  and id = ${validated.zoneId}::uuid
                  and status = 'ACTIVE'
              ) as zone_ok,
              exists(
                select 1 from shipping.locations
                where tenant_id = ${context.tenantId}::uuid
                  and id = ${validated.locationId}::uuid
                  and status = 'ACTIVE'
              ) as location_ok
          `.execute(transaction);
          if (!dependency.rows[0]?.zone_ok || !dependency.rows[0]?.location_ok) {
            throw new ShippingRoutingInvariantError('Active zone and location are required');
          }

          await sql`
            insert into shipping.zone_locations (
              tenant_id, zone_id, location_id, include_descendants
            ) values (
              ${context.tenantId}::uuid,
              ${validated.zoneId}::uuid,
              ${validated.locationId}::uuid,
              ${validated.includeDescendants}
            )
            on conflict (tenant_id, zone_id, location_id) do update
            set include_descendants = excluded.include_descendants
          `.execute(transaction);
          await this.recalculateTenantShipments(transaction, context.tenantId, null);
          return { zoneId: validated.zoneId, locationId: validated.locationId };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async upsertCarrierLocationMapping(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: UpsertCarrierLocationMappingInput,
  ): Promise<CommandResult<{ mappingId: string }>> {
    const validated = upsertCarrierLocationMappingSchema.parse(input);
    const mappingId = randomUUID();

    return this.commands.execute(
      {
        action: 'shipping.routing.carrier_location.upsert',
        permission: 'shipping.shipments.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'shipping.carrier_account', id: validated.carrierAccountId }),
        event: {
          type: 'shipping.carrier_location_mapping.changed',
          data: (_input, result) => ({
            mappingId: result.mappingId,
            carrierAccountId: validated.carrierAccountId,
            locationId: validated.locationId,
          }),
          dedupeKey: (_input, result) =>
            `shipping:carrier-location-mapping:${result.mappingId}:${idempotencyKey.trim()}`,
        },
        audit: {
          afterState: (_input, result) => ({
            mappingId: result.mappingId,
            ...validated,
          }),
        },
        execute: async (transaction) => {
          const dependencies = await sql<{ account_ok: boolean; location_ok: boolean }>`
            select
              exists(
                select 1 from shipping.carrier_accounts
                where tenant_id = ${context.tenantId}::uuid
                  and id = ${validated.carrierAccountId}::uuid
                  and status = 'ACTIVE'
              ) as account_ok,
              exists(
                select 1 from shipping.locations
                where tenant_id = ${context.tenantId}::uuid
                  and id = ${validated.locationId}::uuid
                  and status = 'ACTIVE'
              ) as location_ok
          `.execute(transaction);
          if (!dependencies.rows[0]?.account_ok || !dependencies.rows[0]?.location_ok) {
            throw new ShippingRoutingInvariantError(
              'Active carrier account and location are required',
            );
          }

          const changed = await sql<{ id: string }>`
            insert into shipping.carrier_location_mappings (
              id, tenant_id, carrier_account_id, location_id,
              external_code, external_name, metadata
            ) values (
              ${mappingId}::uuid,
              ${context.tenantId}::uuid,
              ${validated.carrierAccountId}::uuid,
              ${validated.locationId}::uuid,
              ${validated.externalCode},
              ${validated.externalName ?? null},
              ${JSON.stringify(validated.metadata)}::jsonb
            )
            on conflict (tenant_id, carrier_account_id, location_id) do update
            set external_code = excluded.external_code,
                external_name = excluded.external_name,
                state = 'ACTIVE',
                metadata = excluded.metadata,
                updated_at = now()
            returning id
          `.execute(transaction);
          return { mappingId: changed.rows[0]?.id ?? mappingId };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async setServiceZoneRule(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: SetShippingServiceZoneRuleInput,
  ): Promise<CommandResult<{ carrierServiceId: string; zoneId: string; eligibility: string }>> {
    const validated = setServiceZoneRuleSchema.parse(input);

    return this.commands.execute(
      {
        action: 'shipping.routing.service_zone_rule.set',
        permission: 'shipping.shipments.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'shipping.carrier_service', id: validated.carrierServiceId }),
        event: {
          type: 'shipping.carrier_service.zone_rule_changed',
          data: () => ({
            carrierServiceId: validated.carrierServiceId,
            zoneId: validated.zoneId,
            eligibility: validated.eligibility,
          }),
          dedupeKey: () =>
            `shipping:service-zone-rule:${validated.carrierServiceId}:${validated.zoneId}:${idempotencyKey.trim()}`,
        },
        audit: { afterState: () => validated },
        execute: async (transaction) => {
          const dependencies = await sql<{ service_ok: boolean; zone_ok: boolean }>`
            select
              exists(
                select 1 from shipping.carrier_services
                where tenant_id = ${context.tenantId}::uuid
                  and carrier_account_id = ${validated.carrierAccountId}::uuid
                  and id = ${validated.carrierServiceId}::uuid
                  and status = 'ACTIVE'
              ) as service_ok,
              exists(
                select 1 from shipping.zones
                where tenant_id = ${context.tenantId}::uuid
                  and id = ${validated.zoneId}::uuid
                  and status = 'ACTIVE'
              ) as zone_ok
          `.execute(transaction);
          if (!dependencies.rows[0]?.service_ok || !dependencies.rows[0]?.zone_ok) {
            throw new ShippingRoutingInvariantError('Active carrier service and zone are required');
          }

          await sql`
            insert into shipping.carrier_service_zone_rules (
              tenant_id, carrier_account_id, carrier_service_id, zone_id,
              eligibility, metadata
            ) values (
              ${context.tenantId}::uuid,
              ${validated.carrierAccountId}::uuid,
              ${validated.carrierServiceId}::uuid,
              ${validated.zoneId}::uuid,
              ${validated.eligibility},
              ${JSON.stringify(validated.metadata)}::jsonb
            )
            on conflict (tenant_id, carrier_service_id, zone_id) do update
            set carrier_account_id = excluded.carrier_account_id,
                eligibility = excluded.eligibility,
                metadata = excluded.metadata,
                updated_at = now()
          `.execute(transaction);
          return {
            carrierServiceId: validated.carrierServiceId,
            zoneId: validated.zoneId,
            eligibility: validated.eligibility,
          };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async recalculateShipmentRouting(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: RecalculateShippingRoutingInput,
  ): Promise<
    CommandResult<{
      shipmentId: string;
      validationState: string;
      confidence: number | null;
      zoneId: string | null;
      eligible: boolean;
      eligibilityReason: string;
    }>
  > {
    const validated = recalculateShipmentRoutingSchema.parse(input);

    return this.commands.execute(
      {
        action: 'shipping.routing.shipment.recalculate',
        permission: 'shipping.shipments.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'shipping.shipment', id: validated.shipmentId }),
        event: {
          type: 'shipping.shipment.address_normalized',
          data: (_input, result) => result,
          dedupeKey: () =>
            `shipping:shipment:address-normalized:${validated.shipmentId}:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          await this.assertShipment(
            transaction,
            context.tenantId,
            validated.storeId,
            validated.shipmentId,
          );
          await sql`
            select shipping.refresh_shipment_routing(
              ${context.tenantId}::uuid,
              ${validated.shipmentId}::uuid
            )
          `.execute(transaction);
          const routing = await this.loadShipmentRouting(
            transaction,
            context.tenantId,
            validated.shipmentId,
          );
          const eligibility = await this.loadEligibility(
            transaction,
            context.tenantId,
            validated.shipmentId,
          );
          await this.appendTimeline(transaction, context, validated.storeId, validated.shipmentId, {
            validationState: routing.address_validation_state,
            confidence: toNumber(routing.address_validation_confidence),
            zoneId: routing.zone_id,
            eligible: eligibility.eligible,
            eligibilityReason: eligibility.reason,
          });
          return {
            shipmentId: validated.shipmentId,
            validationState: routing.address_validation_state,
            confidence: toNumber(routing.address_validation_confidence),
            zoneId: routing.zone_id,
            eligible: eligibility.eligible,
            eligibilityReason: eligibility.reason,
          };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async reviewShipmentAddress(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: ReviewShippingAddressInput,
    approvalId?: string,
  ): Promise<
    CommandResult<{
      shipmentId: string;
      validationState: string;
      zoneId: string | null;
      eligible: boolean;
      eligibilityReason: string;
    }>
  > {
    const validated = reviewShipmentAddressSchema.parse(input);

    return this.commands.execute(
      {
        action: 'shipping.routing.shipment.address_review',
        permission: 'shipping.shipments.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'shipping.shipment', id: validated.shipmentId }),
        event: {
          type: 'shipping.shipment.address_reviewed',
          data: (_input, result) => result,
          dedupeKey: () =>
            `shipping:shipment:address-reviewed:${validated.shipmentId}:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          await this.assertShipment(
            transaction,
            context.tenantId,
            validated.storeId,
            validated.shipmentId,
          );
          await this.assertReviewedHierarchy(transaction, context.tenantId, validated);

          await sql`
            update shipping.shipments
            set normalized_destination = ${JSON.stringify(validated.normalizedDestination)}::jsonb,
                address_validation_state = ${validated.validationState},
                address_validation_confidence = ${validated.confidence},
                address_validation_source = 'MANUAL',
                country_location_id = ${validated.countryLocationId}::uuid,
                region_location_id = ${validated.regionLocationId ?? null}::uuid,
                city_location_id = ${validated.cityLocationId ?? null}::uuid,
                district_location_id = ${validated.districtLocationId ?? null}::uuid,
                zone_id = ${validated.zoneId ?? null}::uuid,
                updated_at = now()
            where tenant_id = ${context.tenantId}::uuid
              and id = ${validated.shipmentId}::uuid
          `.execute(transaction);

          const eligibility = await this.loadEligibility(
            transaction,
            context.tenantId,
            validated.shipmentId,
          );
          await this.appendTimeline(transaction, context, validated.storeId, validated.shipmentId, {
            validationState: validated.validationState,
            confidence: validated.confidence,
            zoneId: validated.zoneId ?? null,
            eligible: eligibility.eligible,
            eligibilityReason: eligibility.reason,
            manual: true,
          });
          return {
            shipmentId: validated.shipmentId,
            validationState: validated.validationState,
            zoneId: validated.zoneId ?? null,
            eligible: eligibility.eligible,
            eligibilityReason: eligibility.reason,
          };
        },
      },
      {
        context,
        input: validated,
        idempotencyKey,
        ...(approvalId ? { approvalId } : {}),
      },
    );
  }

  public async getCatalog(context: TenantRequestContext): Promise<{
    locations: readonly Record<string, unknown>[];
    zones: readonly Record<string, unknown>[];
    zoneLocations: readonly Record<string, unknown>[];
    carrierMappings: readonly Record<string, unknown>[];
    serviceZoneRules: readonly Record<string, unknown>[];
  }> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const [locations, zones, memberships, mappings, rules] = await Promise.all([
        sql<LocationRow>`
          select id, parent_id, level, country_code, code, name, aliases,
                 status, metadata, created_at, updated_at
          from shipping.locations
          order by country_code, level, name, id
        `.execute(transaction),
        sql<ZoneRow>`
          select id, code, name, priority, status, metadata, created_at, updated_at
          from shipping.zones
          order by priority desc, name, id
        `.execute(transaction),
        sql<Record<string, unknown>>`
          select membership.zone_id, zone.code as zone_code, zone.name as zone_name,
                 membership.location_id, location.level as location_level,
                 location.code as location_code, location.name as location_name,
                 membership.include_descendants, membership.created_at
          from shipping.zone_locations as membership
          join shipping.zones as zone
            on zone.tenant_id = membership.tenant_id and zone.id = membership.zone_id
          join shipping.locations as location
            on location.tenant_id = membership.tenant_id and location.id = membership.location_id
          order by zone.priority desc, zone.name, location.level, location.name
        `.execute(transaction),
        sql<Record<string, unknown>>`
          select mapping.id, mapping.carrier_account_id, account.display_name as carrier_name,
                 mapping.location_id, location.level as location_level,
                 location.name as location_name, mapping.external_code,
                 mapping.external_name, mapping.state, mapping.metadata,
                 mapping.created_at, mapping.updated_at
          from shipping.carrier_location_mappings as mapping
          join shipping.carrier_accounts as account
            on account.tenant_id = mapping.tenant_id
           and account.id = mapping.carrier_account_id
          join shipping.locations as location
            on location.tenant_id = mapping.tenant_id
           and location.id = mapping.location_id
          order by account.display_name, location.level, location.name
        `.execute(transaction),
        sql<Record<string, unknown>>`
          select rule.carrier_account_id, account.display_name as carrier_name,
                 rule.carrier_service_id, service.name as service_name,
                 rule.zone_id, zone.name as zone_name, rule.eligibility,
                 rule.metadata, rule.created_at, rule.updated_at
          from shipping.carrier_service_zone_rules as rule
          join shipping.carrier_accounts as account
            on account.tenant_id = rule.tenant_id
           and account.id = rule.carrier_account_id
          join shipping.carrier_services as service
            on service.tenant_id = rule.tenant_id
           and service.id = rule.carrier_service_id
          join shipping.zones as zone
            on zone.tenant_id = rule.tenant_id
           and zone.id = rule.zone_id
          order by account.display_name, service.name, zone.name
        `.execute(transaction),
      ]);

      return {
        locations: locations.rows.map((row) => ({
          id: row.id,
          parentId: row.parent_id,
          level: row.level,
          countryCode: row.country_code,
          code: row.code,
          name: row.name,
          aliases: row.aliases,
          status: row.status,
          metadata: row.metadata,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        zones: zones.rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          priority: row.priority,
          status: row.status,
          metadata: row.metadata,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        zoneLocations: memberships.rows,
        carrierMappings: mappings.rows,
        serviceZoneRules: rules.rows,
      };
    });
  }

  public async getShipmentRouting(
    context: TenantRequestContext,
    shipmentId: string,
  ): Promise<
    | {
        shipment: Record<string, unknown>;
        eligibility: { eligible: boolean; reason: string; zoneId: string | null };
        labels: readonly Record<string, unknown>[];
        locationPath: readonly Record<string, unknown>[];
      }
    | undefined
  > {
    const id = uuidSchema.parse(shipmentId);
    return withTenantTransaction(this.database, context, async (transaction) => {
      const row = await sql<ShipmentRoutingRow>`
        select id, store_id, carrier_account_id, carrier_service_id, destination,
               normalized_destination, address_validation_state,
               address_validation_confidence, address_validation_source,
               country_location_id, region_location_id, city_location_id,
               district_location_id, zone_id, terminal_reason_code,
               terminal_reason_text, terminal_at
        from shipping.shipments
        where id = ${id}::uuid
      `.execute(transaction);
      const shipment = row.rows[0];
      if (!shipment) return undefined;

      const eligibility = await this.loadEligibility(transaction, context.tenantId, id);
      const labels = await sql<Record<string, unknown>>`
        select id, provider_action_id, package_id, state,
               provider_label_reference, label_format, tracking_number,
               tracking_url, external_shipment_id, error_code,
               created_at, completed_at, updated_at
        from shipping.labels
        where shipment_id = ${id}::uuid
        order by created_at desc, id desc
      `.execute(transaction);
      const path = await sql<Record<string, unknown>>`
        select id, parent_id, level, country_code, code, name
        from shipping.locations
        where id = any(
          array[
            ${shipment.country_location_id}::uuid,
            ${shipment.region_location_id}::uuid,
            ${shipment.city_location_id}::uuid,
            ${shipment.district_location_id}::uuid
          ]
        )
        order by case level
          when 'COUNTRY' then 1 when 'REGION' then 2
          when 'CITY' then 3 else 4 end
      `.execute(transaction);

      return {
        shipment: {
          id: shipment.id,
          storeId: shipment.store_id,
          carrierAccountId: shipment.carrier_account_id,
          carrierServiceId: shipment.carrier_service_id,
          rawDestination: shipment.destination,
          normalizedDestination: shipment.normalized_destination,
          validationState: shipment.address_validation_state,
          validationConfidence: toNumber(shipment.address_validation_confidence),
          validationSource: shipment.address_validation_source,
          countryLocationId: shipment.country_location_id,
          regionLocationId: shipment.region_location_id,
          cityLocationId: shipment.city_location_id,
          districtLocationId: shipment.district_location_id,
          zoneId: shipment.zone_id,
          terminalReasonCode: shipment.terminal_reason_code,
          terminalReasonText: shipment.terminal_reason_text,
          terminalAt: shipment.terminal_at,
        },
        eligibility: {
          eligible: eligibility.eligible,
          reason: eligibility.reason,
          zoneId: eligibility.resolved_zone_id,
        },
        labels: labels.rows,
        locationPath: path.rows,
      };
    });
  }

  private async assertShipment(
    transaction: PlatformTransaction,
    tenantId: string,
    storeId: string,
    shipmentId: string,
  ): Promise<void> {
    const shipment = await sql<{ id: string }>`
      select id
      from shipping.shipments
      where tenant_id = ${tenantId}::uuid
        and store_id = ${storeId}::uuid
        and id = ${shipmentId}::uuid
      for update
    `.execute(transaction);
    if (!shipment.rows[0]) {
      throw new ShippingRoutingInvariantError('Shipment was not found');
    }
  }

  private async loadShipmentRouting(
    transaction: PlatformTransaction,
    tenantId: string,
    shipmentId: string,
  ): Promise<ShipmentRoutingRow> {
    const result = await sql<ShipmentRoutingRow>`
      select id, store_id, carrier_account_id, carrier_service_id, destination,
             normalized_destination, address_validation_state,
             address_validation_confidence, address_validation_source,
             country_location_id, region_location_id, city_location_id,
             district_location_id, zone_id, terminal_reason_code,
             terminal_reason_text, terminal_at
      from shipping.shipments
      where tenant_id = ${tenantId}::uuid
        and id = ${shipmentId}::uuid
      for update
    `.execute(transaction);
    if (!result.rows[0]) {
      throw new ShippingRoutingInvariantError('Shipment was not found');
    }
    return result.rows[0];
  }

  private async loadEligibility(
    transaction: PlatformTransaction,
    tenantId: string,
    shipmentId: string,
  ): Promise<ServiceEligibilityRow> {
    const result = await sql<ServiceEligibilityRow>`
      select eligible, reason, resolved_zone_id
      from shipping.shipment_service_eligibility(
        ${tenantId}::uuid,
        ${shipmentId}::uuid
      )
    `.execute(transaction);
    return (
      result.rows[0] ?? {
        eligible: false,
        reason: 'ELIGIBILITY_UNAVAILABLE',
        resolved_zone_id: null,
      }
    );
  }

  private async assertReviewedHierarchy(
    transaction: PlatformTransaction,
    tenantId: string,
    input: z.output<typeof reviewShipmentAddressSchema>,
  ): Promise<void> {
    const ids = [
      input.countryLocationId,
      input.regionLocationId,
      input.cityLocationId,
      input.districtLocationId,
    ].filter((value): value is string => Boolean(value));
    const rows = await sql<{
      id: string;
      parent_id: string | null;
      level: string;
      country_code: string;
    }>`
      select id, parent_id, level, country_code
      from shipping.locations
      where tenant_id = ${tenantId}::uuid
        and id = any(${ids}::uuid[])
        and status = 'ACTIVE'
    `.execute(transaction);
    if (rows.rows.length !== ids.length) {
      throw new ShippingRoutingInvariantError('Reviewed address contains an invalid location');
    }
    const byId = new Map(rows.rows.map((row) => [row.id, row]));
    const country = byId.get(input.countryLocationId);
    if (!country || country.level !== 'COUNTRY') {
      throw new ShippingRoutingInvariantError('countryLocationId must reference a COUNTRY');
    }
    if (country.country_code !== input.normalizedDestination.countryCode) {
      throw new ShippingRoutingInvariantError(
        'Reviewed destination countryCode must match countryLocationId',
      );
    }
    assertChild(byId, input.regionLocationId, input.countryLocationId, 'REGION');
    assertChild(byId, input.cityLocationId, input.regionLocationId, 'CITY');
    assertChild(byId, input.districtLocationId, input.cityLocationId, 'DISTRICT');

    if (input.zoneId) {
      const zone = await sql<{ id: string }>`
        select id
        from shipping.zones
        where tenant_id = ${tenantId}::uuid
          and id = ${input.zoneId}::uuid
          and status = 'ACTIVE'
      `.execute(transaction);
      if (!zone.rows[0]) {
        throw new ShippingRoutingInvariantError('Reviewed address zone is not active');
      }
    }
  }

  private async recalculateTenantShipments(
    transaction: PlatformTransaction,
    tenantId: string,
    countryCode: string | null,
  ): Promise<void> {
    const shipments = await sql<{ id: string }>`
      select id
      from shipping.shipments
      where tenant_id = ${tenantId}::uuid
        and (
          ${countryCode}::text is null
          or upper(destination->>'countryCode') = ${countryCode}
        )
      order by updated_at desc
      limit 1000
    `.execute(transaction);
    for (const shipment of shipments.rows) {
      await sql`
        select shipping.refresh_shipment_routing(
          ${tenantId}::uuid,
          ${shipment.id}::uuid
        )
      `.execute(transaction);
    }
  }

  private async appendTimeline(
    transaction: PlatformTransaction,
    context: TenantRequestContext,
    storeId: string,
    shipmentId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await sql`
      insert into shipping.shipment_timeline (
        tenant_id, store_id, shipment_id, event_type, actor_type, actor_id, data
      ) values (
        ${context.tenantId}::uuid,
        ${storeId}::uuid,
        ${shipmentId}::uuid,
        'shipping.shipment.address_normalized',
        ${context.actorType},
        ${context.actorId ?? null}::uuid,
        ${JSON.stringify(data)}::jsonb
      )
    `.execute(transaction);
  }
}

function assertChild(
  byId: Map<string, { id: string; parent_id: string | null; level: string }>,
  childId: string | undefined,
  parentId: string | undefined,
  expectedLevel: string,
): void {
  if (!childId) return;
  if (!parentId) {
    throw new ShippingRoutingInvariantError(`${expectedLevel} requires its canonical parent`);
  }
  const child = byId.get(childId);
  if (!child || child.level !== expectedLevel || child.parent_id !== parentId) {
    throw new ShippingRoutingInvariantError(
      `${expectedLevel} does not belong to the reviewed canonical hierarchy`,
    );
  }
}

function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
