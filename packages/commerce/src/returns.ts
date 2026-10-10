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
const uuid = z.string().uuid();

const returnLineSchema = z.object({
  orderLineId: uuid,
  quantity: z.number().int().positive(),
});
const createReturnSchema = z.object({
  storeId: uuid,
  orderId: uuid,
  resolution: z.enum(['REFUND', 'EXCHANGE']),
  reasonCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,63}$/u),
  reason: z.string().trim().min(1).max(4_000).optional(),
  lines: z.array(returnLineSchema).min(1).max(100),
});
const reviewReturnSchema = z.object({
  returnId: uuid,
  decision: z.enum(['APPROVE', 'REJECT']),
});
const receiveReturnSchema = z.object({
  returnId: uuid,
  lines: z.array(z.object({ returnLineId: uuid, quantity: z.number().int().nonnegative() })).min(1),
});
const inspectReturnLineSchema = z.object({
  returnId: uuid,
  returnLineId: uuid,
  quantity: z.number().int().nonnegative(),
  condition: z.enum(['NEW', 'OPEN_BOX', 'USED', 'DAMAGED', 'DEFECTIVE', 'MISSING']),
  disposition: z.enum(['RESTOCK', 'QUARANTINE', 'SCRAP', 'RETURN_TO_VENDOR']),
  refundableMinor: z.number().int().nonnegative(),
  restockLocationId: uuid.optional(),
});
const restockReturnLineSchema = z.object({
  returnId: uuid,
  returnLineId: uuid,
  locationId: uuid,
});
const refundSchema = z.object({
  returnId: uuid,
  amountMinor: z.number().int().positive(),
  sourcePaymentId: uuid.optional(),
  reason: z.string().trim().min(1).max(4_000).optional(),
});
const approveRefundSchema = z.object({ refundId: uuid });
const exchangeSchema = z.object({
  returnId: uuid,
  lines: z.array(z.object({ returnLineId: uuid, replacementVariantId: uuid, quantity: z.number().int().positive() })).min(1),
});

export type CreateReturnInput = z.input<typeof createReturnSchema>;
export class ReturnWorkflowInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ReturnWorkflowInvariantError';
  }
}

export interface ReturnSummary {
  id: string;
  storeId: string;
  orderId: string;
  returnNumber: string;
  status: string;
  requestedResolution: string;
  reasonCode: string;
  eligible: boolean;
  reverseLogisticsState: string;
  providerSyncState: string;
  requestedAt: Date;
  updatedAt: Date;
}

