import { randomUUID } from 'node:crypto';
import {
  CommandExecutor,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';
import { z } from 'zod';

const uuidSchema = z.string().uuid();
const channelSchema = z.enum(['EMAIL', 'WHATSAPP', 'MESSENGER', 'INSTAGRAM']);
const campaignInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  channel: channelSchema,
  segmentId: uuidSchema.optional(),
  templateId: uuidSchema,
  timezone: z.string().trim().min(1).max(100).default('UTC'),
  sendWindowStartMinute: z.number().int().min(0).max(1439).default(480),
  sendWindowEndMinute: z.number().int().min(0).max(1439).default(1260),
  batchSize: z.number().int().min(1).max(5000).default(500),
  attributionWindowHours: z.number().int().min(1).max(2160).default(168),
});
const scheduleInputSchema = z.object({ scheduledAt: z.string().datetime() });
const conversionInputSchema = z.object({
  orderId: uuidSchema,
  customerId: uuidSchema,
  attributedValueMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/),
  occurredAt: z.string().datetime(),
});

export type CampaignInput = z.input<typeof campaignInputSchema>;
export type CampaignScheduleInput = z.input<typeof scheduleInputSchema>;
export type CampaignConversionInput = z.input<typeof conversionInputSchema>;

interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  channel: z.infer<typeof channelSchema>;
  segment_id: string | null;
  template_id: string | null;
  status: string;
  timezone: string;
  send_window_start_minute: number;
  send_window_end_minute: number;
  batch_size: number;
  scheduled_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  temporal_workflow_id: string | null;
  attribution_window_hours: number;
  updated_at: Date;
}

