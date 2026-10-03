import { randomUUID } from 'node:crypto';
import {
  CommandExecutor,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';
import type { Transaction } from 'kysely';
import { z } from 'zod';

type DatabaseTransaction = Transaction<Record<string, never>>;

const uuidSchema = z.string().uuid();
const currencySchema = z.string().regex(/^[A-Z]{3}$/u);
const moneyMinorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const optionalMetadataSchema = z.record(z.unknown()).default({});

export const commerceProviderEntityTypeSchema = z.enum([
  'STORE',
  'PRODUCT',
  'VARIANT',
  'INVENTORY_LOCATION',
  'ORDER',
  'PAYMENT',
  'FULFILLMENT',
]);
export type CommerceProviderEntityType = z.infer<typeof commerceProviderEntityTypeSchema>;

const createStoreSchema = z.object({
  name: z.string().trim().min(1).max(300),
  defaultCurrency: currencySchema,
  timezone: z.string().trim().min(1).max(100).optional(),
  metadata: optionalMetadataSchema,
});
export type CreateStoreInput = z.input<typeof createStoreSchema>;

const createVariantSchema = z.object({
  title: z.string().trim().min(1).max(500),
  sku: z.string().trim().min(1).max(300).optional(),
  barcode: z.string().trim().min(1).max(300).optional(),
  trackInventory: z.boolean().default(true),
  priceMinor: moneyMinorSchema,
  compareAtPriceMinor: moneyMinorSchema.optional(),
  currency: currencySchema,
  weightGrams: z.number().int().min(0).max(100_000_000).optional(),
  metadata: optionalMetadataSchema,
});

const createProductSchema = z.object({
  storeId: uuidSchema,
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).optional(),
  vendor: z.string().trim().min(1).max(300).optional(),
  productType: z.string().trim().min(1).max(300).optional(),
  metadata: optionalMetadataSchema,
  variants: z.array(createVariantSchema).min(1).max(250),
});
export type CreateProductInput = z.input<typeof createProductSchema>;

const createInventoryLocationSchema = z.object({
  storeId: uuidSchema,
  name: z.string().trim().min(1).max(300),
  metadata: optionalMetadataSchema,
});
export type CreateInventoryLocationInput = z.input<typeof createInventoryLocationSchema>;

const setInventoryLevelSchema = z.object({
  storeId: uuidSchema,
  locationId: uuidSchema,
  variantId: uuidSchema,
  onHand: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  committed: z.number().int().min(0).max(1_000_000_000),
  incoming: z.number().int().min(0).max(1_000_000_000).default(0),
  metadata: optionalMetadataSchema,
});
export type SetInventoryLevelInput = z.input<typeof setInventoryLevelSchema>;

const createOrderLineSchema = z
  .object({
    productId: uuidSchema.optional(),
    variantId: uuidSchema.optional(),
    sku: z.string().trim().min(1).max(300).optional(),
    title: z.string().trim().min(1).max(500),
    quantity: z.number().int().min(1).max(1_000_000),
    unitPriceMinor: moneyMinorSchema,
    discountMinor: moneyMinorSchema.default(0),
    taxMinor: moneyMinorSchema.default(0),
    metadata: optionalMetadataSchema,
  })
  .refine((line) => !line.variantId || Boolean(line.productId), {
    message: 'A variant-backed order line must include its productId',
    path: ['productId'],
  });

const createOrderDiscountSchema = z.object({
  code: z.string().trim().min(1).max(300).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  amountMinor: moneyMinorSchema,
  metadata: optionalMetadataSchema,
});

const createOrderTaxSchema = z.object({
  title: z.string().trim().min(1).max(300),
  rateBasisPoints: z.number().int().min(0).max(100_000).optional(),
  amountMinor: moneyMinorSchema,
  metadata: optionalMetadataSchema,
});

const createOrderSchema = z.object({
  storeId: uuidSchema,
  customerId: uuidSchema.optional(),
  orderNumber: z.string().trim().min(1).max(200),
  currency: currencySchema,
  source: z.string().trim().min(1).max(100).default('platform'),
  shippingMinor: moneyMinorSchema.default(0),
  placedAt: z.string().datetime().optional(),
  metadata: optionalMetadataSchema,
  lines: z.array(createOrderLineSchema).min(1).max(500),
  discounts: z.array(createOrderDiscountSchema).max(100).default([]),
  taxes: z.array(createOrderTaxSchema).max(100).default([]),
});
export type CreateOrderInput = z.input<typeof createOrderSchema>;

const recordPaymentSchema = z.object({
  storeId: uuidSchema,
  orderId: uuidSchema,
  kind: z.enum(['AUTHORIZATION', 'CAPTURE', 'SALE', 'REFUND', 'VOID']),
  status: z.enum([
    'PENDING',
    'AUTHORIZED',
    'CAPTURED',
    'FAILED',
    'VOIDED',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
  ]),
  amountMinor: moneyMinorSchema,
  currency: currencySchema,
  paymentMethodType: z.string().trim().min(1).max(200).optional(),
  processedAt: z.string().datetime().optional(),
  metadata: optionalMetadataSchema,
});
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

