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
const currencySchema = z.string().regex(/^[A-Z]{3}$/u);
const reasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/u);
const policyInputSchema = z.object({
  storeId: uuidSchema,
  name: z.string().trim().min(1).max(200),
  returnWindowDays: z.number().int().min(0).max(365),
  requireInspection: z.boolean().default(true),
  allowExchange: z.boolean().default(true),
  allowStoreCredit: z.boolean().default(true),
});
const requestInputSchema = z.object({
  storeId: uuidSchema,
  orderId: uuidSchema,
  kind: z.enum(['RETURN', 'EXCHANGE']),
  reasonCode: reasonCodeSchema,
  customerNote: z.string().trim().max(4000).optional(),
  lines: z.array(z.object({
    orderLineId: uuidSchema,
    quantity: z.number().int().min(1).max(1_000_000),
    exchangeVariantId: uuidSchema.optional(),
  })).min(1).max(500),
});
const reviewInputSchema = z.object({
  requestId: uuidSchema,
  decision: z.enum(['APPROVE', 'REJECT']),
  internalNote: z.string().trim().max(10_000).optional(),
});
const inspectInputSchema = z.object({
  requestId: uuidSchema,
  lines: z.array(z.object({
    lineId: uuidSchema,
    receivedQuantity: z.number().int().min(0).max(1_000_000),
    acceptedQuantity: z.number().int().min(0).max(1_000_000),
    inspectionStatus: z.enum(['PENDING', 'ACCEPTED', 'PARTIAL', 'REJECTED']),
    conditionCode: reasonCodeSchema.optional(),
    restockDisposition: z.enum(['PENDING', 'RESTOCK', 'QUARANTINE', 'DISCARD', 'RETURN_TO_VENDOR']),
  })).min(1).max(500),
});
const refundInputSchema = z.object({
  requestId: uuidSchema,
  sourcePaymentId: uuidSchema,
  connectionId: uuidSchema,
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: currencySchema,
  reason: z.string().trim().min(1).max(4000),
});
const exchangeInputSchema = z.object({
  requestId: uuidSchema,
  priceAdjustmentMinor: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  currency: currencySchema,
});
const fulfillExchangeSchema = z.object({ exchangeId: uuidSchema, replacementOrderId: uuidSchema });

export type ReturnPolicyInput = z.input<typeof policyInputSchema>;
export type CreateReturnRequestInput = z.input<typeof requestInputSchema>;
export type ReviewReturnRequestInput = z.input<typeof reviewInputSchema>;
export type InspectReturnInput = z.input<typeof inspectInputSchema>;
export type IssueRefundInput = z.input<typeof refundInputSchema>;
export type CreateExchangeInput = z.input<typeof exchangeInputSchema>;
export type FulfillExchangeInput = z.input<typeof fulfillExchangeSchema>;

export class ReturnsInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ReturnsInvariantError';
  }
}

interface RequestRow {
  id: string;
  store_id: string;
  order_id: string;
  customer_id: string | null;
  policy_id: string | null;
  kind: 'RETURN' | 'EXCHANGE';
  status: string;
  reason_code: string;
  requested_at: Date;
  updated_at: Date;
}