/** Canonical returns workflow. External effects are intentionally deferred to provider actions. */
export class ReturnWorkflowService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async list(context: TenantRequestContext, limit = 100): Promise<readonly ReturnSummary[]> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        id: string; store_id: string; order_id: string; return_number: string; status: string;
        requested_resolution: string; reason_code: string; eligible: boolean;
        reverse_logistics_state: string; provider_sync_state: string; requested_at: Date; updated_at: Date;
      }>`select id, store_id, order_id, return_number, status, requested_resolution, reason_code,
          eligible, reverse_logistics_state, provider_sync_state, requested_at, updated_at
        from returns.requests
        where tenant_id = ${context.tenantId}::uuid
        order by updated_at desc, id desc
        limit ${Math.max(1, Math.min(limit, 250))}`.execute(transaction);
      return result.rows.map((row) => ({
        id: row.id, storeId: row.store_id, orderId: row.order_id, returnNumber: row.return_number,
        status: row.status, requestedResolution: row.requested_resolution, reasonCode: row.reason_code,
        eligible: row.eligible, reverseLogisticsState: row.reverse_logistics_state,
        providerSyncState: row.provider_sync_state, requestedAt: row.requested_at, updatedAt: row.updated_at,
      }));
    });
  }

  public async create(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateReturnInput,
  ): Promise<CommandResult<{ returnId: string; returnNumber: string; status: 'REQUESTED'; eligible: boolean }>> {
    const validated = createReturnSchema.parse(input);
    const returnId = randomUUID();
    return this.commands.execute(
      {
        action: 'returns.request.create', permission: 'returns.create', risk: 'MEDIUM',
        resource: () => ({ type: 'returns.request', id: returnId }),
        event: {
          type: 'returns.return.requested',
          data: (_input, result) => result,
          dedupeKey: () => `returns:return:requested:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const order = await sql<{ status: string; currency: string; placed_at: Date | null; created_at: Date }>`
            select status, currency, placed_at, created_at from commerce.orders
            where tenant_id=${context.tenantId}::uuid and store_id=${validated.storeId}::uuid
              and id=${validated.orderId}::uuid for update`.execute(transaction);
          const orderRow = order.rows[0];
          if (!orderRow) throw new ReturnWorkflowInvariantError('Order was not found');
          if (['DRAFT','CANCELLED'].includes(orderRow.status))
            throw new ReturnWorkflowInvariantError('Order is not returnable');

          const anchor = orderRow.placed_at ?? orderRow.created_at;
          const eligibleUntil = new Date(anchor.getTime() + 30 * 24 * 60 * 60 * 1000);
          const eligible = eligibleUntil.getTime() >= Date.now();
          const returnNumber = `RMA-${returnId.slice(0, 8).toUpperCase()}`;

          const seen = new Set<string>();
          for (const lineInput of validated.lines) {
            if (seen.has(lineInput.orderLineId)) throw new ReturnWorkflowInvariantError('Duplicate return line');
            seen.add(lineInput.orderLineId);
            const available = await sql<{ fulfilled: string; active_returned: string }>`
              select
                coalesce((select sum(fl.quantity)::text from commerce.fulfillment_lines fl
                  join commerce.fulfillments f on f.tenant_id=fl.tenant_id and f.id=fl.fulfillment_id
                  where fl.tenant_id=line.tenant_id and fl.order_line_id=line.id and f.status='FULFILLED'), '0') as fulfilled,
                coalesce((select sum(rl.requested_quantity)::text from returns.request_lines rl
                  join returns.requests r on r.tenant_id=rl.tenant_id and r.id=rl.return_id
                  where rl.tenant_id=line.tenant_id and rl.order_line_id=line.id
                    and r.status not in ('REJECTED','CANCELLED')), '0') as active_returned
              from commerce.order_lines line
              where line.tenant_id=${context.tenantId}::uuid and line.store_id=${validated.storeId}::uuid
                and line.order_id=${validated.orderId}::uuid and line.id=${lineInput.orderLineId}::uuid`.execute(transaction);
            const row = available.rows[0];
            if (!row) throw new ReturnWorkflowInvariantError('Order line was not found');
            if (lineInput.quantity > Number(row.fulfilled) - Number(row.active_returned))
              throw new ReturnWorkflowInvariantError('Requested return quantity exceeds fulfilled returnable quantity');
          }

          await sql`insert into returns.requests (
            id, tenant_id, store_id, order_id, return_number, requested_resolution,
            reason_code, reason, eligible, eligibility_reason, policy_version,
            return_window_days, eligible_until, requested_by
          ) values (
            ${returnId}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid,
            ${validated.orderId}::uuid, ${returnNumber}, ${validated.resolution}, ${validated.reasonCode},
            ${validated.reason ?? null}, ${eligible}, ${eligible ? 'WITHIN_RETURN_WINDOW' : 'RETURN_WINDOW_EXPIRED'},
            'default-30d-v1', 30, ${eligibleUntil.toISOString()}::timestamptz, ${context.actorId ?? null}::uuid
          )`.execute(transaction);
          for (const lineInput of validated.lines) {
            await sql`insert into returns.request_lines (
              tenant_id, store_id, return_id, order_id, order_line_id, requested_quantity
            ) values (
              ${context.tenantId}::uuid, ${validated.storeId}::uuid, ${returnId}::uuid,
              ${validated.orderId}::uuid, ${lineInput.orderLineId}::uuid, ${lineInput.quantity}
            )`.execute(transaction);
          }
          await this.timeline(transaction, context, returnId, validated.storeId, 'returns.return.requested', {
            orderId: validated.orderId, resolution: validated.resolution, eligible,
          });
          return { returnId, returnNumber, status: 'REQUESTED' as const, eligible };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async review(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: z.input<typeof reviewReturnSchema>,
    approvalId?: string,
  ): Promise<CommandResult<{ returnId: string; status: 'AUTHORIZED' | 'REJECTED' }>> {
    const validated = reviewReturnSchema.parse(input);
    return this.commands.execute(
      {
        action: 'returns.request.review', permission: 'returns.approve', risk: 'HIGH',
        resource: () => ({ type: 'returns.request', id: validated.returnId }),
        event: {
          type: validated.decision === 'APPROVE' ? 'returns.return.authorized' : 'returns.return.rejected',
          data: (_input, result) => result,
          dedupeKey: () => `returns:return:reviewed:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const request = await this.loadRequest(transaction, context.tenantId, validated.returnId, true);
          if (request.status !== 'REQUESTED') throw new ReturnWorkflowInvariantError('Return is not awaiting review');
          if (validated.decision === 'APPROVE' && !request.eligible)
            throw new ReturnWorkflowInvariantError('Ineligible return cannot be authorized without a policy override');
          const status = validated.decision === 'APPROVE' ? 'AUTHORIZED' as const : 'REJECTED' as const;
          if (status === 'AUTHORIZED') {
            await sql`update returns.request_lines set authorized_quantity=requested_quantity, updated_at=now()
              where tenant_id=${context.tenantId}::uuid and return_id=${validated.returnId}::uuid`.execute(transaction);
            await sql`update returns.requests set status='AUTHORIZED', authorized_by=${context.actorId ?? null}::uuid,
              authorized_at=now(), reverse_logistics_state='PENDING', updated_at=now()
              where tenant_id=${context.tenantId}::uuid and id=${validated.returnId}::uuid`.execute(transaction);
          } else {
            await sql`update returns.requests set status='REJECTED', rejected_by=${context.actorId ?? null}::uuid,
              rejected_at=now(), updated_at=now()
              where tenant_id=${context.tenantId}::uuid and id=${validated.returnId}::uuid`.execute(transaction);
          }
          await this.timeline(transaction, context, validated.returnId, request.store_id,
            status === 'AUTHORIZED' ? 'returns.return.authorized' : 'returns.return.rejected', {});
          return { returnId: validated.returnId, status };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async receive(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: z.input<typeof receiveReturnSchema>,
  ): Promise<CommandResult<{ returnId: string; status: 'RECEIVED' }>> {
    const validated = receiveReturnSchema.parse(input);
    return this.commands.execute(
      {
        action: 'returns.request.receive', permission: 'returns.manage', risk: 'MEDIUM',
        resource: () => ({ type: 'returns.request', id: validated.returnId }),
        event: { type: 'returns.return.received', data: (_input, result) => result,
          dedupeKey: () => `returns:return:received:${idempotencyKey.trim()}` },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const request = await this.loadRequest(transaction, context.tenantId, validated.returnId, true);
          if (!['AUTHORIZED','IN_TRANSIT'].includes(request.status))
            throw new ReturnWorkflowInvariantError('Return is not ready for receipt');
          for (const item of validated.lines) {
            const updated = await sql<{ id: string }>`update returns.request_lines
              set received_quantity=${item.quantity}, updated_at=now()
              where tenant_id=${context.tenantId}::uuid and return_id=${validated.returnId}::uuid
                and id=${item.returnLineId}::uuid and ${item.quantity} <= authorized_quantity
              returning id`.execute(transaction);
            if (!updated.rows[0]) throw new ReturnWorkflowInvariantError('Invalid received return quantity');
          }
          await sql`update returns.requests set status='RECEIVED', received_by=${context.actorId ?? null}::uuid,
            received_at=now(), reverse_logistics_state='RECEIVED', updated_at=now()
            where tenant_id=${context.tenantId}::uuid and id=${validated.returnId}::uuid`.execute(transaction);
          await this.timeline(transaction, context, validated.returnId, request.store_id, 'returns.return.received', {});
          return { returnId: validated.returnId, status: 'RECEIVED' as const };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async inspectLine(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: z.input<typeof inspectReturnLineSchema>,
  ): Promise<CommandResult<{ returnId: string; returnLineId: string; inspectedQuantity: number }>> {
    const validated = inspectReturnLineSchema.parse(input);
    return this.commands.execute(
      {
        action: 'returns.line.inspect', permission: 'returns.manage', risk: 'MEDIUM',
        resource: () => ({ type: 'returns.request', id: validated.returnId }),
        event: { type: 'returns.return_line.inspected', data: (_input, result) => result,
          dedupeKey: () => `returns:line:inspected:${idempotencyKey.trim()}` },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const request = await this.loadRequest(transaction, context.tenantId, validated.returnId, true);
          if (!['RECEIVED','INSPECTING'].includes(request.status))
            throw new ReturnWorkflowInvariantError('Return must be received before inspection');
          if (validated.disposition === 'RESTOCK' && !validated.restockLocationId)
            throw new ReturnWorkflowInvariantError('Restock disposition requires an inventory location');
          const updated = await sql<{ id: string }>`update returns.request_lines
            set inspected_quantity=${validated.quantity}, condition=${validated.condition}, disposition=${validated.disposition},
                refundable_minor=${validated.refundableMinor}, restock_location_id=${validated.restockLocationId ?? null}::uuid,
                updated_at=now()
            where tenant_id=${context.tenantId}::uuid and return_id=${validated.returnId}::uuid
              and id=${validated.returnLineId}::uuid and ${validated.quantity} <= received_quantity
            returning id`.execute(transaction);
          if (!updated.rows[0]) throw new ReturnWorkflowInvariantError('Invalid inspection quantity');
          await sql`update returns.requests set status='INSPECTING', updated_at=now()
            where tenant_id=${context.tenantId}::uuid and id=${validated.returnId}::uuid`.execute(transaction);
          await this.timeline(transaction, context, validated.returnId, request.store_id, 'returns.return_line.inspected', {
            returnLineId: validated.returnLineId, quantity: validated.quantity,
            condition: validated.condition, disposition: validated.disposition,
          });
          return { returnId: validated.returnId, returnLineId: validated.returnLineId, inspectedQuantity: validated.quantity };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async restockLine(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: z.input<typeof restockReturnLineSchema>,
    approvalId?: string,
  ): Promise<CommandResult<{ returnId: string; returnLineId: string; restockedQuantity: number }>> {
    const validated = restockReturnLineSchema.parse(input);
    return this.commands.execute(
      {
        action: 'returns.line.restock', permission: 'commerce.inventory.manage', risk: 'HIGH',
        resource: () => ({ type: 'returns.request', id: validated.returnId }),
        event: { type: 'returns.return_line.restocked', data: (_input, result) => result,
          dedupeKey: () => `returns:line:restocked:${idempotencyKey.trim()}` },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const request = await this.loadRequest(transaction, context.tenantId, validated.returnId, true);
          const line = await sql<{ inspected_quantity: number; disposition: string; restocked_at: Date | null; variant_id: string | null }>`
            select rl.inspected_quantity, rl.disposition, rl.restocked_at, ol.variant_id
            from returns.request_lines rl join commerce.order_lines ol
              on ol.tenant_id=rl.tenant_id and ol.id=rl.order_line_id
            where rl.tenant_id=${context.tenantId}::uuid and rl.return_id=${validated.returnId}::uuid
              and rl.id=${validated.returnLineId}::uuid for update of rl`.execute(transaction);
          const row = line.rows[0];
          if (!row) throw new ReturnWorkflowInvariantError('Return line was not found');
          if (row.disposition !== 'RESTOCK' || row.inspected_quantity <= 0 || !row.variant_id)
            throw new ReturnWorkflowInvariantError('Return line is not restockable');
          if (row.restocked_at) throw new ReturnWorkflowInvariantError('Return line has already been restocked');
          const inventory = await sql<{ variant_id: string }>`update commerce.inventory_levels
            set on_hand=on_hand+${row.inspected_quantity}, updated_at=now()
            where tenant_id=${context.tenantId}::uuid and store_id=${request.store_id}::uuid
              and location_id=${validated.locationId}::uuid and variant_id=${row.variant_id}::uuid
            returning variant_id`.execute(transaction);
          if (!inventory.rows[0]) throw new ReturnWorkflowInvariantError('Inventory level was not found for restock');
          await sql`update returns.request_lines set restock_location_id=${validated.locationId}::uuid,
            restocked_at=now(), updated_at=now()
            where tenant_id=${context.tenantId}::uuid and id=${validated.returnLineId}::uuid`.execute(transaction);
          await this.timeline(transaction, context, validated.returnId, request.store_id, 'returns.return_line.restocked', {
            returnLineId: validated.returnLineId, locationId: validated.locationId, quantity: row.inspected_quantity,
          });
          return { returnId: validated.returnId, returnLineId: validated.returnLineId, restockedQuantity: row.inspected_quantity };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async requestRefund(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: z.input<typeof refundSchema>,
  ): Promise<CommandResult<{ refundId: string; status: 'REQUESTED' }>> {
    const validated = refundSchema.parse(input);
    const refundId = randomUUID();
    return this.commands.execute(
      {
        action: 'returns.refund.request', permission: 'returns.manage', risk: 'MEDIUM',
        resource: () => ({ type: 'returns.request', id: validated.returnId }),
        event: { type: 'returns.refund.requested', data: (_input, result) => result,
          dedupeKey: () => `returns:refund:requested:${idempotencyKey.trim()}` },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const request = await this.loadRequest(transaction, context.tenantId, validated.returnId, true);
          if (request.requested_resolution !== 'REFUND' || request.status !== 'INSPECTING')
            throw new ReturnWorkflowInvariantError('Return is not ready for refund resolution');
          const inspected = await sql<{ refundable: string; pending: number }>`select
              coalesce(sum(refundable_minor),0)::text as refundable,
              count(*) filter (where inspected_quantity < received_quantity)::int as pending
            from returns.request_lines where tenant_id=${context.tenantId}::uuid and return_id=${validated.returnId}::uuid`.execute(transaction);
          const totals = inspected.rows[0];
          if (!totals || totals.pending > 0) throw new ReturnWorkflowInvariantError('All received return lines must be inspected');
          if (validated.amountMinor > Number(totals.refundable))
            throw new ReturnWorkflowInvariantError('Refund exceeds inspected refundable amount');
          const order = await sql<{ currency: string }>`select currency from commerce.orders
            where tenant_id=${context.tenantId}::uuid and id=${request.order_id}::uuid`.execute(transaction);
          const currency = order.rows[0]?.currency;
          if (!currency) throw new ReturnWorkflowInvariantError('Return order was not found');
          await sql`insert into returns.refunds (
            id, tenant_id, store_id, return_id, order_id, source_payment_id, amount_minor, currency, reason
          ) values (
            ${refundId}::uuid, ${context.tenantId}::uuid, ${request.store_id}::uuid, ${validated.returnId}::uuid,
            ${request.order_id}::uuid, ${validated.sourcePaymentId ?? null}::uuid, ${validated.amountMinor}, ${currency},
            ${validated.reason ?? null}
          )`.execute(transaction);
          await this.timeline(transaction, context, validated.returnId, request.store_id, 'returns.refund.requested', {
            refundId, amountMinor: validated.amountMinor, currency,
          });
          return { refundId, status: 'REQUESTED' as const };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async approveRefund(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: z.input<typeof approveRefundSchema>,
    approvalId?: string,
  ): Promise<CommandResult<{ refundId: string; paymentId: string; status: 'APPROVED' }>> {
    const validated = approveRefundSchema.parse(input);
    const paymentId = randomUUID();
    return this.commands.execute(
      {
        action: 'returns.refund.approve', permission: 'commerce.refunds.issue', risk: 'CRITICAL',
        resource: () => ({ type: 'returns.refund', id: validated.refundId }),
        event: { type: 'returns.refund.approved', data: (_input, result) => result,
          dedupeKey: () => `returns:refund:approved:${idempotencyKey.trim()}` },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const refund = await sql<{ return_id: string; store_id: string; order_id: string; amount_minor: string; currency: string; status: string }>`
            select return_id, store_id, order_id, amount_minor::text, currency, status from returns.refunds
            where tenant_id=${context.tenantId}::uuid and id=${validated.refundId}::uuid for update`.execute(transaction);
          const row = refund.rows[0];
          if (!row || row.status !== 'REQUESTED') throw new ReturnWorkflowInvariantError('Pending refund was not found');
          await sql`insert into commerce.payments (
            id, tenant_id, store_id, order_id, kind, status, amount_minor, currency, metadata
          ) values (
            ${paymentId}::uuid, ${context.tenantId}::uuid, ${row.store_id}::uuid, ${row.order_id}::uuid,
            'REFUND', 'PENDING', ${row.amount_minor}::bigint, ${row.currency},
            ${JSON.stringify({ returnId: row.return_id, refundId: validated.refundId })}::jsonb
          )`.execute(transaction);
          await sql`update returns.refunds set status='APPROVED', refund_payment_id=${paymentId}::uuid,
            approved_by=${context.actorId ?? null}::uuid, approved_at=now(), updated_at=now()
            where tenant_id=${context.tenantId}::uuid and id=${validated.refundId}::uuid`.execute(transaction);
          await this.timeline(transaction, context, row.return_id, row.store_id, 'returns.refund.approved', {
            refundId: validated.refundId, paymentId,
          });
          return { refundId: validated.refundId, paymentId, status: 'APPROVED' as const };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async createExchange(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: z.input<typeof exchangeSchema>,
    approvalId?: string,
  ): Promise<CommandResult<{ exchangeId: string; status: 'FULFILLMENT_PENDING' }>> {
    const validated = exchangeSchema.parse(input);
    const exchangeId = randomUUID();
    return this.commands.execute(
      {
        action: 'returns.exchange.approve', permission: 'returns.approve', risk: 'HIGH',
        resource: () => ({ type: 'returns.request', id: validated.returnId }),
        event: { type: 'returns.exchange.fulfillment_requested', data: (_input, result) => result,
          dedupeKey: () => `returns:exchange:approved:${idempotencyKey.trim()}` },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const request = await this.loadRequest(transaction, context.tenantId, validated.returnId, true);
          if (request.requested_resolution !== 'EXCHANGE' || request.status !== 'INSPECTING')
            throw new ReturnWorkflowInvariantError('Return is not ready for exchange resolution');
          const order = await sql<{ currency: string }>`select currency from commerce.orders
            where tenant_id=${context.tenantId}::uuid and id=${request.order_id}::uuid`.execute(transaction);
          const currency = order.rows[0]?.currency;
          if (!currency) throw new ReturnWorkflowInvariantError('Return order was not found');
          await sql`insert into returns.exchanges (
            id, tenant_id, store_id, return_id, order_id, status, currency, approved_by, approved_at
          ) values (
            ${exchangeId}::uuid, ${context.tenantId}::uuid, ${request.store_id}::uuid, ${validated.returnId}::uuid,
            ${request.order_id}::uuid, 'FULFILLMENT_PENDING', ${currency}, ${context.actorId ?? null}::uuid, now()
          )`.execute(transaction);
          for (const item of validated.lines) {
            const source = await sql<{ inspected_quantity: number }>`select inspected_quantity from returns.request_lines
              where tenant_id=${context.tenantId}::uuid and return_id=${validated.returnId}::uuid
                and id=${item.returnLineId}::uuid`.execute(transaction);
            if (!source.rows[0] || item.quantity > source.rows[0].inspected_quantity)
              throw new ReturnWorkflowInvariantError('Exchange quantity exceeds inspected return quantity');
            await sql`insert into returns.exchange_lines (
              tenant_id, store_id, exchange_id, return_line_id, replacement_variant_id, quantity
            ) values (
              ${context.tenantId}::uuid, ${request.store_id}::uuid, ${exchangeId}::uuid,
              ${item.returnLineId}::uuid, ${item.replacementVariantId}::uuid, ${item.quantity}
            )`.execute(transaction);
          }
          await this.timeline(transaction, context, validated.returnId, request.store_id,
            'returns.exchange.fulfillment_requested', { exchangeId });
          return { exchangeId, status: 'FULFILLMENT_PENDING' as const };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  private async loadRequest(transaction: DatabaseTransaction, tenantId: string, returnId: string, lock = false) {
    const suffix = lock ? sql` for update` : sql``;
    const result = await sql<{
      id: string; store_id: string; order_id: string; status: string; requested_resolution: string; eligible: boolean;
    }>`select id, store_id, order_id, status, requested_resolution, eligible from returns.requests
       where tenant_id=${tenantId}::uuid and id=${returnId}::uuid${suffix}`.execute(transaction);
    const row = result.rows[0];
    if (!row) throw new ReturnWorkflowInvariantError('Return request was not found');
    return row;
  }

  private async timeline(
    transaction: DatabaseTransaction,
    context: TenantRequestContext,
    returnId: string,
    storeId: string,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await sql`insert into returns.timeline (tenant_id, store_id, return_id, event_type, actor_type, actor_id, data)
      values (${context.tenantId}::uuid, ${storeId}::uuid, ${returnId}::uuid, ${eventType},
        ${context.actorType}, ${context.actorId ?? null}::uuid, ${JSON.stringify(data)}::jsonb)`.execute(transaction);
  }
}
