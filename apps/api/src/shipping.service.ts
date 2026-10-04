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
const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/u);

const destinationSchema = z.object({
  name: z.string().trim().min(1).max(300),
  company: z.string().trim().min(1).max(300).optional(),
  line1: z.string().trim().min(1).max(500),
  line2: z.string().trim().min(1).max(500).optional(),
  city: z.string().trim().min(1).max(300),
  region: z.string().trim().min(1).max(300).optional(),
  postalCode: z.string().trim().min(1).max(100).optional(),
  countryCode: countryCodeSchema,
  phone: z.string().trim().min(1).max(64).optional(),
});
export type ShippingDestination = z.infer<typeof destinationSchema>;

const createCarrierAccountSchema = z.object({
  connectionId: uuidSchema.optional(),
  carrierKey: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_.-]{1,99}$/u),
  accountLabel: z.string().trim().min(1).max(300),
  displayName: z.string().trim().min(1).max(300),
  metadata: metadataSchema,
});
export type CreateCarrierAccountInput = z.input<typeof createCarrierAccountSchema>;

const createCarrierServiceSchema = z.object({
  carrierAccountId: uuidSchema,
  serviceCode: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(300),
  domestic: z.boolean().default(true),
  international: z.boolean().default(false),
  metadata: metadataSchema,
});
export type CreateCarrierServiceInput = z.input<typeof createCarrierServiceSchema>;

const packageSchema = z.object({
  weightGrams: z.number().int().min(0).max(100_000_000).optional(),
  lengthMm: z.number().int().min(0).max(100_000).optional(),
  widthMm: z.number().int().min(0).max(100_000).optional(),
  heightMm: z.number().int().min(0).max(100_000).optional(),
  metadata: metadataSchema,
});

const createShipmentSchema = z
  .object({
    storeId: uuidSchema,
    orderId: uuidSchema,
    fulfillmentId: uuidSchema,
    carrierAccountId: uuidSchema.optional(),
    carrierServiceId: uuidSchema.optional(),
    destination: destinationSchema,
    declaredValueMinor: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    declaredValueCurrency: currencySchema.optional(),
    estimatedDeliveryAt: z.string().datetime().optional(),
    metadata: metadataSchema,
    lines: z
      .array(
        z.object({
          orderLineId: uuidSchema,
          quantity: z.number().int().min(1).max(1_000_000),
        }),
      )
      .min(1)
      .max(500),
    packages: z.array(packageSchema).min(1).max(50).default([{}]),
  })
  .superRefine((input, context) => {
    if (
      Boolean(input.declaredValueMinor === undefined) !==
      Boolean(input.declaredValueCurrency === undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['declaredValueMinor'],
        message:
          'declaredValueMinor and declaredValueCurrency must be provided together',
      });
    }
    if (input.carrierServiceId && !input.carrierAccountId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['carrierAccountId'],
        message: 'carrierAccountId is required when carrierServiceId is provided',
      });
    }
  });
export type CreateShipmentInput = z.input<typeof createShipmentSchema>;

const trackingEventTypeSchema = z.enum([
  'LABEL_CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'ARRIVED_AT_FACILITY',
  'DEPARTED_FACILITY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'EXCEPTION',
  'RETURN_TO_SENDER',
  'RETURNED',
  'CANCELLED',
]);
const normalizedShippingStatusSchema = z.enum([
  'LABEL_CREATED',
  'HANDED_OVER',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
  'RETURN_TO_SENDER',
  'RETURNED',
  'CANCELLED',
]);
const recordTrackingEventSchema = z.object({
  storeId: uuidSchema,
  shipmentId: uuidSchema,
  packageId: uuidSchema.optional(),
  eventType: trackingEventTypeSchema,
  normalizedStatus: normalizedShippingStatusSchema,
  rawCode: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().min(1).max(4_000).optional(),
  locationName: z.string().trim().min(1).max(500).optional(),
  countryCode: countryCodeSchema.optional(),
  occurredAt: z.string().datetime(),
  sourceType: z
    .enum(['USER', 'SYSTEM', 'SERVICE', 'INTEGRATION'])
    .default('INTEGRATION'),
  externalEventId: z.string().trim().min(1).max(500).optional(),
  dedupeKey: z.string().trim().min(1).max(300),
  data: metadataSchema,
});
export type RecordTrackingEventInput = z.input<typeof recordTrackingEventSchema>;

const rescueStateSchema = z.enum([
  'OPEN',
  'CONTACT_REQUIRED',
  'CONTACTED',
  'ADDRESS_UPDATE_REQUIRED',
  'RESCHEDULED',
  'READY_TO_RETRY',
  'RESOLVED',
  'CANCELLED',
]);
const rescueReasonSchema = z.enum([
  'DELIVERY_FAILED',
  'ADDRESS_ISSUE',
  'CUSTOMER_UNREACHABLE',
  'CARRIER_EXCEPTION',
  'RETURN_RISK',
  'OTHER',
]);
const rescuePrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const openRescueCaseSchema = z.object({
  storeId: uuidSchema,
  shipmentId: uuidSchema,
  state: rescueStateSchema.default('OPEN'),
  triggerReason: rescueReasonSchema,
  priority: rescuePrioritySchema.default('MEDIUM'),
  assignedActorId: uuidSchema.optional(),
  summary: z.string().trim().min(1).max(1_000),
  dueAt: z.string().datetime().optional(),
  metadata: metadataSchema,
});
export type OpenRescueCaseInput = z.input<typeof openRescueCaseSchema>;

const updateRescueCaseSchema = z.object({
  storeId: uuidSchema,
  rescueCaseId: uuidSchema,
  state: rescueStateSchema,
  priority: rescuePrioritySchema.optional(),
  assignedActorId: uuidSchema.nullable().optional(),
  summary: z.string().trim().min(1).max(1_000).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});
