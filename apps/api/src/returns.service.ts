import { randomUUID } from 'node:crypto';
import {
  CommandExecutor,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';
import { z } from 'zod';

const uuidSchema = z.string().uuid();
const reasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const resolutionSchema = z.enum(['REFUND', 'EXCHANGE', 'STORE_CREDIT', 'NO_REFUND']);
const conditionSchema = z.enum([
  'NEW',
  'OPENED',
  'USED',
  'DAMAGED',
  'DEFECTIVE',
  'MISSING_PARTS',
  'OTHER',
]);

const createReturnSchema = z
  .object({
    orderId: uuidSchema,
    reasonCode: reasonCodeSchema,
    customerNote: z.string().trim().max(4000).optional(),
    lines: z
      .array(
        z
          .object({
            orderLineId: uuidSchema,
            quantity: z.number().int().positive().max(100000),
            reasonCode: reasonCodeSchema,
            requestedResolution: resolutionSchema,
            proposedRefundMinor: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

const decisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: z.string().trim().min(1).max(4000).optional(),
  })
  .strict();

const inspectionSchema = z
  .object({
    note: z.string().trim().max(4000).optional(),
    lines: z
      .array(
        z
          .object({
            returnLineId: uuidSchema,
            acceptedQuantity: z.number().int().nonnegative(),
            rejectedQuantity: z.number().int().nonnegative(),
            condition: conditionSchema,
            note: z.string().trim().max(4000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

const exchangeSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            returnLineId: uuidSchema,
            replacementVariantId: uuidSchema,
            quantity: z.number().int().positive().max(100000),
            unitPriceDeltaMinor: z.number().int(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

const refundSchema = z
  .object({
    amountMinor: z.number().int().positive(),
    currency: currencySchema,
    reason: z.string().trim().min(1).max(4000),
    paymentId: uuidSchema.optional(),
  })
  .strict();

const restockSchema = z
  .object({
    returnLineId: uuidSchema,
    locationId: uuidSchema,
    quantity: z.number().int().positive().max(100000),
    note: z.string().trim().max(4000).optional(),
  })
  .strict();

const shipmentSchema = z.object({ shipmentId: uuidSchema }).strict();

export type CreateReturnInput = z.input<typeof createReturnSchema>;
export type ReturnDecisionInput = z.input<typeof decisionSchema>;
export type ReturnInspectionInput = z.input<typeof inspectionSchema>;
export type ExchangeInput = z.input<typeof exchangeSchema>;
export type RefundInput = z.input<typeof refundSchema>;
export type RestockInput = z.input<typeof restockSchema>;
export type ReturnShipmentInput = z.input<typeof shipmentSchema>;

export class ReturnsInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ReturnsInvariantError';
  }
}

interface ReturnListRow {
  id: string;
  order_id: string;
  order_number: string;
  status: string;
  reason_code: string;
  currency: string;
  created_at: Date;
  updated_at: Date;
}

interface ReturnLineRow {
  id: string;
  order_line_id: string;
  title: string;
  sku: string | null;
  quantity: number;
  reason_code: string;
  requested_resolution: string;
  proposed_refund_minor: string;
  currency: string;
}

interface ReturnDetailRow extends ReturnListRow {
  store_id: string;
  customer_id: string | null;
  customer_note: string | null;
  return_shipment_id: string | null;
  approved_at: Date | null;
  rejected_at: Date | null;
  received_at: Date | null;
  resolved_at: Date | null;
  cancelled_at: Date | null;
}

export class ReturnsService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async list(context: TenantRequestContext, limit = 50) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<ReturnListRow>`
        select request.id, request.order_id, orders.order_number, request.status,
               request.reason_code, orders.currency, request.created_at, request.updated_at
        from returns.return_requests request
        join commerce.orders orders
          on orders.tenant_id = request.tenant_id and orders.id = request.order_id
        order by request.created_at desc, request.id desc
        limit ${Math.min(Math.max(limit, 1), 100)}
      `.execute(transaction);
      return {
        items: result.rows.map((row) => ({
          id: row.id,
          orderId: row.order_id,
          orderNumber: row.order_number,
          status: row.status,
          reasonCode: row.reason_code,
          currency: row.currency,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        })),
      };
    });
  }

  public async eligibility(context: TenantRequestContext, orderId: string) {
    const parsedOrderId = uuidSchema.parse(orderId);
    return withTenantTransaction(this.database, context, async (transaction) => {
      const order = await sql<{
        id: string;
        store_id: string;
        order_number: string;
        status: string;
        fulfillment_status: string;
        currency: string;
        placed_at: Date | null;
        created_at: Date;
      }>`
        select id, store_id, order_number, status, fulfillment_status, currency, placed_at, created_at
        from commerce.orders where id = ${parsedOrderId}::uuid
      `.execute(transaction);
      const row = order.rows[0];
      if (!row) throw new ReturnsInvariantError('Order was not found');

      const policy = await sql<{
        id: string;
        return_window_days: number;
        require_fulfilled: boolean;
        allow_exchanges: boolean;
        require_inspection: boolean;
        allow_restock: boolean;
      }>`
        select id, return_window_days, require_fulfilled, allow_exchanges,
               require_inspection, allow_restock
        from returns.policies
        where store_id = ${row.store_id}::uuid and status = 'ACTIVE'
        order by updated_at desc, id
        limit 1
      `.execute(transaction);
      const selectedPolicy = policy.rows[0] ?? {
        id: null,
        return_window_days: 14,
        require_fulfilled: true,
        allow_exchanges: true,
        require_inspection: true,
        allow_restock: true,
      };
      const anchor = row.placed_at ?? row.created_at;
      const deadline = new Date(anchor.getTime() + selectedPolicy.return_window_days * 86_400_000);
      const withinWindow = Date.now() <= deadline.getTime();
      const fulfillmentEligible =
        !selectedPolicy.require_fulfilled || ['PARTIAL', 'FULFILLED'].includes(row.fulfillment_status);
      const orderEligible = !['CANCELLED'].includes(row.status);

      const lines = await sql<{
        id: string;
        title: string;
        sku: string | null;
        quantity: number;
        total_minor: string;
        already_returned: string;
      }>`
        select line.id, line.title, line.sku, line.quantity, line.total_minor::text,
          coalesce((
            select sum(return_line.quantity)
            from returns.return_lines return_line
            join returns.return_requests request
              on request.tenant_id = return_line.tenant_id and request.id = return_line.return_id
            where return_line.tenant_id = line.tenant_id
              and return_line.order_line_id = line.id
              and request.status not in ('REJECTED','CANCELLED')
          ), 0)::text as already_returned
        from commerce.order_lines line
        where line.order_id = ${parsedOrderId}::uuid
        order by line.created_at, line.id
      `.execute(transaction);

      return {
        orderId: row.id,
        orderNumber: row.order_number,
        currency: row.currency,
        eligible: withinWindow && fulfillmentEligible && orderEligible,
        reasons: [
          ...(withinWindow ? [] : ['RETURN_WINDOW_EXPIRED']),
          ...(fulfillmentEligible ? [] : ['ORDER_NOT_FULFILLED']),
          ...(orderEligible ? [] : ['ORDER_CANCELLED']),
        ],
        deadline: deadline.toISOString(),
        policy: {
          id: selectedPolicy.id,
          returnWindowDays: selectedPolicy.return_window_days,
          requireFulfilled: selectedPolicy.require_fulfilled,
          allowExchanges: selectedPolicy.allow_exchanges,
          requireInspection: selectedPolicy.require_inspection,
          allowRestock: selectedPolicy.allow_restock,
        },
        lines: lines.rows.map((line) => ({
          orderLineId: line.id,
          title: line.title,
          sku: line.sku,
          purchasedQuantity: line.quantity,
          alreadyReturnedQuantity: Number(line.already_returned),
          returnableQuantity: Math.max(0, line.quantity - Number(line.already_returned)),
          lineTotalMinor: line.total_minor,
        })),
      };
    });
  }

  public async detail(context: TenantRequestContext, returnId: string) {
    const id = uuidSchema.parse(returnId);
    return withTenantTransaction(this.database, context, async (transaction) => {
      const request = await sql<ReturnDetailRow>`
        select request.id, request.store_id, request.order_id, orders.order_number,
               request.customer_id, request.status, request.reason_code, request.customer_note,
               request.return_shipment_id, orders.currency, request.approved_at, request.rejected_at,
               request.received_at, request.resolved_at, request.cancelled_at,
               request.created_at, request.updated_at
        from returns.return_requests request
        join commerce.orders orders on orders.tenant_id = request.tenant_id and orders.id = request.order_id
        where request.id = ${id}::uuid
      `.execute(transaction);
      const row = request.rows[0];
      if (!row) return undefined;
      const [lines, inspections, exchanges, refunds, restocks, timeline] = await Promise.all([
        sql<ReturnLineRow>`
          select line.id, line.order_line_id, order_line.title, order_line.sku,
                 line.quantity, line.reason_code, line.requested_resolution,
                 line.proposed_refund_minor::text, line.currency
          from returns.return_lines line
          join commerce.order_lines order_line
            on order_line.tenant_id = line.tenant_id and order_line.id = line.order_line_id
          where line.return_id = ${id}::uuid order by line.created_at, line.id
        `.execute(transaction),
        sql<Record<string, unknown>>`select * from returns.inspections where return_id = ${id}::uuid order by created_at`.execute(transaction),
        sql<Record<string, unknown>>`select * from returns.exchange_requests where return_id = ${id}::uuid order by created_at`.execute(transaction),
        sql<Record<string, unknown>>`select * from returns.refunds where return_id = ${id}::uuid order by created_at`.execute(transaction),
        sql<Record<string, unknown>>`select * from returns.restock_movements where return_id = ${id}::uuid order by created_at`.execute(transaction),
        sql<{ event_type: string; data: unknown; occurred_at: Date }>`select event_type, data, occurred_at from returns.timeline where return_id = ${id}::uuid order by occurred_at, id`.execute(transaction),
      ]);
      return {
        id: row.id,
        storeId: row.store_id,
        orderId: row.order_id,
        orderNumber: row.order_number,
        customerId: row.customer_id,
        status: row.status,
        reasonCode: row.reason_code,
        customerNote: row.customer_note,
        returnShipmentId: row.return_shipment_id,
        currency: row.currency,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        lines: lines.rows.map((line) => ({
          id: line.id,
          orderLineId: line.order_line_id,
          title: line.title,
          sku: line.sku,
          quantity: line.quantity,
          reasonCode: line.reason_code,
          requestedResolution: line.requested_resolution,
          proposedRefundMinor: line.proposed_refund_minor,
          currency: line.currency,
        })),
        inspections: inspections.rows,
        exchanges: exchanges.rows,
        refunds: refunds.rows,
        restocks: restocks.rows,
        timeline: timeline.rows.map((event) => ({
          eventType: event.event_type,
          data: event.data,
          occurredAt: event.occurred_at.toISOString(),
        })),
      };
    });
  }

  public async create(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateReturnInput,
  ): Promise<CommandResult<{ returnId: string; status: 'REQUESTED' }>> {
    const validated = createReturnSchema.parse(input);
    const returnId = randomUUID();
    return this.commands.execute(
      {
        action: 'returns.request.create',
        permission: 'returns.create',
        risk: 'MEDIUM',
        resource: () => ({ type: 'returns.request', id: returnId }),
        event: {
          type: 'returns.request.created',
          data: () => ({ returnId, orderId: validated.orderId, lineCount: validated.lines.length }),
          dedupeKey: () => `returns:request:created:${idempotencyKey}`,
        },
        audit: {
          afterState: () => ({ returnId, orderId: validated.orderId, status: 'REQUESTED' }),
        },
        execute: async (transaction) => {
          const orderResult = await sql<{
            store_id: string;
            customer_id: string | null;
            currency: string;
            status: string;
            fulfillment_status: string;
            placed_at: Date | null;
            created_at: Date;
          }>`select store_id, customer_id, currency, status, fulfillment_status, placed_at, created_at
              from commerce.orders where id = ${validated.orderId}::uuid`.execute(transaction);
          const order = orderResult.rows[0];
          if (!order) throw new ReturnsInvariantError('Order was not found');
          if (order.status === 'CANCELLED') throw new ReturnsInvariantError('Cancelled orders cannot be returned');

          const policyResult = await sql<{
            id: string;
            return_window_days: number;
            require_fulfilled: boolean;
            allow_exchanges: boolean;
            require_inspection: boolean;
            allow_restock: boolean;
          }>`select id, return_window_days, require_fulfilled, allow_exchanges,
                     require_inspection, allow_restock
              from returns.policies where store_id = ${order.store_id}::uuid and status = 'ACTIVE'
              order by updated_at desc, id limit 1`.execute(transaction);
          const policy = policyResult.rows[0];
          const windowDays = policy?.return_window_days ?? 14;
          const anchor = order.placed_at ?? order.created_at;
          if (Date.now() > anchor.getTime() + windowDays * 86_400_000) {
            throw new ReturnsInvariantError('Return window has expired');
          }
          if ((policy?.require_fulfilled ?? true) && !['PARTIAL', 'FULFILLED'].includes(order.fulfillment_status)) {
            throw new ReturnsInvariantError('Order must be fulfilled before a return can be requested');
          }
          if (validated.lines.some((line) => line.requestedResolution === 'EXCHANGE') && policy?.allow_exchanges === false) {
            throw new ReturnsInvariantError('Exchange resolution is disabled by the active return policy');
          }

          await sql`insert into returns.return_requests (
              id, tenant_id, store_id, order_id, customer_id, policy_id, reason_code,
              customer_note, eligibility_snapshot, requested_by_user_id
            ) values (
              ${returnId}::uuid, ${context.tenantId}::uuid, ${order.store_id}::uuid,
              ${validated.orderId}::uuid, ${order.customer_id}::uuid, ${policy?.id ?? null}::uuid,
              ${validated.reasonCode}, ${validated.customerNote ?? null},
              ${JSON.stringify({ windowDays, requireFulfilled: policy?.require_fulfilled ?? true })}::jsonb,
              ${context.actorId}::uuid
            )`.execute(transaction);

          for (const line of validated.lines) {
            await sql`insert into returns.return_lines (
                tenant_id, store_id, return_id, order_id, order_line_id, quantity,
                reason_code, requested_resolution, proposed_refund_minor, currency
              ) values (
                ${context.tenantId}::uuid, ${order.store_id}::uuid, ${returnId}::uuid,
                ${validated.orderId}::uuid, ${line.orderLineId}::uuid, ${line.quantity},
                ${line.reasonCode}, ${line.requestedResolution}, ${line.proposedRefundMinor}, ${order.currency}
              )`.execute(transaction);
          }
          await this.timeline(transaction, context, returnId, 'returns.request.created', {
            orderId: validated.orderId,
            lineCount: validated.lines.length,
          });
          await sql`insert into platform.usage_records (
              tenant_id, meter_key, meter_version, quantity, unit, occurred_at, source_type,
              source_id, resource_type, resource_id, correlation_id, idempotency_key, bounded_metadata
            ) values (
              ${context.tenantId}::uuid, 'returns.request.created', 1, 1, 'case', now(), 'RETURN_REQUEST',
              ${returnId}, 'returns.request', ${returnId}, ${context.correlationId}, ${idempotencyKey},
              ${JSON.stringify({ resolution: validated.lines[0]?.requestedResolution ?? 'MIXED' })}::jsonb
            )`.execute(transaction);
          return { returnId, status: 'REQUESTED' as const };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async decide(
    context: TenantRequestContext,
    returnId: string,
    idempotencyKey: string,
    input: ReturnDecisionInput,
    approvalId?: string,
  ) {
    const id = uuidSchema.parse(returnId);
    const validated = decisionSchema.parse(input);
    return this.commands.execute(
      {
        action: 'returns.request.decide',
        permission: 'returns.approve',
        risk: 'HIGH',
        resource: () => ({ type: 'returns.request', id }),
        event: {
          type: validated.decision === 'APPROVE' ? 'returns.request.approved' : 'returns.request.rejected',
          data: () => ({ returnId: id, decision: validated.decision }),
          dedupeKey: () => `returns:decision:${id}:${idempotencyKey}`,
        },
        execute: async (transaction) => {
          const targetStatus = validated.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
          const result = await sql<{ id: string }>`update returns.return_requests
            set status = ${targetStatus},
                approved_at = case when ${targetStatus} = 'APPROVED' then now() else null end,
                rejected_at = case when ${targetStatus} = 'REJECTED' then now() else null end,
                updated_at = now()
            where id = ${id}::uuid and status = 'REQUESTED'
            returning id`.execute(transaction);
          if (!result.rows[0]) throw new ReturnsInvariantError('Only requested returns can be decided');
          await this.timeline(transaction, context, id, `returns.request.${targetStatus.toLowerCase()}`, {
            reason: validated.reason ?? null,
          });
          return { returnId: id, status: targetStatus };
        },
      },
      { context, input: validated, idempotencyKey, approvalId },
    );
  }

  public async markReceived(context: TenantRequestContext, returnId: string, idempotencyKey: string) {
    const id = uuidSchema.parse(returnId);
    return this.commands.execute(
      {
        action: 'returns.request.receive',
        permission: 'returns.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'returns.request', id }),
        event: {
          type: 'returns.request.received',
          data: () => ({ returnId: id }),
          dedupeKey: () => `returns:received:${id}:${idempotencyKey}`,
        },
        execute: async (transaction) => {
          const result = await sql<{ id: string }>`update returns.return_requests
            set status = 'RECEIVED', received_at = now(), updated_at = now()
            where id = ${id}::uuid and status in ('APPROVED','IN_TRANSIT') returning id`.execute(transaction);
          if (!result.rows[0]) throw new ReturnsInvariantError('Return must be approved or in transit before receipt');
          await this.timeline(transaction, context, id, 'returns.request.received', {});
          return { returnId: id, status: 'RECEIVED' as const };
        },
      },
      { context, input: { returnId: id }, idempotencyKey },
    );
  }

  public async inspect(
    context: TenantRequestContext,
    returnId: string,
    idempotencyKey: string,
    input: ReturnInspectionInput,
  ) {
    const id = uuidSchema.parse(returnId);
    const validated = inspectionSchema.parse(input);
    const inspectionId = randomUUID();
    return this.commands.execute(
      {
        action: 'returns.inspection.complete',
        permission: 'returns.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'returns.request', id }),
        event: {
          type: 'returns.inspection.completed',
          data: () => ({ returnId: id, inspectionId }),
          dedupeKey: () => `returns:inspection:${id}:${idempotencyKey}`,
        },
        execute: async (transaction) => {
          const request = await sql<{ id: string }>`select id from returns.return_requests where id = ${id}::uuid and status = 'RECEIVED'`.execute(transaction);
          if (!request.rows[0]) throw new ReturnsInvariantError('Return must be received before inspection');
          await sql`insert into returns.inspections (
              id, tenant_id, return_id, status, inspected_by_user_id, inspected_at, note
            ) values (${inspectionId}::uuid, ${context.tenantId}::uuid, ${id}::uuid, 'COMPLETED',
              ${context.actorId}::uuid, now(), ${validated.note ?? null})`.execute(transaction);
          for (const line of validated.lines) {
            await sql`insert into returns.inspection_lines (
                tenant_id, return_id, inspection_id, return_line_id, accepted_quantity,
                rejected_quantity, condition, note
              ) values (${context.tenantId}::uuid, ${id}::uuid, ${inspectionId}::uuid,
                ${line.returnLineId}::uuid, ${line.acceptedQuantity}, ${line.rejectedQuantity},
                ${line.condition}, ${line.note ?? null})`.execute(transaction);
          }
          await sql`update returns.return_requests set status = 'INSPECTED', updated_at = now() where id = ${id}::uuid`.execute(transaction);
          await this.timeline(transaction, context, id, 'returns.inspection.completed', { inspectionId });
          return { returnId: id, inspectionId, status: 'INSPECTED' as const };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async createExchange(
    context: TenantRequestContext,
    returnId: string,
    idempotencyKey: string,
    input: ExchangeInput,
    approvalId?: string,
  ) {
    const id = uuidSchema.parse(returnId);
    const validated = exchangeSchema.parse(input);
    const exchangeId = randomUUID();
    return this.commands.execute(
      {
        action: 'returns.exchange.create',
        permission: 'returns.approve',
        risk: 'HIGH',
        resource: () => ({ type: 'returns.exchange', id: exchangeId }),
        event: {
          type: 'returns.exchange.created',
          data: () => ({ returnId: id, exchangeId }),
          dedupeKey: () => `returns:exchange:${exchangeId}`,
        },
        execute: async (transaction) => {
          const request = await sql<{ currency: string; allowed: boolean }>`
            select orders.currency,
              coalesce(policy.allow_exchanges, true) as allowed
            from returns.return_requests request
            join commerce.orders orders on orders.tenant_id = request.tenant_id and orders.id = request.order_id
            left join returns.policies policy on policy.tenant_id = request.tenant_id and policy.id = request.policy_id
            where request.id = ${id}::uuid and request.status in ('INSPECTED','RESOLVED')
          `.execute(transaction);
          const row = request.rows[0];
          if (!row) throw new ReturnsInvariantError('Return must be inspected before exchange creation');
          if (!row.allowed) throw new ReturnsInvariantError('Exchanges are disabled by the return policy');
          await sql`insert into returns.exchange_requests (
              id, tenant_id, return_id, status, currency, approved_at
            ) values (${exchangeId}::uuid, ${context.tenantId}::uuid, ${id}::uuid,
              'APPROVED', ${row.currency}, now())`.execute(transaction);
          for (const line of validated.lines) {
            await sql`insert into returns.exchange_lines (
                tenant_id, return_id, exchange_id, return_line_id,
                replacement_variant_id, quantity, unit_price_delta_minor, currency
              ) values (${context.tenantId}::uuid, ${id}::uuid, ${exchangeId}::uuid,
                ${line.returnLineId}::uuid, ${line.replacementVariantId}::uuid,
                ${line.quantity}, ${line.unitPriceDeltaMinor}, ${row.currency})`.execute(transaction);
          }
          await this.timeline(transaction, context, id, 'returns.exchange.created', { exchangeId });
          return { returnId: id, exchangeId, status: 'APPROVED' as const };
        },
      },
      { context, input: validated, idempotencyKey, approvalId },
    );
  }

  public async requestRefund(
    context: TenantRequestContext,
    returnId: string,
    idempotencyKey: string,
    input: RefundInput,
    approvalId?: string,
  ) {
    const id = uuidSchema.parse(returnId);
    const validated = refundSchema.parse(input);
    const refundId = randomUUID();
    return this.commands.execute(
      {
        action: 'returns.refund.issue',
        permission: 'commerce.refunds.issue',
        risk: 'CRITICAL',
        resource: () => ({ type: 'returns.refund', id: refundId }),
        event: {
          type: 'returns.refund.requested',
          data: () => ({ returnId: id, refundId, amountMinor: validated.amountMinor, currency: validated.currency }),
          dedupeKey: () => `returns:refund:${refundId}`,
        },
        execute: async (transaction) => {
          const request = await sql<{ order_id: string; store_id: string; max_refund: string }>`
            select request.order_id, request.store_id,
              coalesce(sum(
                case when inspected.accepted_quantity > 0 then
                  floor(line.proposed_refund_minor::numeric * inspected.accepted_quantity / line.quantity)
                else 0 end
              ),0)::bigint::text as max_refund
            from returns.return_requests request
            join returns.return_lines line on line.tenant_id = request.tenant_id and line.return_id = request.id
            left join returns.inspection_lines inspected
              on inspected.tenant_id = line.tenant_id and inspected.return_id = line.return_id
             and inspected.return_line_id = line.id
            where request.id = ${id}::uuid and request.status in ('INSPECTED','RESOLVED')
            group by request.order_id, request.store_id
          `.execute(transaction);
          const row = request.rows[0];
          if (!row) throw new ReturnsInvariantError('Return must be inspected before a refund can be issued');
          if (BigInt(validated.amountMinor) > BigInt(row.max_refund)) {
            throw new ReturnsInvariantError('Refund exceeds the accepted inspected return value');
          }
          if (validated.paymentId) {
            const payment = await sql<{ id: string }>`select id from commerce.payments
              where id = ${validated.paymentId}::uuid and order_id = ${row.order_id}::uuid and currency = ${validated.currency}`.execute(transaction);
            if (!payment.rows[0]) throw new ReturnsInvariantError('Payment does not belong to the return order/currency');
          }
          const mapping = await sql<{ connection_id: string }>`
            select connection_id from commerce.provider_mappings
            where store_id = ${row.store_id}::uuid and entity_type = 'ORDER'
              and canonical_id = ${row.order_id}::uuid and state = 'ACTIVE'
            order by updated_at desc limit 1
          `.execute(transaction);
          const connectionId = mapping.rows[0]?.connection_id ?? null;
          const providerActionId = connectionId ? randomUUID() : null;
          if (providerActionId && connectionId) {
            await sql`insert into integrations.provider_actions (
                id, tenant_id, connection_id, action_type, input, idempotency_key
              ) values (${providerActionId}::uuid, ${context.tenantId}::uuid, ${connectionId}::uuid,
                'commerce.refund.create',
                ${JSON.stringify({ refundId, returnId: id, orderId: row.order_id, paymentId: validated.paymentId ?? null, amountMinor: validated.amountMinor, currency: validated.currency, reason: validated.reason })}::jsonb,
                ${`returns-refund:${refundId}`})`.execute(transaction);
          }
          const status = providerActionId ? 'QUEUED' : 'APPROVED';
          await sql`insert into returns.refunds (
              id, tenant_id, return_id, order_id, payment_id, connection_id, provider_action_id,
              status, amount_minor, currency, reason, approved_at
            ) values (${refundId}::uuid, ${context.tenantId}::uuid, ${id}::uuid, ${row.order_id}::uuid,
              ${validated.paymentId ?? null}::uuid, ${connectionId}::uuid, ${providerActionId}::uuid,
              ${status}, ${validated.amountMinor}, ${validated.currency}, ${validated.reason}, now())`.execute(transaction);
          await this.timeline(transaction, context, id, 'returns.refund.requested', {
            refundId,
            status,
            amountMinor: validated.amountMinor,
            providerActionId,
          });
          if (providerActionId) {
            await sql`insert into platform.usage_records (
                tenant_id, meter_key, meter_version, quantity, unit, occurred_at, source_type,
                source_id, resource_type, resource_id, provider_key, connection_id,
                correlation_id, idempotency_key, bounded_metadata
              ) values (${context.tenantId}::uuid, 'returns.refund.queued', 1, 1, 'refund', now(),
                'RETURN_REFUND', ${refundId}, 'returns.refund', ${refundId}, 'commerce',
                ${connectionId}::uuid, ${context.correlationId}, ${idempotencyKey},
                ${JSON.stringify({ currency: validated.currency })}::jsonb)`.execute(transaction);
          }
          return { returnId: id, refundId, status, providerActionId };
        },
      },
      { context, input: validated, idempotencyKey, approvalId },
    );
  }

  public async restock(
    context: TenantRequestContext,
    returnId: string,
    idempotencyKey: string,
    input: RestockInput,
    approvalId?: string,
  ) {
    const id = uuidSchema.parse(returnId);
    const validated = restockSchema.parse(input);
    const movementId = randomUUID();
    return this.commands.execute(
      {
        action: 'returns.restock.record',
        permission: 'commerce.inventory.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'returns.restock', id: movementId }),
        event: {
          type: 'returns.restock.recorded',
          data: () => ({ returnId: id, movementId, quantity: validated.quantity }),
          dedupeKey: () => `returns:restock:${movementId}`,
        },
        execute: async (transaction) => {
          const line = await sql<{ variant_id: string | null }>`
            select order_line.variant_id
            from returns.return_lines return_line
            join commerce.order_lines order_line
              on order_line.tenant_id = return_line.tenant_id and order_line.id = return_line.order_line_id
            join returns.return_requests request
              on request.tenant_id = return_line.tenant_id and request.id = return_line.return_id
            where return_line.return_id = ${id}::uuid and return_line.id = ${validated.returnLineId}::uuid
              and request.status in ('INSPECTED','RESOLVED')
          `.execute(transaction);
          const variantId = line.rows[0]?.variant_id;
          if (!variantId) throw new ReturnsInvariantError('Return line has no canonical inventory variant');
          const inventory = await sql<{ store_id: string }>`select store_id from commerce.inventory_levels
            where location_id = ${validated.locationId}::uuid and variant_id = ${variantId}::uuid`.execute(transaction);
          if (!inventory.rows[0]) throw new ReturnsInvariantError('Inventory level was not found for restock target');
          await sql`insert into returns.restock_movements (
              id, tenant_id, return_id, return_line_id, variant_id, location_id, quantity, actor_user_id, note
            ) values (${movementId}::uuid, ${context.tenantId}::uuid, ${id}::uuid,
              ${validated.returnLineId}::uuid, ${variantId}::uuid, ${validated.locationId}::uuid,
              ${validated.quantity}, ${context.actorId}::uuid, ${validated.note ?? null})`.execute(transaction);
          await sql`update commerce.inventory_levels set on_hand = on_hand + ${validated.quantity}, updated_at = now()
            where location_id = ${validated.locationId}::uuid and variant_id = ${variantId}::uuid`.execute(transaction);
          await this.timeline(transaction, context, id, 'returns.restock.recorded', {
            movementId,
            quantity: validated.quantity,
            variantId,
            locationId: validated.locationId,
          });
          return { returnId: id, movementId, quantity: validated.quantity };
        },
      },
      { context, input: validated, idempotencyKey, approvalId },
    );
  }

  public async linkShipment(
    context: TenantRequestContext,
    returnId: string,
    idempotencyKey: string,
    input: ReturnShipmentInput,
  ) {
    const id = uuidSchema.parse(returnId);
    const validated = shipmentSchema.parse(input);
    return this.commands.execute(
      {
        action: 'returns.shipment.link',
        permission: 'returns.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'returns.request', id }),
        event: {
          type: 'returns.shipment.linked',
          data: () => ({ returnId: id, shipmentId: validated.shipmentId }),
          dedupeKey: () => `returns:shipment:${id}:${idempotencyKey}`,
        },
        execute: async (transaction) => {
          const result = await sql<{ id: string }>`update returns.return_requests request
            set return_shipment_id = ${validated.shipmentId}::uuid,
                status = case when request.status = 'APPROVED' then 'IN_TRANSIT' else request.status end,
                updated_at = now()
            where request.id = ${id}::uuid
              and exists (select 1 from shipping.shipments shipment
                where shipment.id = ${validated.shipmentId}::uuid and shipment.order_id = request.order_id)
            returning request.id`.execute(transaction);
          if (!result.rows[0]) throw new ReturnsInvariantError('Return shipment must belong to the same order');
          await this.timeline(transaction, context, id, 'returns.shipment.linked', {
            shipmentId: validated.shipmentId,
          });
          return { returnId: id, shipmentId: validated.shipmentId };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  private async timeline(
    transaction: Parameters<Parameters<CommandExecutor['execute']>[0]['execute']>[0],
    context: TenantRequestContext,
    returnId: string,
    eventType: string,
    data: Record<string, unknown>,
  ) {
    await sql`insert into returns.timeline (
        tenant_id, return_id, event_type, actor_type, actor_id, data
      ) values (${context.tenantId}::uuid, ${returnId}::uuid, ${eventType},
        ${context.actorType}, ${context.actorId}::uuid, ${JSON.stringify(data)}::jsonb)`.execute(transaction);
  }
}