const createFulfillmentSchema = z.object({
  storeId: uuidSchema,
  orderId: uuidSchema,
  status: z.enum(['PENDING', 'IN_PROGRESS', 'FULFILLED', 'CANCELLED', 'FAILED']).default('PENDING'),
  fulfilledAt: z.string().datetime().optional(),
  metadata: optionalMetadataSchema,
  lines: z
    .array(
      z.object({
        orderLineId: uuidSchema,
        quantity: z.number().int().min(1).max(1_000_000),
      }),
    )
    .min(1)
    .max(500),
}).superRefine((input, context) => {
  if (input.status === 'FULFILLED' && !input.fulfilledAt)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fulfilledAt'],
      message: 'fulfilledAt is required when status is FULFILLED',
    });
});
export type CreateFulfillmentInput = z.input<typeof createFulfillmentSchema>;

const mapProviderResourceSchema = z.object({
  storeId: uuidSchema,
  connectionId: uuidSchema,
  entityType: commerceProviderEntityTypeSchema,
  canonicalId: uuidSchema,
  externalId: z.string().trim().min(1).max(500),
  externalParentId: z.string().trim().min(1).max(500).optional(),
  metadata: optionalMetadataSchema,
});
export type MapProviderResourceInput = z.input<typeof mapProviderResourceSchema>;

export class CommerceInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CommerceInvariantError';
  }
}

export interface CommerceStoreListItem {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  defaultCurrency: string;
  timezone: string | null;
  updatedAt: Date;
}

export interface CommerceProductListItem {
  id: string;
  storeId: string;
  title: string;
  vendor: string | null;
  productType: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  variantCount: number;
  updatedAt: Date;
}

