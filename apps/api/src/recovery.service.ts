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
import { MessagingService } from './messaging.service.js';

const uuidSchema = z.string().uuid();
const channelSchema = z.enum(['EMAIL', 'WHATSAPP', 'MESSENGER', 'INSTAGRAM']);
const policyInputSchema = z.object({
  storeId: uuidSchema,
  name: z.string().trim().min(1).max(200),
  abandonmentDelayMinutes: z.number().int().min(1).max(43_200),
  opportunityTtlHours: z.number().int().min(1).max(2_160),
  maxAttempts: z.number().int().min(1).max(20),
  cooldownMinutes: z.number().int().min(1).max(43_200),
  attributionWindowHours: z.number().int().min(1).max(2_160),
  channels: z.array(channelSchema).min(1).max(4),
  maxOfferPercentBasisPoints: z.number().int().min(0).max(10_000),
  maxOfferAmountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
const offerInputSchema = z.object({
  opportunityId: uuidSchema,
  offerType: z.enum(['PERCENT', 'FIXED', 'FREE_SHIPPING']),
  percentBasisPoints: z.number().int().min(1).max(10_000).optional(),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/u).optional(),
  code: z.string().trim().min(1).max(200).optional(),
  expiresAt: z.coerce.date(),
});
const attemptInputSchema = z.object({
  opportunityId: uuidSchema,
  conversationId: uuidSchema,
  channel: channelSchema,
  body: z.string().trim().min(1).max(20_000),
  offerId: uuidSchema.optional(),
});
const recoveryInputSchema = z.object({
  opportunityId: uuidSchema,
  recoveredOrderId: uuidSchema,
});

export type RecoveryPolicyInput = z.input<typeof policyInputSchema>;
export type RecoveryOfferInput = z.input<typeof offerInputSchema>;
export type RecoveryAttemptInput = z.input<typeof attemptInputSchema>;
export type MarkRecoveredInput = z.input<typeof recoveryInputSchema>;

export class RecoveryInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RecoveryInvariantError';
  }
}

interface OpportunityRow {
  id: string;
  store_id: string;
  source_order_id: string;
  customer_id: string;
  policy_id: string;
  status: string;
  potential_value_minor: string;
  currency: string;
  detected_at: Date;
  eligible_at: Date;
  expires_at: Date;
  suppression_code: string | null;
  suppression_reason: string | null;
  temporal_workflow_id: string;
  recovered_order_id: string | null;
  attributed_attempt_id: string | null;
  recovered_at: Date | null;
  recovered_value_minor: string | null;
  updated_at: Date;
}

interface PolicyRow {
  id: string;
  store_id: string;
  name: string;
  status: string;
  abandonment_delay_minutes: number;
  opportunity_ttl_hours: number;
  max_attempts: number;
  cooldown_minutes: number;
  attribution_window_hours: number;
  channels: string[];
  max_offer_percent_basis_points: number;
  max_offer_amount_minor: string;
}