export type UpdateRescueCaseInput = z.input<typeof updateRescueCaseSchema>;

const providerOperationSchema = z.enum([
  'CREATE_LABEL',
  'REQUEST_PICKUP',
  'CANCEL_SHIPMENT',
  'RESCHEDULE_DELIVERY',
  'UPDATE_DELIVERY_ADDRESS',
]);
const queueProviderActionSchema = z
  .object({
    storeId: uuidSchema,
    shipmentId: uuidSchema,
    operation: providerOperationSchema,
    reason: z.string().trim().min(1).max(4_000).optional(),
    scheduledAt: z.string().datetime().optional(),
    destination: destinationSchema.optional(),
  })
  .superRefine((input, context) => {
    if (input.operation === 'CANCEL_SHIPMENT' && !input.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'reason is required',
      });
    }
    if (input.operation === 'RESCHEDULE_DELIVERY' && !input.scheduledAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledAt'],
        message: 'scheduledAt is required',
      });
    }
    if (input.operation === 'UPDATE_DELIVERY_ADDRESS' && !input.destination) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['destination'],
        message: 'destination is required',
      });
    }
  });
export type QueueShippingProviderActionInput = z.input<
  typeof queueProviderActionSchema
>;

export class ShippingInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ShippingInvariantError';
  }
}

interface ShipmentStateRow {
  id: string;
  store_id: string;
  order_id: string;
  fulfillment_id: string;
  carrier_account_id: string | null;
  carrier_service_id: string | null;
  status: string;
  tracking_number: string | null;
  provider_sync_state: string;
  last_tracking_at: Date | null;
}

export interface ShippingShipmentListItem {
  id: string;
  storeId: string;
  orderId: string;
  fulfillmentId: string;
  carrierAccountId: string | null;
  carrierServiceId: string | null;
  status: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  estimatedDeliveryAt: Date | null;
  providerSyncState: string;
  updatedAt: Date;
}