export interface CommerceOrderListItem {
  id: string;
  storeId: string;
  customerId: string | null;
  orderNumber: string;
  status: 'DRAFT' | 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'CLOSED';
  financialStatus:
    | 'PENDING'
    | 'AUTHORIZED'
    | 'PARTIALLY_PAID'
    | 'PAID'
    | 'PARTIALLY_REFUNDED'
    | 'REFUNDED'
    | 'VOIDED';
  fulfillmentStatus: 'UNFULFILLED' | 'PARTIAL' | 'FULFILLED' | 'CANCELLED';
  currency: string;
  totalMinor: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommerceOrderDetail extends CommerceOrderListItem {
  source: string;
  placedAt: Date | null;
  lines: readonly {
    id: string;
    productId: string | null;
    variantId: string | null;
    sku: string | null;
    title: string;
    quantity: number;
    unitPriceMinor: string;
    discountMinor: string;
    taxMinor: string;
    totalMinor: string;
  }[];
  payments: readonly {
    id: string;
    kind: string;
    status: string;
    amountMinor: string;
    currency: string;
    processedAt: Date | null;
  }[];
  fulfillments: readonly {
    id: string;
    status: string;
    fulfilledAt: Date | null;
  }[];
}

/**
 * Canonical commerce application service. Provider adapters map into this model;
 * no Shopify/WooCommerce payload shape is allowed to become the domain model.
 */
export class CommerceService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async createStore(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateStoreInput,
    approvalId?: string,
  ): Promise<CommandResult<{ storeId: string }>> {
    const validated = createStoreSchema.parse(input);
    const storeId = randomUUID();
    return this.commands.execute(
      {
        action: 'commerce.store.create',
        permission: 'commerce.stores.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'commerce.store', id: storeId }),
        event: {
          type: 'commerce.store.created',
          data: () => ({ storeId, defaultCurrency: validated.defaultCurrency }),
          dedupeKey: () => `commerce.store.created:${storeId}`,
        },
        audit: {
          afterState: () => ({ storeId, name: validated.name, status: 'ACTIVE' }),
        },
        execute: async (transaction) => {
          await sql`insert into commerce.stores (
            id, tenant_id, name, default_currency, timezone, metadata
          ) values (
            ${storeId}::uuid, ${context.tenantId}::uuid, ${validated.name},
            ${validated.defaultCurrency}, ${validated.timezone ?? null}, ${JSON.stringify(validated.metadata)}::jsonb
          )`.execute(transaction);
          return { storeId };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async createProduct(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateProductInput,
    approvalId?: string,
  ): Promise<CommandResult<{ productId: string; variantIds: readonly string[] }>> {
    const validated = createProductSchema.parse(input);
    const productId = randomUUID();
    const variants = validated.variants.map((variant) => ({ ...variant, id: randomUUID() }));
    return this.commands.execute(
      {
        action: 'commerce.product.create',
        permission: 'commerce.products.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'commerce.product', id: productId }),
        event: {
          type: 'commerce.product.created',
          data: () => ({ productId, storeId: validated.storeId, variantCount: variants.length }),
          dedupeKey: () => `commerce.product.created:${productId}`,
        },
        audit: {
          afterState: () => ({ productId, storeId: validated.storeId, title: validated.title }),
          metadata: () => ({ variantCount: variants.length }),
        },
        execute: async (transaction) => {
          await sql`insert into commerce.products (
            id, tenant_id, store_id, title, description, vendor, product_type, metadata
          ) values (
            ${productId}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid,
            ${validated.title}, ${validated.description ?? null}, ${validated.vendor ?? null},
            ${validated.productType ?? null}, ${JSON.stringify(validated.metadata)}::jsonb
          )`.execute(transaction);
          for (const variant of variants)
            await sql`insert into commerce.variants (
              id, tenant_id, store_id, product_id, title, sku, barcode,
              track_inventory, price_minor, compare_at_price_minor, currency,
              weight_grams, metadata
            ) values (
              ${variant.id}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid,
              ${productId}::uuid, ${variant.title}, ${variant.sku ?? null}, ${variant.barcode ?? null},
              ${variant.trackInventory}, ${variant.priceMinor}, ${variant.compareAtPriceMinor ?? null},
              ${variant.currency}, ${variant.weightGrams ?? null}, ${JSON.stringify(variant.metadata)}::jsonb
            )`.execute(transaction);
          return { productId, variantIds: variants.map((variant) => variant.id) };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async createInventoryLocation(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateInventoryLocationInput,
    approvalId?: string,
  ): Promise<CommandResult<{ locationId: string }>> {
    const validated = createInventoryLocationSchema.parse(input);
    const locationId = randomUUID();
    return this.commands.execute(
      {
        action: 'commerce.inventory_location.create',
        permission: 'commerce.inventory.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'commerce.inventory_location', id: locationId }),
        event: {
          type: 'commerce.inventory_location.created',
          data: () => ({ locationId, storeId: validated.storeId }),
          dedupeKey: () => `commerce.inventory_location.created:${locationId}`,
        },
        audit: {
          afterState: () => ({ locationId, storeId: validated.storeId, name: validated.name }),
        },
        execute: async (transaction) => {
          await sql`insert into commerce.inventory_locations (
            id, tenant_id, store_id, name, metadata
          ) values (
            ${locationId}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid,
            ${validated.name}, ${JSON.stringify(validated.metadata)}::jsonb
          )`.execute(transaction);
          return { locationId };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async setInventoryLevel(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: SetInventoryLevelInput,
    approvalId?: string,
  ): Promise<CommandResult<{ locationId: string; variantId: string; available: number }>> {
    const validated = setInventoryLevelSchema.parse(input);
    const available = validated.onHand - validated.committed;
    return this.commands.execute(
      {
        action: 'commerce.inventory.set',
        permission: 'commerce.inventory.manage',
        risk: 'HIGH',
        resource: () => ({
          type: 'commerce.inventory_level',
          id: `${validated.locationId}:${validated.variantId}`,
        }),
        event: {
          type: 'commerce.inventory.updated',
          data: () => ({
            storeId: validated.storeId,
            locationId: validated.locationId,
            variantId: validated.variantId,
            available,
          }),
          dedupeKey: () => `commerce.inventory.updated:${idempotencyKey.trim()}`,
        },
        audit: {
          afterState: () => ({
            onHand: validated.onHand,
            committed: validated.committed,
            incoming: validated.incoming,
            available,
          }),
        },
        execute: async (transaction) => {
          await sql`insert into commerce.inventory_levels (
            tenant_id, store_id, location_id, variant_id, on_hand, committed,
            incoming, metadata
          ) values (
            ${context.tenantId}::uuid, ${validated.storeId}::uuid,
            ${validated.locationId}::uuid, ${validated.variantId}::uuid,
            ${validated.onHand}, ${validated.committed}, ${validated.incoming},
            ${JSON.stringify(validated.metadata)}::jsonb
          ) on conflict (tenant_id, location_id, variant_id) do update set
            store_id = excluded.store_id,
            on_hand = excluded.on_hand,
            committed = excluded.committed,
            incoming = excluded.incoming,
            metadata = excluded.metadata`.execute(transaction);
          return { locationId: validated.locationId, variantId: validated.variantId, available };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async createOrder(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateOrderInput,
    approvalId?: string,
  ): Promise<CommandResult<{ orderId: string; totalMinor: number; lineIds: readonly string[] }>> {
    const validated = createOrderSchema.parse(input);
    const orderId = randomUUID();
    const lines = validated.lines.map((line) => {
      const gross = safeMultiply(line.unitPriceMinor, line.quantity);
      const total = safeAdd(safeSubtract(gross, line.discountMinor), line.taxMinor);
      return { ...line, id: randomUUID(), gross, total };
    });
    const subtotalMinor = safeSum(lines.map((line) => line.gross));
    const discountMinor = safeAdd(
      safeSum(lines.map((line) => line.discountMinor)),
      safeSum(validated.discounts.map((discount) => discount.amountMinor)),
    );
    const taxMinor = safeAdd(
      safeSum(lines.map((line) => line.taxMinor)),
      safeSum(validated.taxes.map((tax) => tax.amountMinor)),
    );
    const totalMinor = safeAdd(
      safeSubtract(safeAdd(subtotalMinor, taxMinor), discountMinor),
      validated.shippingMinor,
    );

    return this.commands.execute(
      {
        action: 'commerce.order.create',
        permission: 'commerce.orders.create',
        risk: 'MEDIUM',
        resource: () => ({ type: 'commerce.order', id: orderId }),
        event: {
          type: 'commerce.order.created',
          data: () => ({
            orderId,
            storeId: validated.storeId,
            customerId: validated.customerId ?? null,
            orderNumber: validated.orderNumber,
            totalMinor,
            currency: validated.currency,
          }),
          dedupeKey: () => `commerce.order.created:${orderId}`,
        },
        audit: {
          afterState: () => ({
            orderId,
            orderNumber: validated.orderNumber,
            status: 'PENDING',
            totalMinor,
            currency: validated.currency,
          }),
          metadata: () => ({ lineCount: lines.length }),
        },
        execute: async (transaction) => {
          await this.validateCatalogReferences(transaction, context.tenantId, validated.storeId, lines);
          await sql`insert into commerce.orders (
            id, tenant_id, store_id, customer_id, order_number, currency,
            subtotal_minor, discount_minor, tax_minor, shipping_minor, total_minor,
            source, placed_at, metadata
          ) values (
            ${orderId}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid,
            ${validated.customerId ?? null}::uuid, ${validated.orderNumber}, ${validated.currency},
            ${subtotalMinor}, ${discountMinor}, ${taxMinor}, ${validated.shippingMinor}, ${totalMinor},
            ${validated.source}, ${validated.placedAt ?? null}::timestamptz,
            ${JSON.stringify(validated.metadata)}::jsonb
          )`.execute(transaction);
          for (const line of lines)
            await sql`insert into commerce.order_lines (
              id, tenant_id, store_id, order_id, product_id, variant_id, sku,
              title, quantity, unit_price_minor, discount_minor, tax_minor,
              total_minor, metadata
            ) values (
              ${line.id}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid,
              ${orderId}::uuid, ${line.productId ?? null}::uuid, ${line.variantId ?? null}::uuid,
              ${line.sku ?? null}, ${line.title}, ${line.quantity}, ${line.unitPriceMinor},
              ${line.discountMinor}, ${line.taxMinor}, ${line.total},
              ${JSON.stringify(line.metadata)}::jsonb
            )`.execute(transaction);
          for (const discount of validated.discounts)
            await sql`insert into commerce.order_discounts (
              tenant_id, store_id, order_id, code, title, amount_minor, metadata
            ) values (
              ${context.tenantId}::uuid, ${validated.storeId}::uuid, ${orderId}::uuid,
              ${discount.code ?? null}, ${discount.title ?? null}, ${discount.amountMinor},
              ${JSON.stringify(discount.metadata)}::jsonb
            )`.execute(transaction);
          for (const tax of validated.taxes)
            await sql`insert into commerce.order_tax_lines (
              tenant_id, store_id, order_id, title, rate_basis_points, amount_minor, metadata
            ) values (
              ${context.tenantId}::uuid, ${validated.storeId}::uuid, ${orderId}::uuid,
              ${tax.title}, ${tax.rateBasisPoints ?? null}, ${tax.amountMinor},
              ${JSON.stringify(tax.metadata)}::jsonb
            )`.execute(transaction);
          await this.appendOrderTimeline(transaction, context, validated.storeId, orderId, 'commerce.order.created', {
            orderNumber: validated.orderNumber,
            totalMinor,
            currency: validated.currency,
          });
          return { orderId, totalMinor, lineIds: lines.map((line) => line.id) };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async recordPayment(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: RecordPaymentInput,
    approvalId?: string,
  ): Promise<CommandResult<{ paymentId: string }>> {
    const validated = recordPaymentSchema.parse(input);
    const paymentId = randomUUID();
    return this.commands.execute(
      {
        action: 'commerce.payment.record',
        permission: 'commerce.payments.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'commerce.payment', id: paymentId }),
        event: {
          type: 'commerce.payment.recorded',
          data: () => ({
            paymentId,
            orderId: validated.orderId,
            kind: validated.kind,
            status: validated.status,
            amountMinor: validated.amountMinor,
            currency: validated.currency,
          }),
          dedupeKey: () => `commerce.payment.recorded:${paymentId}`,
        },
        audit: {
          afterState: () => ({
            paymentId,
            orderId: validated.orderId,
            kind: validated.kind,
            status: validated.status,
            amountMinor: validated.amountMinor,
            currency: validated.currency,
          }),
        },
        execute: async (transaction) => {
          await this.assertOrderCurrency(
            transaction,
            context.tenantId,
            validated.storeId,
            validated.orderId,
            validated.currency,
          );
          await sql`insert into commerce.payments (
            id, tenant_id, store_id, order_id, kind, status, amount_minor,
            currency, payment_method_type, processed_at, metadata
          ) values (
            ${paymentId}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid,
            ${validated.orderId}::uuid, ${validated.kind}, ${validated.status},
            ${validated.amountMinor}, ${validated.currency}, ${validated.paymentMethodType ?? null},
            ${validated.processedAt ?? null}::timestamptz, ${JSON.stringify(validated.metadata)}::jsonb
          )`.execute(transaction);
          await this.appendOrderTimeline(
            transaction,
            context,
            validated.storeId,
            validated.orderId,
            'commerce.payment.recorded',
            { paymentId, kind: validated.kind, status: validated.status, amountMinor: validated.amountMinor },
          );
          return { paymentId };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async createFulfillment(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateFulfillmentInput,
    approvalId?: string,
  ): Promise<CommandResult<{ fulfillmentId: string }>> {
    const validated = createFulfillmentSchema.parse(input);
    const fulfillmentId = randomUUID();
    const lineIds = new Set(validated.lines.map((line) => line.orderLineId));
    if (lineIds.size !== validated.lines.length)
      throw new CommerceInvariantError('A fulfillment cannot contain the same order line twice');
    return this.commands.execute(
      {
        action: 'commerce.fulfillment.create',
        permission: 'commerce.fulfillments.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'commerce.fulfillment', id: fulfillmentId }),
        event: {
          type: 'commerce.fulfillment.created',
          data: () => ({
            fulfillmentId,
            orderId: validated.orderId,
            status: validated.status,
            lineCount: validated.lines.length,
          }),
          dedupeKey: () => `commerce.fulfillment.created:${fulfillmentId}`,
        },
        audit: {
          afterState: () => ({
            fulfillmentId,
            orderId: validated.orderId,
            status: validated.status,
          }),
          metadata: () => ({ lineCount: validated.lines.length }),
        },
        execute: async (transaction) => {
          await sql`insert into commerce.fulfillments (
            id, tenant_id, store_id, order_id, status, fulfilled_at, metadata
          ) values (
            ${fulfillmentId}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid,
            ${validated.orderId}::uuid, ${validated.status}, ${validated.fulfilledAt ?? null}::timestamptz,
            ${JSON.stringify(validated.metadata)}::jsonb
          )`.execute(transaction);
          for (const line of validated.lines)
            await sql`insert into commerce.fulfillment_lines (
              tenant_id, store_id, fulfillment_id, order_id, order_line_id, quantity
            ) values (
              ${context.tenantId}::uuid, ${validated.storeId}::uuid, ${fulfillmentId}::uuid,
              ${validated.orderId}::uuid, ${line.orderLineId}::uuid, ${line.quantity}
            )`.execute(transaction);
          await this.appendOrderTimeline(
            transaction,
            context,
            validated.storeId,
            validated.orderId,
            'commerce.fulfillment.created',
            { fulfillmentId, status: validated.status, lineCount: validated.lines.length },
          );
          return { fulfillmentId };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async mapProviderResource(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: MapProviderResourceInput,
    approvalId?: string,
  ): Promise<CommandResult<{ mappingId: string }>> {
    const validated = mapProviderResourceSchema.parse(input);
    const mappingId = randomUUID();
    return this.commands.execute(
      {
        action: 'commerce.provider_mapping.upsert',
        permission: 'integrations.sync.execute',
        risk: 'MEDIUM',
        resource: () => ({ type: 'commerce.provider_mapping', id: mappingId }),
        event: {
          type: 'commerce.provider_mapping.updated',
          data: () => ({
            entityType: validated.entityType,
            canonicalId: validated.canonicalId,
            connectionId: validated.connectionId,
          }),
          dedupeKey: () => `commerce.provider_mapping.updated:${idempotencyKey.trim()}`,
        },
        audit: {
          afterState: () => ({
            entityType: validated.entityType,
            canonicalId: validated.canonicalId,
            connectionId: validated.connectionId,
            externalId: validated.externalId,
          }),
        },
        execute: async (transaction) => {
          await this.assertCanonicalEntity(
            transaction,
            context.tenantId,
            validated.storeId,
            validated.entityType,
            validated.canonicalId,
          );
          const result = await sql<{ id: string }>`insert into commerce.provider_mappings (
            id, tenant_id, store_id, connection_id, entity_type, canonical_id,
            external_id, external_parent_id, metadata
          ) values (
            ${mappingId}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid,
            ${validated.connectionId}::uuid, ${validated.entityType}, ${validated.canonicalId}::uuid,
            ${validated.externalId}, ${validated.externalParentId ?? null},
            ${JSON.stringify(validated.metadata)}::jsonb
          ) on conflict (tenant_id, connection_id, entity_type, external_id) do update set
            store_id = excluded.store_id,
            canonical_id = excluded.canonical_id,
            external_parent_id = excluded.external_parent_id,
            state = 'ACTIVE',
            metadata = excluded.metadata
          returning id`.execute(transaction);
          const resolvedId = result.rows[0]?.id;
          if (!resolvedId) throw new CommerceInvariantError('Provider mapping write returned no identifier');
          return { mappingId: resolvedId };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async listStores(context: TenantRequestContext): Promise<readonly CommerceStoreListItem[]> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        id: string;
        name: string;
        status: CommerceStoreListItem['status'];
        default_currency: string;
        timezone: string | null;
        updated_at: Date;
      }>`select id, name, status, default_currency, timezone, updated_at
         from commerce.stores
         where status <> 'ARCHIVED'
         order by lower(name), id`.execute(transaction);
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        defaultCurrency: row.default_currency,
        timezone: row.timezone,
        updatedAt: row.updated_at,
      }));
    });
  }

  public async listProducts(
    context: TenantRequestContext,
    storeId: string,
    input: { search?: string; limit?: number; offset?: number } = {},
  ): Promise<{ items: readonly CommerceProductListItem[]; nextOffset: number | undefined }> {
    const validatedStoreId = uuidSchema.parse(storeId);
    const search = input.search?.trim() || null;
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        id: string;
        store_id: string;
        title: string;
        vendor: string | null;
        product_type: string | null;
        status: CommerceProductListItem['status'];
        variant_count: number;
        updated_at: Date;
      }>`select p.id, p.store_id, p.title, p.vendor, p.product_type, p.status,
          count(v.id)::integer as variant_count, p.updated_at
        from commerce.products p
        left join commerce.variants v
          on v.tenant_id = p.tenant_id and v.product_id = p.id and v.status <> 'ARCHIVED'
        where p.store_id = ${validatedStoreId}::uuid
          and p.status <> 'ARCHIVED'
          and (${search}::text is null or p.title ilike '%' || ${search} || '%' or coalesce(p.vendor, '') ilike '%' || ${search} || '%')
        group by p.id, p.store_id, p.title, p.vendor, p.product_type, p.status, p.updated_at
        order by p.updated_at desc, p.id desc
        limit ${limit + 1} offset ${offset}`.execute(transaction);
      const hasMore = result.rows.length > limit;
      return {
        items: result.rows.slice(0, limit).map((row) => ({
          id: row.id,
          storeId: row.store_id,
          title: row.title,
          vendor: row.vendor,
          productType: row.product_type,
          status: row.status,
          variantCount: row.variant_count,
          updatedAt: row.updated_at,
        })),
        nextOffset: hasMore ? offset + limit : undefined,
      };
    });
  }

  public async listOrders(
    context: TenantRequestContext,
    input: { storeId?: string; customerId?: string; limit?: number; offset?: number } = {},
  ): Promise<{ items: readonly CommerceOrderListItem[]; nextOffset: number | undefined }> {
    const storeId = input.storeId ? uuidSchema.parse(input.storeId) : null;
    const customerId = input.customerId ? uuidSchema.parse(input.customerId) : null;
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        id: string;
        store_id: string;
        customer_id: string | null;
        order_number: string;
        status: CommerceOrderListItem['status'];
        financial_status: CommerceOrderListItem['financialStatus'];
        fulfillment_status: CommerceOrderListItem['fulfillmentStatus'];
        currency: string;
        total_minor: string;
        created_at: Date;
        updated_at: Date;
      }>`select id, store_id, customer_id, order_number, status, financial_status,
          fulfillment_status, currency, total_minor::text as total_minor, created_at, updated_at
        from commerce.orders
        where (${storeId}::uuid is null or store_id = ${storeId}::uuid)
          and (${customerId}::uuid is null or customer_id = ${customerId}::uuid)
        order by created_at desc, id desc
        limit ${limit + 1} offset ${offset}`.execute(transaction);
      const hasMore = result.rows.length > limit;
      return {
        items: result.rows.slice(0, limit).map(toOrderListItem),
        nextOffset: hasMore ? offset + limit : undefined,
      };
    });
  }

  public async getOrder(
    context: TenantRequestContext,
    orderId: string,
  ): Promise<CommerceOrderDetail | undefined> {
    const validatedOrderId = uuidSchema.parse(orderId);
    return withTenantTransaction(this.database, context, async (transaction) => {
      const order = await sql<{
        id: string;
        store_id: string;
        customer_id: string | null;
        order_number: string;
        status: CommerceOrderListItem['status'];
        financial_status: CommerceOrderListItem['financialStatus'];
        fulfillment_status: CommerceOrderListItem['fulfillmentStatus'];
        currency: string;
        total_minor: string;
        source: string;
        placed_at: Date | null;
        created_at: Date;
        updated_at: Date;
      }>`select id, store_id, customer_id, order_number, status, financial_status,
          fulfillment_status, currency, total_minor::text as total_minor, source,
          placed_at, created_at, updated_at
        from commerce.orders where id = ${validatedOrderId}::uuid`.execute(transaction);
      const row = order.rows[0];
      if (!row) return undefined;
      const [lines, payments, fulfillments] = await Promise.all([
        sql<{
          id: string;
          product_id: string | null;
          variant_id: string | null;
          sku: string | null;
          title: string;
          quantity: number;
          unit_price_minor: string;
          discount_minor: string;
          tax_minor: string;
          total_minor: string;
        }>`select id, product_id, variant_id, sku, title, quantity,
            unit_price_minor::text as unit_price_minor,
            discount_minor::text as discount_minor,
            tax_minor::text as tax_minor,
            total_minor::text as total_minor
          from commerce.order_lines where order_id = ${validatedOrderId}::uuid
          order by created_at, id`.execute(transaction),
        sql<{
          id: string;
          kind: string;
          status: string;
          amount_minor: string;
          currency: string;
          processed_at: Date | null;
        }>`select id, kind, status, amount_minor::text as amount_minor, currency, processed_at
          from commerce.payments where order_id = ${validatedOrderId}::uuid
          order by created_at, id`.execute(transaction),
        sql<{ id: string; status: string; fulfilled_at: Date | null }>`
          select id, status, fulfilled_at from commerce.fulfillments
          where order_id = ${validatedOrderId}::uuid order by created_at, id
        `.execute(transaction),
      ]);
      return {
        ...toOrderListItem(row),
        source: row.source,
        placedAt: row.placed_at,
        lines: lines.rows.map((line) => ({
          id: line.id,
          productId: line.product_id,
          variantId: line.variant_id,
          sku: line.sku,
          title: line.title,
          quantity: line.quantity,
          unitPriceMinor: line.unit_price_minor,
          discountMinor: line.discount_minor,
          taxMinor: line.tax_minor,
          totalMinor: line.total_minor,
        })),
        payments: payments.rows.map((payment) => ({
          id: payment.id,
          kind: payment.kind,
          status: payment.status,
          amountMinor: payment.amount_minor,
          currency: payment.currency,
          processedAt: payment.processed_at,
        })),
        fulfillments: fulfillments.rows.map((fulfillment) => ({
          id: fulfillment.id,
          status: fulfillment.status,
          fulfilledAt: fulfillment.fulfilled_at,
        })),
      };
    });
  }

  public async resolveProviderMapping(
    context: TenantRequestContext,
    input: { connectionId: string; entityType: CommerceProviderEntityType; externalId: string },
  ): Promise<{ canonicalId: string; storeId: string } | undefined> {
    const connectionId = uuidSchema.parse(input.connectionId);
    const entityType = commerceProviderEntityTypeSchema.parse(input.entityType);
    const externalId = z.string().trim().min(1).max(500).parse(input.externalId);
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{ canonical_id: string; store_id: string }>`
        select canonical_id, store_id
        from commerce.provider_mappings
        where connection_id = ${connectionId}::uuid
          and entity_type = ${entityType}
          and external_id = ${externalId}
          and state = 'ACTIVE'
        limit 1
      `.execute(transaction);
      const row = result.rows[0];
      return row ? { canonicalId: row.canonical_id, storeId: row.store_id } : undefined;
    });
  }

  private async validateCatalogReferences(
    transaction: DatabaseTransaction,
    tenantId: string,
    storeId: string,
    lines: readonly z.infer<typeof createOrderLineSchema>[],
  ): Promise<void> {
    for (const line of lines) {
      if (!line.productId) continue;
      if (line.variantId) {
        const result = await sql<{ exists: boolean }>`select exists(
          select 1 from commerce.variants
          where tenant_id = ${tenantId}::uuid and store_id = ${storeId}::uuid
            and product_id = ${line.productId}::uuid and id = ${line.variantId}::uuid
            and status = 'ACTIVE'
        ) as exists`.execute(transaction);
        if (!result.rows[0]?.exists)
          throw new CommerceInvariantError('Order line variant does not belong to the active product/store');
      } else {
        const result = await sql<{ exists: boolean }>`select exists(
          select 1 from commerce.products
          where tenant_id = ${tenantId}::uuid and store_id = ${storeId}::uuid
            and id = ${line.productId}::uuid and status = 'ACTIVE'
        ) as exists`.execute(transaction);
        if (!result.rows[0]?.exists)
          throw new CommerceInvariantError('Order line product does not belong to the active store');
      }
    }
  }

  private async assertOrderCurrency(
    transaction: DatabaseTransaction,
    tenantId: string,
    storeId: string,
    orderId: string,
    currency: string,
  ): Promise<void> {
    const result = await sql<{ currency: string }>`select currency from commerce.orders
      where tenant_id = ${tenantId}::uuid and store_id = ${storeId}::uuid and id = ${orderId}::uuid`.execute(
      transaction,
    );
    const order = result.rows[0];
    if (!order) throw new CommerceInvariantError('Order does not exist in this store');
    if (order.currency !== currency)
      throw new CommerceInvariantError('Payment currency must match the order currency');
  }

  private async assertCanonicalEntity(
    transaction: DatabaseTransaction,
    tenantId: string,
    storeId: string,
    entityType: CommerceProviderEntityType,
    canonicalId: string,
  ): Promise<void> {
    let exists = false;
    if (entityType === 'STORE') {
      const result = await sql<{ exists: boolean }>`select exists(
        select 1 from commerce.stores where tenant_id = ${tenantId}::uuid
          and id = ${canonicalId}::uuid and id = ${storeId}::uuid
      ) as exists`.execute(transaction);
      exists = result.rows[0]?.exists ?? false;
    } else if (entityType === 'PRODUCT') {
      const result = await sql<{ exists: boolean }>`select exists(
        select 1 from commerce.products where tenant_id = ${tenantId}::uuid
          and store_id = ${storeId}::uuid and id = ${canonicalId}::uuid
      ) as exists`.execute(transaction);
      exists = result.rows[0]?.exists ?? false;
    } else if (entityType === 'VARIANT') {
      const result = await sql<{ exists: boolean }>`select exists(
        select 1 from commerce.variants where tenant_id = ${tenantId}::uuid
          and store_id = ${storeId}::uuid and id = ${canonicalId}::uuid
      ) as exists`.execute(transaction);
      exists = result.rows[0]?.exists ?? false;
    } else if (entityType === 'INVENTORY_LOCATION') {
      const result = await sql<{ exists: boolean }>`select exists(
        select 1 from commerce.inventory_locations where tenant_id = ${tenantId}::uuid
          and store_id = ${storeId}::uuid and id = ${canonicalId}::uuid
      ) as exists`.execute(transaction);
      exists = result.rows[0]?.exists ?? false;
    } else if (entityType === 'ORDER') {
      const result = await sql<{ exists: boolean }>`select exists(
        select 1 from commerce.orders where tenant_id = ${tenantId}::uuid
          and store_id = ${storeId}::uuid and id = ${canonicalId}::uuid
      ) as exists`.execute(transaction);
      exists = result.rows[0]?.exists ?? false;
    } else if (entityType === 'PAYMENT') {
      const result = await sql<{ exists: boolean }>`select exists(
        select 1 from commerce.payments where tenant_id = ${tenantId}::uuid
          and store_id = ${storeId}::uuid and id = ${canonicalId}::uuid
      ) as exists`.execute(transaction);
      exists = result.rows[0]?.exists ?? false;
    } else {
      const result = await sql<{ exists: boolean }>`select exists(
        select 1 from commerce.fulfillments where tenant_id = ${tenantId}::uuid
          and store_id = ${storeId}::uuid and id = ${canonicalId}::uuid
      ) as exists`.execute(transaction);
      exists = result.rows[0]?.exists ?? false;
    }
    if (!exists)
      throw new CommerceInvariantError(`${entityType} canonical entity does not exist in this store`);
  }

  private async appendOrderTimeline(
    transaction: DatabaseTransaction,
    context: TenantRequestContext,
    storeId: string,
    orderId: string,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await sql`insert into commerce.order_timeline (
      tenant_id, store_id, order_id, event_type, actor_type, actor_id, data
    ) values (
      ${context.tenantId}::uuid, ${storeId}::uuid, ${orderId}::uuid, ${eventType},
      'USER', ${context.actorId}::uuid, ${JSON.stringify(data)}::jsonb
    )`.execute(transaction);
  }
}

function safeMultiply(left: number, right: number): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new CommerceInvariantError('Money calculation exceeds safe integer range');
  return result;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0)
    throw new CommerceInvariantError('Money calculation exceeds safe non-negative range');
  return result;
}

function safeSubtract(left: number, right: number): number {
  const result = left - right;
  if (!Number.isSafeInteger(result) || result < 0)
    throw new CommerceInvariantError('Discounts cannot exceed the amount they apply to');
  return result;
}

function safeSum(values: readonly number[]): number {
  return values.reduce((total, value) => safeAdd(total, value), 0);
}

function toOrderListItem(row: {
  id: string;
  store_id: string;
  customer_id: string | null;
  order_number: string;
  status: CommerceOrderListItem['status'];
  financial_status: CommerceOrderListItem['financialStatus'];
  fulfillment_status: CommerceOrderListItem['fulfillmentStatus'];
  currency: string;
  total_minor: string;
  created_at: Date;
  updated_at: Date;
}): CommerceOrderListItem {
  return {
    id: row.id,
    storeId: row.store_id,
    customerId: row.customer_id,
    orderNumber: row.order_number,
    status: row.status,
    financialStatus: row.financial_status,
    fulfillmentStatus: row.fulfillment_status,
    currency: row.currency,
    totalMinor: row.total_minor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
