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
const optionalText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable().optional();
const orderAddressSchema = z.object({
  name: optionalText(300),
  company: optionalText(300),
  line1: z.string().trim().min(1).max(500),
  line2: optionalText(500),
  city: z.string().trim().min(1).max(300),
  region: optionalText(300),
  postalCode: optionalText(100),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/u),
  phone: optionalText(64),
});

export type OrderAddressInput = z.input<typeof orderAddressSchema>;

const orderModificationPatchSchema = z
  .object({
    customerId: uuidSchema.nullable().optional(),
    customerEmail: z.string().trim().email().max(320).nullable().optional(),
    customerPhone: optionalText(64),
    note: z.string().trim().max(10_000).nullable().optional(),
    shippingAddress: orderAddressSchema.optional(),
    billingAddress: orderAddressSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one modification is required');

export type OrderModificationPatch = z.input<typeof orderModificationPatchSchema>;

const requestModificationSchema = z.object({
  storeId: uuidSchema,
  orderId: uuidSchema,
  patch: orderModificationPatchSchema,
  reason: z.string().trim().min(1).max(4_000).optional(),
});

export type RequestOrderModificationInput = z.input<typeof requestModificationSchema>;

const requestCancellationSchema = z.object({
  storeId: uuidSchema,
  orderId: uuidSchema,
  reason: z.string().trim().min(1).max(4_000),
});

export type RequestOrderCancellationInput = z.input<typeof requestCancellationSchema>;

const confirmationSchema = z.object({
  storeId: uuidSchema,
  orderId: uuidSchema,
});

const confirmationResponseSchema = z.object({
  storeId: uuidSchema,
  orderId: uuidSchema,
  response: z.enum(['CONFIRMED', 'DECLINED']),
});

const duplicateEvaluationSchema = z.object({
  storeId: uuidSchema,
  orderId: uuidSchema,
  lookbackDays: z.number().int().min(1).max(30).default(5),
  threshold: z.number().int().min(40).max(100).default(60),
});

export type EvaluateOrderDuplicatesInput = z.input<typeof duplicateEvaluationSchema>;

const duplicateReviewSchema = z.object({
  storeId: uuidSchema,
  orderId: uuidSchema,
  candidateId: uuidSchema,
  decision: z.enum(['DISMISS', 'CONFIRM_DUPLICATE']),
});

const changeReviewSchema = z.object({
  storeId: uuidSchema,
  orderId: uuidSchema,
  requestId: uuidSchema,
  decision: z.enum(['APPROVE', 'REJECT']),
});

const providerActionSchema = z.object({
  storeId: uuidSchema,
  orderId: uuidSchema,
  connectionId: uuidSchema,
  operation: z.enum(['CONFIRM', 'MODIFY', 'CANCEL']),
  changeRequestId: uuidSchema.optional(),
});

export type QueueOrderProviderActionInput = z.input<typeof providerActionSchema>;

export class OrderWorkflowInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'OrderWorkflowInvariantError';
  }
}

interface MutableOrderState {
  id: string;
  store_id: string;
  customer_id: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  status: 'DRAFT' | 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'CLOSED';
  financial_status:
    | 'PENDING'
    | 'AUTHORIZED'
    | 'PARTIALLY_PAID'
    | 'PAID'
    | 'PARTIALLY_REFUNDED'
    | 'REFUNDED'
    | 'VOIDED';
  fulfillment_status: 'UNFULFILLED' | 'PARTIAL' | 'FULFILLED' | 'CANCELLED';
  total_minor: string;
  confirmation_state: string;
  duplicate_state: string;
  cancellation_state: string;
}

export interface OrderWorkflowDetail {
  orderId: string;
  storeId: string;
  confirmationState: string;
  duplicateState: string;
  modificationState: string;
  cancellationState: string;
  providerSyncState: string;
  confirmationAttempts: number;
  confirmationRequestedAt: Date | null;
  confirmedAt: Date | null;
  declinedAt: Date | null;
  duplicatesEvaluatedAt: Date | null;
  lastProviderSyncAt: Date | null;
  duplicates: readonly {
    id: string;
    candidateOrderId: string;
    score: number;
    reasons: readonly string[];
    state: string;
    detectedAt: Date;
    reviewedAt: Date | null;
  }[];
  changeRequests: readonly {
    id: string;
    kind: string;
    state: string;
    patch: Record<string, unknown>;
    reason: string | null;
    requestedAt: Date;
    decidedAt: Date | null;
    appliedAt: Date | null;
  }[];
  providerActions: readonly {
    providerActionId: string;
    operation: string;
    state: string;
    createdAt: Date;
    completedAt: Date | null;
  }[];
}

/**
 * Order operations deliberately keep canonical state in Commerce and external
 * writes in integrations.provider_actions. Provider failures therefore cannot
 * bypass tenant authorization, audit, idempotency, or the durable retry queue.
 */