export class RecoveryService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
    private readonly messaging: MessagingService,
  ) {}

  public async list(context: TenantRequestContext) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<
        OpportunityRow & {
          order_number: string;
          customer_name: string;
          attempt_count: string;
        }
      >`select opportunity.id, opportunity.store_id, opportunity.source_order_id,
          opportunity.customer_id, opportunity.policy_id, opportunity.status,
          opportunity.potential_value_minor::text, opportunity.currency,
          opportunity.detected_at, opportunity.eligible_at, opportunity.expires_at,
          opportunity.suppression_code, opportunity.suppression_reason,
          opportunity.temporal_workflow_id, opportunity.recovered_order_id,
          opportunity.attributed_attempt_id, opportunity.recovered_at,
          opportunity.recovered_value_minor::text, opportunity.updated_at,
          source_order.order_number,
          coalesce(customer.display_name, customer.company_name, customer.id::text) as customer_name,
          (select count(*)::text from recovery.attempts attempt
            where attempt.opportunity_id = opportunity.id) as attempt_count
        from recovery.opportunities opportunity
        join commerce.orders source_order
          on source_order.tenant_id = opportunity.tenant_id
         and source_order.store_id = opportunity.store_id
         and source_order.id = opportunity.source_order_id
        join crm.customers customer
          on customer.tenant_id = opportunity.tenant_id and customer.id = opportunity.customer_id
        order by opportunity.updated_at desc, opportunity.id desc
        limit 250`.execute(transaction);
      return result.rows.map((row) => ({
        id: row.id,
        storeId: row.store_id,
        sourceOrderId: row.source_order_id,
        orderNumber: row.order_number,
        customerId: row.customer_id,
        customerName: row.customer_name,
        status: row.status,
        potentialValueMinor: Number(row.potential_value_minor),
        currency: row.currency,
        attemptCount: Number(row.attempt_count),
        eligibleAt: row.eligible_at,
        expiresAt: row.expires_at,
        recoveredOrderId: row.recovered_order_id,
        recoveredAt: row.recovered_at,
        recoveredValueMinor:
          row.recovered_value_minor === null ? null : Number(row.recovered_value_minor),
      }));
    });
  }

  public async policies(context: TenantRequestContext) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<PolicyRow>`select id, store_id, name, status,
          abandonment_delay_minutes, opportunity_ttl_hours, max_attempts,
          cooldown_minutes, attribution_window_hours, channels,
          max_offer_percent_basis_points, max_offer_amount_minor::text
        from recovery.policies order by status, name, id`.execute(transaction);
      return result.rows.map((row) => ({
        id: row.id,
        storeId: row.store_id,
        name: row.name,
        status: row.status,
        abandonmentDelayMinutes: row.abandonment_delay_minutes,
        opportunityTtlHours: row.opportunity_ttl_hours,
        maxAttempts: row.max_attempts,
        cooldownMinutes: row.cooldown_minutes,
        attributionWindowHours: row.attribution_window_hours,
        channels: row.channels,
        maxOfferPercentBasisPoints: row.max_offer_percent_basis_points,
        maxOfferAmountMinor: Number(row.max_offer_amount_minor),
      }));
    });
  }

  public async get(context: TenantRequestContext, opportunityId: string) {
    const id = uuidSchema.parse(opportunityId);
    return withTenantTransaction(this.database, context, async (transaction) => {
      const opportunityResult = await sql<
        OpportunityRow & { order_number: string; source_order_status: string; customer_name: string }
      >`select opportunity.id, opportunity.store_id, opportunity.source_order_id,
          opportunity.customer_id, opportunity.policy_id, opportunity.status,
          opportunity.potential_value_minor::text, opportunity.currency,
          opportunity.detected_at, opportunity.eligible_at, opportunity.expires_at,
          opportunity.suppression_code, opportunity.suppression_reason,
          opportunity.temporal_workflow_id, opportunity.recovered_order_id,
          opportunity.attributed_attempt_id, opportunity.recovered_at,
          opportunity.recovered_value_minor::text, opportunity.updated_at,
          source_order.order_number, source_order.status as source_order_status,
          coalesce(customer.display_name, customer.company_name, customer.id::text) as customer_name
        from recovery.opportunities opportunity
        join commerce.orders source_order
          on source_order.tenant_id = opportunity.tenant_id
         and source_order.store_id = opportunity.store_id
         and source_order.id = opportunity.source_order_id
        join crm.customers customer
          on customer.tenant_id = opportunity.tenant_id and customer.id = opportunity.customer_id
        where opportunity.id = ${id}::uuid`.execute(transaction);
      const opportunity = opportunityResult.rows[0];
      if (!opportunity) return undefined;
      const [attempts, offers, timeline, conversations, preferences] = await Promise.all([
        sql<{
          id: string;
          sequence: number;
          channel: string;
          status: string;
          conversation_id: string;
          message_id: string | null;
          offer_id: string | null;
          body_snapshot: string;
          scheduled_at: Date;
          queued_at: Date | null;
          sent_at: Date | null;
          delivered_at: Date | null;
          failed_at: Date | null;
          last_error: string | null;
        }>`select id, sequence, channel, status, conversation_id, message_id, offer_id,
              body_snapshot, scheduled_at, queued_at, sent_at, delivered_at, failed_at, last_error
            from recovery.attempts where opportunity_id = ${id}::uuid
            order by sequence desc`.execute(transaction),
        sql<{
          id: string;
          offer_type: string;
          percent_basis_points: number | null;
          amount_minor: string | null;
          currency: string | null;
          code: string | null;
          status: string;
          expires_at: Date;
        }>`select id, offer_type, percent_basis_points, amount_minor::text, currency,
              code, status, expires_at from recovery.offers
            where opportunity_id = ${id}::uuid order by created_at desc`.execute(transaction),
        sql<{ event_type: string; data: Record<string, unknown>; occurred_at: Date }>`
          select event_type, data, occurred_at from recovery.timeline
          where opportunity_id = ${id}::uuid order by occurred_at, id
        `.execute(transaction),
        sql<{ id: string; channel: string; status: string }>`
          select id, channel, status from messaging.conversations
          where customer_id = ${opportunity.customer_id}::uuid
            and connection_id is not null and provider_conversation_id is not null
            and status <> 'CLOSED'
          order by updated_at desc, id desc
        `.execute(transaction),
        sql<{
          channel: string;
          status: string;
          suppressed_until: Date | null;
          reason: string | null;
        }>`select channel, status, suppressed_until, reason
          from crm.communication_preferences
          where customer_id = ${opportunity.customer_id}::uuid
          order by channel`.execute(transaction),
      ]);
      return {
        id: opportunity.id,
        storeId: opportunity.store_id,
        sourceOrderId: opportunity.source_order_id,
        orderNumber: opportunity.order_number,
        sourceOrderStatus: opportunity.source_order_status,
        customerId: opportunity.customer_id,
        customerName: opportunity.customer_name,
        status: opportunity.status,
        potentialValueMinor: Number(opportunity.potential_value_minor),
        currency: opportunity.currency,
        detectedAt: opportunity.detected_at,
        eligibleAt: opportunity.eligible_at,
        expiresAt: opportunity.expires_at,
        suppressionCode: opportunity.suppression_code,
        suppressionReason: opportunity.suppression_reason,
        temporalWorkflowId: opportunity.temporal_workflow_id,
        recoveredOrderId: opportunity.recovered_order_id,
        attributedAttemptId: opportunity.attributed_attempt_id,
        recoveredAt: opportunity.recovered_at,
        recoveredValueMinor:
          opportunity.recovered_value_minor === null
            ? null
            : Number(opportunity.recovered_value_minor),
        attempts: attempts.rows.map((attempt) => ({
          id: attempt.id,
          sequence: attempt.sequence,
          channel: attempt.channel,
          status: attempt.status,
          conversationId: attempt.conversation_id,
          messageId: attempt.message_id,
          offerId: attempt.offer_id,
          body: attempt.body_snapshot,
          scheduledAt: attempt.scheduled_at,
          queuedAt: attempt.queued_at,
          sentAt: attempt.sent_at,
          deliveredAt: attempt.delivered_at,
          failedAt: attempt.failed_at,
          lastError: attempt.last_error,
        })),
        offers: offers.rows.map((offer) => ({
          id: offer.id,
          type: offer.offer_type,
          percentBasisPoints: offer.percent_basis_points,
          amountMinor: offer.amount_minor === null ? null : Number(offer.amount_minor),
          currency: offer.currency,
          code: offer.code,
          status: offer.status,
          expiresAt: offer.expires_at,
        })),
        conversations: conversations.rows.map((conversation) => ({
          id: conversation.id,
          channel: conversation.channel,
          status: conversation.status,
        })),
        preferences: preferences.rows.map((preference) => ({
          channel: preference.channel,
          status: preference.status,
          suppressedUntil: preference.suppressed_until,
          reason: preference.reason,
        })),
        timeline: timeline.rows.map((event) => ({
          eventType: event.event_type,
          data: event.data,
          occurredAt: event.occurred_at,
        })),
      };
    });
  }

  public async upsertPolicy(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: RecoveryPolicyInput,
    approvalId?: string,
  ): Promise<CommandResult<{ policyId: string; status: 'ACTIVE' }>> {
    const validated = policyInputSchema.parse(input);
    const channels = [...new Set(validated.channels)];
    const generatedId = randomUUID();
    return this.commands.execute(
      {
        action: 'recovery.policy.upsert',
        permission: 'recovery.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'recovery.policy', id: validated.storeId }),
        event: {
          type: 'recovery.policy.updated',
          data: (_input, result) => result,
          dedupeKey: () => `recovery:policy:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const store = await sql<{ id: string }>`select id from commerce.stores
            where id = ${validated.storeId}::uuid and status = 'ACTIVE'`.execute(transaction);
          if (!store.rows[0]) throw new RecoveryInvariantError('Active store was not found');
          const current = await sql<{ id: string }>`select id from recovery.policies
            where store_id = ${validated.storeId}::uuid and status = 'ACTIVE'
            for update`.execute(transaction);
          const policyId = current.rows[0]?.id ?? generatedId;
          if (current.rows[0]) {
            await sql`update recovery.policies set name = ${validated.name},
                abandonment_delay_minutes = ${validated.abandonmentDelayMinutes},
                opportunity_ttl_hours = ${validated.opportunityTtlHours},
                max_attempts = ${validated.maxAttempts},
                cooldown_minutes = ${validated.cooldownMinutes},
                attribution_window_hours = ${validated.attributionWindowHours},
                channels = ${channels}::text[],
                max_offer_percent_basis_points = ${validated.maxOfferPercentBasisPoints},
                max_offer_amount_minor = ${validated.maxOfferAmountMinor}, updated_at = now()
              where id = ${policyId}::uuid`.execute(transaction);
          } else {
            await sql`insert into recovery.policies (
                id, tenant_id, store_id, name, status, abandonment_delay_minutes,
                opportunity_ttl_hours, max_attempts, cooldown_minutes,
                attribution_window_hours, channels, max_offer_percent_basis_points,
                max_offer_amount_minor
              ) values (
                ${policyId}::uuid, ${context.tenantId}::uuid, ${validated.storeId}::uuid,
                ${validated.name}, 'ACTIVE', ${validated.abandonmentDelayMinutes},
                ${validated.opportunityTtlHours}, ${validated.maxAttempts},
                ${validated.cooldownMinutes}, ${validated.attributionWindowHours},
                ${channels}::text[], ${validated.maxOfferPercentBasisPoints},
                ${validated.maxOfferAmountMinor}
              )`.execute(transaction);
          }
          return { policyId, status: 'ACTIVE' as const };
        },
      },
      {
        context,
        input: { ...validated, channels },
        idempotencyKey,
        ...(approvalId ? { approvalId } : {}),
      },
    );
  }

  public async detect(
    context: TenantRequestContext,
    idempotencyKey: string,
    orderId: string,
  ): Promise<CommandResult<{ opportunityId: string; status: 'ELIGIBLE'; workflowId: string }>> {
    const sourceOrderId = uuidSchema.parse(orderId);
    const generatedId = randomUUID();
    return this.commands.execute(
      {
        action: 'recovery.opportunity.detect',
        permission: 'recovery.execute',
        risk: 'MEDIUM',
        resource: () => ({ type: 'commerce.order', id: sourceOrderId }),
        event: {
          type: 'recovery.opportunity.created',
          data: (_input, result) => result,
          dedupeKey: () => `recovery:detect:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const existing = await sql<{ id: string; temporal_workflow_id: string }>`
            select id, temporal_workflow_id from recovery.opportunities
            where source_order_id = ${sourceOrderId}::uuid for update
          `.execute(transaction);
          if (existing.rows[0]) {
            return {
              opportunityId: existing.rows[0].id,
              status: 'ELIGIBLE' as const,
              workflowId: existing.rows[0].temporal_workflow_id,
            };
          }
          const order = await sql<{
            store_id: string;
            customer_id: string | null;
            status: string;
            total_minor: string;
            currency: string;
            updated_at: Date;
          }>`select store_id, customer_id, status, total_minor::text, currency, updated_at
            from commerce.orders where id = ${sourceOrderId}::uuid for update`.execute(transaction);
          const row = order.rows[0];
          if (!row) throw new RecoveryInvariantError('Source order was not found');
          if (!['DRAFT', 'PENDING'].includes(row.status))
            throw new RecoveryInvariantError('Only draft or pending orders can enter recovery');
          if (!row.customer_id)
            throw new RecoveryInvariantError('Recovery requires a canonical customer identity');
          if (Number(row.total_minor) <= 0)
            throw new RecoveryInvariantError('Recovery requires a positive order value');
          const policy = await sql<PolicyRow>`select id, store_id, name, status,
              abandonment_delay_minutes, opportunity_ttl_hours, max_attempts,
              cooldown_minutes, attribution_window_hours, channels,
              max_offer_percent_basis_points, max_offer_amount_minor::text
            from recovery.policies where store_id = ${row.store_id}::uuid and status = 'ACTIVE'
            for share`.execute(transaction);
          const policyRow = policy.rows[0];
          if (!policyRow) throw new RecoveryInvariantError('Active recovery policy was not found');
          const workflowId = `recovery:${context.tenantId}:${sourceOrderId}`;
          const inserted = await sql<{ id: string }>`insert into recovery.opportunities (
              id, tenant_id, store_id, source_order_id, customer_id, policy_id,
              status, potential_value_minor, currency, detected_at, eligible_at,
              expires_at, temporal_workflow_id
            ) values (
              ${generatedId}::uuid, ${context.tenantId}::uuid, ${row.store_id}::uuid,
              ${sourceOrderId}::uuid, ${row.customer_id}::uuid, ${policyRow.id}::uuid,
              'ELIGIBLE', ${Number(row.total_minor)}, ${row.currency}, now(),
              greatest(now(), ${row.updated_at}::timestamptz + ${policyRow.abandonment_delay_minutes} * interval '1 minute'),
              greatest(now(), ${row.updated_at}::timestamptz + ${policyRow.abandonment_delay_minutes} * interval '1 minute')
                + ${policyRow.opportunity_ttl_hours} * interval '1 hour',
              ${workflowId}
            ) returning id`.execute(transaction);
          const opportunityId = inserted.rows[0]?.id;
          if (!opportunityId) throw new RecoveryInvariantError('Recovery opportunity was not created');
          await this.timeline(transaction, context, row.store_id, opportunityId, 'recovery.detected', {
            sourceOrderId,
            workflowId,
          });
          return { opportunityId, status: 'ELIGIBLE' as const, workflowId };
        },
      },
      { context, input: { orderId: sourceOrderId }, idempotencyKey },
    );
  }

  public async createOffer(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: RecoveryOfferInput,
    approvalId?: string,
  ): Promise<CommandResult<{ offerId: string; status: 'ACTIVE' }>> {
    const validated = offerInputSchema.parse(input);
    const offerId = randomUUID();
    return this.commands.execute(
      {
        action: 'recovery.offer.create',
        permission: 'recovery.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'recovery.opportunity', id: validated.opportunityId }),
        event: {
          type: 'recovery.offer.created',
          data: (_input, result) => result,
          dedupeKey: () => `recovery:offer:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const opportunity = await this.lockOpportunity(
            transaction,
            validated.opportunityId,
          );
          if (!['ELIGIBLE', 'ACTIVE'].includes(opportunity.status))
            throw new RecoveryInvariantError('Recovery opportunity cannot accept an offer');
          if (validated.expiresAt <= new Date())
            throw new RecoveryInvariantError('Recovery offer expiry must be in the future');
          if (validated.expiresAt > opportunity.expires_at)
            throw new RecoveryInvariantError('Recovery offer cannot outlive its opportunity');
          const policy = await this.policyById(transaction, opportunity.policy_id);
          if (validated.offerType === 'PERCENT') {
            if (validated.percentBasisPoints === undefined)
              throw new RecoveryInvariantError('Percentage recovery offer requires a percentage');
            if (validated.percentBasisPoints > policy.max_offer_percent_basis_points)
              throw new RecoveryInvariantError('Percentage recovery offer exceeds policy limit');
          } else if (validated.offerType === 'FIXED') {
            if (validated.amountMinor === undefined || !validated.currency)
              throw new RecoveryInvariantError('Fixed recovery offer requires amount and currency');
            if (validated.amountMinor > Number(policy.max_offer_amount_minor))
              throw new RecoveryInvariantError('Fixed recovery offer exceeds policy limit');
            if (validated.currency !== opportunity.currency)
              throw new RecoveryInvariantError('Recovery offer currency must match the source order');
          }
          await sql`update recovery.offers set status = 'CANCELLED', updated_at = now()
            where opportunity_id = ${opportunity.id}::uuid and status = 'ACTIVE'`.execute(transaction);
          await sql`insert into recovery.offers (
              id, tenant_id, store_id, opportunity_id, offer_type, percent_basis_points,
              amount_minor, currency, code, status, expires_at
            ) values (
              ${offerId}::uuid, ${context.tenantId}::uuid, ${opportunity.store_id}::uuid,
              ${opportunity.id}::uuid, ${validated.offerType},
              ${validated.percentBasisPoints ?? null}, ${validated.amountMinor ?? null},
              ${validated.currency ?? null}, ${validated.code ?? null}, 'ACTIVE',
              ${validated.expiresAt}
            )`.execute(transaction);
          await this.timeline(transaction, context, opportunity.store_id, opportunity.id, 'recovery.offer_created', {
            offerId,
            offerType: validated.offerType,
          });
          return { offerId, status: 'ACTIVE' as const };
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

  public async dispatchAttempt(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: RecoveryAttemptInput,
  ): Promise<{ attemptId: string; messageId: string; status: 'QUEUED' }> {
    const validated = attemptInputSchema.parse(input);
    const reserved = await this.reserveAttempt(
      context,
      `${idempotencyKey}:reserve`,
      validated,
    );
    try {
      const message = await this.messaging.send(
        context,
        `${idempotencyKey}:message`,
        reserved.result.conversationId,
        reserved.result.body,
      );
      const linked = await this.linkAttemptMessage(
        context,
        `${idempotencyKey}:link`,
        reserved.result.attemptId,
        message.result.messageId,
      );
      return linked.result;
    } catch (error) {
      await this.failReservedAttempt(
        context,
        `${idempotencyKey}:failure`,
        reserved.result.attemptId,
        error instanceof Error ? error.message : 'Messaging dispatch reservation failed',
      );
      throw error;
    }
  }

  public async markRecovered(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: MarkRecoveredInput,
  ): Promise<CommandResult<{ opportunityId: string; recoveredOrderId: string; recoveredValueMinor: number }>> {
    const validated = recoveryInputSchema.parse(input);
    return this.commands.execute(
      {
        action: 'recovery.opportunity.mark_recovered',
        permission: 'recovery.execute',
        risk: 'MEDIUM',
        resource: () => ({ type: 'recovery.opportunity', id: validated.opportunityId }),
        event: {
          type: 'recovery.opportunity.recovered',
          data: (_input, result) => result,
          dedupeKey: () => `recovery:recovered:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const opportunity = await this.lockOpportunity(transaction, validated.opportunityId);
          if (opportunity.status === 'RECOVERED' && opportunity.recovered_order_id) {
            return {
              opportunityId: opportunity.id,
              recoveredOrderId: opportunity.recovered_order_id,
              recoveredValueMinor: Number(opportunity.recovered_value_minor ?? '0'),
            };
          }
          if (!['ELIGIBLE', 'ACTIVE'].includes(opportunity.status))
            throw new RecoveryInvariantError('Recovery opportunity is not attributable');
          const attempt = await sql<{ id: string; sent_at: Date | null; queued_at: Date | null }>`
            select id, sent_at, queued_at from recovery.attempts
            where opportunity_id = ${opportunity.id}::uuid
              and status in ('QUEUED','SENT','DELIVERED')
            order by sequence desc limit 1 for update
          `.execute(transaction);
          const attributedAttempt = attempt.rows[0];
          if (!attributedAttempt)
            throw new RecoveryInvariantError('Recovery attribution requires a dispatched attempt');
          const order = await sql<{
            id: string;
            customer_id: string | null;
            store_id: string;
            status: string;
            total_minor: string;
            currency: string;
            updated_at: Date;
          }>`select id, customer_id, store_id, status, total_minor::text, currency, updated_at
            from commerce.orders where id = ${validated.recoveredOrderId}::uuid for share`.execute(
            transaction,
          );
          const recovered = order.rows[0];
          if (!recovered) throw new RecoveryInvariantError('Recovered order was not found');
          if (recovered.store_id !== opportunity.store_id || recovered.customer_id !== opportunity.customer_id)
            throw new RecoveryInvariantError('Recovered order must match the source store and customer');
          if (!['CONFIRMED', 'CLOSED'].includes(recovered.status))
            throw new RecoveryInvariantError('Recovered order must be confirmed or closed');
          if (recovered.currency !== opportunity.currency)
            throw new RecoveryInvariantError('Recovered order currency must match the opportunity');
          const policy = await this.policyById(transaction, opportunity.policy_id);
          const attemptedAt = attributedAttempt.sent_at ?? attributedAttempt.queued_at;
          if (!attemptedAt)
            throw new RecoveryInvariantError('Recovery attempt has no dispatch timestamp');
          const attributionDeadline = new Date(
            attemptedAt.getTime() + policy.attribution_window_hours * 60 * 60 * 1000,
          );
          if (new Date() > attributionDeadline)
            throw new RecoveryInvariantError('Recovery attribution window has expired');
          if (recovered.updated_at < attemptedAt)
            throw new RecoveryInvariantError('Recovered order predates the attributed attempt');
          const recoveredValueMinor = Number(recovered.total_minor);
          await sql`update recovery.opportunities set status = 'RECOVERED',
              recovered_order_id = ${recovered.id}::uuid,
              attributed_attempt_id = ${attributedAttempt.id}::uuid,
              recovered_at = now(), recovered_value_minor = ${recoveredValueMinor}, updated_at = now()
            where id = ${opportunity.id}::uuid`.execute(transaction);
          await sql`update recovery.offers set status = 'REDEEMED', redeemed_at = now(), updated_at = now()
            where opportunity_id = ${opportunity.id}::uuid and status = 'ACTIVE'
              and id = (select offer_id from recovery.attempts where id = ${attributedAttempt.id}::uuid)
          `.execute(transaction);
          await this.timeline(transaction, context, opportunity.store_id, opportunity.id, 'recovery.recovered', {
            recoveredOrderId: recovered.id,
            recoveredValueMinor,
            attributedAttemptId: attributedAttempt.id,
          });
          return {
            opportunityId: opportunity.id,
            recoveredOrderId: recovered.id,
            recoveredValueMinor,
          };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async expireDue(
    context: TenantRequestContext,
    idempotencyKey: string,
  ): Promise<CommandResult<{ expiredCount: number }>> {
    return this.commands.execute(
      {
        action: 'recovery.opportunity.expire_due',
        permission: 'recovery.execute',
        risk: 'LOW',
        resource: () => ({ type: 'recovery.opportunity', id: context.tenantId }),
        event: {
          type: 'recovery.opportunities.expired',
          data: (_input, result) => result,
          dedupeKey: () => `recovery:expire:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const expired = await sql<{ id: string; store_id: string }>`update recovery.opportunities
            set status = 'EXPIRED', updated_at = now()
            where status in ('ELIGIBLE','ACTIVE') and expires_at <= now()
            returning id, store_id`.execute(transaction);
          for (const row of expired.rows) {
            await this.timeline(transaction, context, row.store_id, row.id, 'recovery.expired', {});
          }
          return { expiredCount: expired.rows.length };
        },
      },
      { context, input: {}, idempotencyKey },
    );
  }

  private async reserveAttempt(
    context: TenantRequestContext,
    idempotencyKey: string,
    validated: z.output<typeof attemptInputSchema>,
  ): Promise<CommandResult<{ attemptId: string; conversationId: string; body: string }>> {
    const attemptId = randomUUID();
    return this.commands.execute(
      {
        action: 'recovery.attempt.reserve',
        permission: 'recovery.execute',
        risk: 'MEDIUM',
        resource: () => ({ type: 'recovery.opportunity', id: validated.opportunityId }),
        event: {
          type: 'recovery.attempt.reserved',
          data: (_input, result) => ({ attemptId: result.attemptId }),
          dedupeKey: () => `recovery:attempt:reserve:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const opportunity = await this.lockOpportunity(transaction, validated.opportunityId);
          if (!['ELIGIBLE', 'ACTIVE'].includes(opportunity.status))
            throw new RecoveryInvariantError('Recovery opportunity cannot send another attempt');
          const now = new Date();
          if (now < opportunity.eligible_at)
            throw new RecoveryInvariantError('Recovery opportunity is not eligible yet');
          if (now >= opportunity.expires_at)
            throw new RecoveryInvariantError('Recovery opportunity has expired');
          const sourceOrder = await sql<{ status: string }>`select status from commerce.orders
            where id = ${opportunity.source_order_id}::uuid for share`.execute(transaction);
          if (!sourceOrder.rows[0] || !['DRAFT', 'PENDING'].includes(sourceOrder.rows[0].status))
            throw new RecoveryInvariantError('Source order is no longer recoverable');
          const policy = await this.policyById(transaction, opportunity.policy_id);
          if (!policy.channels.includes(validated.channel))
            throw new RecoveryInvariantError('Recovery channel is not enabled by policy');
          const attempts = await sql<{
            count: string;
            last_attempt_at: Date | null;
          }>`select count(*)::text as count,
              max(coalesce(sent_at, queued_at, scheduled_at)) as last_attempt_at
            from recovery.attempts where opportunity_id = ${opportunity.id}::uuid
              and status not in ('CANCELLED','SUPPRESSED')`.execute(transaction);
          const attemptCount = Number(attempts.rows[0]?.count ?? '0');
          if (attemptCount >= policy.max_attempts)
            throw new RecoveryInvariantError('Recovery attempt limit has been reached');
          const lastAttemptAt = attempts.rows[0]?.last_attempt_at;
          if (
            lastAttemptAt &&
            now.getTime() < lastAttemptAt.getTime() + policy.cooldown_minutes * 60 * 1000
          )
            throw new RecoveryInvariantError('Recovery attempt cooldown is still active');
          const preference = await sql<{
            status: string;
            suppressed_until: Date | null;
          }>`select status, suppressed_until from crm.communication_preferences
            where customer_id = ${opportunity.customer_id}::uuid and channel = ${validated.channel}`.execute(
            transaction,
          );
          const preferenceRow = preference.rows[0];
          if (!preferenceRow || preferenceRow.status !== 'OPTED_IN')
            throw new RecoveryInvariantError('Verified customer opt-in is required for recovery outreach');
          if (preferenceRow.suppressed_until && preferenceRow.suppressed_until > now)
            throw new RecoveryInvariantError('Customer recovery outreach is temporarily suppressed');
          const conversation = await sql<{ id: string; channel: string }>`
            select id, channel from messaging.conversations
            where id = ${validated.conversationId}::uuid
              and customer_id = ${opportunity.customer_id}::uuid
              and channel = ${validated.channel}
              and status <> 'CLOSED'
              and connection_id is not null and provider_conversation_id is not null
            for share
          `.execute(transaction);
          if (!conversation.rows[0])
            throw new RecoveryInvariantError('Dispatchable customer conversation was not found');
          if (validated.offerId) {
            const offer = await sql<{ id: string }>`select id from recovery.offers
              where id = ${validated.offerId}::uuid
                and opportunity_id = ${opportunity.id}::uuid
                and status = 'ACTIVE' and expires_at > now() for share`.execute(transaction);
            if (!offer.rows[0]) throw new RecoveryInvariantError('Active recovery offer was not found');
          }
          const sequence = attemptCount + 1;
          await sql`insert into recovery.attempts (
              id, tenant_id, store_id, opportunity_id, sequence, channel, status,
              conversation_id, offer_id, body_snapshot, scheduled_at
            ) values (
              ${attemptId}::uuid, ${context.tenantId}::uuid, ${opportunity.store_id}::uuid,
              ${opportunity.id}::uuid, ${sequence}, ${validated.channel}, 'RESERVED',
              ${validated.conversationId}::uuid, ${validated.offerId ?? null}::uuid,
              ${validated.body}, now()
            )`.execute(transaction);
          await sql`update recovery.opportunities set status = 'ACTIVE',
              suppression_code = null, suppression_reason = null, updated_at = now()
            where id = ${opportunity.id}::uuid`.execute(transaction);
          await this.timeline(transaction, context, opportunity.store_id, opportunity.id, 'recovery.attempt_reserved', {
            attemptId,
            sequence,
            channel: validated.channel,
          });
          return { attemptId, conversationId: validated.conversationId, body: validated.body };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  private async linkAttemptMessage(
    context: TenantRequestContext,
    idempotencyKey: string,
    attemptId: string,
    messageId: string,
  ): Promise<CommandResult<{ attemptId: string; messageId: string; status: 'QUEUED' }>> {
    return this.commands.execute(
      {
        action: 'recovery.attempt.link_message',
        permission: 'recovery.execute',
        risk: 'LOW',
        resource: () => ({ type: 'recovery.attempt', id: attemptId }),
        event: {
          type: 'recovery.attempt.queued',
          data: (_input, result) => result,
          dedupeKey: () => `recovery:attempt:queued:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const attempt = await sql<{ opportunity_id: string; store_id: string }>`
            update recovery.attempts set status = 'QUEUED', message_id = ${messageId}::uuid,
              queued_at = now(), updated_at = now()
            where id = ${attemptId}::uuid and status = 'RESERVED'
              and exists (
                select 1 from messaging.messages message
                where message.tenant_id = ${context.tenantId}::uuid
                  and message.id = ${messageId}::uuid
              )
            returning opportunity_id, store_id
          `.execute(transaction);
          const row = attempt.rows[0];
          if (!row) throw new RecoveryInvariantError('Reserved recovery attempt was not found');
          await this.timeline(transaction, context, row.store_id, row.opportunity_id, 'recovery.attempt_queued', {
            attemptId,
            messageId,
          });
          return { attemptId, messageId, status: 'QUEUED' as const };
        },
      },
      { context, input: { attemptId, messageId }, idempotencyKey },
    );
  }

  private async failReservedAttempt(
    context: TenantRequestContext,
    idempotencyKey: string,
    attemptId: string,
    reason: string,
  ): Promise<void> {
    await this.commands.execute(
      {
        action: 'recovery.attempt.fail',
        permission: 'recovery.execute',
        risk: 'LOW',
        resource: () => ({ type: 'recovery.attempt', id: attemptId }),
        event: {
          type: 'recovery.attempt.failed',
          data: () => ({ attemptId, reason: reason.slice(0, 4000) }),
          dedupeKey: () => `recovery:attempt:failed:${idempotencyKey.trim()}`,
        },
        execute: async (transaction) => {
          await sql`update recovery.attempts set status = 'FAILED', failed_at = now(),
              last_error = ${reason.slice(0, 4000)}, updated_at = now()
            where id = ${attemptId}::uuid and status = 'RESERVED'`.execute(transaction);
          return { attemptId };
        },
      },
      { context, input: { attemptId }, idempotencyKey },
    );
  }

  private async lockOpportunity(
    transaction: PlatformTransaction,
    opportunityId: string,
  ): Promise<OpportunityRow> {
    const result = await sql<OpportunityRow>`select id, store_id, source_order_id, customer_id,
        policy_id, status, potential_value_minor::text, currency, detected_at, eligible_at,
        expires_at, suppression_code, suppression_reason, temporal_workflow_id,
        recovered_order_id, attributed_attempt_id, recovered_at, recovered_value_minor::text,
        updated_at from recovery.opportunities where id = ${opportunityId}::uuid for update`.execute(
      transaction,
    );
    const row = result.rows[0];
    if (!row) throw new RecoveryInvariantError('Recovery opportunity was not found');
    return row;
  }

  private async policyById(
    transaction: PlatformTransaction,
    policyId: string,
  ): Promise<PolicyRow> {
    const result = await sql<PolicyRow>`select id, store_id, name, status,
        abandonment_delay_minutes, opportunity_ttl_hours, max_attempts,
        cooldown_minutes, attribution_window_hours, channels,
        max_offer_percent_basis_points, max_offer_amount_minor::text
      from recovery.policies where id = ${policyId}::uuid`.execute(transaction);
    const row = result.rows[0];
    if (!row) throw new RecoveryInvariantError('Recovery policy was not found');
    return row;
  }

  private async timeline(
    transaction: PlatformTransaction,
    context: TenantRequestContext,
    storeId: string,
    opportunityId: string,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await sql`insert into recovery.timeline (
        tenant_id, store_id, opportunity_id, event_type, actor_type, actor_id, data
      ) values (
        ${context.tenantId}::uuid, ${storeId}::uuid, ${opportunityId}::uuid,
        ${eventType}, ${context.actorType}, ${context.actorId}::uuid, ${JSON.stringify(data)}::jsonb
      )`.execute(transaction);
  }
}
