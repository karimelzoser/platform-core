import { randomUUID } from 'node:crypto';
import {
  CommandExecutor,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';
import { z } from 'zod';

const uuidSchema = z.string().uuid();
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const pipelineInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  isDefault: z.boolean().default(false),
  stages: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        probabilityBps: z.number().int().min(0).max(10000),
        terminalKind: z.enum(['OPEN', 'WON', 'LOST']).default('OPEN'),
      }),
    )
    .min(1)
    .max(30),
});
const leadInputSchema = z.object({
  customerId: uuidSchema,
  ownerMembershipId: uuidSchema.optional(),
  source: z.string().trim().min(1).max(120).default('platform'),
});
const qualificationInputSchema = z.object({
  score: z.number().int().min(0).max(100),
  grade: z.enum(['UNKNOWN', 'COLD', 'WARM', 'HOT']),
  status: z.enum(['QUALIFYING', 'QUALIFIED', 'DISQUALIFIED']),
  notes: z.string().trim().max(4000).optional(),
  disqualificationReason: z.string().trim().min(1).max(1000).optional(),
});
const opportunityInputSchema = z.object({
  customerId: uuidSchema,
  leadId: uuidSchema.optional(),
  pipelineId: uuidSchema,
  stageId: uuidSchema,
  ownerMembershipId: uuidSchema.optional(),
  name: z.string().trim().min(1).max(240),
  currencyCode: currencySchema,
  expectedValueMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  probabilityBps: z.number().int().min(0).max(10000).optional(),
  expectedCloseDate: z.string().date().optional(),
});
const moveInputSchema = z.object({
  stageId: uuidSchema,
  probabilityBps: z.number().int().min(0).max(10000).optional(),
  reason: z.string().trim().max(1000).optional(),
});
const closeInputSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('WON'),
    stageId: uuidSchema,
    orderId: uuidSchema.optional(),
    reason: z.string().trim().max(1000).optional(),
  }),
  z.object({
    status: z.literal('LOST'),
    stageId: uuidSchema,
    reason: z.string().trim().min(1).max(1000),
  }),
]);
const activityInputSchema = z
  .object({
    customerId: uuidSchema,
    leadId: uuidSchema.optional(),
    opportunityId: uuidSchema.optional(),
    assignedMembershipId: uuidSchema.optional(),
    type: z.enum(['CALL', 'EMAIL', 'MEETING', 'NOTE', 'TASK']),
    subject: z.string().trim().min(1).max(240),
    body: z.string().trim().max(8000).optional(),
    dueAt: z.string().datetime().optional(),
  })
  .refine((input) => input.leadId || input.opportunityId, {
    message: 'Sales activity requires a lead or opportunity',
  });

export type SalesPipelineInput = z.input<typeof pipelineInputSchema>;
export type SalesLeadInput = z.input<typeof leadInputSchema>;
export type SalesQualificationInput = z.input<typeof qualificationInputSchema>;
export type SalesOpportunityInput = z.input<typeof opportunityInputSchema>;
export type SalesMoveInput = z.input<typeof moveInputSchema>;
export type SalesCloseInput = z.input<typeof closeInputSchema>;
export type SalesActivityInput = z.input<typeof activityInputSchema>;