export class ShippingService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async createCarrierAccount(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateCarrierAccountInput,
    approvalId?: string,
  ): Promise<CommandResult<{ carrierAccountId: string }>> {
    const validated = createCarrierAccountSchema.parse(input);
    const carrierAccountId = randomUUID();

    return this.commands.execute(
      {
        action: 'shipping.carrier_account.create',
        permission: 'shipping.shipments.manage',
        risk: 'MEDIUM',
        resource: () => ({
          type: 'shipping.carrier_account',
          id: carrierAccountId,
        }),
        event: {
          type: 'shipping.carrier_account.created',
          data: () => ({
            carrierAccountId,
            carrierKey: validated.carrierKey,
          }),
          dedupeKey: () =>
            `shipping:carrier-account:created:${carrierAccountId}`,
        },
        audit: {
          afterState: () => ({
            carrierAccountId,
            carrierKey: validated.carrierKey,
            accountLabel: validated.accountLabel,
            connectionId: validated.connectionId ?? null,
          }),
        },
        execute: async (transaction) => {
          if (validated.connectionId) {
            const connection = await sql<{ id: string }>`
              select id
              from integrations.connections
              where tenant_id = ${context.tenantId}::uuid
                and id = ${validated.connectionId}::uuid
                and status in ('CONNECTED', 'DEGRADED')
            `.execute(transaction);
            if (!connection.rows[0]) {
              throw new ShippingInvariantError(
                'Carrier connection is not dispatchable',
              );
            }
          }

          await sql`
            insert into shipping.carrier_accounts (
              id, tenant_id, connection_id, carrier_key, account_label,
              display_name, metadata
            ) values (
              ${carrierAccountId}::uuid,
              ${context.tenantId}::uuid,
              ${validated.connectionId ?? null}::uuid,
              ${validated.carrierKey},
              ${validated.accountLabel},
              ${validated.displayName},
              ${JSON.stringify(validated.metadata)}::jsonb
            )
          `.execute(transaction);
          return { carrierAccountId };
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

  public async createCarrierService(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateCarrierServiceInput,
    approvalId?: string,
  ): Promise<CommandResult<{ carrierServiceId: string }>> {
    const validated = createCarrierServiceSchema.parse(input);
    const carrierServiceId = randomUUID();

    return this.commands.execute(
      {
        action: 'shipping.carrier_service.create',
        permission: 'shipping.shipments.manage',
        risk: 'MEDIUM',
        resource: () => ({
          type: 'shipping.carrier_account',
          id: validated.carrierAccountId,
        }),
        event: {
          type: 'shipping.carrier_service.created',
          data: () => ({
            carrierAccountId: validated.carrierAccountId,
            carrierServiceId,
            serviceCode: validated.serviceCode,
          }),
          dedupeKey: () =>
            `shipping:carrier-service:created:${carrierServiceId}`,
        },
        audit: {
          afterState: () => ({
            carrierAccountId: validated.carrierAccountId,
            carrierServiceId,
            serviceCode: validated.serviceCode,
          }),
        },
        execute: async (transaction) => {
          const account = await sql<{ id: string }>`
            select id
            from shipping.carrier_accounts
            where tenant_id = ${context.tenantId}::uuid
              and id = ${validated.carrierAccountId}::uuid
              and status = 'ACTIVE'
          `.execute(transaction);
          if (!account.rows[0]) {
            throw new ShippingInvariantError(
              'Active carrier account was not found',
            );
          }

          await sql`
            insert into shipping.carrier_services (
              id, tenant_id, carrier_account_id, service_code, name,
              domestic, international, metadata
            ) values (
              ${carrierServiceId}::uuid,
              ${context.tenantId}::uuid,
              ${validated.carrierAccountId}::uuid,
              ${validated.serviceCode},
              ${validated.name},
              ${validated.domestic},
              ${validated.international},
              ${JSON.stringify(validated.metadata)}::jsonb
            )
          `.execute(transaction);
          return { carrierServiceId };
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

  public async createShipment(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateShipmentInput,
    approvalId?: string,
  ): Promise<
    CommandResult<{ shipmentId: string; packageIds: readonly string[] }>
  > {
    const validated = createShipmentSchema.parse(input);
    const shipmentId = randomUUID();
    const packages = validated.packages.map((item, index) => ({
      ...item,
      id: randomUUID(),
      sequence: index + 1,
    }));

    return this.commands.execute(
      {
        action: 'shipping.shipment.create',
        permission: 'shipping.shipments.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'shipping.shipment', id: shipmentId }),
        event: {
          type: 'shipping.shipment.created',
          data: () => ({
            shipmentId,
            orderId: validated.orderId,
            fulfillmentId: validated.fulfillmentId,
          }),
          dedupeKey: () => `shipping:shipment:created:${shipmentId}`,
        },
        audit: {
          afterState: () => ({
            shipmentId,
            orderId: validated.orderId,
            fulfillmentId: validated.fulfillmentId,
            status: 'READY',
            packageCount: packages.length,
          }),
        },
        execute: async (transaction) => {
          const fulfillment = await sql<{ status: string }>`
            select status
            from commerce.fulfillments
            where tenant_id = ${context.tenantId}::uuid
              and store_id = ${validated.storeId}::uuid
              and order_id = ${validated.orderId}::uuid
              and id = ${validated.fulfillmentId}::uuid
            for share
          `.execute(transaction);
          if (!fulfillment.rows[0]) {
            throw new ShippingInvariantError(
              'Fulfillment was not found for this order',
            );
          }
          if (['CANCELLED', 'FAILED'].includes(fulfillment.rows[0].status)) {
            throw new ShippingInvariantError(
              'Cancelled or failed fulfillments cannot be shipped',
            );
          }

          if (validated.carrierAccountId) {
            const carrier = await sql<{ service_ok: boolean }>`
              select (
                ${validated.carrierServiceId ?? null}::uuid is null
                or exists (
                  select 1
                  from shipping.carrier_services as service
                  where service.tenant_id = account.tenant_id
                    and service.carrier_account_id = account.id
                    and service.id = ${validated.carrierServiceId ?? null}::uuid
                    and service.status = 'ACTIVE'
                )
              ) as service_ok
              from shipping.carrier_accounts as account
              where account.tenant_id = ${context.tenantId}::uuid
                and account.id = ${validated.carrierAccountId}::uuid
                and account.status = 'ACTIVE'
            `.execute(transaction);
            if (!carrier.rows[0]) {
              throw new ShippingInvariantError(
                'Active carrier account was not found',
              );
            }
            if (!carrier.rows[0].service_ok) {
              throw new ShippingInvariantError(
                'Active carrier service was not found on this account',
              );
            }
          }

          for (const line of validated.lines) {
            const available = await sql<{ quantity: number }>`
              select quantity
              from commerce.fulfillment_lines
              where tenant_id = ${context.tenantId}::uuid
                and store_id = ${validated.storeId}::uuid
                and fulfillment_id = ${validated.fulfillmentId}::uuid
                and order_id = ${validated.orderId}::uuid
                and order_line_id = ${line.orderLineId}::uuid
            `.execute(transaction);
            if (!available.rows[0]) {
              throw new ShippingInvariantError(
                'Shipment line is not part of this fulfillment',
              );
            }
            if (line.quantity > available.rows[0].quantity) {
              throw new ShippingInvariantError(
                'Shipment quantity exceeds fulfillment quantity',
              );
            }
          }

          await sql`
            insert into shipping.shipments (
              id, tenant_id, store_id, order_id, fulfillment_id,
              carrier_account_id, carrier_service_id, status, destination,
              declared_value_minor, declared_value_currency,
              estimated_delivery_at, metadata
            ) values (
              ${shipmentId}::uuid,
              ${context.tenantId}::uuid,
              ${validated.storeId}::uuid,
              ${validated.orderId}::uuid,
              ${validated.fulfillmentId}::uuid,
              ${validated.carrierAccountId ?? null}::uuid,
              ${validated.carrierServiceId ?? null}::uuid,
              'READY',
              ${JSON.stringify(validated.destination)}::jsonb,
              ${validated.declaredValueMinor ?? null},
              ${validated.declaredValueCurrency ?? null},
              ${validated.estimatedDeliveryAt ?? null}::timestamptz,
              ${JSON.stringify(validated.metadata)}::jsonb
            )
          `.execute(transaction);

          for (const line of validated.lines) {
            await sql`
              insert into shipping.shipment_lines (
                tenant_id, store_id, shipment_id, fulfillment_id,
                order_line_id, quantity
              ) values (
                ${context.tenantId}::uuid,
                ${validated.storeId}::uuid,
                ${shipmentId}::uuid,
                ${validated.fulfillmentId}::uuid,
                ${line.orderLineId}::uuid,
                ${line.quantity}
              )
            `.execute(transaction);
          }

          for (const item of packages) {
            await sql`
              insert into shipping.packages (
                id, tenant_id, store_id, shipment_id, sequence, status,
                weight_grams, length_mm, width_mm, height_mm, metadata
              ) values (
                ${item.id}::uuid,
                ${context.tenantId}::uuid,
                ${validated.storeId}::uuid,
                ${shipmentId}::uuid,
                ${item.sequence},
                'READY',
                ${item.weightGrams ?? null},
                ${item.lengthMm ?? null},
                ${item.widthMm ?? null},
                ${item.heightMm ?? null},
                ${JSON.stringify(item.metadata)}::jsonb
              )
            `.execute(transaction);
          }

          await this.appendTimeline(
            transaction,
            context,
            validated.storeId,
            shipmentId,
            'shipping.shipment.created',
            {
              orderId: validated.orderId,
              fulfillmentId: validated.fulfillmentId,
              packageCount: packages.length,
            },
          );
          return {
            shipmentId,
            packageIds: packages.map((item) => item.id),
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

  public async recordTrackingEvent(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: RecordTrackingEventInput,
  ): Promise<
    CommandResult<{
      trackingEventId: string;
      duplicate: boolean;
      rescueCaseId: string | null;
    }>
  > {
    const validated = recordTrackingEventSchema.parse(input);
    const trackingEventId = randomUUID();

    return this.commands.execute(
      {
        action: 'shipping.tracking.record',
        permission: 'shipping.tracking.record',
        risk: 'MEDIUM',
        resource: () => ({
          type: 'shipping.shipment',
          id: validated.shipmentId,
        }),
        event: {
          type: 'shipping.tracking.recorded',
          data: (_input, result) => ({
            shipmentId: validated.shipmentId,
            trackingEventId: result.trackingEventId,
            normalizedStatus: validated.normalizedStatus,
            duplicate: result.duplicate,
          }),
          dedupeKey: (_input, result) =>
            `shipping:tracking:${validated.shipmentId}:${result.trackingEventId}`,
        },
        audit: {
          afterState: (_input, result) => ({
            shipmentId: validated.shipmentId,
            trackingEventId: result.trackingEventId,
            normalizedStatus: validated.normalizedStatus,
            duplicate: result.duplicate,
            rescueCaseId: result.rescueCaseId,
          }),
        },
        execute: async (transaction) => {
          const shipment = await this.loadShipmentForUpdate(
            transaction,
            context.tenantId,
            validated.storeId,
            validated.shipmentId,
          );

          let packageStatus: string | undefined;
          if (validated.packageId) {
            const packageRow = await sql<{ status: string }>`
              select status
              from shipping.packages
              where tenant_id = ${context.tenantId}::uuid
                and store_id = ${validated.storeId}::uuid
                and shipment_id = ${validated.shipmentId}::uuid
                and id = ${validated.packageId}::uuid
              for update
            `.execute(transaction);
            packageStatus = packageRow.rows[0]?.status;
            if (!packageStatus) {
              throw new ShippingInvariantError(
                'Package was not found on this shipment',
              );
            }
          }

          const inserted = await sql<{ id: string }>`
            insert into shipping.tracking_events (
              id, tenant_id, store_id, shipment_id, package_id, event_type,
              normalized_status, raw_code, description, location_name,
              country_code, occurred_at, source_type, external_event_id,
              dedupe_key, data
            ) values (
              ${trackingEventId}::uuid,
              ${context.tenantId}::uuid,
              ${validated.storeId}::uuid,
              ${validated.shipmentId}::uuid,
              ${validated.packageId ?? null}::uuid,
              ${validated.eventType},
              ${validated.normalizedStatus},
              ${validated.rawCode ?? null},
              ${validated.description ?? null},
              ${validated.locationName ?? null},
              ${validated.countryCode ?? null},
              ${validated.occurredAt}::timestamptz,
              ${validated.sourceType},
              ${validated.externalEventId ?? null},
              ${validated.dedupeKey},
              ${JSON.stringify(validated.data)}::jsonb
            )
            on conflict (tenant_id, shipment_id, dedupe_key) do nothing
            returning id
          `.execute(transaction);

          if (!inserted.rows[0]) {
            const existing = await sql<{ id: string }>`
              select id
              from shipping.tracking_events
              where tenant_id = ${context.tenantId}::uuid
                and shipment_id = ${validated.shipmentId}::uuid
                and dedupe_key = ${validated.dedupeKey}
            `.execute(transaction);
            return {
              trackingEventId: existing.rows[0]?.id ?? trackingEventId,
              duplicate: true,
              rescueCaseId: null,
            };
          }

          const occurredAt = new Date(validated.occurredAt);
          const isNewest =
            !shipment.last_tracking_at ||
            occurredAt >= shipment.last_tracking_at;
          const shouldAdvanceShipment =
            isNewest &&
            canAdvanceShippingStatus(
              shipment.status,
              validated.normalizedStatus,
            );

          if (shouldAdvanceShipment) {
            const deliveredAt =
              validated.normalizedStatus === 'DELIVERED'
                ? validated.occurredAt
                : null;
            const shippedAt =
              [
                'HANDED_OVER',
                'IN_TRANSIT',
                'OUT_FOR_DELIVERY',
                'DELIVERED',
              ].includes(validated.normalizedStatus) &&
              shipment.status === 'LABEL_CREATED'
                ? validated.occurredAt
                : null;

            await sql`
              update shipping.shipments
              set status = ${validated.normalizedStatus},
                  last_tracking_at = ${validated.occurredAt}::timestamptz,
                  delivered_at = coalesce(
                    delivered_at,
                    ${deliveredAt}::timestamptz
                  ),
                  shipped_at = coalesce(shipped_at, ${shippedAt}::timestamptz),
                  updated_at = now()
              where tenant_id = ${context.tenantId}::uuid
                and id = ${validated.shipmentId}::uuid
            `.execute(transaction);
          } else if (isNewest) {
            await sql`
              update shipping.shipments
              set last_tracking_at = ${validated.occurredAt}::timestamptz,
                  updated_at = now()
              where tenant_id = ${context.tenantId}::uuid
                and id = ${validated.shipmentId}::uuid
            `.execute(transaction);
          }

          if (
            validated.packageId &&
            packageStatus &&
            canAdvanceShippingStatus(
              packageStatus,
              validated.normalizedStatus,
            )
          ) {
            await sql`
              update shipping.packages
              set status = ${validated.normalizedStatus}, updated_at = now()
              where tenant_id = ${context.tenantId}::uuid
                and id = ${validated.packageId}::uuid
            `.execute(transaction);
          }

          let rescueCaseId: string | null = null;
          if (
            validated.eventType === 'DELIVERY_FAILED' ||
            validated.eventType === 'EXCEPTION'
          ) {
            const active = await sql<{ id: string }>`
              select id
              from shipping.rescue_cases
              where tenant_id = ${context.tenantId}::uuid
                and shipment_id = ${validated.shipmentId}::uuid
                and state not in ('RESOLVED', 'CANCELLED')
              limit 1
              for update
            `.execute(transaction);
            rescueCaseId = active.rows[0]?.id ?? randomUUID();
            if (!active.rows[0]) {
              await sql`
                insert into shipping.rescue_cases (
                  id, tenant_id, store_id, shipment_id, state, trigger_reason,
                  priority, summary, due_at, metadata
                ) values (
                  ${rescueCaseId}::uuid,
                  ${context.tenantId}::uuid,
                  ${validated.storeId}::uuid,
                  ${validated.shipmentId}::uuid,
                  'CONTACT_REQUIRED',
                  ${
                    validated.eventType === 'DELIVERY_FAILED'
                      ? 'DELIVERY_FAILED'
                      : 'CARRIER_EXCEPTION'
                  },
                  'HIGH',
                  ${
                    validated.description ??
                    'Carrier tracking requires delivery rescue'
                  },
                  now() + interval '4 hours',
                  ${JSON.stringify({ trackingEventId, automatic: true })}::jsonb
                )
              `.execute(transaction);
            }
          }

          await this.appendTimeline(
            transaction,
            context,
            validated.storeId,
            validated.shipmentId,
            'shipping.tracking.recorded',
            {
              trackingEventId,
              eventType: validated.eventType,
              normalizedStatus: validated.normalizedStatus,
              packageId: validated.packageId ?? null,
              rescueCaseId,
            },
          );

          return {
            trackingEventId,
            duplicate: false,
            rescueCaseId,
          };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async openRescueCase(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: OpenRescueCaseInput,
  ): Promise<CommandResult<{ rescueCaseId: string }>> {
    const validated = openRescueCaseSchema.parse(input);
    const rescueCaseId = randomUUID();

    return this.commands.execute(
      {
        action: 'shipping.rescue.open',
        permission: 'shipping.rescue.manage',
        risk: 'MEDIUM',
        resource: () => ({
          type: 'shipping.shipment',
          id: validated.shipmentId,
        }),
        event: {
          type: 'shipping.rescue.opened',
          data: () => ({
            shipmentId: validated.shipmentId,
            rescueCaseId,
            triggerReason: validated.triggerReason,
          }),
          dedupeKey: () => `shipping:rescue:opened:${rescueCaseId}`,
        },
        audit: {
          afterState: () => ({
            rescueCaseId,
            shipmentId: validated.shipmentId,
            state: validated.state,
          }),
        },
        execute: async (transaction) => {
          await this.loadShipmentForUpdate(
            transaction,
            context.tenantId,
            validated.storeId,
            validated.shipmentId,
          );
          const active = await sql<{ id: string }>`
            select id
            from shipping.rescue_cases
            where tenant_id = ${context.tenantId}::uuid
              and shipment_id = ${validated.shipmentId}::uuid
              and state not in ('RESOLVED', 'CANCELLED')
            limit 1
            for update
          `.execute(transaction);
          if (active.rows[0]) {
            throw new ShippingInvariantError(
              'Shipment already has an active rescue case',
            );
          }

          await sql`
            insert into shipping.rescue_cases (
              id, tenant_id, store_id, shipment_id, state, trigger_reason,
              priority, assigned_actor_id, summary, due_at, metadata
            ) values (
              ${rescueCaseId}::uuid,
              ${context.tenantId}::uuid,
              ${validated.storeId}::uuid,
              ${validated.shipmentId}::uuid,
              ${validated.state},
              ${validated.triggerReason},
              ${validated.priority},
              ${validated.assignedActorId ?? null}::uuid,
              ${validated.summary},
              ${validated.dueAt ?? null}::timestamptz,
              ${JSON.stringify(validated.metadata)}::jsonb
            )
          `.execute(transaction);
          await this.appendTimeline(
            transaction,
            context,
            validated.storeId,
            validated.shipmentId,
            'shipping.rescue.opened',
            {
              rescueCaseId,
              triggerReason: validated.triggerReason,
              priority: validated.priority,
            },
          );
          return { rescueCaseId };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async updateRescueCase(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: UpdateRescueCaseInput,
  ): Promise<CommandResult<{ rescueCaseId: string; state: string }>> {
    const validated = updateRescueCaseSchema.parse(input);

    return this.commands.execute(
      {
        action: 'shipping.rescue.update',
        permission: 'shipping.rescue.manage',
        risk: 'MEDIUM',
        resource: () => ({
          type: 'shipping.rescue_case',
          id: validated.rescueCaseId,
        }),
        event: {
          type: 'shipping.rescue.updated',
          data: () => ({
            rescueCaseId: validated.rescueCaseId,
            state: validated.state,
          }),
          dedupeKey: () =>
            `shipping:rescue:updated:${validated.rescueCaseId}:${idempotencyKey.trim()}`,
        },
        audit: {
          afterState: () => ({
            rescueCaseId: validated.rescueCaseId,
            state: validated.state,
          }),
        },
        execute: async (transaction) => {
          const row = await sql<{ shipment_id: string; state: string }>`
            select rescue.shipment_id, rescue.state
            from shipping.rescue_cases as rescue
            join shipping.shipments as shipment
              on shipment.tenant_id = rescue.tenant_id
             and shipment.id = rescue.shipment_id
            where rescue.tenant_id = ${context.tenantId}::uuid
              and rescue.id = ${validated.rescueCaseId}::uuid
              and shipment.store_id = ${validated.storeId}::uuid
            for update of rescue
          `.execute(transaction);
          const current = row.rows[0];
          if (!current) {
            throw new ShippingInvariantError('Rescue case was not found');
          }
          if (!canTransitionRescue(current.state, validated.state)) {
            throw new ShippingInvariantError(
              `Rescue case cannot transition from ${current.state} to ${validated.state}`,
            );
          }

          await sql`
            update shipping.rescue_cases
            set state = ${validated.state},
                priority = coalesce(${validated.priority ?? null}, priority),
                assigned_actor_id = case
                  when ${validated.assignedActorId === undefined}
                    then assigned_actor_id
                  else ${validated.assignedActorId ?? null}::uuid
                end,
                summary = coalesce(${validated.summary ?? null}, summary),
                due_at = case
                  when ${validated.dueAt === undefined} then due_at
                  else ${validated.dueAt ?? null}::timestamptz
                end,
                resolved_at = case
                  when ${validated.state} = 'RESOLVED' then now()
                  else null
                end,
                updated_at = now()
            where tenant_id = ${context.tenantId}::uuid
              and id = ${validated.rescueCaseId}::uuid
          `.execute(transaction);
          await this.appendTimeline(
            transaction,
            context,
            validated.storeId,
            current.shipment_id,
            'shipping.rescue.updated',
            {
              rescueCaseId: validated.rescueCaseId,
              previousState: current.state,
              state: validated.state,
            },
          );
          return {
            rescueCaseId: validated.rescueCaseId,
            state: validated.state,
          };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async queueProviderAction(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: QueueShippingProviderActionInput,
    approvalId?: string,
  ): Promise<CommandResult<{ providerActionId: string; state: 'QUEUED' }>> {
    const validated = queueProviderActionSchema.parse(input);
    const providerActionId = randomUUID();

    return this.commands.execute(
      {
        action: `shipping.shipment.provider.${validated.operation.toLowerCase()}`,
        permission: 'shipping.provider.execute',
        risk: 'HIGH',
        resource: () => ({
          type: 'shipping.shipment',
          id: validated.shipmentId,
        }),
        event: {
          type: 'shipping.shipment.provider_action_queued',
          data: () => ({
            shipmentId: validated.shipmentId,
            providerActionId,
            operation: validated.operation,
          }),
          dedupeKey: () =>
            `shipping:shipment:provider-action:${providerActionId}`,
        },
        audit: {
          afterState: () => ({
            shipmentId: validated.shipmentId,
            providerActionId,
            operation: validated.operation,
          }),
        },
        execute: async (transaction) => {
          const shipment = await this.loadShipmentForUpdate(
            transaction,
            context.tenantId,
            validated.storeId,
            validated.shipmentId,
          );
          if (!shipment.carrier_account_id) {
            throw new ShippingInvariantError(
              'Shipment has no carrier account',
            );
          }

          const route = await sql<{
            connection_id: string;
            connector_key: string;
          }>`
            select account.connection_id, connection.connector_key
            from shipping.carrier_accounts as account
            join integrations.connections as connection
              on connection.tenant_id = account.tenant_id
             and connection.id = account.connection_id
            where account.tenant_id = ${context.tenantId}::uuid
              and account.id = ${shipment.carrier_account_id}::uuid
              and account.status = 'ACTIVE'
              and connection.status in ('CONNECTED', 'DEGRADED')
          `.execute(transaction);
          const carrierRoute = route.rows[0];
          if (!carrierRoute) {
            throw new ShippingInvariantError(
              'Shipment carrier has no dispatchable connection',
            );
          }

          await this.prepareProviderAction(
            transaction,
            context.tenantId,
            shipment,
            validated,
          );

          const actionType = `shipping.shipment.${validated.operation.toLowerCase()}`;
          const providerInput = {
            canonicalShipmentId: validated.shipmentId,
            canonicalOrderId: shipment.order_id,
            fulfillmentId: shipment.fulfillment_id,
            trackingNumber: shipment.tracking_number,
            ...(validated.reason ? { reason: validated.reason } : {}),
            ...(validated.scheduledAt
              ? { scheduledAt: validated.scheduledAt }
              : {}),
            ...(validated.destination
              ? { destination: validated.destination }
              : {}),
          };

          await sql`
            insert into integrations.provider_actions (
              id, tenant_id, connection_id, action_type, input,
              idempotency_key
            ) values (
              ${providerActionId}::uuid,
              ${context.tenantId}::uuid,
              ${carrierRoute.connection_id}::uuid,
              ${actionType},
              ${JSON.stringify(providerInput)}::jsonb,
              ${idempotencyKey.trim()}
            )
          `.execute(transaction);
          await sql`
            insert into shipping.shipment_provider_actions (
              provider_action_id, tenant_id, store_id, shipment_id, operation
            ) values (
              ${providerActionId}::uuid,
              ${context.tenantId}::uuid,
              ${validated.storeId}::uuid,
              ${validated.shipmentId}::uuid,
              ${validated.operation}
            )
          `.execute(transaction);
          await this.appendTimeline(
            transaction,
            context,
            validated.storeId,
            validated.shipmentId,
            'shipping.shipment.provider_action_queued',
            {
              providerActionId,
              operation: validated.operation,
              connectorKey: carrierRoute.connector_key,
            },
          );
          return { providerActionId, state: 'QUEUED' as const };
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

  public async listShipments(
    context: TenantRequestContext,
    filters: {
      storeId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{
    items: readonly ShippingShipmentListItem[];
    limit: number;
    offset: number;
  }> {
    const storeId = filters.storeId ? uuidSchema.parse(filters.storeId) : null;
    const status = filters.status
      ? z.string().trim().min(1).max(50).parse(filters.status)
      : null;
    const limit = z.number().int().min(1).max(100).parse(filters.limit ?? 50);
    const offset = z
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .parse(filters.offset ?? 0);

    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        id: string;
        store_id: string;
        order_id: string;
        fulfillment_id: string;
        carrier_account_id: string | null;
        carrier_service_id: string | null;
        status: string;
        tracking_number: string | null;
        tracking_url: string | null;
        estimated_delivery_at: Date | null;
        provider_sync_state: string;
        updated_at: Date;
      }>`
        select id, store_id, order_id, fulfillment_id, carrier_account_id,
               carrier_service_id, status, tracking_number, tracking_url,
               estimated_delivery_at, provider_sync_state, updated_at
        from shipping.shipments
        where (${storeId}::uuid is null or store_id = ${storeId}::uuid)
          and (${status}::text is null or status = ${status})
        order by updated_at desc, id desc
        limit ${limit} offset ${offset}
      `.execute(transaction);

      return {
        items: result.rows.map((row) => ({
          id: row.id,
          storeId: row.store_id,
          orderId: row.order_id,
          fulfillmentId: row.fulfillment_id,
          carrierAccountId: row.carrier_account_id,
          carrierServiceId: row.carrier_service_id,
          status: row.status,
          trackingNumber: row.tracking_number,
          trackingUrl: row.tracking_url,
          estimatedDeliveryAt: row.estimated_delivery_at,
          providerSyncState: row.provider_sync_state,
          updatedAt: row.updated_at,
        })),
        limit,
        offset,
      };
    });
  }

  public async getShipment(
    context: TenantRequestContext,
    shipmentId: string,
  ): Promise<
    | {
        shipment: Record<string, unknown>;
        packages: readonly Record<string, unknown>[];
        trackingEvents: readonly Record<string, unknown>[];
        deliveryAttempts: readonly Record<string, unknown>[];
        rescueCases: readonly Record<string, unknown>[];
        providerActions: readonly Record<string, unknown>[];
      }
    | undefined
  > {
    const id = uuidSchema.parse(shipmentId);

    return withTenantTransaction(this.database, context, async (transaction) => {
      const shipment = await sql<Record<string, unknown>>`
        select id, store_id, order_id, fulfillment_id, carrier_account_id,
               carrier_service_id, status, tracking_number, tracking_url,
               destination, declared_value_minor::text,
               declared_value_currency, estimated_delivery_at, shipped_at,
               delivered_at, last_tracking_at, provider_sync_state, metadata,
               created_at, updated_at
        from shipping.shipments
        where id = ${id}::uuid
      `.execute(transaction);
      if (!shipment.rows[0]) return undefined;

      const [packages, tracking, attempts, rescues, actions] = await Promise.all([
        sql<Record<string, unknown>>`
          select id, sequence, status, weight_grams, length_mm, width_mm,
                 height_mm, tracking_number, tracking_url, metadata,
                 created_at, updated_at
          from shipping.packages
          where shipment_id = ${id}::uuid
          order by sequence, id
        `.execute(transaction),
        sql<Record<string, unknown>>`
          select id, package_id, event_type, normalized_status, raw_code,
                 description, location_name, country_code, occurred_at,
                 source_type, external_event_id, data
          from shipping.tracking_events
          where shipment_id = ${id}::uuid
          order by occurred_at desc, id desc
          limit 100
        `.execute(transaction),
        sql<Record<string, unknown>>`
          select id, attempt_number, state, attempted_at, next_attempt_at,
                 failure_code, failure_reason, metadata, created_at, updated_at
          from shipping.delivery_attempts
          where shipment_id = ${id}::uuid
          order by attempt_number desc, id desc
        `.execute(transaction),
        sql<Record<string, unknown>>`
          select id, state, trigger_reason, priority, assigned_actor_id,
                 summary, due_at, resolved_at, metadata, created_at, updated_at
          from shipping.rescue_cases
          where shipment_id = ${id}::uuid
          order by created_at desc, id desc
        `.execute(transaction),
        sql<Record<string, unknown>>`
          select provider_action_id, operation, state, created_at, completed_at
          from shipping.shipment_provider_actions
          where shipment_id = ${id}::uuid
          order by created_at desc, provider_action_id desc
        `.execute(transaction),
      ]);

      return {
        shipment: shipment.rows[0],
        packages: packages.rows,
        trackingEvents: tracking.rows,
        deliveryAttempts: attempts.rows,
        rescueCases: rescues.rows,
        providerActions: actions.rows,
      };
    });
  }

  private async prepareProviderAction(
    transaction: PlatformTransaction,
    tenantId: string,
    shipment: ShipmentStateRow,
    input: z.infer<typeof queueProviderActionSchema>,
  ): Promise<void> {
    if (input.operation === 'CREATE_LABEL') {
      if (!['READY', 'LABEL_PENDING'].includes(shipment.status)) {
        throw new ShippingInvariantError(
          'Labels can only be created for ready shipments',
        );
      }
      await sql`
        update shipping.shipments
        set status = 'LABEL_PENDING',
            provider_sync_state = 'PENDING',
            updated_at = now()
        where tenant_id = ${tenantId}::uuid
          and id = ${input.shipmentId}::uuid
      `.execute(transaction);
      return;
    }

    if (input.operation === 'REQUEST_PICKUP') {
      if (shipment.status !== 'LABEL_CREATED') {
        throw new ShippingInvariantError(
          'Pickup requires a created shipping label',
        );
      }
      await this.markProviderPending(transaction, tenantId, input.shipmentId);
      return;
    }

    if (input.operation === 'CANCEL_SHIPMENT') {
      if (['DELIVERED', 'RETURNED'].includes(shipment.status)) {
        throw new ShippingInvariantError(
          'Delivered or returned shipments cannot be cancelled',
        );
      }
      await sql`
        update shipping.shipments
        set status = 'CANCELLED',
            provider_sync_state = 'PENDING',
            updated_at = now()
        where tenant_id = ${tenantId}::uuid
          and id = ${input.shipmentId}::uuid
      `.execute(transaction);
      return;
    }

    if (input.operation === 'RESCHEDULE_DELIVERY') {
      this.assertShipmentIsNotTerminal(shipment.status, 'rescheduled');
      await sql`
        update shipping.shipments
        set estimated_delivery_at = ${input.scheduledAt ?? null}::timestamptz,
            provider_sync_state = 'PENDING',
            updated_at = now()
        where tenant_id = ${tenantId}::uuid
          and id = ${input.shipmentId}::uuid
      `.execute(transaction);
      return;
    }

    this.assertShipmentIsNotTerminal(shipment.status, 'change delivery address');
    await sql`
      update shipping.shipments
      set destination = ${JSON.stringify(input.destination)}::jsonb,
          provider_sync_state = 'PENDING',
          updated_at = now()
      where tenant_id = ${tenantId}::uuid
        and id = ${input.shipmentId}::uuid
    `.execute(transaction);
  }

  private assertShipmentIsNotTerminal(status: string, action: string): void {
    if (['DELIVERED', 'RETURNED', 'CANCELLED'].includes(status)) {
      throw new ShippingInvariantError(
        `Terminal shipments cannot ${action}`,
      );
    }
  }

  private async loadShipmentForUpdate(
    transaction: PlatformTransaction,
    tenantId: string,
    storeId: string,
    shipmentId: string,
  ): Promise<ShipmentStateRow> {
    const result = await sql<ShipmentStateRow>`
      select id, store_id, order_id, fulfillment_id, carrier_account_id,
             carrier_service_id, status, tracking_number,
             provider_sync_state, last_tracking_at
      from shipping.shipments
      where tenant_id = ${tenantId}::uuid
        and store_id = ${storeId}::uuid
        and id = ${shipmentId}::uuid
      for update
    `.execute(transaction);
    const shipment = result.rows[0];
    if (!shipment) {
      throw new ShippingInvariantError(
        'Shipment was not found in this store',
      );
    }
    return shipment;
  }

  private async markProviderPending(
    transaction: PlatformTransaction,
    tenantId: string,
    shipmentId: string,
  ): Promise<void> {
    await sql`
      update shipping.shipments
      set provider_sync_state = 'PENDING', updated_at = now()
      where tenant_id = ${tenantId}::uuid
        and id = ${shipmentId}::uuid
    `.execute(transaction);
  }

  private async appendTimeline(
    transaction: PlatformTransaction,
    context: TenantRequestContext,
    storeId: string,
    shipmentId: string,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await sql`
      insert into shipping.shipment_timeline (
        tenant_id, store_id, shipment_id, event_type,
        actor_type, actor_id, data
      ) values (
        ${context.tenantId}::uuid,
        ${storeId}::uuid,
        ${shipmentId}::uuid,
        ${eventType},
        ${context.actorId ? 'USER' : 'SERVICE'},
        ${context.actorId ?? null}::uuid,
        ${JSON.stringify(data)}::jsonb
      )
    `.execute(transaction);
  }
}

const shippingProgression: Record<string, number> = {
  DRAFT: 0,
  READY: 1,
  LABEL_PENDING: 2,
  LABEL_CREATED: 3,
  HANDED_OVER: 4,
  IN_TRANSIT: 5,
  OUT_FOR_DELIVERY: 6,
  EXCEPTION: 6,
  RETURN_TO_SENDER: 7,
  DELIVERED: 8,
  RETURNED: 8,
  CANCELLED: 8,
};

function canAdvanceShippingStatus(current: string, incoming: string): boolean {
  if (['DELIVERED', 'RETURNED', 'CANCELLED'].includes(current)) {
    return current === incoming;
  }
  if (incoming === 'EXCEPTION') return true;
  if (current === 'EXCEPTION') return incoming !== 'LABEL_CREATED';
  return (
    (shippingProgression[incoming] ?? -1) >=
    (shippingProgression[current] ?? -1)
  );
}

const rescueTransitions: Readonly<Record<string, readonly string[]>> = {
  OPEN: [
    'CONTACT_REQUIRED',
    'ADDRESS_UPDATE_REQUIRED',
    'READY_TO_RETRY',
    'RESOLVED',
    'CANCELLED',
  ],
  CONTACT_REQUIRED: [
    'CONTACTED',
    'ADDRESS_UPDATE_REQUIRED',
    'RESCHEDULED',
    'READY_TO_RETRY',
    'RESOLVED',
    'CANCELLED',
  ],
  CONTACTED: [
    'ADDRESS_UPDATE_REQUIRED',
    'RESCHEDULED',
    'READY_TO_RETRY',
    'RESOLVED',
    'CANCELLED',
  ],
  ADDRESS_UPDATE_REQUIRED: [
    'CONTACTED',
    'RESCHEDULED',
    'READY_TO_RETRY',
    'RESOLVED',
    'CANCELLED',
  ],
  RESCHEDULED: [
    'READY_TO_RETRY',
    'CONTACT_REQUIRED',
    'RESOLVED',
    'CANCELLED',
  ],
  READY_TO_RETRY: [
    'CONTACT_REQUIRED',
    'RESCHEDULED',
    'RESOLVED',
    'CANCELLED',
  ],
  RESOLVED: [],
  CANCELLED: [],
};

function canTransitionRescue(current: string, next: string): boolean {
  return current === next || (rescueTransitions[current] ?? []).includes(next);
}