export class ReturnsService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async list(context: TenantRequestContext) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<RequestRow>`select id, store_id, order_id, customer_id, policy_id,
          kind, status, reason_code, requested_at, updated_at
        from returns.requests order by requested_at desc, id desc`.execute(transaction);
      return result.rows.map((row) => ({
        id: row.id,
        storeId: row.store_id,
        orderId: row.order_id,
        customerId: row.customer_id,
        kind: row.kind,
        status: row.status,
        reasonCode: row.reason_code,
        requestedAt: row.requested_at,
        updatedAt: row.updated_at,
      }));
    });
  }

  public async get(context: TenantRequestContext, requestId: string) {
    const id = uuidSchema.parse(requestId);
    return withTenantTransaction(this.database, context, async (transaction) => {
      const request = await sql<RequestRow & { customer_note: string | null; internal_note: string | null }>`
        select id, store_id, order_id, customer_id, policy_id, kind, status, reason_code,
               requested_at, updated_at, customer_note, internal_note
        from returns.requests where id = ${id}::uuid`.execute(transaction);
      const row = request.rows[0];
      if (!row) return undefined;
      const [lines, refunds, exchanges, timeline] = await Promise.all([
        sql<{ id: string; order_line_id: string; requested_quantity: number; received_quantity: number;
          accepted_quantity: number; inspection_status: string; condition_code: string | null;
          restock_disposition: string; eligible_refund_minor: string; exchange_variant_id: string | null }>`
          select id, order_line_id, requested_quantity, received_quantity, accepted_quantity,
                 inspection_status, condition_code, restock_disposition,
                 eligible_refund_minor::text, exchange_variant_id
          from returns.request_lines where request_id = ${id}::uuid order by created_at, id
        `.execute(transaction),
        sql<{ id: string; amount_minor: string; currency: string; status: string;
          provider_action_id: string | null; provider_reference: string | null }>`
          select id, amount_minor::text, currency, status, provider_action_id, provider_reference
          from returns.refunds where return_request_id = ${id}::uuid order by created_at desc, id desc
        `.execute(transaction),
        sql<{ id: string; status: string; price_adjustment_minor: string; currency: string;
          replacement_order_id: string | null }>`
          select id, status, price_adjustment_minor::text, currency, replacement_order_id
          from returns.exchanges where return_request_id = ${id}::uuid
        `.execute(transaction),
        sql<{ event_type: string; data: Record<string, unknown>; occurred_at: Date }>`
          select event_type, data, occurred_at from returns.timeline
          where request_id = ${id}::uuid order by occurred_at, id
        `.execute(transaction),
      ]);
      return {
        id: row.id, storeId: row.store_id, orderId: row.order_id, customerId: row.customer_id,
        kind: row.kind, status: row.status, reasonCode: row.reason_code,
        customerNote: row.customer_note, internalNote: row.internal_note,
        requestedAt: row.requested_at, updatedAt: row.updated_at,
        lines: lines.rows.map((line) => ({
          id: line.id, orderLineId: line.order_line_id,
          requestedQuantity: line.requested_quantity, receivedQuantity: line.received_quantity,
          acceptedQuantity: line.accepted_quantity, inspectionStatus: line.inspection_status,
          conditionCode: line.condition_code, restockDisposition: line.restock_disposition,
          eligibleRefundMinor: Number(line.eligible_refund_minor), exchangeVariantId: line.exchange_variant_id,
        })),
        refunds: refunds.rows.map((refund) => ({
          id: refund.id, amountMinor: Number(refund.amount_minor), currency: refund.currency,
          status: refund.status, providerActionId: refund.provider_action_id,
          providerReference: refund.provider_reference,
        })),
        exchanges: exchanges.rows.map((exchange) => ({
          id: exchange.id, status: exchange.status,
          priceAdjustmentMinor: Number(exchange.price_adjustment_minor), currency: exchange.currency,
          replacementOrderId: exchange.replacement_order_id,
        })),
        timeline: timeline.rows.map((event) => ({
          eventType: event.event_type, data: event.data, occurredAt: event.occurred_at,
        })),
      };
    });
  }

  public async upsertPolicy(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: ReturnPolicyInput,
    approvalId?: string,
  ): Promise<CommandResult<{ policyId: string; status: 'ACTIVE' }>> {
    const validated = policyInputSchema.parse(input);
    const policyId = randomUUID();
    return this.commands.execute({
      action: 'returns.policy.upsert', permission: 'returns.manage', risk: 'HIGH',
      resource: () => ({ type: 'returns.policy', id: validated.storeId }),
      event: { type: 'returns.policy.updated', data: (_input, result) => result,
        dedupeKey: () => `returns:policy:${idempotencyKey.trim()}` },
      audit: { afterState: (_input, result) => result },
      execute: async (transaction) => {
        await this.requireStore(transaction, context.tenantId, validated.storeId);
        const current = await sql<{ id: string }>`select id from returns.policies
          where tenant_id = ${context.tenantId}::uuid and store_id = ${validated.storeId}::uuid
            and status = 'ACTIVE' for update`.execute(transaction);
        const id = current.rows[0]?.id ?? policyId;
        if (current.rows[0]) {
          await sql`update returns.policies set name = ${validated.name},
              return_window_days = ${validated.returnWindowDays},
              require_inspection = ${validated.requireInspection}, allow_exchange = ${validated.allowExchange},
              allow_store_credit = ${validated.allowStoreCredit}, updated_at = now()
            where tenant_id = ${context.tenantId}::uuid and id = ${id}::uuid`.execute(transaction);
        } else {
          await sql`insert into returns.policies (
              id, tenant_id, store_id, name, status, return_window_days,
              require_inspection, allow_exchange, allow_store_credit
            ) values (
              ${id}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid, ${validated.name},
              'ACTIVE', ${validated.returnWindowDays}, ${validated.requireInspection},
              ${validated.allowExchange}, ${validated.allowStoreCredit}
            )`.execute(transaction);
        }
        return { policyId: id, status: 'ACTIVE' as const };
      },
    }, { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) });
  }

  public async createRequest(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateReturnRequestInput,
  ): Promise<CommandResult<{ requestId: string; status: 'REQUESTED' }>> {
    const validated = requestInputSchema.parse(input);
    const requestId = randomUUID();
    return this.commands.execute({
      action: 'returns.request.create', permission: 'returns.create', risk: 'MEDIUM',
      resource: () => ({ type: 'returns.request', id: requestId }),
      event: { type: 'returns.request.created',
        data: () => ({ requestId, orderId: validated.orderId, kind: validated.kind }),
        dedupeKey: () => `returns:request:${idempotencyKey.trim()}` },
      audit: { afterState: () => ({ requestId, status: 'REQUESTED' }) },
      execute: async (transaction) => {
        const order = await sql<{ customer_id: string | null; currency: string; status: string;
          placed_at: Date | null; created_at: Date }>`
          select customer_id, currency, status, placed_at, created_at from commerce.orders
          where tenant_id = ${context.tenantId}::uuid and store_id = ${validated.storeId}::uuid
            and id = ${validated.orderId}::uuid for update
        `.execute(transaction);
        const orderRow = order.rows[0];
        if (!orderRow) throw new ReturnsInvariantError('Order was not found in this store');
        if (!['CONFIRMED', 'CLOSED'].includes(orderRow.status))
          throw new ReturnsInvariantError('Only confirmed or closed orders are return-eligible');
        const delivered = await sql<{ delivered_at: Date | null }>`select max(delivered_at) as delivered_at
          from shipping.shipments where tenant_id = ${context.tenantId}::uuid
            and store_id = ${validated.storeId}::uuid and order_id = ${validated.orderId}::uuid
            and delivered_at is not null`.execute(transaction);
        const eligibilityAnchor = delivered.rows[0]?.delivered_at ?? orderRow.placed_at ?? orderRow.created_at;
        const policy = await sql<{ id: string; return_window_days: number; allow_exchange: boolean }>`
          select id, return_window_days, allow_exchange from returns.policies
          where tenant_id = ${context.tenantId}::uuid and store_id = ${validated.storeId}::uuid
            and status = 'ACTIVE' for share`.execute(transaction);
        const policyRow = policy.rows[0];
        if (!policyRow) throw new ReturnsInvariantError('An active return policy is required');
        const expiresAt = new Date(eligibilityAnchor);
        expiresAt.setUTCDate(expiresAt.getUTCDate() + policyRow.return_window_days);
        if (new Date() > expiresAt) throw new ReturnsInvariantError('The configured return window has expired');
        if (validated.kind === 'EXCHANGE' && !policyRow.allow_exchange)
          throw new ReturnsInvariantError('Exchanges are disabled by the active return policy');

        await sql`insert into returns.requests (
            id, tenant_id, store_id, order_id, customer_id, policy_id, kind,
            reason_code, customer_note, requested_by_actor_type, requested_by_actor_id
          ) values (
            ${requestId}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid,
            ${validated.orderId}::uuid, ${orderRow.customer_id}::uuid, ${policyRow.id}::uuid,
            ${validated.kind}, ${validated.reasonCode}, ${validated.customerNote ?? null},
            ${context.actorType}, ${context.actorId ?? null}::uuid
          )`.execute(transaction);
        for (const requestedLine of validated.lines) {
          const line = await sql<{ quantity: number; total_minor: string; already_requested: string }>`
            select line.quantity, line.total_minor::text,
              coalesce((select sum(existing_line.requested_quantity)::text
                from returns.request_lines existing_line
                join returns.requests existing_request
                  on existing_request.tenant_id = existing_line.tenant_id
                 and existing_request.id = existing_line.request_id
                where existing_line.tenant_id = line.tenant_id
                  and existing_line.order_line_id = line.id
                  and existing_request.status not in ('REJECTED', 'CANCELLED')), '0') as already_requested
            from commerce.order_lines line
            where line.tenant_id = ${context.tenantId}::uuid and line.store_id = ${validated.storeId}::uuid
              and line.order_id = ${validated.orderId}::uuid and line.id = ${requestedLine.orderLineId}::uuid
            for share`.execute(transaction);
          const lineRow = line.rows[0];
          if (!lineRow) throw new ReturnsInvariantError('Return line does not belong to this order');
          if (Number(lineRow.already_requested) + requestedLine.quantity > lineRow.quantity)
            throw new ReturnsInvariantError('Return quantity exceeds the remaining order-line quantity');
          if (validated.kind === 'EXCHANGE' && !requestedLine.exchangeVariantId)
            throw new ReturnsInvariantError('Exchange lines require a replacement variant');
          if (validated.kind === 'RETURN' && requestedLine.exchangeVariantId)
            throw new ReturnsInvariantError('Return lines cannot specify an exchange variant');
          if (requestedLine.exchangeVariantId) {
            const replacement = await sql<{ id: string }>`select id from commerce.variants
              where tenant_id = ${context.tenantId}::uuid and store_id = ${validated.storeId}::uuid
                and id = ${requestedLine.exchangeVariantId}::uuid and status = 'ACTIVE'`.execute(transaction);
            if (!replacement.rows[0]) throw new ReturnsInvariantError('Replacement variant is not active in this store');
          }
          const eligibleRefundMinor = Math.floor(Number(lineRow.total_minor) * requestedLine.quantity / lineRow.quantity);
          await sql`insert into returns.request_lines (
              tenant_id, store_id, request_id, order_line_id, requested_quantity,
              eligible_refund_minor, exchange_variant_id
            ) values (
              ${context.tenantId}::uuid, ${validated.storeId}::uuid, ${requestId}::uuid,
              ${requestedLine.orderLineId}::uuid, ${requestedLine.quantity}, ${eligibleRefundMinor},
              ${requestedLine.exchangeVariantId ?? null}::uuid
            )`.execute(transaction);
        }
        await this.appendTimeline(transaction, context, requestId, validated.storeId, 'returns.request.created', {
          orderId: validated.orderId, kind: validated.kind, reasonCode: validated.reasonCode,
        });
        return { requestId, status: 'REQUESTED' as const };
      },
    }, { context, input: validated, idempotencyKey });
  }

  public async reviewRequest(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: ReviewReturnRequestInput,
    approvalId?: string,
  ): Promise<CommandResult<{ requestId: string; status: 'APPROVED' | 'REJECTED' }>> {
    const validated = reviewInputSchema.parse(input);
    return this.commands.execute({
      action: 'returns.request.review', permission: 'returns.approve', risk: 'HIGH',
      resource: () => ({ type: 'returns.request', id: validated.requestId }),
      event: { type: validated.decision === 'APPROVE' ? 'returns.request.approved' : 'returns.request.rejected',
        data: (_input, result) => result, dedupeKey: () => `returns:request:review:${idempotencyKey.trim()}` },
      audit: { afterState: (_input, result) => result },
      execute: async (transaction) => {
        const request = await this.loadRequestForUpdate(transaction, context.tenantId, validated.requestId);
        if (request.status !== 'REQUESTED') throw new ReturnsInvariantError('Only a requested return can be reviewed');
        const status = validated.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        await sql`update returns.requests set status = ${status},
            internal_note = coalesce(${validated.internalNote ?? null}, internal_note),
            approved_by_user_id = case when ${status} = 'APPROVED' then ${context.actorId ?? null}::uuid else approved_by_user_id end,
            rejected_by_user_id = case when ${status} = 'REJECTED' then ${context.actorId ?? null}::uuid else rejected_by_user_id end,
            approved_at = case when ${status} = 'APPROVED' then now() else approved_at end,
            rejected_at = case when ${status} = 'REJECTED' then now() else rejected_at end,
            updated_at = now()
          where tenant_id = ${context.tenantId}::uuid and id = ${validated.requestId}::uuid`.execute(transaction);
        await this.appendTimeline(transaction, context, validated.requestId, request.store_id,
          `returns.request.${status.toLowerCase()}`, { note: validated.internalNote ?? null });
        return { requestId: validated.requestId, status };
      },
    }, { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) });
  }

  public async receiveAndInspect(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: InspectReturnInput,
    approvalId?: string,
  ): Promise<CommandResult<{ requestId: string; status: 'INSPECTING'; inspectedLines: number }>> {
    const validated = inspectInputSchema.parse(input);
    return this.commands.execute({
      action: 'returns.request.inspect', permission: 'returns.manage', risk: 'HIGH',
      resource: () => ({ type: 'returns.request', id: validated.requestId }),
      event: { type: 'returns.request.inspected', data: (_input, result) => result,
        dedupeKey: () => `returns:request:inspect:${idempotencyKey.trim()}` },
      audit: { afterState: (_input, result) => result },
      execute: async (transaction) => {
        const request = await this.loadRequestForUpdate(transaction, context.tenantId, validated.requestId);
        if (!['APPROVED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTING'].includes(request.status))
          throw new ReturnsInvariantError('Return must be approved before receipt and inspection');
        for (const inspected of validated.lines) {
          const line = await sql<{ requested_quantity: number }>`select requested_quantity
            from returns.request_lines where tenant_id = ${context.tenantId}::uuid
              and request_id = ${validated.requestId}::uuid and id = ${inspected.lineId}::uuid
            for update`.execute(transaction);
          const lineRow = line.rows[0];
          if (!lineRow) throw new ReturnsInvariantError('Return line was not found');
          if (inspected.receivedQuantity > lineRow.requested_quantity || inspected.acceptedQuantity > inspected.receivedQuantity)
            throw new ReturnsInvariantError('Inspection quantities exceed the requested/received quantity');
          await sql`update returns.request_lines set received_quantity = ${inspected.receivedQuantity},
              accepted_quantity = ${inspected.acceptedQuantity}, inspection_status = ${inspected.inspectionStatus},
              condition_code = ${inspected.conditionCode ?? null},
              restock_disposition = ${inspected.restockDisposition}, updated_at = now()
            where tenant_id = ${context.tenantId}::uuid and id = ${inspected.lineId}::uuid`.execute(transaction);
        }
        await sql`update returns.requests set status = 'INSPECTING',
            received_at = coalesce(received_at, now()), updated_at = now()
          where tenant_id = ${context.tenantId}::uuid and id = ${validated.requestId}::uuid`.execute(transaction);
        await this.appendTimeline(transaction, context, validated.requestId, request.store_id,
          'returns.request.inspected', { inspectedLines: validated.lines.length });
        return { requestId: validated.requestId, status: 'INSPECTING' as const, inspectedLines: validated.lines.length };
      },
    }, { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) });
  }

  public async issueRefund(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: IssueRefundInput,
    approvalId?: string,
  ): Promise<CommandResult<{ refundId: string; providerActionId: string; status: 'QUEUED' }>> {
    const validated = refundInputSchema.parse(input);
    const refundId = randomUUID();
    const providerActionId = randomUUID();
    return this.commands.execute({
      action: 'commerce.refund.issue', permission: 'commerce.refunds.issue', risk: 'CRITICAL',
      resource: () => ({ type: 'returns.refund', id: refundId }),
      event: { type: 'returns.refund.queued',
        data: () => ({ refundId, requestId: validated.requestId, providerActionId }),
        dedupeKey: () => `returns:refund:${idempotencyKey.trim()}` },
      audit: { afterState: () => ({ refundId, status: 'QUEUED', amountMinor: validated.amountMinor }) },
      execute: async (transaction) => {
        const request = await this.loadRequestForUpdate(transaction, context.tenantId, validated.requestId);
        if (!['APPROVED', 'RECEIVED', 'INSPECTING'].includes(request.status))
          throw new ReturnsInvariantError('Refunds require an approved, unresolved return');
        const order = await sql<{ currency: string }>`select currency from commerce.orders
          where tenant_id = ${context.tenantId}::uuid and store_id = ${request.store_id}::uuid
            and id = ${request.order_id}::uuid for update`.execute(transaction);
        const orderRow = order.rows[0];
        if (!orderRow) throw new ReturnsInvariantError('Return order is missing');
        if (validated.currency !== orderRow.currency) throw new ReturnsInvariantError('Refund currency must match the order currency');
        const sourcePayment = await sql<{ amount_minor: string; kind: string; status: string }>`
          select amount_minor::text, kind, status from commerce.payments
          where tenant_id = ${context.tenantId}::uuid and store_id = ${request.store_id}::uuid
            and order_id = ${request.order_id}::uuid and id = ${validated.sourcePaymentId}::uuid for share
        `.execute(transaction);
        const source = sourcePayment.rows[0];
        if (!source || !['CAPTURE', 'SALE'].includes(source.kind) ||
          !['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(source.status))
          throw new ReturnsInvariantError('Refund source must be a captured sale or capture payment');
        const eligible = await sql<{ amount: string }>`select coalesce(sum(
            floor((eligible_refund_minor::numeric * accepted_quantity) / nullif(requested_quantity, 0))
          ), 0)::text as amount from returns.request_lines
          where tenant_id = ${context.tenantId}::uuid and request_id = ${validated.requestId}::uuid`.execute(transaction);
        const reserved = await sql<{ amount: string }>`select coalesce(sum(amount_minor), 0)::text as amount
          from returns.refunds where tenant_id = ${context.tenantId}::uuid
            and return_request_id = ${validated.requestId}::uuid
            and status in ('APPROVED', 'QUEUED', 'PROCESSING', 'SUCCEEDED')`.execute(transaction);
        if (validated.amountMinor > Number(eligible.rows[0]?.amount ?? '0') - Number(reserved.rows[0]?.amount ?? '0'))
          throw new ReturnsInvariantError('Refund exceeds accepted return value remaining');
        const sourceReserved = await sql<{ amount: string }>`select coalesce(sum(amount_minor), 0)::text as amount
          from returns.refunds where tenant_id = ${context.tenantId}::uuid
            and source_payment_id = ${validated.sourcePaymentId}::uuid
            and status in ('APPROVED', 'QUEUED', 'PROCESSING', 'SUCCEEDED')`.execute(transaction);
        if (validated.amountMinor > Number(source.amount_minor) - Number(sourceReserved.rows[0]?.amount ?? '0'))
          throw new ReturnsInvariantError('Refund exceeds the source payment amount remaining');
        const mapping = await sql<{ external_order_id: string; external_payment_id: string | null; connector_key: string }>`
          select order_mapping.external_id as external_order_id,
                 payment_mapping.external_id as external_payment_id, connection.connector_key
          from commerce.provider_mappings order_mapping
          join integrations.connections connection
            on connection.tenant_id = order_mapping.tenant_id and connection.id = order_mapping.connection_id
          left join commerce.provider_mappings payment_mapping
            on payment_mapping.tenant_id = order_mapping.tenant_id
           and payment_mapping.connection_id = order_mapping.connection_id
           and payment_mapping.entity_type = 'PAYMENT'
           and payment_mapping.canonical_id = ${validated.sourcePaymentId}::uuid
           and payment_mapping.state = 'ACTIVE'
          where order_mapping.tenant_id = ${context.tenantId}::uuid
            and order_mapping.store_id = ${request.store_id}::uuid
            and order_mapping.connection_id = ${validated.connectionId}::uuid
            and order_mapping.entity_type = 'ORDER' and order_mapping.canonical_id = ${request.order_id}::uuid
            and order_mapping.state = 'ACTIVE' and connection.status in ('CONNECTED', 'DEGRADED') limit 1
        `.execute(transaction);
        const route = mapping.rows[0];
        if (!route) throw new ReturnsInvariantError('Active provider order mapping was not found');
        const providerInput = {
          canonicalRefundId: refundId, returnRequestId: validated.requestId,
          canonicalOrderId: request.order_id, externalOrderId: route.external_order_id,
          canonicalPaymentId: validated.sourcePaymentId, externalPaymentId: route.external_payment_id,
          amountMinor: validated.amountMinor, currency: validated.currency, reason: validated.reason,
        };
        await sql`insert into integrations.provider_actions (
            id, tenant_id, connection_id, action_type, input, idempotency_key
          ) values (
            ${providerActionId}::uuid, ${context.tenantId}::uuid, ${validated.connectionId}::uuid,
            'commerce.refund.issue', ${JSON.stringify(providerInput)}::jsonb, ${idempotencyKey.trim()}
          )`.execute(transaction);
        await sql`insert into returns.refunds (
            id, tenant_id, store_id, order_id, return_request_id, source_payment_id,
            amount_minor, currency, status, reason, approved_by_user_id,
            provider_action_id, approved_at, queued_at
          ) values (
            ${refundId}::uuid, ${context.tenantId}::uuid, ${request.store_id}::uuid,
            ${request.order_id}::uuid, ${validated.requestId}::uuid, ${validated.sourcePaymentId}::uuid,
            ${validated.amountMinor}, ${validated.currency}, 'QUEUED', ${validated.reason},
            ${context.actorId ?? null}::uuid, ${providerActionId}::uuid, now(), now()
          )`.execute(transaction);
        await this.appendTimeline(transaction, context, validated.requestId, request.store_id,
          'returns.refund.queued', { refundId, providerActionId, connectorKey: route.connector_key,
            amountMinor: validated.amountMinor });
        return { refundId, providerActionId, status: 'QUEUED' as const };
      },
    }, { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) });
  }

  public async reconcileRefund(
    context: TenantRequestContext,
    idempotencyKey: string,
    refundId: string,
  ): Promise<CommandResult<{ refundId: string; status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' }>> {
    const validatedRefundId = uuidSchema.parse(refundId);
    return this.commands.execute({
      action: 'returns.refund.reconcile', permission: 'returns.manage', risk: 'LOW',
      resource: () => ({ type: 'returns.refund', id: validatedRefundId }),
      event: { type: 'returns.refund.reconciled', data: (_input, result) => result,
        dedupeKey: () => `returns:refund:reconcile:${idempotencyKey.trim()}` },
      audit: { afterState: (_input, result) => result },
      execute: async (transaction) => {
        const refund = await sql<{ id: string; store_id: string; order_id: string;
          return_request_id: string | null; amount_minor: string; currency: string;
          provider_action_id: string; action_state: string; provider_reference: string | null;
          action_error: string | null }>`
          select refund.id, refund.store_id, refund.order_id, refund.return_request_id,
                 refund.amount_minor::text, refund.currency, refund.provider_action_id,
                 action.state as action_state, action.provider_action_id as provider_reference,
                 action.last_error as action_error
          from returns.refunds refund join integrations.provider_actions action
            on action.tenant_id = refund.tenant_id and action.id = refund.provider_action_id
          where refund.tenant_id = ${context.tenantId}::uuid and refund.id = ${validatedRefundId}::uuid
          for update of refund
        `.execute(transaction);
        const row = refund.rows[0];
        if (!row) throw new ReturnsInvariantError('Refund was not found');
        const status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' =
          row.action_state === 'SUCCEEDED' ? 'SUCCEEDED' :
          row.action_state === 'RUNNING' ? 'PROCESSING' :
          ['FAILED', 'DEAD_LETTER'].includes(row.action_state) ? 'FAILED' : 'QUEUED';
        await sql`update returns.refunds set status = ${status}, provider_reference = ${row.provider_reference},
            processed_at = case when ${status} = 'SUCCEEDED' then coalesce(processed_at, now()) else processed_at end,
            failed_at = case when ${status} = 'FAILED' then now() else null end,
            last_error = case when ${status} = 'FAILED' then ${row.action_error} else null end,
            updated_at = now()
          where tenant_id = ${context.tenantId}::uuid and id = ${validatedRefundId}::uuid`.execute(transaction);
        if (status === 'SUCCEEDED') {
          await sql`insert into commerce.payments (
              id, tenant_id, store_id, order_id, kind, status, amount_minor, currency, processed_at, metadata
            ) values (
              ${row.id}::uuid, ${context.tenantId}::uuid, ${row.store_id}::uuid, ${row.order_id}::uuid,
              'REFUND', 'CAPTURED', ${Number(row.amount_minor)}, ${row.currency}, now(),
              ${JSON.stringify({ returnRefundId: row.id, providerActionId: row.provider_action_id })}::jsonb
            ) on conflict (id) do nothing`.execute(transaction);
          const totals = await sql<{ paid: string; refunded: string }>`select
              coalesce(sum(amount_minor) filter (where kind in ('CAPTURE', 'SALE')
                and status in ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')), 0)::text as paid,
              coalesce(sum(amount_minor) filter (where kind = 'REFUND' and status = 'CAPTURED'), 0)::text as refunded
            from commerce.payments where tenant_id = ${context.tenantId}::uuid and order_id = ${row.order_id}::uuid
          `.execute(transaction);
          const paid = Number(totals.rows[0]?.paid ?? '0');
          const refunded = Number(totals.rows[0]?.refunded ?? '0');
          if (paid > 0) {
            await sql`update commerce.orders set financial_status = ${refunded >= paid ? 'REFUNDED' : 'PARTIALLY_REFUNDED'},
                updated_at = now() where tenant_id = ${context.tenantId}::uuid and id = ${row.order_id}::uuid`.execute(transaction);
          }
        }
        if (row.return_request_id)
          await this.appendTimeline(transaction, context, row.return_request_id, row.store_id,
            'returns.refund.reconciled', { refundId: row.id, status });
        return { refundId: row.id, status };
      },
    }, { context, input: { refundId: validatedRefundId }, idempotencyKey });
  }

  public async createExchange(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateExchangeInput,
    approvalId?: string,
  ): Promise<CommandResult<{ exchangeId: string; status: 'APPROVED' }>> {
    const validated = exchangeInputSchema.parse(input);
    const exchangeId = randomUUID();
    return this.commands.execute({
      action: 'returns.exchange.create', permission: 'returns.approve', risk: 'HIGH',
      resource: () => ({ type: 'returns.exchange', id: exchangeId }),
      event: { type: 'returns.exchange.approved', data: () => ({ exchangeId, requestId: validated.requestId }),
        dedupeKey: () => `returns:exchange:${idempotencyKey.trim()}` },
      audit: { afterState: () => ({ exchangeId, status: 'APPROVED' }) },
      execute: async (transaction) => {
        const request = await this.loadRequestForUpdate(transaction, context.tenantId, validated.requestId);
        if (request.kind !== 'EXCHANGE') throw new ReturnsInvariantError('Only an exchange request can create an exchange');
        if (!['APPROVED', 'RECEIVED', 'INSPECTING'].includes(request.status))
          throw new ReturnsInvariantError('Exchange request must be approved and unresolved');
        const accepted = await sql<{ count: string }>`select count(*)::text as count from returns.request_lines
          where tenant_id = ${context.tenantId}::uuid and request_id = ${validated.requestId}::uuid
            and accepted_quantity > 0 and exchange_variant_id is not null`.execute(transaction);
        if (Number(accepted.rows[0]?.count ?? '0') === 0)
          throw new ReturnsInvariantError('At least one accepted exchange line is required');
        await sql`insert into returns.exchanges (
            id, tenant_id, store_id, return_request_id, original_order_id, status,
            price_adjustment_minor, currency, approved_by_user_id, approved_at
          ) values (
            ${exchangeId}::uuid, ${context.tenantId}::uuid, ${request.store_id}::uuid,
            ${validated.requestId}::uuid, ${request.order_id}::uuid, 'APPROVED',
            ${validated.priceAdjustmentMinor}, ${validated.currency}, ${context.actorId ?? null}::uuid, now()
          )`.execute(transaction);
        await this.appendTimeline(transaction, context, validated.requestId, request.store_id,
          'returns.exchange.approved', { exchangeId, priceAdjustmentMinor: validated.priceAdjustmentMinor });
        return { exchangeId, status: 'APPROVED' as const };
      },
    }, { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) });
  }

  public async fulfillExchange(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: FulfillExchangeInput,
  ): Promise<CommandResult<{ exchangeId: string; status: 'FULFILLED' }>> {
    const validated = fulfillExchangeSchema.parse(input);
    return this.commands.execute({
      action: 'returns.exchange.fulfill', permission: 'returns.manage', risk: 'MEDIUM',
      resource: () => ({ type: 'returns.exchange', id: validated.exchangeId }),
      event: { type: 'returns.exchange.fulfilled', data: (_input, result) => result,
        dedupeKey: () => `returns:exchange:fulfilled:${idempotencyKey.trim()}` },
      audit: { afterState: (_input, result) => result },
      execute: async (transaction) => {
        const exchange = await sql<{ return_request_id: string; store_id: string; original_order_id: string; status: string }>`
          select return_request_id, store_id, original_order_id, status from returns.exchanges
          where tenant_id = ${context.tenantId}::uuid and id = ${validated.exchangeId}::uuid for update
        `.execute(transaction);
        const row = exchange.rows[0];
        if (!row || row.status !== 'APPROVED') throw new ReturnsInvariantError('Approved exchange was not found');
        const replacement = await sql<{ id: string }>`select id from commerce.orders
          where tenant_id = ${context.tenantId}::uuid and store_id = ${row.store_id}::uuid
            and id = ${validated.replacementOrderId}::uuid and id <> ${row.original_order_id}::uuid`.execute(transaction);
        if (!replacement.rows[0]) throw new ReturnsInvariantError('Replacement order was not found in this store');
        await sql`update returns.exchanges set status = 'FULFILLED',
            replacement_order_id = ${validated.replacementOrderId}::uuid, fulfilled_at = now(), updated_at = now()
          where tenant_id = ${context.tenantId}::uuid and id = ${validated.exchangeId}::uuid`.execute(transaction);
        await this.appendTimeline(transaction, context, row.return_request_id, row.store_id,
          'returns.exchange.fulfilled', { exchangeId: validated.exchangeId, replacementOrderId: validated.replacementOrderId });
        return { exchangeId: validated.exchangeId, status: 'FULFILLED' as const };
      },
    }, { context, input: validated, idempotencyKey });
  }

  public async resolveRequest(
    context: TenantRequestContext,
    idempotencyKey: string,
    requestId: string,
  ): Promise<CommandResult<{ requestId: string; status: 'RESOLVED' }>> {
    const id = uuidSchema.parse(requestId);
    return this.commands.execute({
      action: 'returns.request.resolve', permission: 'returns.manage', risk: 'MEDIUM',
      resource: () => ({ type: 'returns.request', id }),
      event: { type: 'returns.request.resolved', data: (_input, result) => result,
        dedupeKey: () => `returns:request:resolved:${idempotencyKey.trim()}` },
      audit: { afterState: (_input, result) => result },
      execute: async (transaction) => {
        const request = await this.loadRequestForUpdate(transaction, context.tenantId, id);
        if (!['APPROVED', 'RECEIVED', 'INSPECTING'].includes(request.status))
          throw new ReturnsInvariantError('Request is not in a resolvable state');
        const pendingInspection = await sql<{ count: string }>`select count(*)::text as count
          from returns.request_lines where tenant_id = ${context.tenantId}::uuid
            and request_id = ${id}::uuid and inspection_status = 'PENDING'`.execute(transaction);
        if (Number(pendingInspection.rows[0]?.count ?? '0') > 0)
          throw new ReturnsInvariantError('All return lines must be inspected before resolution');
        const unfinishedRefund = await sql<{ count: string }>`select count(*)::text as count from returns.refunds
          where tenant_id = ${context.tenantId}::uuid and return_request_id = ${id}::uuid
            and status not in ('SUCCEEDED', 'CANCELLED', 'FAILED')`.execute(transaction);
        if (Number(unfinishedRefund.rows[0]?.count ?? '0') > 0)
          throw new ReturnsInvariantError('Refund processing must finish before resolution');
        if (request.kind === 'EXCHANGE') {
          const exchange = await sql<{ status: string }>`select status from returns.exchanges
            where tenant_id = ${context.tenantId}::uuid and return_request_id = ${id}::uuid`.execute(transaction);
          if (exchange.rows[0]?.status !== 'FULFILLED')
            throw new ReturnsInvariantError('Exchange must be fulfilled before resolution');
        }
        await sql`update returns.requests set status = 'RESOLVED', resolved_at = now(), updated_at = now()
          where tenant_id = ${context.tenantId}::uuid and id = ${id}::uuid`.execute(transaction);
        await this.appendTimeline(transaction, context, id, request.store_id, 'returns.request.resolved', {});
        return { requestId: id, status: 'RESOLVED' as const };
      },
    }, { context, input: { requestId: id }, idempotencyKey });
  }

  private async requireStore(transaction: PlatformTransaction, tenantId: string, storeId: string) {
    const result = await sql<{ id: string }>`select id from commerce.stores
      where tenant_id = ${tenantId}::uuid and id = ${storeId}::uuid`.execute(transaction);
    if (!result.rows[0]) throw new ReturnsInvariantError('Store was not found');
  }

  private async loadRequestForUpdate(
    transaction: PlatformTransaction,
    tenantId: string,
    requestId: string,
  ): Promise<RequestRow> {
    const result = await sql<RequestRow>`select id, store_id, order_id, customer_id, policy_id,
        kind, status, reason_code, requested_at, updated_at from returns.requests
      where tenant_id = ${tenantId}::uuid and id = ${requestId}::uuid for update`.execute(transaction);
    const row = result.rows[0];
    if (!row) throw new ReturnsInvariantError('Return request was not found');
    return row;
  }

  private async appendTimeline(
    transaction: PlatformTransaction,
    context: TenantRequestContext,
    requestId: string,
    storeId: string,
    eventType: string,
    data: Record<string, unknown>,
  ) {
    await sql`insert into returns.timeline (
        tenant_id, store_id, request_id, event_type, actor_type, actor_id, data
      ) values (
        ${context.tenantId}::uuid, ${storeId}::uuid, ${requestId}::uuid, ${eventType},
        ${context.actorType}, ${context.actorId ?? null}::uuid, ${JSON.stringify(data)}::jsonb
      )`.execute(transaction);
  }
}