export class OrderWorkflowService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async requestConfirmation(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: z.input<typeof confirmationSchema>,
  ): Promise<CommandResult<{ orderId: string; confirmationState: 'REQUESTED'; attempts: number }>> {
    const validated = confirmationSchema.parse(input);
    return this.commands.execute(
      {
        action: 'commerce.order.confirmation.request',
        permission: 'commerce.orders.confirm',
        risk: 'MEDIUM',
        resource: () => ({ type: 'commerce.order', id: validated.orderId }),
        event: {
          type: 'commerce.order.confirmation_requested',
          data: (_input, result) => result,
          dedupeKey: () => `commerce:order:confirmation-requested:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const order = await this.loadOrderForUpdate(transaction, validated, context.tenantId);
          this.assertOrderOpen(order);
          if (order.duplicate_state === 'CONFIRMED_DUPLICATE')
            throw new OrderWorkflowInvariantError(
              'A confirmed duplicate must be resolved before confirmation',
            );
          const updated = await sql<{
            confirmation_attempts: number;
          }>`update commerce.order_workflows
            set confirmation_state = 'REQUESTED',
                confirmation_attempts = confirmation_attempts + 1,
                confirmation_requested_at = now(),
                declined_at = null,
                updated_at = now()
            where tenant_id = ${context.tenantId}::uuid
              and store_id = ${validated.storeId}::uuid
              and order_id = ${validated.orderId}::uuid
            returning confirmation_attempts`.execute(transaction);
          const attempts = updated.rows[0]?.confirmation_attempts;
          if (!attempts) throw new OrderWorkflowInvariantError('Order workflow state is missing');
          await this.appendTimeline(
            transaction,
            context,
            validated,
            'commerce.order.confirmation_requested',
            {
              attempts,
            },
          );
          return { orderId: validated.orderId, confirmationState: 'REQUESTED' as const, attempts };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async recordConfirmationResponse(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: z.input<typeof confirmationResponseSchema>,
  ): Promise<CommandResult<{ orderId: string; confirmationState: 'CONFIRMED' | 'DECLINED' }>> {
    const validated = confirmationResponseSchema.parse(input);
    return this.commands.execute(
      {
        action: 'commerce.order.confirmation.respond',
        permission: 'commerce.orders.confirm',
        risk: 'MEDIUM',
        resource: () => ({ type: 'commerce.order', id: validated.orderId }),
        event: {
          type: `commerce.order.confirmation_${validated.response.toLowerCase()}`,
          data: (_input, result) => result,
          dedupeKey: () =>
            `commerce:order:confirmation:${validated.response}:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const order = await this.loadOrderForUpdate(transaction, validated, context.tenantId);
          this.assertOrderOpen(order);
          if (validated.response === 'CONFIRMED') {
            if (order.duplicate_state === 'CONFIRMED_DUPLICATE')
              throw new OrderWorkflowInvariantError('A confirmed duplicate cannot be confirmed');
            await sql`update commerce.orders
              set status = 'CONFIRMED', updated_at = now()
              where tenant_id = ${context.tenantId}::uuid
                and store_id = ${validated.storeId}::uuid
                and id = ${validated.orderId}::uuid`.execute(transaction);
            await sql`update commerce.order_workflows
              set confirmation_state = 'CONFIRMED', confirmed_at = now(), declined_at = null,
                  updated_at = now()
              where tenant_id = ${context.tenantId}::uuid
                and store_id = ${validated.storeId}::uuid
                and order_id = ${validated.orderId}::uuid`.execute(transaction);
          } else {
            await sql`update commerce.order_workflows
              set confirmation_state = 'DECLINED', declined_at = now(), confirmed_at = null,
                  updated_at = now()
              where tenant_id = ${context.tenantId}::uuid
                and store_id = ${validated.storeId}::uuid
                and order_id = ${validated.orderId}::uuid`.execute(transaction);
          }
          await this.appendTimeline(
            transaction,
            context,
            validated,
            `commerce.order.confirmation_${validated.response.toLowerCase()}`,
            {},
          );
          return { orderId: validated.orderId, confirmationState: validated.response };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async evaluateDuplicates(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: EvaluateOrderDuplicatesInput,
  ): Promise<CommandResult<{ orderId: string; duplicateState: string; candidateCount: number }>> {
    const validated = duplicateEvaluationSchema.parse(input);
    return this.commands.execute(
      {
        action: 'commerce.order.duplicates.evaluate',
        permission: 'commerce.orders.update',
        risk: 'MEDIUM',
        resource: () => ({ type: 'commerce.order', id: validated.orderId }),
        event: {
          type: 'commerce.order.duplicates_evaluated',
          data: (_input, result) => result,
          dedupeKey: () => `commerce:order:duplicates-evaluated:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const target = await this.loadDuplicateComparable(
            transaction,
            context.tenantId,
            validated.storeId,
            validated.orderId,
          );
          if (!target) throw new OrderWorkflowInvariantError('Order was not found');
          const candidates = await sql<{
            id: string;
            customer_id: string | null;
            customer_email: string | null;
            customer_phone: string | null;
            total_minor: string;
            line_signature: string;
          }>`select candidate.id, candidate.customer_id, candidate.customer_email,
                candidate.customer_phone, candidate.total_minor::text as total_minor,
                coalesce((
                  select string_agg(
                    coalesce(line.sku, '') || '|' || coalesce(line.variant_id::text, '') || '|' ||
                    lower(line.title) || '|' || line.quantity::text,
                    ',' order by coalesce(line.sku, ''), coalesce(line.variant_id::text, ''), lower(line.title), line.quantity
                  )
                  from commerce.order_lines as line
                  where line.tenant_id = candidate.tenant_id and line.order_id = candidate.id
                ), '') as line_signature
              from commerce.orders as candidate
              where candidate.tenant_id = ${context.tenantId}::uuid
                and candidate.store_id = ${validated.storeId}::uuid
                and candidate.id <> ${validated.orderId}::uuid
                and candidate.status <> 'CANCELLED'
                and candidate.created_at >= now() - make_interval(days => ${validated.lookbackDays})
              order by candidate.created_at desc, candidate.id desc
              limit 250`.execute(transaction);

          const detected: string[] = [];
          for (const candidate of candidates.rows) {
            const comparison = duplicateScore(target, candidate);
            if (comparison.score < validated.threshold) continue;
            detected.push(candidate.id);
            await sql`insert into commerce.order_duplicate_candidates (
                tenant_id, store_id, order_id, candidate_order_id, score, reasons, state, detected_at
              ) values (
                ${context.tenantId}::uuid, ${validated.storeId}::uuid, ${validated.orderId}::uuid,
                ${candidate.id}::uuid, ${comparison.score}, ${JSON.stringify(comparison.reasons)}::jsonb,
                'OPEN', now()
              ) on conflict (tenant_id, order_id, candidate_order_id) do update
                set score = excluded.score, reasons = excluded.reasons, detected_at = now(),
                    state = case
                      when commerce.order_duplicate_candidates.state in ('DISMISSED', 'CONFIRMED_DUPLICATE')
                        then commerce.order_duplicate_candidates.state
                      else 'OPEN'
                    end,
                    updated_at = now()`.execute(transaction);
          }

          if (detected.length === 0) {
            await sql`update commerce.order_duplicate_candidates
              set state = 'CLEARED', updated_at = now()
              where tenant_id = ${context.tenantId}::uuid
                and order_id = ${validated.orderId}::uuid and state = 'OPEN'`.execute(transaction);
          } else {
            await sql`update commerce.order_duplicate_candidates
              set state = 'CLEARED', updated_at = now()
              where tenant_id = ${context.tenantId}::uuid
                and order_id = ${validated.orderId}::uuid and state = 'OPEN'
                and not (candidate_order_id = any(${detected}::uuid[]))`.execute(transaction);
          }

          const state = await this.recomputeDuplicateState(
            transaction,
            context.tenantId,
            validated.orderId,
          );
          await sql`update commerce.order_workflows
            set duplicates_evaluated_at = now(), updated_at = now()
            where tenant_id = ${context.tenantId}::uuid and order_id = ${validated.orderId}::uuid`.execute(
            transaction,
          );
          await this.appendTimeline(
            transaction,
            context,
            validated,
            'commerce.order.duplicates_evaluated',
            {
              candidateCount: detected.length,
              duplicateState: state,
              threshold: validated.threshold,
              lookbackDays: validated.lookbackDays,
            },
          );
          return {
            orderId: validated.orderId,
            duplicateState: state,
            candidateCount: detected.length,
          };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async reviewDuplicate(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: z.input<typeof duplicateReviewSchema>,
  ): Promise<CommandResult<{ orderId: string; duplicateState: string }>> {
    const validated = duplicateReviewSchema.parse(input);
    return this.commands.execute(
      {
        action: 'commerce.order.duplicate.review',
        permission: 'commerce.orders.update',
        risk: 'MEDIUM',
        resource: () => ({ type: 'commerce.order', id: validated.orderId }),
        event: {
          type: 'commerce.order.duplicate_reviewed',
          data: (_input, result) => ({ ...result, decision: validated.decision }),
          dedupeKey: () => `commerce:order:duplicate-reviewed:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => ({ ...result, decision: validated.decision }) },
        execute: async (transaction) => {
          const updated = await sql<{ id: string }>`update commerce.order_duplicate_candidates
            set state = ${validated.decision === 'DISMISS' ? 'DISMISSED' : 'CONFIRMED_DUPLICATE'},
                reviewed_at = now(), reviewed_by = ${context.actorId ?? null}::uuid, updated_at = now()
            where tenant_id = ${context.tenantId}::uuid
              and store_id = ${validated.storeId}::uuid
              and order_id = ${validated.orderId}::uuid
              and candidate_order_id = ${validated.candidateId}::uuid
              and state in ('OPEN', 'DISMISSED', 'CONFIRMED_DUPLICATE')
            returning id`.execute(transaction);
          if (!updated.rows[0])
            throw new OrderWorkflowInvariantError('Duplicate candidate was not found');
          const state = await this.recomputeDuplicateState(
            transaction,
            context.tenantId,
            validated.orderId,
          );
          await this.appendTimeline(
            transaction,
            context,
            validated,
            'commerce.order.duplicate_reviewed',
            {
              candidateOrderId: validated.candidateId,
              decision: validated.decision,
              duplicateState: state,
            },
          );
          return { orderId: validated.orderId, duplicateState: state };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async requestModification(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: RequestOrderModificationInput,
  ): Promise<CommandResult<{ requestId: string; state: 'REQUESTED' }>> {
    const validated = requestModificationSchema.parse(input);
    const requestId = randomUUID();
    return this.commands.execute(
      {
        action: 'commerce.order.modification.request',
        permission: 'commerce.orders.update',
        risk: 'MEDIUM',
        resource: () => ({ type: 'commerce.order', id: validated.orderId }),
        event: {
          type: 'commerce.order.modification_requested',
          data: () => ({ orderId: validated.orderId, requestId }),
          dedupeKey: () => `commerce:order:modification-requested:${requestId}`,
        },
        audit: {
          afterState: () => ({ orderId: validated.orderId, requestId, state: 'REQUESTED' }),
        },
        execute: async (transaction) => {
          const order = await this.loadOrderForUpdate(transaction, validated, context.tenantId);
          this.assertOrderMutable(order);
          await sql`insert into commerce.order_change_requests (
              id, tenant_id, store_id, order_id, kind, state, patch, reason,
              requested_actor_type, requested_actor_id
            ) values (
              ${requestId}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid,
              ${validated.orderId}::uuid, 'MODIFICATION', 'REQUESTED',
              ${JSON.stringify(validated.patch)}::jsonb, ${validated.reason ?? null},
              ${context.actorType}, ${context.actorId ?? null}::uuid
            )`.execute(transaction);
          await sql`update commerce.order_workflows
            set modification_state = 'REQUESTED', updated_at = now()
            where tenant_id = ${context.tenantId}::uuid and order_id = ${validated.orderId}::uuid`.execute(
            transaction,
          );
          await this.appendTimeline(
            transaction,
            context,
            validated,
            'commerce.order.modification_requested',
            {
              requestId,
              reason: validated.reason ?? null,
            },
          );
          return { requestId, state: 'REQUESTED' as const };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async reviewModification(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: z.input<typeof changeReviewSchema>,
  ): Promise<CommandResult<{ requestId: string; state: 'APPLIED' | 'REJECTED' }>> {
    const validated = changeReviewSchema.parse(input);
    return this.commands.execute(
      {
        action: 'commerce.order.modification.review',
        permission: 'commerce.orders.update',
        risk: 'MEDIUM',
        resource: () => ({ type: 'commerce.order', id: validated.orderId }),
        event: {
          type:
            validated.decision === 'APPROVE'
              ? 'commerce.order.modification_applied'
              : 'commerce.order.modification_rejected',
          data: (_input, result) => result,
          dedupeKey: () => `commerce:order:modification-reviewed:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const order = await this.loadOrderForUpdate(transaction, validated, context.tenantId);
          this.assertOrderMutable(order);
          const request = await sql<{ patch: Record<string, unknown> }>`select patch
            from commerce.order_change_requests
            where tenant_id = ${context.tenantId}::uuid
              and store_id = ${validated.storeId}::uuid
              and order_id = ${validated.orderId}::uuid
              and id = ${validated.requestId}::uuid
              and kind = 'MODIFICATION' and state = 'REQUESTED'
            for update`.execute(transaction);
          const row = request.rows[0];
          if (!row)
            throw new OrderWorkflowInvariantError('Pending modification request was not found');

          if (validated.decision === 'REJECT') {
            await sql`update commerce.order_change_requests
              set state = 'REJECTED', decision_actor_id = ${context.actorId ?? null}::uuid,
                  decided_at = now(), updated_at = now()
              where tenant_id = ${context.tenantId}::uuid and id = ${validated.requestId}::uuid`.execute(
              transaction,
            );
            await sql`update commerce.order_workflows
              set modification_state = 'REJECTED', updated_at = now()
              where tenant_id = ${context.tenantId}::uuid and order_id = ${validated.orderId}::uuid`.execute(
              transaction,
            );
            await this.appendTimeline(
              transaction,
              context,
              validated,
              'commerce.order.modification_rejected',
              {
                requestId: validated.requestId,
              },
            );
            return { requestId: validated.requestId, state: 'REJECTED' as const };
          }

          const patch = orderModificationPatchSchema.parse(row.patch);
          await this.applyModificationPatch(transaction, context.tenantId, validated, patch);
          const mapped = await this.hasActiveProviderMapping(
            transaction,
            context.tenantId,
            validated.storeId,
            validated.orderId,
          );
          await sql`update commerce.order_change_requests
            set state = 'APPLIED', decision_actor_id = ${context.actorId ?? null}::uuid,
                decided_at = now(), applied_at = now(), updated_at = now()
            where tenant_id = ${context.tenantId}::uuid and id = ${validated.requestId}::uuid`.execute(
            transaction,
          );
          await sql`update commerce.order_workflows
            set modification_state = 'APPLIED',
                provider_sync_state = ${mapped ? 'PENDING' : 'IN_SYNC'},
                updated_at = now()
            where tenant_id = ${context.tenantId}::uuid and order_id = ${validated.orderId}::uuid`.execute(
            transaction,
          );
          await this.appendTimeline(
            transaction,
            context,
            validated,
            'commerce.order.modification_applied',
            {
              requestId: validated.requestId,
              providerSyncRequired: mapped,
            },
          );
          return { requestId: validated.requestId, state: 'APPLIED' as const };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async requestCancellation(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: RequestOrderCancellationInput,
  ): Promise<CommandResult<{ requestId: string; state: 'REQUESTED' }>> {
    const validated = requestCancellationSchema.parse(input);
    const requestId = randomUUID();
    return this.commands.execute(
      {
        action: 'commerce.order.cancellation.request',
        permission: 'commerce.orders.cancel',
        risk: 'MEDIUM',
        resource: () => ({ type: 'commerce.order', id: validated.orderId }),
        event: {
          type: 'commerce.order.cancellation_requested',
          data: () => ({ orderId: validated.orderId, requestId }),
          dedupeKey: () => `commerce:order:cancellation-requested:${requestId}`,
        },
        audit: {
          afterState: () => ({ orderId: validated.orderId, requestId, state: 'REQUESTED' }),
        },
        execute: async (transaction) => {
          const order = await this.loadOrderForUpdate(transaction, validated, context.tenantId);
          this.assertCancellationSafe(order);
          await sql`insert into commerce.order_change_requests (
              id, tenant_id, store_id, order_id, kind, state, patch, reason,
              requested_actor_type, requested_actor_id
            ) values (
              ${requestId}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid,
              ${validated.orderId}::uuid, 'CANCELLATION', 'REQUESTED', '{}'::jsonb,
              ${validated.reason}, ${context.actorType}, ${context.actorId ?? null}::uuid
            )`.execute(transaction);
          await sql`update commerce.order_workflows
            set cancellation_state = 'REQUESTED', updated_at = now()
            where tenant_id = ${context.tenantId}::uuid and order_id = ${validated.orderId}::uuid`.execute(
            transaction,
          );
          await this.appendTimeline(
            transaction,
            context,
            validated,
            'commerce.order.cancellation_requested',
            {
              requestId,
              reason: validated.reason,
            },
          );
          return { requestId, state: 'REQUESTED' as const };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async reviewCancellation(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: z.input<typeof changeReviewSchema>,
    approvalId?: string,
  ): Promise<CommandResult<{ requestId: string; state: 'APPLIED' | 'REJECTED' }>> {
    const validated = changeReviewSchema.parse(input);
    return this.commands.execute(
      {
        action: 'commerce.order.cancellation.review',
        permission: 'commerce.orders.cancel',
        risk: 'HIGH',
        resource: () => ({ type: 'commerce.order', id: validated.orderId }),
        event: {
          type:
            validated.decision === 'APPROVE'
              ? 'commerce.order.cancelled'
              : 'commerce.order.cancellation_rejected',
          data: (_input, result) => result,
          dedupeKey: () => `commerce:order:cancellation-reviewed:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const order = await this.loadOrderForUpdate(transaction, validated, context.tenantId);
          const request = await sql<{ id: string }>`select id
            from commerce.order_change_requests
            where tenant_id = ${context.tenantId}::uuid
              and store_id = ${validated.storeId}::uuid
              and order_id = ${validated.orderId}::uuid
              and id = ${validated.requestId}::uuid
              and kind = 'CANCELLATION' and state = 'REQUESTED'
            for update`.execute(transaction);
          if (!request.rows[0])
            throw new OrderWorkflowInvariantError('Pending cancellation request was not found');

          if (validated.decision === 'REJECT') {
            await sql`update commerce.order_change_requests
              set state = 'REJECTED', decision_actor_id = ${context.actorId ?? null}::uuid,
                  decided_at = now(), updated_at = now()
              where tenant_id = ${context.tenantId}::uuid and id = ${validated.requestId}::uuid`.execute(
              transaction,
            );
            await sql`update commerce.order_workflows
              set cancellation_state = 'REJECTED', updated_at = now()
              where tenant_id = ${context.tenantId}::uuid and order_id = ${validated.orderId}::uuid`.execute(
              transaction,
            );
            await this.appendTimeline(
              transaction,
              context,
              validated,
              'commerce.order.cancellation_rejected',
              {
                requestId: validated.requestId,
              },
            );
            return { requestId: validated.requestId, state: 'REJECTED' as const };
          }

          this.assertCancellationSafe(order);
          const mapped = await this.hasActiveProviderMapping(
            transaction,
            context.tenantId,
            validated.storeId,
            validated.orderId,
          );
          await sql`update commerce.orders
            set status = 'CANCELLED', cancelled_at = now(), updated_at = now()
            where tenant_id = ${context.tenantId}::uuid
              and store_id = ${validated.storeId}::uuid and id = ${validated.orderId}::uuid`.execute(
            transaction,
          );
          await sql`update commerce.order_change_requests
            set state = 'APPLIED', decision_actor_id = ${context.actorId ?? null}::uuid,
                decided_at = now(), applied_at = now(), updated_at = now()
            where tenant_id = ${context.tenantId}::uuid and id = ${validated.requestId}::uuid`.execute(
            transaction,
          );
          await sql`update commerce.order_workflows
            set cancellation_state = 'APPLIED', confirmation_state = 'NOT_REQUIRED',
                provider_sync_state = ${mapped ? 'PENDING' : 'IN_SYNC'}, updated_at = now()
            where tenant_id = ${context.tenantId}::uuid and order_id = ${validated.orderId}::uuid`.execute(
            transaction,
          );
          await this.appendTimeline(transaction, context, validated, 'commerce.order.cancelled', {
            requestId: validated.requestId,
            providerSyncRequired: mapped,
          });
          return { requestId: validated.requestId, state: 'APPLIED' as const };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async queueProviderAction(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: QueueOrderProviderActionInput,
    approvalId?: string,
  ): Promise<CommandResult<{ providerActionId: string; state: 'QUEUED' }>> {
    const validated = providerActionSchema.parse(input);
    const providerActionId = randomUUID();
    const permission =
      validated.operation === 'CANCEL'
        ? 'commerce.orders.cancel'
        : validated.operation === 'CONFIRM'
          ? 'commerce.orders.confirm'
          : 'commerce.orders.update';
    return this.commands.execute(
      {
        action: `commerce.order.provider.${validated.operation.toLowerCase()}`,
        permission,
        risk: 'HIGH',
        resource: () => ({ type: 'commerce.order', id: validated.orderId }),
        event: {
          type: 'commerce.order.provider_action_queued',
          data: () => ({
            orderId: validated.orderId,
            providerActionId,
            operation: validated.operation,
          }),
          dedupeKey: () => `commerce:order:provider-action:${providerActionId}`,
        },
        audit: {
          afterState: () => ({
            orderId: validated.orderId,
            providerActionId,
            operation: validated.operation,
          }),
        },
        execute: async (transaction) => {
          const order = await this.loadOrderForUpdate(transaction, validated, context.tenantId);
          if (validated.operation === 'CONFIRM' && order.status !== 'CONFIRMED')
            throw new OrderWorkflowInvariantError(
              'Only a confirmed canonical order can be confirmed upstream',
            );
          if (validated.operation === 'CANCEL' && order.status !== 'CANCELLED')
            throw new OrderWorkflowInvariantError(
              'Only a cancelled canonical order can be cancelled upstream',
            );

          let changeRequest:
            | { kind: string; state: string; patch: Record<string, unknown>; reason: string | null }
            | undefined;
          if (validated.operation === 'MODIFY') {
            if (!validated.changeRequestId)
              throw new OrderWorkflowInvariantError(
                'Modification provider action requires a change request',
              );
            const request = await sql<{
              kind: string;
              state: string;
              patch: Record<string, unknown>;
              reason: string | null;
            }>`select kind, state, patch, reason from commerce.order_change_requests
              where tenant_id = ${context.tenantId}::uuid
                and store_id = ${validated.storeId}::uuid
                and order_id = ${validated.orderId}::uuid
                and id = ${validated.changeRequestId}::uuid`.execute(transaction);
            changeRequest = request.rows[0];
            if (changeRequest?.kind !== 'MODIFICATION' || changeRequest.state !== 'APPLIED')
              throw new OrderWorkflowInvariantError(
                'Provider modification requires an applied modification',
              );
          }

          const mapping = await sql<{ external_id: string; connector_key: string }>`select
                mapping.external_id, connection.connector_key
              from commerce.provider_mappings as mapping
              join integrations.connections as connection
                on connection.tenant_id = mapping.tenant_id and connection.id = mapping.connection_id
              where mapping.tenant_id = ${context.tenantId}::uuid
                and mapping.store_id = ${validated.storeId}::uuid
                and mapping.connection_id = ${validated.connectionId}::uuid
                and mapping.entity_type = 'ORDER'
                and mapping.canonical_id = ${validated.orderId}::uuid
                and mapping.state = 'ACTIVE'
                and connection.status in ('CONNECTED', 'DEGRADED')
              limit 1`.execute(transaction);
          const route = mapping.rows[0];
          if (!route)
            throw new OrderWorkflowInvariantError('Active provider order mapping was not found');

          const actionType = `commerce.order.${validated.operation.toLowerCase()}`;
          const providerInput: Record<string, unknown> = {
            canonicalOrderId: validated.orderId,
            externalOrderId: route.external_id,
          };
          if (changeRequest) providerInput.patch = changeRequest.patch;

          await sql`insert into integrations.provider_actions (
              id, tenant_id, connection_id, action_type, input, idempotency_key
            ) values (
              ${providerActionId}::uuid, ${context.tenantId}::uuid,
              ${validated.connectionId}::uuid, ${actionType},
              ${JSON.stringify(providerInput)}::jsonb, ${idempotencyKey.trim()}
            )`.execute(transaction);
          await sql`insert into commerce.order_provider_actions (
              provider_action_id, tenant_id, store_id, order_id, change_request_id, operation
            ) values (
              ${providerActionId}::uuid, ${context.tenantId}::uuid,
              ${validated.storeId}::uuid, ${validated.orderId}::uuid,
              ${validated.changeRequestId ?? null}::uuid, ${validated.operation}
            )`.execute(transaction);
          await sql`update commerce.order_workflows
            set provider_sync_state = 'PENDING', updated_at = now()
            where tenant_id = ${context.tenantId}::uuid and order_id = ${validated.orderId}::uuid`.execute(
            transaction,
          );
          await this.appendTimeline(
            transaction,
            context,
            validated,
            'commerce.order.provider_action_queued',
            {
              providerActionId,
              operation: validated.operation,
              connectorKey: route.connector_key,
            },
          );
          return { providerActionId, state: 'QUEUED' as const };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async get(
    context: TenantRequestContext,
    orderId: string,
  ): Promise<OrderWorkflowDetail | undefined> {
    const validatedOrderId = uuidSchema.parse(orderId);
    return withTenantTransaction(this.database, context, async (transaction) => {
      const workflow = await sql<{
        order_id: string;
        store_id: string;
        confirmation_state: string;
        duplicate_state: string;
        modification_state: string;
        cancellation_state: string;
        provider_sync_state: string;
        confirmation_attempts: number;
        confirmation_requested_at: Date | null;
        confirmed_at: Date | null;
        declined_at: Date | null;
        duplicates_evaluated_at: Date | null;
        last_provider_sync_at: Date | null;
      }>`select order_id, store_id, confirmation_state, duplicate_state, modification_state,
            cancellation_state, provider_sync_state, confirmation_attempts,
            confirmation_requested_at, confirmed_at, declined_at, duplicates_evaluated_at,
            last_provider_sync_at
          from commerce.order_workflows where order_id = ${validatedOrderId}::uuid`.execute(
        transaction,
      );
      const row = workflow.rows[0];
      if (!row) return undefined;
      const [duplicates, changes, providerActions] = await Promise.all([
        sql<{
          id: string;
          candidate_order_id: string;
          score: number;
          reasons: string[];
          state: string;
          detected_at: Date;
          reviewed_at: Date | null;
        }>`select id, candidate_order_id, score, reasons, state, detected_at, reviewed_at
            from commerce.order_duplicate_candidates
            where order_id = ${validatedOrderId}::uuid
            order by score desc, detected_at desc, id`.execute(transaction),
        sql<{
          id: string;
          kind: string;
          state: string;
          patch: Record<string, unknown>;
          reason: string | null;
          requested_at: Date;
          decided_at: Date | null;
          applied_at: Date | null;
        }>`select id, kind, state, patch, reason, requested_at, decided_at, applied_at
            from commerce.order_change_requests
            where order_id = ${validatedOrderId}::uuid
            order by requested_at desc, id desc`.execute(transaction),
        sql<{
          provider_action_id: string;
          operation: string;
          state: string;
          created_at: Date;
          completed_at: Date | null;
        }>`select provider_action_id, operation, state, created_at, completed_at
            from commerce.order_provider_actions
            where order_id = ${validatedOrderId}::uuid
            order by created_at desc, provider_action_id desc`.execute(transaction),
      ]);
      return {
        orderId: row.order_id,
        storeId: row.store_id,
        confirmationState: row.confirmation_state,
        duplicateState: row.duplicate_state,
        modificationState: row.modification_state,
        cancellationState: row.cancellation_state,
        providerSyncState: row.provider_sync_state,
        confirmationAttempts: row.confirmation_attempts,
        confirmationRequestedAt: row.confirmation_requested_at,
        confirmedAt: row.confirmed_at,
        declinedAt: row.declined_at,
        duplicatesEvaluatedAt: row.duplicates_evaluated_at,
        lastProviderSyncAt: row.last_provider_sync_at,
        duplicates: duplicates.rows.map((candidate) => ({
          id: candidate.id,
          candidateOrderId: candidate.candidate_order_id,
          score: candidate.score,
          reasons: candidate.reasons,
          state: candidate.state,
          detectedAt: candidate.detected_at,
          reviewedAt: candidate.reviewed_at,
        })),
        changeRequests: changes.rows.map((request) => ({
          id: request.id,
          kind: request.kind,
          state: request.state,
          patch: request.patch,
          reason: request.reason,
          requestedAt: request.requested_at,
          decidedAt: request.decided_at,
          appliedAt: request.applied_at,
        })),
        providerActions: providerActions.rows.map((action) => ({
          providerActionId: action.provider_action_id,
          operation: action.operation,
          state: action.state,
          createdAt: action.created_at,
          completedAt: action.completed_at,
        })),
      };
    });
  }

  private async loadOrderForUpdate(
    transaction: DatabaseTransaction,
    input: { storeId: string; orderId: string },
    tenantId: string,
  ): Promise<MutableOrderState> {
    const result = await sql<MutableOrderState>`select order_record.id, order_record.store_id,
        order_record.customer_id, order_record.customer_email, order_record.customer_phone,
        order_record.status, order_record.financial_status, order_record.fulfillment_status,
        order_record.total_minor::text as total_minor, workflow.confirmation_state,
        workflow.duplicate_state, workflow.cancellation_state
      from commerce.orders as order_record
      join commerce.order_workflows as workflow
        on workflow.tenant_id = order_record.tenant_id and workflow.order_id = order_record.id
      where order_record.tenant_id = ${tenantId}::uuid
        and order_record.store_id = ${input.storeId}::uuid
        and order_record.id = ${input.orderId}::uuid
      for update of order_record, workflow`.execute(transaction);
    const order = result.rows[0];
    if (!order) throw new OrderWorkflowInvariantError('Order was not found in this store');
    return order;
  }

  private assertOrderOpen(order: MutableOrderState): void {
    if (order.status === 'CANCELLED' || order.status === 'CLOSED')
      throw new OrderWorkflowInvariantError('Cancelled or closed orders cannot enter confirmation');
    if (order.cancellation_state === 'REQUESTED' || order.cancellation_state === 'APPLIED')
      throw new OrderWorkflowInvariantError('Order cancellation is already in progress');
  }

  private assertOrderMutable(order: MutableOrderState): void {
    if (order.status === 'CANCELLED' || order.status === 'CLOSED')
      throw new OrderWorkflowInvariantError('Cancelled or closed orders cannot be modified');
    if (order.fulfillment_status !== 'UNFULFILLED')
      throw new OrderWorkflowInvariantError(
        'Fulfilled or partially fulfilled orders cannot be modified',
      );
  }

  private assertCancellationSafe(order: MutableOrderState): void {
    if (order.status === 'CANCELLED' || order.status === 'CLOSED')
      throw new OrderWorkflowInvariantError('Order is already cancelled or closed');
    if (order.fulfillment_status !== 'UNFULFILLED')
      throw new OrderWorkflowInvariantError(
        'Fulfilled or partially fulfilled orders require a return workflow',
      );
    if (!['PENDING', 'VOIDED'].includes(order.financial_status))
      throw new OrderWorkflowInvariantError(
        'Authorized or paid orders require a payment void/refund workflow before cancellation',
      );
  }

  private async applyModificationPatch(
    transaction: DatabaseTransaction,
    tenantId: string,
    input: { storeId: string; orderId: string },
    patch: z.infer<typeof orderModificationPatchSchema>,
  ): Promise<void> {
    if ('customerId' in patch)
      await sql`update commerce.orders set customer_id = ${patch.customerId ?? null}::uuid, updated_at = now()
        where tenant_id = ${tenantId}::uuid and store_id = ${input.storeId}::uuid
          and id = ${input.orderId}::uuid`.execute(transaction);
    if ('customerEmail' in patch)
      await sql`update commerce.orders set customer_email = ${patch.customerEmail ?? null}, updated_at = now()
        where tenant_id = ${tenantId}::uuid and store_id = ${input.storeId}::uuid
          and id = ${input.orderId}::uuid`.execute(transaction);
    if ('customerPhone' in patch)
      await sql`update commerce.orders set customer_phone = ${patch.customerPhone ?? null}, updated_at = now()
        where tenant_id = ${tenantId}::uuid and store_id = ${input.storeId}::uuid
          and id = ${input.orderId}::uuid`.execute(transaction);
    if ('note' in patch)
      await sql`update commerce.orders set note = ${patch.note ?? null}, updated_at = now()
        where tenant_id = ${tenantId}::uuid and store_id = ${input.storeId}::uuid
          and id = ${input.orderId}::uuid`.execute(transaction);
    if (patch.shippingAddress)
      await this.upsertAddress(transaction, tenantId, input, 'SHIPPING', patch.shippingAddress);
    if (patch.billingAddress)
      await this.upsertAddress(transaction, tenantId, input, 'BILLING', patch.billingAddress);
  }

  private async upsertAddress(
    transaction: DatabaseTransaction,
    tenantId: string,
    input: { storeId: string; orderId: string },
    kind: 'SHIPPING' | 'BILLING',
    address: z.infer<typeof orderAddressSchema>,
  ): Promise<void> {
    await sql`insert into commerce.order_addresses (
        tenant_id, store_id, order_id, kind, name, company, line1, line2, city,
        region, postal_code, country_code, phone
      ) values (
        ${tenantId}::uuid, ${input.storeId}::uuid, ${input.orderId}::uuid, ${kind},
        ${address.name ?? null}, ${address.company ?? null}, ${address.line1},
        ${address.line2 ?? null}, ${address.city}, ${address.region ?? null},
        ${address.postalCode ?? null}, ${address.countryCode}, ${address.phone ?? null}
      ) on conflict (tenant_id, order_id, kind) do update set
        store_id = excluded.store_id, name = excluded.name, company = excluded.company,
        line1 = excluded.line1, line2 = excluded.line2, city = excluded.city,
        region = excluded.region, postal_code = excluded.postal_code,
        country_code = excluded.country_code, phone = excluded.phone, updated_at = now()`.execute(
      transaction,
    );
  }

  private async hasActiveProviderMapping(
    transaction: DatabaseTransaction,
    tenantId: string,
    storeId: string,
    orderId: string,
  ): Promise<boolean> {
    const result = await sql<{ exists: boolean }>`select exists(
        select 1 from commerce.provider_mappings
        where tenant_id = ${tenantId}::uuid and store_id = ${storeId}::uuid
          and entity_type = 'ORDER' and canonical_id = ${orderId}::uuid and state = 'ACTIVE'
      ) as exists`.execute(transaction);
    return result.rows[0]?.exists ?? false;
  }

  private async loadDuplicateComparable(
    transaction: DatabaseTransaction,
    tenantId: string,
    storeId: string,
    orderId: string,
  ): Promise<DuplicateComparable | undefined> {
    const result = await sql<{
      id: string;
      customer_id: string | null;
      customer_email: string | null;
      customer_phone: string | null;
      total_minor: string;
      line_signature: string;
    }>`select order_record.id, order_record.customer_id, order_record.customer_email,
          order_record.customer_phone, order_record.total_minor::text as total_minor,
          coalesce((
            select string_agg(
              coalesce(line.sku, '') || '|' || coalesce(line.variant_id::text, '') || '|' ||
              lower(line.title) || '|' || line.quantity::text,
              ',' order by coalesce(line.sku, ''), coalesce(line.variant_id::text, ''), lower(line.title), line.quantity
            )
            from commerce.order_lines as line
            where line.tenant_id = order_record.tenant_id and line.order_id = order_record.id
          ), '') as line_signature
        from commerce.orders as order_record
        where order_record.tenant_id = ${tenantId}::uuid
          and order_record.store_id = ${storeId}::uuid and order_record.id = ${orderId}::uuid`.execute(
      transaction,
    );
    return result.rows[0];
  }

  private async recomputeDuplicateState(
    transaction: DatabaseTransaction,
    tenantId: string,
    orderId: string,
  ): Promise<string> {
    const result = await sql<{ confirmed: number; open: number }>`select
        count(*) filter (where state = 'CONFIRMED_DUPLICATE')::integer as confirmed,
        count(*) filter (where state = 'OPEN')::integer as open
      from commerce.order_duplicate_candidates
      where tenant_id = ${tenantId}::uuid and order_id = ${orderId}::uuid`.execute(transaction);
    const row = result.rows[0] ?? { confirmed: 0, open: 0 };
    const state =
      row.confirmed > 0 ? 'CONFIRMED_DUPLICATE' : row.open > 0 ? 'POSSIBLE_DUPLICATE' : 'UNIQUE';
    await sql`update commerce.order_workflows set duplicate_state = ${state}, updated_at = now()
      where tenant_id = ${tenantId}::uuid and order_id = ${orderId}::uuid`.execute(transaction);
    return state;
  }

  private async appendTimeline(
    transaction: DatabaseTransaction,
    context: TenantRequestContext,
    input: { storeId: string; orderId: string },
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await sql`insert into commerce.order_timeline (
        tenant_id, store_id, order_id, event_type, actor_type, actor_id, data
      ) values (
        ${context.tenantId}::uuid, ${input.storeId}::uuid, ${input.orderId}::uuid,
        ${eventType}, ${context.actorType}, ${context.actorId ?? null}::uuid,
        ${JSON.stringify(data)}::jsonb
      )`.execute(transaction);
  }
}

interface DuplicateComparable {
  id: string;
  customer_id: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  total_minor: string;
  line_signature: string;
}

function duplicateScore(
  target: DuplicateComparable,
  candidate: DuplicateComparable,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (target.customer_id && target.customer_id === candidate.customer_id) {
    score += 50;
    reasons.push('SAME_CUSTOMER');
  }
  const targetPhone = normalizePhone(target.customer_phone);
  const candidatePhone = normalizePhone(candidate.customer_phone);
  if (targetPhone && targetPhone === candidatePhone) {
    score += 40;
    reasons.push('SAME_PHONE');
  }
  const targetEmail = target.customer_email?.trim().toLowerCase();
  const candidateEmail = candidate.customer_email?.trim().toLowerCase();
  if (targetEmail && targetEmail === candidateEmail) {
    score += 30;
    reasons.push('SAME_EMAIL');
  }
  if (target.total_minor === candidate.total_minor) {
    score += 10;
    reasons.push('SAME_TOTAL');
  }
  if (target.line_signature && target.line_signature === candidate.line_signature) {
    score += 10;
    reasons.push('SAME_ITEMS');
  }
  return { score: Math.min(score, 100), reasons };
}

function normalizePhone(value: string | null): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/gu, '');
  return digits.length >= 7 ? digits : undefined;
}