export class CampaignsService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async dashboard(context: TenantRequestContext) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const campaigns = await sql<CampaignRow>`
        select id, name, description, channel, segment_id, template_id, status, timezone,
               send_window_start_minute, send_window_end_minute, batch_size,
               scheduled_at, started_at, completed_at, temporal_workflow_id,
               attribution_window_hours, updated_at
        from campaigns.campaigns
        order by created_at desc, id
        limit 200
      `.execute(transaction);
      const metrics = await sql<{
        campaign_id: string;
        total: string;
        eligible: string;
        suppressed: string;
        queued: string;
        sent: string;
        delivered: string;
        read_count: string;
        failed: string;
        conversion_count: string;
        conversion_value_minor: string;
        provider_cost_minor: string;
      }>`
        select campaign.id as campaign_id,
          count(recipient.id)::text as total,
          count(recipient.id) filter (where recipient.eligibility = 'ELIGIBLE')::text as eligible,
          count(recipient.id) filter (where recipient.eligibility = 'SUPPRESSED')::text as suppressed,
          count(recipient.id) filter (where recipient.delivery_status = 'QUEUED')::text as queued,
          count(recipient.id) filter (where recipient.delivery_status = 'SENT')::text as sent,
          count(recipient.id) filter (where recipient.delivery_status = 'DELIVERED')::text as delivered,
          count(recipient.id) filter (where recipient.delivery_status = 'READ')::text as read_count,
          count(recipient.id) filter (where recipient.delivery_status in ('FAILED','DEAD_LETTER'))::text as failed,
          (select count(*)::text from campaigns.conversions conversion
             where conversion.campaign_id = campaign.id) as conversion_count,
          coalesce((select sum(conversion.attributed_value_minor)::text
             from campaigns.conversions conversion where conversion.campaign_id = campaign.id), '0') as conversion_value_minor,
          coalesce((select sum(delivery.provider_cost_minor)::text
             from campaigns.deliveries delivery where delivery.campaign_id = campaign.id), '0') as provider_cost_minor
        from campaigns.campaigns campaign
        left join campaigns.recipients recipient on recipient.campaign_id = campaign.id
        group by campaign.id
      `.execute(transaction);
      const metricByCampaign = new Map(metrics.rows.map((row) => [row.campaign_id, row]));
      return {
        items: campaigns.rows.map((campaign) => {
          const metric = metricByCampaign.get(campaign.id);
          return {
            id: campaign.id,
            name: campaign.name,
            description: campaign.description,
            channel: campaign.channel,
            segmentId: campaign.segment_id,
            templateId: campaign.template_id,
            status: campaign.status,
            timezone: campaign.timezone,
            sendWindowStartMinute: campaign.send_window_start_minute,
            sendWindowEndMinute: campaign.send_window_end_minute,
            batchSize: campaign.batch_size,
            scheduledAt: campaign.scheduled_at?.toISOString() ?? null,
            startedAt: campaign.started_at?.toISOString() ?? null,
            completedAt: campaign.completed_at?.toISOString() ?? null,
            temporalWorkflowId: campaign.temporal_workflow_id,
            attributionWindowHours: campaign.attribution_window_hours,
            updatedAt: campaign.updated_at.toISOString(),
            metrics: {
              total: Number(metric?.total ?? 0),
              eligible: Number(metric?.eligible ?? 0),
              suppressed: Number(metric?.suppressed ?? 0),
              queued: Number(metric?.queued ?? 0),
              sent: Number(metric?.sent ?? 0),
              delivered: Number(metric?.delivered ?? 0),
              read: Number(metric?.read_count ?? 0),
              failed: Number(metric?.failed ?? 0),
              conversions: Number(metric?.conversion_count ?? 0),
              conversionValueMinor: metric?.conversion_value_minor ?? '0',
              providerCostMinor: metric?.provider_cost_minor ?? '0',
            },
          };
        }),
      };
    });
  }

  public async create(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CampaignInput,
  ): Promise<CommandResult<{ campaignId: string }>> {
    const validated = campaignInputSchema.parse(input);
    if (validated.sendWindowStartMinute === validated.sendWindowEndMinute)
      throw new Error('Campaign send window must have a non-zero duration');
    await this.assertTimezone(context, validated.timezone);
    const campaignId = randomUUID();
    return this.commands.execute(
      {
        action: 'campaigns.campaign.create',
        permission: 'campaigns.create',
        risk: 'MEDIUM',
        resource: () => ({ type: 'campaign', id: campaignId }),
        event: {
          type: 'campaigns.campaign.created',
          data: () => ({ campaignId, channel: validated.channel }),
          dedupeKey: () => `campaign:create:${idempotencyKey}`,
        },
        audit: { afterState: () => ({ campaignId, ...validated }) },
        execute: async (transaction) => {
          if (validated.segmentId) {
            const segment = await sql<{ id: string }>`select id from crm.segments
              where id = ${validated.segmentId}::uuid and status = 'ACTIVE'`.execute(transaction);
            if (!segment.rows[0]) throw new Error('Active CRM segment was not found');
          }
          const template = await sql<{ channel: string | null; status: string }>`
            select channel, status from messaging.templates where id = ${validated.templateId}::uuid
          `.execute(transaction);
          const templateRow = template.rows[0];
          if (!templateRow || templateRow.status !== 'ACTIVE')
            throw new Error('Active message template was not found');
          if (templateRow.channel && templateRow.channel !== validated.channel)
            throw new Error('Campaign channel must match the message template channel');
          await sql`insert into campaigns.campaigns (
              id, tenant_id, name, description, channel, segment_id, template_id,
              timezone, send_window_start_minute, send_window_end_minute, batch_size,
              attribution_window_hours, created_by_user_id
            ) values (
              ${campaignId}::uuid, ${context.tenantId}::uuid, ${validated.name},
              ${validated.description ?? null}, ${validated.channel},
              ${validated.segmentId ?? null}::uuid, ${validated.templateId}::uuid,
              ${validated.timezone}, ${validated.sendWindowStartMinute},
              ${validated.sendWindowEndMinute}, ${validated.batchSize},
              ${validated.attributionWindowHours}, ${context.actorId}::uuid
            )`.execute(transaction);
          await this.timeline(transaction, context, campaignId, 'campaign.created', {
            channel: validated.channel,
          });
          return { campaignId };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async freezeAudience(
    context: TenantRequestContext,
    idempotencyKey: string,
    campaignId: string,
  ): Promise<CommandResult<{ campaignId: string; total: number; eligible: number; suppressed: number; batches: number }>> {
    const id = uuidSchema.parse(campaignId);
    return this.commands.execute(
      {
        action: 'campaigns.audience.freeze',
        permission: 'campaigns.audiences.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'campaign', id }),
        event: {
          type: 'campaigns.audience.frozen',
          data: (_input, result) => result,
          dedupeKey: () => `campaign:audience:freeze:${idempotencyKey}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const campaignResult = await sql<{
            channel: z.infer<typeof channelSchema>;
            segment_id: string | null;
            status: string;
            timezone: string;
            batch_size: number;
          }>`select channel, segment_id, status, timezone, batch_size
             from campaigns.campaigns where id = ${id}::uuid for update`.execute(transaction);
          const campaign = campaignResult.rows[0];
          if (!campaign || campaign.status !== 'DRAFT')
            throw new Error('Draft campaign was not found');
          const existing = await sql<{ count: string }>`select count(*)::text as count
            from campaigns.recipients where campaign_id = ${id}::uuid`.execute(transaction);
          if (Number(existing.rows[0]?.count ?? 0) > 0)
            throw new Error('Campaign audience is already frozen');

          const candidates = await sql<{
            customer_id: string;
            contact_point_id: string | null;
            destination: string | null;
            locale: string | null;
            timezone: string | null;
            consent_status: 'OPTED_IN' | 'OPTED_OUT' | 'UNKNOWN' | null;
            suppressed_until: Date | null;
            has_verified_consent: boolean;
          }>`
            select customer.id as customer_id,
              contact.id as contact_point_id,
              contact.normalized_value as destination,
              customer.preferred_language as locale,
              customer.timezone,
              preference.status as consent_status,
              preference.suppressed_until,
              exists(
                select 1 from crm.communication_consent_evidence evidence
                where evidence.customer_id = customer.id and evidence.channel = ${campaign.channel}
              ) as has_verified_consent
            from crm.customers customer
            left join lateral (
              select point.id, point.normalized_value
              from crm.contact_points point
              where point.customer_id = customer.id
                and point.status = 'ACTIVE'
                and point.channel = ${campaign.channel}
              order by point.is_primary desc, point.created_at, point.id
              limit 1
            ) contact on true
            left join crm.communication_preferences preference
              on preference.customer_id = customer.id and preference.channel = ${campaign.channel}
            where customer.status = 'ACTIVE'
              and (
                ${campaign.segment_id}::uuid is null
                or exists(
                  select 1 from crm.segment_memberships membership
                  where membership.segment_id = ${campaign.segment_id}::uuid
                    and membership.customer_id = customer.id
                )
              )
            order by customer.id
          `.execute(transaction);

          let eligible = 0;
          let suppressed = 0;
          for (const candidate of candidates.rows) {
            const consent = candidate.consent_status ?? 'UNKNOWN';
            const suppression = this.suppressionCode(
              candidate.destination,
              consent,
              candidate.suppressed_until,
              candidate.has_verified_consent,
            );
            const eligibility = suppression ? 'SUPPRESSED' : 'ELIGIBLE';
            const deliveryStatus = suppression ? 'SUPPRESSED' : 'PENDING';
            if (suppression) suppressed += 1;
            else eligible += 1;
            const destination = candidate.destination ?? `missing:${candidate.customer_id}`;
            const sendIdentity = `campaign:${id}:customer:${candidate.customer_id}:channel:${campaign.channel}`;
            await sql`insert into campaigns.recipients (
                tenant_id, campaign_id, customer_id, contact_point_id, destination, channel,
                locale, timezone, consent_status, eligibility, suppression_code,
                send_identity, delivery_status
              ) values (
                ${context.tenantId}::uuid, ${id}::uuid, ${candidate.customer_id}::uuid,
                ${candidate.contact_point_id ?? null}::uuid, ${destination}, ${campaign.channel},
                ${candidate.locale ?? 'en'}, ${candidate.timezone ?? campaign.timezone},
                ${consent}, ${eligibility}, ${suppression}, ${sendIdentity}, ${deliveryStatus}
              )`.execute(transaction);
          }

          const batches = eligible === 0 ? 0 : Math.ceil(eligible / campaign.batch_size);
          for (let sequence = 1; sequence <= batches; sequence += 1) {
            const first = (sequence - 1) * campaign.batch_size + 1;
            const last = Math.min(sequence * campaign.batch_size, eligible);
            await sql`insert into campaigns.batches (
                tenant_id, campaign_id, sequence, first_recipient_ordinal, last_recipient_ordinal
              ) values (
                ${context.tenantId}::uuid, ${id}::uuid, ${sequence}, ${first}, ${last}
              )`.execute(transaction);
          }
          await this.timeline(transaction, context, id, 'campaign.audience_frozen', {
            total: candidates.rows.length,
            eligible,
            suppressed,
            batches,
          });
          return { campaignId: id, total: candidates.rows.length, eligible, suppressed, batches };
        },
      },
      { context, input: { campaignId: id }, idempotencyKey },
    );
  }

  public async schedule(
    context: TenantRequestContext,
    idempotencyKey: string,
    campaignId: string,
    input: CampaignScheduleInput,
    approvalId?: string,
  ): Promise<CommandResult<{ campaignId: string; status: 'SCHEDULED'; scheduledAt: string }>> {
    const id = uuidSchema.parse(campaignId);
    const validated = scheduleInputSchema.parse(input);
    const scheduledAt = new Date(validated.scheduledAt);
    if (scheduledAt.getTime() <= Date.now()) throw new Error('Campaign schedule must be in the future');
    return this.commands.execute(
      {
        action: 'campaigns.campaign.schedule',
        permission: 'campaigns.send',
        risk: 'HIGH',
        resource: () => ({ type: 'campaign', id }),
        event: {
          type: 'campaigns.campaign.scheduled',
          data: () => ({ campaignId: id, scheduledAt: scheduledAt.toISOString() }),
          dedupeKey: () => `campaign:schedule:${idempotencyKey}`,
        },
        audit: { afterState: () => ({ campaignId: id, status: 'SCHEDULED', scheduledAt }) },
        execute: async (transaction) => {
          await this.assertAudienceReady(transaction, id);
          const updated = await sql<{ id: string }>`update campaigns.campaigns
            set status = 'SCHEDULED', scheduled_at = ${scheduledAt},
                temporal_workflow_id = ${this.workflowId(context.tenantId, id)}, updated_at = now()
            where id = ${id}::uuid and status = 'DRAFT'
            returning id`.execute(transaction);
          if (!updated.rows[0]) throw new Error('Draft campaign was not found');
          await this.timeline(transaction, context, id, 'campaign.scheduled', {
            scheduledAt: scheduledAt.toISOString(),
          });
          return { campaignId: id, status: 'SCHEDULED' as const, scheduledAt: scheduledAt.toISOString() };
        },
      },
      { context, input: validated, idempotencyKey, approvalId },
    );
  }

  public async start(
    context: TenantRequestContext,
    idempotencyKey: string,
    campaignId: string,
    approvalId?: string,
  ): Promise<CommandResult<{ campaignId: string; status: 'RUNNING' }>> {
    const id = uuidSchema.parse(campaignId);
    return this.commands.execute(
      {
        action: 'campaigns.campaign.start',
        permission: 'campaigns.send',
        risk: 'HIGH',
        resource: () => ({ type: 'campaign', id }),
        event: {
          type: 'campaigns.campaign.started',
          data: () => ({ campaignId: id }),
          dedupeKey: () => `campaign:start:${idempotencyKey}`,
        },
        audit: { afterState: () => ({ campaignId: id, status: 'RUNNING' }) },
        execute: async (transaction) => {
          await this.assertAudienceReady(transaction, id);
          const updated = await sql<{ id: string }>`update campaigns.campaigns
            set status = 'RUNNING', started_at = coalesce(started_at, now()),
                scheduled_at = coalesce(scheduled_at, now()),
                temporal_workflow_id = coalesce(temporal_workflow_id, ${this.workflowId(context.tenantId, id)}),
                updated_at = now()
            where id = ${id}::uuid and status in ('DRAFT','SCHEDULED','PAUSED')
            returning id`.execute(transaction);
          if (!updated.rows[0]) throw new Error('Startable campaign was not found');
          await this.timeline(transaction, context, id, 'campaign.started', {});
          return { campaignId: id, status: 'RUNNING' as const };
        },
      },
      { context, input: { campaignId: id }, idempotencyKey, approvalId },
    );
  }

  public async setOperationalState(
    context: TenantRequestContext,
    idempotencyKey: string,
    campaignId: string,
    target: 'PAUSED' | 'RUNNING' | 'CANCELLED',
  ): Promise<CommandResult<{ campaignId: string; status: string }>> {
    const id = uuidSchema.parse(campaignId);
    const action = target === 'PAUSED' ? 'pause' : target === 'RUNNING' ? 'resume' : 'cancel';
    return this.commands.execute(
      {
        action: `campaigns.campaign.${action}`,
        permission: 'campaigns.stop',
        risk: 'HIGH',
        resource: () => ({ type: 'campaign', id }),
        event: {
          type: `campaigns.campaign.${target.toLowerCase()}`,
          data: () => ({ campaignId: id, status: target }),
          dedupeKey: () => `campaign:${action}:${idempotencyKey}`,
        },
        audit: { afterState: () => ({ campaignId: id, status: target }) },
        execute: async (transaction) => {
          const allowed =
            target === 'PAUSED'
              ? ['RUNNING']
              : target === 'RUNNING'
                ? ['PAUSED']
                : ['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED'];
          const result = await sql<{ id: string }>`update campaigns.campaigns
            set status = ${target},
                cancelled_at = case when ${target} = 'CANCELLED' then now() else cancelled_at end,
                started_at = case when ${target} = 'RUNNING' then coalesce(started_at, now()) else started_at end,
                updated_at = now()
            where id = ${id}::uuid and status = any(${allowed}::text[])
            returning id`.execute(transaction);
          if (!result.rows[0]) throw new Error(`Campaign cannot transition to ${target}`);
          if (target === 'CANCELLED') {
            await sql`update campaigns.batches set state = 'CANCELLED', finished_at = now(), updated_at = now()
              where campaign_id = ${id}::uuid and state in ('QUEUED','FAILED')`.execute(transaction);
            await sql`update campaigns.recipients set delivery_status = 'CANCELLED', updated_at = now()
              where campaign_id = ${id}::uuid and delivery_status in ('PENDING','FAILED')`.execute(
              transaction,
            );
          }
          await this.timeline(transaction, context, id, `campaign.${action}`, {});
          return { campaignId: id, status: target };
        },
      },
      { context, input: { campaignId: id, target }, idempotencyKey },
    );
  }

  public async dispatchBatch(
    context: TenantRequestContext,
    idempotencyKey: string,
    campaignId: string,
    batchId: string,
  ): Promise<CommandResult<{ campaignId: string; batchId: string; queued: number; skipped: number }>> {
    const id = uuidSchema.parse(campaignId);
    const batch = uuidSchema.parse(batchId);
    return this.commands.execute(
      {
        action: 'campaigns.batch.dispatch',
        permission: 'campaigns.send',
        risk: 'MEDIUM',
        resource: () => ({ type: 'campaign.batch', id: batch }),
        event: {
          type: 'campaigns.batch.dispatched',
          data: (_input, result) => result,
          dedupeKey: () => `campaign:batch:dispatch:${idempotencyKey}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const campaignResult = await sql<{
            channel: string;
            template_id: string;
            status: string;
            timezone: string;
            send_window_start_minute: number;
            send_window_end_minute: number;
          }>`select channel, template_id, status, timezone,
                    send_window_start_minute, send_window_end_minute
             from campaigns.campaigns where id = ${id}::uuid for update`.execute(transaction);
          const campaign = campaignResult.rows[0];
          if (!campaign || campaign.status !== 'RUNNING')
            throw new Error('Running campaign was not found');
          if (!this.withinSendWindow(campaign.timezone, campaign.send_window_start_minute, campaign.send_window_end_minute))
            throw new Error('Campaign is outside its configured send window');
          const batchResult = await sql<{
            first_recipient_ordinal: number;
            last_recipient_ordinal: number;
            state: string;
          }>`select first_recipient_ordinal, last_recipient_ordinal, state
             from campaigns.batches
             where id = ${batch}::uuid and campaign_id = ${id}::uuid for update`.execute(transaction);
          const batchRow = batchResult.rows[0];
          if (!batchRow || !['QUEUED', 'FAILED'].includes(batchRow.state))
            throw new Error('Dispatchable campaign batch was not found');
          const template = await sql<{ body: string }>`select body from messaging.templates
            where id = ${campaign.template_id}::uuid and status = 'ACTIVE'`.execute(transaction);
          const body = template.rows[0]?.body;
          if (!body) throw new Error('Active campaign template was not found');

          await sql`update campaigns.batches
            set state = 'RUNNING', attempts = attempts + 1, started_at = coalesce(started_at, now()),
                claimed_by = ${context.subject}, claimed_at = now(), last_error = null, updated_at = now()
            where id = ${batch}::uuid`.execute(transaction);

          const recipients = await sql<{
            id: string;
            customer_id: string;
            destination: string;
            delivery_status: string;
            last_attempt: number;
            ordinal: string;
          }>`with eligible as (
              select recipient.*,
                     row_number() over (order by recipient.id) as ordinal
              from campaigns.recipients recipient
              where recipient.campaign_id = ${id}::uuid and recipient.eligibility = 'ELIGIBLE'
            )
            select id, customer_id, destination, delivery_status, last_attempt, ordinal::text
            from eligible
            where ordinal between ${batchRow.first_recipient_ordinal} and ${batchRow.last_recipient_ordinal}
            order by ordinal`.execute(transaction);

          let queued = 0;
          let skipped = 0;
          for (const recipient of recipients.rows) {
            if (['QUEUED', 'SENT', 'DELIVERED', 'READ'].includes(recipient.delivery_status)) {
              skipped += 1;
              continue;
            }
            const currentConsent = await sql<{
              status: string | null;
              suppressed_until: Date | null;
              verified: boolean;
            }>`select preference.status,
                    preference.suppressed_until,
                    exists(
                      select 1 from crm.communication_consent_evidence evidence
                      where evidence.customer_id = ${recipient.customer_id}::uuid
                        and evidence.channel = ${campaign.channel}
                    ) as verified
               from crm.customers customer
               left join crm.communication_preferences preference
                 on preference.customer_id = customer.id and preference.channel = ${campaign.channel}
               where customer.id = ${recipient.customer_id}::uuid`.execute(transaction);
            const consent = currentConsent.rows[0];
            if (
              !consent ||
              consent.status !== 'OPTED_IN' ||
              !consent.verified ||
              (consent.suppressed_until && consent.suppressed_until.getTime() > Date.now())
            ) {
              await sql`update campaigns.recipients
                set delivery_status = 'SUPPRESSED', updated_at = now()
                where id = ${recipient.id}::uuid`.execute(transaction);
              skipped += 1;
              continue;
            }
            const conversationId = randomUUID();
            const providerConversationId = `campaign:${id}:${recipient.customer_id}:${campaign.channel}`;
            const conversation = await sql<{ id: string }>`insert into messaging.conversations (
                id, tenant_id, customer_id, channel, provider_conversation_id, mode
              ) values (
                ${conversationId}::uuid, ${context.tenantId}::uuid, ${recipient.customer_id}::uuid,
                ${campaign.channel}, ${providerConversationId}, 'HUMAN'
              ) on conflict (tenant_id, channel, provider_conversation_id) do update
                set customer_id = excluded.customer_id, updated_at = now()
              returning id`.execute(transaction);
            const canonicalConversationId = conversation.rows[0]?.id;
            if (!canonicalConversationId) throw new Error('Campaign conversation could not be created');
            const messageId = randomUUID();
            await sql`insert into messaging.messages (
                id, tenant_id, conversation_id, direction, sender_type, body,
                delivery_status, next_delivery_attempt_at
              ) values (
                ${messageId}::uuid, ${context.tenantId}::uuid, ${canonicalConversationId}::uuid,
                'OUTBOUND', 'SYSTEM', ${body}, 'PENDING', now()
              )`.execute(transaction);
            const attempt = recipient.last_attempt + 1;
            await sql`insert into campaigns.deliveries (
                tenant_id, campaign_id, recipient_id, attempt, status,
                conversation_id, message_id, queued_at
              ) values (
                ${context.tenantId}::uuid, ${id}::uuid, ${recipient.id}::uuid, ${attempt},
                'QUEUED', ${canonicalConversationId}::uuid, ${messageId}::uuid, now()
              )`.execute(transaction);
            await sql`update campaigns.recipients
              set delivery_status = 'QUEUED', last_attempt = ${attempt}, updated_at = now()
              where id = ${recipient.id}::uuid`.execute(transaction);
            queued += 1;
          }

          await sql`update campaigns.batches
            set state = 'SUCCEEDED', finished_at = now(), updated_at = now()
            where id = ${batch}::uuid`.execute(transaction);
          await this.timeline(transaction, context, id, 'campaign.batch_dispatched', {
            batchId: batch,
            queued,
            skipped,
          });
          return { campaignId: id, batchId: batch, queued, skipped };
        },
      },
      { context, input: { campaignId: id, batchId: batch }, idempotencyKey },
    );
  }

  public async attributeConversion(
    context: TenantRequestContext,
    idempotencyKey: string,
    campaignId: string,
    input: CampaignConversionInput,
  ): Promise<CommandResult<{ conversionId: string; campaignId: string; orderId: string }>> {
    const id = uuidSchema.parse(campaignId);
    const validated = conversionInputSchema.parse(input);
    const conversionId = randomUUID();
    return this.commands.execute(
      {
        action: 'campaigns.conversion.attribute',
        permission: 'campaigns.update',
        risk: 'LOW',
        resource: () => ({ type: 'campaign', id }),
        event: {
          type: 'campaigns.conversion.attributed',
          data: () => ({ campaignId: id, conversionId, orderId: validated.orderId }),
          dedupeKey: () => `campaign:conversion:${idempotencyKey}`,
        },
        audit: { afterState: () => ({ conversionId, campaignId: id, ...validated }) },
        execute: async (transaction) => {
          const campaign = await sql<{ started_at: Date | null; attribution_window_hours: number }>`
            select started_at, attribution_window_hours from campaigns.campaigns
            where id = ${id}::uuid`.execute(transaction);
          const row = campaign.rows[0];
          if (!row?.started_at) throw new Error('Started campaign was not found');
          const occurredAt = new Date(validated.occurredAt);
          const end = row.started_at.getTime() + row.attribution_window_hours * 60 * 60 * 1000;
          if (occurredAt.getTime() < row.started_at.getTime() || occurredAt.getTime() > end)
            throw new Error('Conversion is outside the campaign attribution window');
          const recipient = await sql<{ id: string }>`select id from campaigns.recipients
            where campaign_id = ${id}::uuid and customer_id = ${validated.customerId}::uuid
              and delivery_status in ('QUEUED','SENT','DELIVERED','READ')
            order by frozen_at, id limit 1`.execute(transaction);
          const recipientId = recipient.rows[0]?.id;
          if (!recipientId) throw new Error('Delivered campaign recipient was not found');
          const order = await sql<{ customer_id: string | null; currency: string; total_minor: string }>`
            select customer_id, currency, total_minor::text as total_minor from commerce.orders
            where id = ${validated.orderId}::uuid`.execute(transaction);
          const orderRow = order.rows[0];
          if (!orderRow) throw new Error('Attributed order was not found');
          if (orderRow.customer_id && orderRow.customer_id !== validated.customerId)
            throw new Error('Attributed order must belong to the recipient customer');
          if (orderRow.currency !== validated.currency)
            throw new Error('Attributed conversion currency must match the order currency');
          if (validated.attributedValueMinor > Number(orderRow.total_minor))
            throw new Error('Attributed value cannot exceed the order total');
          await sql`insert into campaigns.conversions (
              id, tenant_id, campaign_id, recipient_id, order_id,
              attributed_value_minor, currency, occurred_at
            ) values (
              ${conversionId}::uuid, ${context.tenantId}::uuid, ${id}::uuid,
              ${recipientId}::uuid, ${validated.orderId}::uuid,
              ${validated.attributedValueMinor}, ${validated.currency}, ${occurredAt}
            )`.execute(transaction);
          await this.timeline(transaction, context, id, 'campaign.conversion_attributed', {
            conversionId,
            orderId: validated.orderId,
            valueMinor: validated.attributedValueMinor,
          });
          return { conversionId, campaignId: id, orderId: validated.orderId };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  private suppressionCode(
    destination: string | null,
    consent: 'OPTED_IN' | 'OPTED_OUT' | 'UNKNOWN',
    suppressedUntil: Date | null,
    verifiedConsent: boolean,
  ): string | null {
    if (!destination) return 'MISSING_DESTINATION';
    if (consent === 'OPTED_OUT') return 'OPTED_OUT';
    if (consent !== 'OPTED_IN') return 'CONSENT_UNKNOWN';
    if (!verifiedConsent) return 'CONSENT_UNVERIFIED';
    if (suppressedUntil && suppressedUntil.getTime() > Date.now()) return 'TEMPORARILY_SUPPRESSED';
    return null;
  }

  private workflowId(tenantId: string, campaignId: string): string {
    return `campaign:${tenantId}:${campaignId}`;
  }

  private withinSendWindow(timezone: string, startMinute: number, endMinute: number): boolean {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 24;
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
    const current = hour * 60 + minute;
    return startMinute < endMinute
      ? current >= startMinute && current < endMinute
      : current >= startMinute || current < endMinute;
  }

  private async assertAudienceReady(
    transaction: Parameters<Parameters<CommandExecutor['execute']>[0]['execute']>[0],
    campaignId: string,
  ): Promise<void> {
    const result = await sql<{ total: string; eligible: string }>`select count(*)::text as total,
      count(*) filter (where eligibility = 'ELIGIBLE')::text as eligible
      from campaigns.recipients where campaign_id = ${campaignId}::uuid`.execute(transaction);
    if (Number(result.rows[0]?.total ?? 0) === 0)
      throw new Error('Campaign audience must be frozen before scheduling or launch');
    if (Number(result.rows[0]?.eligible ?? 0) === 0)
      throw new Error('Campaign has no consent-eligible recipients');
  }

  private async assertTimezone(context: TenantRequestContext, timezone: string): Promise<void> {
    await withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{ valid: boolean }>`select exists(
        select 1 from pg_timezone_names where name = ${timezone}
      ) as valid`.execute(transaction);
      if (!result.rows[0]?.valid) throw new Error('Unknown timezone');
    });
  }

  private async timeline(
    transaction: Parameters<Parameters<CommandExecutor['execute']>[0]['execute']>[0],
    context: TenantRequestContext,
    campaignId: string,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await sql`insert into campaigns.timeline (
        tenant_id, campaign_id, event_type, actor_type, actor_id, data
      ) values (
        ${context.tenantId}::uuid, ${campaignId}::uuid, ${eventType},
        ${context.actorType}, ${context.actorId}::uuid, ${JSON.stringify(data)}::jsonb
      )`.execute(transaction);
  }
}