export class SalesService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async dashboard(context: TenantRequestContext) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const [pipelines, leads, opportunities, activities] = await Promise.all([
        sql<{
          id: string;
          name: string;
          description: string | null;
          is_default: boolean;
          status: string;
        }>`select id, name, description, is_default, status
          from sales.pipelines where status = 'ACTIVE'
          order by is_default desc, lower(name), id`.execute(transaction),
        sql<{
          id: string;
          customer_id: string;
          customer_name: string | null;
          owner_membership_id: string | null;
          source: string;
          status: string;
          score: number;
          qualification_grade: string;
          updated_at: Date;
        }>`select lead.id, lead.customer_id, customer.display_name as customer_name,
                 lead.owner_membership_id, lead.source, lead.status, lead.score,
                 lead.qualification_grade, lead.updated_at
          from sales.leads lead
          join crm.customers customer
            on customer.tenant_id = lead.tenant_id and customer.id = lead.customer_id
          order by lead.updated_at desc, lead.id
          limit 200`.execute(transaction),
        sql<{
          id: string;
          customer_id: string;
          customer_name: string | null;
          name: string;
          status: string;
          pipeline_id: string;
          pipeline_name: string;
          stage_id: string;
          stage_name: string;
          owner_membership_id: string | null;
          currency_code: string;
          expected_value_minor: string;
          probability_bps: number;
          expected_close_date: string | null;
          updated_at: Date;
        }>`select opportunity.id, opportunity.customer_id,
                 customer.display_name as customer_name, opportunity.name,
                 opportunity.status, opportunity.pipeline_id, pipeline.name as pipeline_name,
                 opportunity.stage_id, stage.name as stage_name,
                 opportunity.owner_membership_id, opportunity.currency_code,
                 opportunity.expected_value_minor::text as expected_value_minor,
                 opportunity.probability_bps,
                 opportunity.expected_close_date::text as expected_close_date,
                 opportunity.updated_at
          from sales.opportunities opportunity
          join crm.customers customer
            on customer.tenant_id = opportunity.tenant_id and customer.id = opportunity.customer_id
          join sales.pipelines pipeline
            on pipeline.tenant_id = opportunity.tenant_id and pipeline.id = opportunity.pipeline_id
          join sales.pipeline_stages stage
            on stage.tenant_id = opportunity.tenant_id and stage.id = opportunity.stage_id
          order by case opportunity.status when 'OPEN' then 0 when 'WON' then 1 else 2 end,
                   opportunity.updated_at desc, opportunity.id
          limit 300`.execute(transaction),
        sql<{
          id: string;
          customer_id: string;
          opportunity_id: string | null;
          lead_id: string | null;
          type: string;
          status: string;
          subject: string;
          due_at: Date | null;
          completed_at: Date | null;
        }>`select id, customer_id, opportunity_id, lead_id, type, status, subject,
                 due_at, completed_at
          from sales.activities
          order by case status when 'PLANNED' then 0 when 'DONE' then 1 else 2 end,
                   due_at nulls last, created_at desc
          limit 200`.execute(transaction),
      ]);
      const stages = await sql<{
        id: string;
        pipeline_id: string;
        name: string;
        position: number;
        default_probability_bps: number;
        terminal_kind: string;
      }>`select id, pipeline_id, name, position, default_probability_bps, terminal_kind
        from sales.pipeline_stages where status = 'ACTIVE'
        order by pipeline_id, position, id`.execute(transaction);
      return {
        pipelines: pipelines.rows.map((pipeline) => ({
          id: pipeline.id,
          name: pipeline.name,
          description: pipeline.description,
          isDefault: pipeline.is_default,
          status: pipeline.status,
          stages: stages.rows
            .filter((stage) => stage.pipeline_id === pipeline.id)
            .map((stage) => ({
              id: stage.id,
              name: stage.name,
              position: stage.position,
              probabilityBps: stage.default_probability_bps,
              terminalKind: stage.terminal_kind,
            })),
        })),
        leads: leads.rows.map((lead) => ({
          id: lead.id,
          customerId: lead.customer_id,
          customerName: lead.customer_name,
          ownerMembershipId: lead.owner_membership_id,
          source: lead.source,
          status: lead.status,
          score: lead.score,
          qualificationGrade: lead.qualification_grade,
          updatedAt: lead.updated_at.toISOString(),
        })),
        opportunities: opportunities.rows.map((opportunity) => ({
          id: opportunity.id,
          customerId: opportunity.customer_id,
          customerName: opportunity.customer_name,
          name: opportunity.name,
          status: opportunity.status,
          pipelineId: opportunity.pipeline_id,
          pipelineName: opportunity.pipeline_name,
          stageId: opportunity.stage_id,
          stageName: opportunity.stage_name,
          ownerMembershipId: opportunity.owner_membership_id,
          currencyCode: opportunity.currency_code,
          expectedValueMinor: opportunity.expected_value_minor,
          probabilityBps: opportunity.probability_bps,
          expectedCloseDate: opportunity.expected_close_date,
          updatedAt: opportunity.updated_at.toISOString(),
        })),
        activities: activities.rows.map((activity) => ({
          id: activity.id,
          customerId: activity.customer_id,
          opportunityId: activity.opportunity_id,
          leadId: activity.lead_id,
          type: activity.type,
          status: activity.status,
          subject: activity.subject,
          dueAt: activity.due_at?.toISOString() ?? null,
          completedAt: activity.completed_at?.toISOString() ?? null,
        })),
      };
    });
  }

  public async createPipeline(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: SalesPipelineInput,
  ): Promise<CommandResult<{ pipelineId: string; stageIds: string[] }>> {
    const validated = pipelineInputSchema.parse(input);
    const pipelineId = randomUUID();
    const stageIds = validated.stages.map(() => randomUUID());
    return this.commands.execute(
      {
        action: 'sales.pipeline.create',
        permission: 'sales.pipelines.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'sales.pipeline', id: pipelineId }),
        event: {
          type: 'sales.pipeline.created',
          data: () => ({ pipelineId, stageCount: stageIds.length }),
          dedupeKey: () => `sales:pipeline:create:${idempotencyKey}`,
        },
        audit: {
          afterState: () => ({ pipelineId, name: validated.name, stageCount: stageIds.length }),
        },
        execute: async (transaction) => {
          if (validated.isDefault) {
            await sql`update sales.pipelines set is_default = false, updated_at = now()
              where is_default = true`.execute(transaction);
          }
          await sql`insert into sales.pipelines (
              id, tenant_id, name, description, is_default, created_by_user_id
            ) values (
              ${pipelineId}::uuid, ${context.tenantId}::uuid, ${validated.name},
              ${validated.description ?? null}, ${validated.isDefault}, ${context.actorId}::uuid
            )`.execute(transaction);
          for (const [index, stage] of validated.stages.entries()) {
            await sql`insert into sales.pipeline_stages (
                id, tenant_id, pipeline_id, name, position,
                default_probability_bps, terminal_kind
              ) values (
                ${stageIds[index]}::uuid, ${context.tenantId}::uuid, ${pipelineId}::uuid,
                ${stage.name}, ${index + 1}, ${stage.probabilityBps}, ${stage.terminalKind}
              )`.execute(transaction);
          }
          return { pipelineId, stageIds };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async createLead(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: SalesLeadInput,
  ): Promise<CommandResult<{ leadId: string }>> {
    const validated = leadInputSchema.parse(input);
    const leadId = randomUUID();
    return this.commands.execute(
      {
        action: 'sales.lead.create',
        permission: 'sales.leads.create',
        risk: 'LOW',
        resource: () => ({ type: 'sales.lead', id: leadId }),
        event: {
          type: 'sales.lead.created',
          data: () => ({ leadId, customerId: validated.customerId, source: validated.source }),
          dedupeKey: () => `sales:lead:create:${idempotencyKey}`,
        },
        audit: { afterState: () => ({ leadId, ...validated }) },
        execute: async (transaction) => {
          await this.assertActiveCustomer(transaction, validated.customerId);
          if (validated.ownerMembershipId)
            await this.assertActiveMembership(transaction, validated.ownerMembershipId);
          await sql`insert into sales.leads (
              id, tenant_id, customer_id, owner_membership_id, source, created_by_user_id
            ) values (
              ${leadId}::uuid, ${context.tenantId}::uuid, ${validated.customerId}::uuid,
              ${validated.ownerMembershipId ?? null}::uuid, ${validated.source}, ${context.actorId}::uuid
            )`.execute(transaction);
          return { leadId };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async qualifyLead(
    context: TenantRequestContext,
    idempotencyKey: string,
    leadId: string,
    input: SalesQualificationInput,
  ): Promise<CommandResult<{ leadId: string; status: string; score: number }>> {
    const id = uuidSchema.parse(leadId);
    const validated = qualificationInputSchema.parse(input);
    if (validated.status === 'DISQUALIFIED' && !validated.disqualificationReason)
      throw new Error('Disqualified lead requires a reason');
    return this.commands.execute(
      {
        action: 'sales.lead.qualify',
        permission: 'sales.leads.update',
        risk: 'MEDIUM',
        resource: () => ({ type: 'sales.lead', id }),
        event: {
          type: 'sales.lead.qualification_updated',
          data: () => ({ leadId: id, status: validated.status, score: validated.score }),
          dedupeKey: () => `sales:lead:qualification:${idempotencyKey}`,
        },
        audit: { afterState: () => ({ leadId: id, ...validated }) },
        execute: async (transaction) => {
          const result = await sql<{ id: string }>`update sales.leads
            set score = ${validated.score},
                qualification_grade = ${validated.grade},
                status = ${validated.status},
                qualification_notes = ${validated.notes ?? null},
                disqualification_reason = ${validated.status === 'DISQUALIFIED' ? (validated.disqualificationReason ?? null) : null},
                qualified_at = ${validated.status === 'QUALIFIED' ? new Date() : null},
                updated_at = now()
            where id = ${id}::uuid and status <> 'CONVERTED'
            returning id`.execute(transaction);
          if (!result.rows[0]) throw new Error('Mutable sales lead was not found');
          return { leadId: id, status: validated.status, score: validated.score };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async createOpportunity(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: SalesOpportunityInput,
  ): Promise<CommandResult<{ opportunityId: string }>> {
    const validated = opportunityInputSchema.parse(input);
    const opportunityId = randomUUID();
    return this.commands.execute(
      {
        action: 'sales.opportunity.create',
        permission: 'sales.opportunities.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'sales.opportunity', id: opportunityId }),
        event: {
          type: 'sales.opportunity.created',
          data: () => ({
            opportunityId,
            customerId: validated.customerId,
            pipelineId: validated.pipelineId,
          }),
          dedupeKey: () => `sales:opportunity:create:${idempotencyKey}`,
        },
        audit: { afterState: () => ({ opportunityId, ...validated }) },
        execute: async (transaction) => {
          await this.assertActiveCustomer(transaction, validated.customerId);
          if (validated.ownerMembershipId)
            await this.assertActiveMembership(transaction, validated.ownerMembershipId);
          if (validated.leadId) {
            const lead = await sql<{
              customer_id: string;
              status: string;
            }>`select customer_id, status
              from sales.leads where id = ${validated.leadId}::uuid for update`.execute(
              transaction,
            );
            const row = lead.rows[0];
            if (!row) throw new Error('Sales lead was not found');
            if (row.customer_id !== validated.customerId)
              throw new Error('Sales lead and opportunity must reference the same customer');
            if (row.status === 'DISQUALIFIED')
              throw new Error('Disqualified lead cannot be converted');
          }
          const stage = await sql<{ default_probability_bps: number; terminal_kind: string }>`
            select default_probability_bps, terminal_kind from sales.pipeline_stages
            where id = ${validated.stageId}::uuid
              and pipeline_id = ${validated.pipelineId}::uuid and status = 'ACTIVE'
          `.execute(transaction);
          const stageRow = stage.rows[0];
          if (!stageRow || stageRow.terminal_kind !== 'OPEN')
            throw new Error('Opportunity creation requires an active open pipeline stage');
          const probability = validated.probabilityBps ?? stageRow.default_probability_bps;
          await sql`insert into sales.opportunities (
              id, tenant_id, customer_id, lead_id, pipeline_id, stage_id,
              owner_membership_id, name, currency_code, expected_value_minor,
              probability_bps, expected_close_date, created_by_user_id
            ) values (
              ${opportunityId}::uuid, ${context.tenantId}::uuid, ${validated.customerId}::uuid,
              ${validated.leadId ?? null}::uuid, ${validated.pipelineId}::uuid,
              ${validated.stageId}::uuid, ${validated.ownerMembershipId ?? null}::uuid,
              ${validated.name}, ${validated.currencyCode}, ${validated.expectedValueMinor},
              ${probability}, ${validated.expectedCloseDate ?? null}::date, ${context.actorId}::uuid
            )`.execute(transaction);
          await sql`insert into sales.opportunity_stage_history (
              tenant_id, opportunity_id, to_stage_id, changed_by_user_id, reason
            ) values (
              ${context.tenantId}::uuid, ${opportunityId}::uuid, ${validated.stageId}::uuid,
              ${context.actorId}::uuid, 'Opportunity created'
            )`.execute(transaction);
          if (validated.leadId) {
            await sql`update sales.leads set status = 'CONVERTED', converted_at = now(), updated_at = now()
              where id = ${validated.leadId}::uuid`.execute(transaction);
          }
          return { opportunityId };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async moveOpportunity(
    context: TenantRequestContext,
    idempotencyKey: string,
    opportunityId: string,
    input: SalesMoveInput,
  ): Promise<CommandResult<{ opportunityId: string; stageId: string; probabilityBps: number }>> {
    const id = uuidSchema.parse(opportunityId);
    const validated = moveInputSchema.parse(input);
    return this.commands.execute(
      {
        action: 'sales.opportunity.stage.update',
        permission: 'sales.opportunities.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'sales.opportunity', id }),
        event: {
          type: 'sales.opportunity.stage_changed',
          data: (_input, result) => result,
          dedupeKey: () => `sales:opportunity:stage:${idempotencyKey}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const current = await sql<{ pipeline_id: string; stage_id: string; status: string }>`
            select pipeline_id, stage_id, status from sales.opportunities
            where id = ${id}::uuid for update`.execute(transaction);
          const row = current.rows[0];
          if (!row || row.status !== 'OPEN')
            throw new Error('Open sales opportunity was not found');
          const next = await sql<{ default_probability_bps: number; terminal_kind: string }>`
            select default_probability_bps, terminal_kind from sales.pipeline_stages
            where id = ${validated.stageId}::uuid and pipeline_id = ${row.pipeline_id}::uuid
              and status = 'ACTIVE'`.execute(transaction);
          const nextStage = next.rows[0];
          if (!nextStage || nextStage.terminal_kind !== 'OPEN')
            throw new Error('Stage transition requires an active open stage in the same pipeline');
          const probability = validated.probabilityBps ?? nextStage.default_probability_bps;
          await sql`update sales.opportunities
            set stage_id = ${validated.stageId}::uuid, probability_bps = ${probability}, updated_at = now()
            where id = ${id}::uuid`.execute(transaction);
          await sql`insert into sales.opportunity_stage_history (
              tenant_id, opportunity_id, from_stage_id, to_stage_id, changed_by_user_id, reason
            ) values (
              ${context.tenantId}::uuid, ${id}::uuid, ${row.stage_id}::uuid,
              ${validated.stageId}::uuid, ${context.actorId}::uuid, ${validated.reason ?? null}
            )`.execute(transaction);
          return { opportunityId: id, stageId: validated.stageId, probabilityBps: probability };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async closeOpportunity(
    context: TenantRequestContext,
    idempotencyKey: string,
    opportunityId: string,
    input: SalesCloseInput,
  ): Promise<
    CommandResult<{ opportunityId: string; status: 'WON' | 'LOST'; orderId: string | null }>
  > {
    const id = uuidSchema.parse(opportunityId);
    const validated = closeInputSchema.parse(input);
    return this.commands.execute(
      {
        action: validated.status === 'WON' ? 'sales.opportunity.win' : 'sales.opportunity.lose',
        permission: 'sales.opportunities.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'sales.opportunity', id }),
        event: {
          type: validated.status === 'WON' ? 'sales.opportunity.won' : 'sales.opportunity.lost',
          data: (_input, result) => result,
          dedupeKey: () => `sales:opportunity:close:${idempotencyKey}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const current = await sql<{
            customer_id: string;
            pipeline_id: string;
            stage_id: string;
            status: string;
          }>`
            select customer_id, pipeline_id, stage_id, status from sales.opportunities
            where id = ${id}::uuid for update`.execute(transaction);
          const row = current.rows[0];
          if (!row || row.status !== 'OPEN')
            throw new Error('Open sales opportunity was not found');
          const stage = await sql<{ terminal_kind: string }>`select terminal_kind
            from sales.pipeline_stages where id = ${validated.stageId}::uuid
              and pipeline_id = ${row.pipeline_id}::uuid and status = 'ACTIVE'`.execute(
            transaction,
          );
          if (stage.rows[0]?.terminal_kind !== validated.status)
            throw new Error(
              `Closing ${validated.status} requires a matching terminal pipeline stage`,
            );
          let orderId: string | null = null;
          if (validated.status === 'WON' && validated.orderId) {
            const order = await sql<{
              customer_id: string | null;
            }>`select customer_id from commerce.orders
              where id = ${validated.orderId}::uuid`.execute(transaction);
            const orderRow = order.rows[0];
            if (!orderRow) throw new Error('Won order was not found');
            if (orderRow.customer_id && orderRow.customer_id !== row.customer_id)
              throw new Error('Won order must belong to the opportunity customer');
            orderId = validated.orderId;
          }
          await sql`update sales.opportunities set
              stage_id = ${validated.stageId}::uuid,
              status = ${validated.status},
              probability_bps = ${validated.status === 'WON' ? 10000 : 0},
              won_order_id = ${orderId}::uuid,
              loss_reason = ${validated.status === 'LOST' ? validated.reason : null},
              closed_at = now(), updated_at = now()
            where id = ${id}::uuid`.execute(transaction);
          await sql`insert into sales.opportunity_stage_history (
              tenant_id, opportunity_id, from_stage_id, to_stage_id, changed_by_user_id, reason
            ) values (
              ${context.tenantId}::uuid, ${id}::uuid, ${row.stage_id}::uuid,
              ${validated.stageId}::uuid, ${context.actorId}::uuid, ${validated.reason ?? null}
            )`.execute(transaction);
          return { opportunityId: id, status: validated.status, orderId };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async addActivity(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: SalesActivityInput,
  ): Promise<CommandResult<{ activityId: string }>> {
    const validated = activityInputSchema.parse(input);
    const activityId = randomUUID();
    return this.commands.execute(
      {
        action: 'sales.activity.create',
        permission: 'sales.leads.update',
        risk: 'LOW',
        resource: () => ({ type: 'sales.activity', id: activityId }),
        event: {
          type: 'sales.activity.created',
          data: () => ({ activityId, type: validated.type, customerId: validated.customerId }),
          dedupeKey: () => `sales:activity:create:${idempotencyKey}`,
        },
        audit: { afterState: () => ({ activityId, ...validated }) },
        execute: async (transaction) => {
          await this.assertActiveCustomer(transaction, validated.customerId);
          if (validated.assignedMembershipId)
            await this.assertActiveMembership(transaction, validated.assignedMembershipId);
          if (validated.leadId) {
            const lead = await sql<{ customer_id: string }>`select customer_id from sales.leads
              where id = ${validated.leadId}::uuid`.execute(transaction);
            if (lead.rows[0]?.customer_id !== validated.customerId)
              throw new Error('Sales activity lead does not belong to the customer');
          }
          if (validated.opportunityId) {
            const opportunity = await sql<{ customer_id: string }>`select customer_id
              from sales.opportunities where id = ${validated.opportunityId}::uuid`.execute(
              transaction,
            );
            if (opportunity.rows[0]?.customer_id !== validated.customerId)
              throw new Error('Sales activity opportunity does not belong to the customer');
          }
          await sql`insert into sales.activities (
              id, tenant_id, lead_id, opportunity_id, customer_id, assigned_membership_id,
              type, subject, body, due_at, created_by_user_id
            ) values (
              ${activityId}::uuid, ${context.tenantId}::uuid, ${validated.leadId ?? null}::uuid,
              ${validated.opportunityId ?? null}::uuid, ${validated.customerId}::uuid,
              ${validated.assignedMembershipId ?? null}::uuid, ${validated.type}, ${validated.subject},
              ${validated.body ?? null}, ${validated.dueAt ? new Date(validated.dueAt) : null},
              ${context.actorId}::uuid
            )`.execute(transaction);
          return { activityId };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async completeActivity(
    context: TenantRequestContext,
    idempotencyKey: string,
    activityId: string,
  ): Promise<CommandResult<{ activityId: string; status: 'DONE' }>> {
    const id = uuidSchema.parse(activityId);
    return this.commands.execute(
      {
        action: 'sales.activity.complete',
        permission: 'sales.leads.update',
        risk: 'LOW',
        resource: () => ({ type: 'sales.activity', id }),
        event: {
          type: 'sales.activity.completed',
          data: () => ({ activityId: id }),
          dedupeKey: () => `sales:activity:complete:${idempotencyKey}`,
        },
        audit: { afterState: () => ({ activityId: id, status: 'DONE' }) },
        execute: async (transaction) => {
          const result = await sql<{ id: string }>`update sales.activities
            set status = 'DONE', completed_at = now(), updated_at = now()
            where id = ${id}::uuid and status = 'PLANNED'
            returning id`.execute(transaction);
          if (!result.rows[0]) throw new Error('Planned sales activity was not found');
          return { activityId: id, status: 'DONE' as const };
        },
      },
      { context, input: { activityId: id }, idempotencyKey },
    );
  }

  private async assertActiveCustomer(
    transaction: Parameters<Parameters<CommandExecutor['execute']>[0]['execute']>[0],
    customerId: string,
  ): Promise<void> {
    const result = await sql<{ exists: boolean }>`select exists(
        select 1 from crm.customers where id = ${customerId}::uuid and status = 'ACTIVE'
      ) as exists`.execute(transaction);
    if (!result.rows[0]?.exists) throw new Error('Active CRM customer was not found');
  }

  private async assertActiveMembership(
    transaction: Parameters<Parameters<CommandExecutor['execute']>[0]['execute']>[0],
    membershipId: string,
  ): Promise<void> {
    const result = await sql<{ exists: boolean }>`select exists(
        select 1 from identity.memberships where id = ${membershipId}::uuid and status = 'ACTIVE'
      ) as exists`.execute(transaction);
    if (!result.rows[0]?.exists) throw new Error('Active sales owner membership was not found');
  }
}
