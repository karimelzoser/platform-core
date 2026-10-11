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
const qualificationGradeSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const stageCategorySchema = z.enum(['OPEN', 'WON', 'LOST']);
const activityTypeSchema = z.enum(['CALL', 'EMAIL', 'MEETING', 'NOTE', 'TASK', 'FOLLOW_UP']);

const leadCreateSchema = z.object({
  customerId: uuidSchema,
  source: z.string().trim().min(1).max(100).default('platform'),
  ownerMembershipId: uuidSchema.optional(),
});
const leadQualificationSchema = z.object({
  leadId: uuidSchema,
  outcome: z.enum(['QUALIFIED', 'DISQUALIFIED']),
  score: z.number().int().min(0).max(100),
  grade: qualificationGradeSchema,
  signals: z.record(z.unknown()).default({}),
  disqualificationReason: z.string().trim().min(1).max(2000).optional(),
});
const leadAssignmentSchema = z.object({
  membershipId: uuidSchema.nullable(),
});
const stageInputSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/u),
  name: z.string().trim().min(1).max(120),
  category: stageCategorySchema,
  sortOrder: z.number().int().min(0).max(10_000),
  defaultProbabilityBasisPoints: z.number().int().min(0).max(10_000),
});
const pipelineCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  isDefault: z.boolean().default(false),
  stages: z.array(stageInputSchema).min(3).max(40),
});
const opportunityCreateSchema = z.object({
  customerId: uuidSchema,
  leadId: uuidSchema.optional(),
  pipelineId: uuidSchema,
  stageId: uuidSchema,
  ownerMembershipId: uuidSchema.optional(),
  name: z.string().trim().min(1).max(240),
  expectedValueMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency: currencySchema,
  probabilityBasisPoints: z.number().int().min(0).max(10_000).optional(),
  expectedCloseDate: z.coerce.date().optional(),
});
const opportunityMoveSchema = z.object({
  stageId: uuidSchema,
  probabilityBasisPoints: z.number().int().min(0).max(10_000).optional(),
});
const opportunityCloseSchema = z.object({
  outcome: z.enum(['WON', 'LOST', 'CANCELLED']),
  stageId: uuidSchema.optional(),
  wonStoreId: uuidSchema.optional(),
  wonOrderId: uuidSchema.optional(),
  lossReason: z.string().trim().min(1).max(2000).optional(),
});
const activityCreateSchema = z.object({
  customerId: uuidSchema,
  leadId: uuidSchema.optional(),
  opportunityId: uuidSchema.optional(),
  assignedMembershipId: uuidSchema.optional(),
  activityType: activityTypeSchema,
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().max(20_000).optional(),
  dueAt: z.coerce.date().optional(),
});

export type SalesLeadCreateInput = z.input<typeof leadCreateSchema>;
export type SalesLeadQualificationInput = z.input<typeof leadQualificationSchema>;
export type SalesLeadAssignmentInput = z.input<typeof leadAssignmentSchema>;
export type SalesPipelineCreateInput = z.input<typeof pipelineCreateSchema>;
export type SalesOpportunityCreateInput = z.input<typeof opportunityCreateSchema>;
export type SalesOpportunityMoveInput = z.input<typeof opportunityMoveSchema>;
export type SalesOpportunityCloseInput = z.input<typeof opportunityCloseSchema>;
export type SalesActivityCreateInput = z.input<typeof activityCreateSchema>;

export class SalesInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SalesInvariantError';
  }
}

interface LeadRow {
  id: string;
  customer_id: string;
  owner_membership_id: string | null;
  status: string;
  source: string;
  qualification_score: number | null;
  qualification_grade: string | null;
  qualification_data: Record<string, unknown>;
  disqualification_reason: string | null;
  converted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface OpportunityRow {
  id: string;
  customer_id: string;
  lead_id: string | null;
  pipeline_id: string;
  stage_id: string;
  owner_membership_id: string | null;
  name: string;
  status: string;
  expected_value_minor: string;
  currency: string;
  probability_basis_points: number;
  expected_close_date: Date | null;
  won_store_id: string | null;
  won_order_id: string | null;
  closed_at: Date | null;
  loss_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export class SalesService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async listLeads(context: TenantRequestContext) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<
        LeadRow & { customer_name: string; owner_name: string | null; opportunity_id: string | null }
      >`
        select lead.id, lead.customer_id, lead.owner_membership_id, lead.status, lead.source,
               lead.qualification_score, lead.qualification_grade, lead.qualification_data,
               lead.disqualification_reason, lead.converted_at, lead.created_at, lead.updated_at,
               coalesce(customer.display_name, customer.company_name, customer.id::text) as customer_name,
               nullif(trim(concat_ws(' ', owner.first_name, owner.last_name)), '') as owner_name,
               opportunity.id as opportunity_id
        from sales.leads lead
        join crm.customers customer
          on customer.tenant_id = lead.tenant_id and customer.id = lead.customer_id
        left join identity.memberships membership
          on membership.tenant_id = lead.tenant_id and membership.id = lead.owner_membership_id
        left join identity.users owner on owner.id = membership.user_id
        left join sales.opportunities opportunity
          on opportunity.tenant_id = lead.tenant_id and opportunity.lead_id = lead.id
        order by lead.updated_at desc, lead.id desc
        limit 500
      `.execute(transaction);
      return result.rows.map((row) => ({
        id: row.id,
        customerId: row.customer_id,
        customerName: row.customer_name,
        ownerMembershipId: row.owner_membership_id,
        ownerName: row.owner_name,
        status: row.status,
        source: row.source,
        qualificationScore: row.qualification_score,
        qualificationGrade: row.qualification_grade,
        qualificationData: row.qualification_data,
        disqualificationReason: row.disqualification_reason,
        opportunityId: row.opportunity_id,
        convertedAt: row.converted_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    });
  }

  public async listPipelines(context: TenantRequestContext) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const pipelines = await sql<{
        id: string;
        name: string;
        status: string;
        is_default: boolean;
      }>`select id, name, status, is_default from sales.pipelines
          order by is_default desc, lower(name), id`.execute(transaction);
      const stages = await sql<{
        id: string;
        pipeline_id: string;
        code: string;
        name: string;
        category: string;
        sort_order: number;
        default_probability_basis_points: number;
        status: string;
      }>`select id, pipeline_id, code, name, category, sort_order,
          default_probability_basis_points, status from sales.stages
          order by pipeline_id, sort_order, id`.execute(transaction);
      return pipelines.rows.map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        status: pipeline.status,
        isDefault: pipeline.is_default,
        stages: stages.rows
          .filter((stage) => stage.pipeline_id === pipeline.id)
          .map((stage) => ({
            id: stage.id,
            code: stage.code,
            name: stage.name,
            category: stage.category,
            sortOrder: stage.sort_order,
            defaultProbabilityBasisPoints: stage.default_probability_basis_points,
            status: stage.status,
          })),
      }));
    });
  }

  public async listOpportunities(context: TenantRequestContext) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<
        OpportunityRow & {
          customer_name: string;
          pipeline_name: string;
          stage_name: string;
          stage_category: string;
          owner_name: string | null;
          open_activity_count: string;
        }
      >`
        select opportunity.id, opportunity.customer_id, opportunity.lead_id,
               opportunity.pipeline_id, opportunity.stage_id, opportunity.owner_membership_id,
               opportunity.name, opportunity.status, opportunity.expected_value_minor::text,
               opportunity.currency, opportunity.probability_basis_points,
               opportunity.expected_close_date, opportunity.won_store_id, opportunity.won_order_id,
               opportunity.closed_at, opportunity.loss_reason, opportunity.created_at,
               opportunity.updated_at,
               coalesce(customer.display_name, customer.company_name, customer.id::text) as customer_name,
               pipeline.name as pipeline_name, stage.name as stage_name,
               stage.category as stage_category,
               nullif(trim(concat_ws(' ', owner.first_name, owner.last_name)), '') as owner_name,
               (select count(*)::text from sales.activities activity
                 where activity.opportunity_id = opportunity.id and activity.status = 'OPEN') as open_activity_count
        from sales.opportunities opportunity
        join crm.customers customer
          on customer.tenant_id = opportunity.tenant_id and customer.id = opportunity.customer_id
        join sales.pipelines pipeline
          on pipeline.tenant_id = opportunity.tenant_id and pipeline.id = opportunity.pipeline_id
        join sales.stages stage
          on stage.tenant_id = opportunity.tenant_id and stage.id = opportunity.stage_id
        left join identity.memberships membership
          on membership.tenant_id = opportunity.tenant_id
         and membership.id = opportunity.owner_membership_id
        left join identity.users owner on owner.id = membership.user_id
        order by opportunity.updated_at desc, opportunity.id desc
        limit 500
      `.execute(transaction);
      return result.rows.map((row) => this.opportunityView(row));
    });
  }

  public async getOpportunity(context: TenantRequestContext, opportunityId: string) {
    const id = uuidSchema.parse(opportunityId);
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<
        OpportunityRow & {
          customer_name: string;
          pipeline_name: string;
          stage_name: string;
          stage_category: string;
          owner_name: string | null;
          open_activity_count: string;
        }
      >`
        select opportunity.id, opportunity.customer_id, opportunity.lead_id,
               opportunity.pipeline_id, opportunity.stage_id, opportunity.owner_membership_id,
               opportunity.name, opportunity.status, opportunity.expected_value_minor::text,
               opportunity.currency, opportunity.probability_basis_points,
               opportunity.expected_close_date, opportunity.won_store_id, opportunity.won_order_id,
               opportunity.closed_at, opportunity.loss_reason, opportunity.created_at,
               opportunity.updated_at,
               coalesce(customer.display_name, customer.company_name, customer.id::text) as customer_name,
               pipeline.name as pipeline_name, stage.name as stage_name,
               stage.category as stage_category,
               nullif(trim(concat_ws(' ', owner.first_name, owner.last_name)), '') as owner_name,
               (select count(*)::text from sales.activities activity
                 where activity.opportunity_id = opportunity.id and activity.status = 'OPEN') as open_activity_count
        from sales.opportunities opportunity
        join crm.customers customer
          on customer.tenant_id = opportunity.tenant_id and customer.id = opportunity.customer_id
        join sales.pipelines pipeline
          on pipeline.tenant_id = opportunity.tenant_id and pipeline.id = opportunity.pipeline_id
        join sales.stages stage
          on stage.tenant_id = opportunity.tenant_id and stage.id = opportunity.stage_id
        left join identity.memberships membership
          on membership.tenant_id = opportunity.tenant_id
         and membership.id = opportunity.owner_membership_id
        left join identity.users owner on owner.id = membership.user_id
        where opportunity.id = ${id}::uuid
      `.execute(transaction);
      const opportunity = result.rows[0];
      if (!opportunity) return undefined;
      const [activities, timeline] = await Promise.all([
        sql<{
          id: string;
          activity_type: string;
          status: string;
          title: string;
          body: string | null;
          assigned_membership_id: string | null;
          due_at: Date | null;
          completed_at: Date | null;
          created_at: Date;
        }>`select id, activity_type, status, title, body, assigned_membership_id,
               due_at, completed_at, created_at from sales.activities
            where opportunity_id = ${id}::uuid order by created_at desc, id desc`.execute(transaction),
        sql<{ event_type: string; data: Record<string, unknown>; occurred_at: Date }>`
          select event_type, data, occurred_at from sales.timeline
          where opportunity_id = ${id}::uuid order by occurred_at, id
        `.execute(transaction),
      ]);
      return {
        ...this.opportunityView(opportunity),
        activities: activities.rows.map((activity) => ({
          id: activity.id,
          type: activity.activity_type,
          status: activity.status,
          title: activity.title,
          body: activity.body,
          assignedMembershipId: activity.assigned_membership_id,
          dueAt: activity.due_at,
          completedAt: activity.completed_at,
          createdAt: activity.created_at,
        })),
        timeline: timeline.rows.map((event) => ({
          eventType: event.event_type,
          data: event.data,
          occurredAt: event.occurred_at,
        })),
      };
    });
  }

  public async createLead(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: SalesLeadCreateInput,
  ): Promise<CommandResult<{ leadId: string; status: 'NEW' }>> {
    const validated = leadCreateSchema.parse(input);
    const leadId = randomUUID();
    return this.commands.execute(
      {
        action: 'sales.lead.create',
        permission: 'sales.leads.create',
        risk: 'LOW',
        resource: () => ({ type: 'sales.lead', id: leadId }),
        event: {
          type: 'sales.lead.created',
          data: (_input, result) => result,
          dedupeKey: () => `sales:lead:create:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          await this.assertActiveCustomer(transaction, validated.customerId);
          if (validated.ownerMembershipId)
            await this.assertActiveMembership(transaction, validated.ownerMembershipId);
          await sql`insert into sales.leads (
              id, tenant_id, customer_id, owner_membership_id, status, source
            ) values (
              ${leadId}::uuid, ${context.tenantId}::uuid, ${validated.customerId}::uuid,
              ${validated.ownerMembershipId ?? null}::uuid, 'NEW', ${validated.source}
            )`.execute(transaction);
          await this.timeline(transaction, context, validated.customerId, leadId, null, 'sales.lead_created', {
            source: validated.source,
          });
          return { leadId, status: 'NEW' as const };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async qualifyLead(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: SalesLeadQualificationInput,
  ): Promise<CommandResult<{ leadId: string; status: 'QUALIFIED' | 'DISQUALIFIED' }>> {
    const validated = leadQualificationSchema.parse(input);
    if (validated.outcome === 'DISQUALIFIED' && !validated.disqualificationReason)
      throw new SalesInvariantError('Disqualified leads require a reason');
    return this.commands.execute(
      {
        action: 'sales.lead.qualify',
        permission: 'sales.leads.update',
        risk: 'MEDIUM',
        resource: () => ({ type: 'sales.lead', id: validated.leadId }),
        event: {
          type: 'sales.lead.qualified',
          data: (_input, result) => ({ ...result, score: validated.score, grade: validated.grade }),
          dedupeKey: () => `sales:lead:qualify:${idempotencyKey.trim()}`,
        },
        audit: {
          afterState: () => ({
            status: validated.outcome,
            score: validated.score,
            grade: validated.grade,
            signals: validated.signals,
            disqualificationReason: validated.disqualificationReason ?? null,
          }),
        },
        execute: async (transaction) => {
          const lead = await this.lockLead(transaction, validated.leadId);
          if (lead.status === 'CONVERTED' || lead.status === 'ARCHIVED')
            throw new SalesInvariantError('Converted or archived lead cannot be requalified');
          await sql`update sales.leads set
              status = ${validated.outcome}, qualification_score = ${validated.score},
              qualification_grade = ${validated.grade},
              qualification_data = ${JSON.stringify(validated.signals)}::jsonb,
              disqualification_reason = ${validated.disqualificationReason ?? null},
              converted_at = null, updated_at = now()
            where id = ${lead.id}::uuid`.execute(transaction);
          await this.timeline(
            transaction,
            context,
            lead.customer_id,
            lead.id,
            null,
            validated.outcome === 'QUALIFIED' ? 'sales.lead_qualified' : 'sales.lead_disqualified',
            { score: validated.score, grade: validated.grade },
          );
          return { leadId: lead.id, status: validated.outcome };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async assignLead(
    context: TenantRequestContext,
    idempotencyKey: string,
    leadId: string,
    input: SalesLeadAssignmentInput,
  ): Promise<CommandResult<{ leadId: string; ownerMembershipId: string | null }>> {
    const id = uuidSchema.parse(leadId);
    const validated = leadAssignmentSchema.parse(input);
    return this.commands.execute(
      {
        action: 'sales.lead.assign',
        permission: 'sales.leads.assign',
        risk: 'LOW',
        resource: () => ({ type: 'sales.lead', id }),
        event: {
          type: 'sales.lead.assigned',
          data: (_input, result) => result,
          dedupeKey: () => `sales:lead:assign:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const lead = await this.lockLead(transaction, id);
          if (validated.membershipId)
            await this.assertActiveMembership(transaction, validated.membershipId);
          await sql`update sales.leads set owner_membership_id = ${validated.membershipId}::uuid,
              updated_at = now() where id = ${id}::uuid`.execute(transaction);
          await this.timeline(transaction, context, lead.customer_id, lead.id, null, 'sales.lead_assigned', {
            ownerMembershipId: validated.membershipId,
          });
          return { leadId: id, ownerMembershipId: validated.membershipId };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async createPipeline(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: SalesPipelineCreateInput,
  ): Promise<CommandResult<{ pipelineId: string; stageIds: string[] }>> {
    const validated = pipelineCreateSchema.parse(input);
    this.assertStageDefinition(validated.stages);
    const pipelineId = randomUUID();
    const stages = validated.stages.map((stage) => ({ ...stage, id: randomUUID() }));
    return this.commands.execute(
      {
        action: 'sales.pipeline.create',
        permission: 'sales.pipelines.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'sales.pipeline', id: pipelineId }),
        event: {
          type: 'sales.pipeline.created',
          data: () => ({ pipelineId, stageCount: stages.length }),
          dedupeKey: () => `sales:pipeline:create:${idempotencyKey.trim()}`,
        },
        audit: {
          afterState: () => ({
            pipelineId,
            name: validated.name,
            isDefault: validated.isDefault,
            stages: stages.map(({ id, ...stage }) => ({ id, ...stage })),
          }),
        },
        execute: async (transaction) => {
          if (validated.isDefault)
            await sql`update sales.pipelines set is_default = false, updated_at = now()
              where status = 'ACTIVE' and is_default = true`.execute(transaction);
          await sql`insert into sales.pipelines (id, tenant_id, name, status, is_default)
              values (${pipelineId}::uuid, ${context.tenantId}::uuid, ${validated.name}, 'ACTIVE',
                ${validated.isDefault})`.execute(transaction);
          for (const stage of stages) {
            await sql`insert into sales.stages (
                id, tenant_id, pipeline_id, code, name, category, sort_order,
                default_probability_basis_points, status
              ) values (
                ${stage.id}::uuid, ${context.tenantId}::uuid, ${pipelineId}::uuid,
                ${stage.code}, ${stage.name}, ${stage.category}, ${stage.sortOrder},
                ${stage.defaultProbabilityBasisPoints}, 'ACTIVE'
              )`.execute(transaction);
          }
          return { pipelineId, stageIds: stages.map((stage) => stage.id) };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async createOpportunity(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: SalesOpportunityCreateInput,
  ): Promise<CommandResult<{ opportunityId: string; status: 'OPEN' }>> {
    const validated = opportunityCreateSchema.parse(input);
    const opportunityId = randomUUID();
    return this.commands.execute(
      {
        action: 'sales.opportunity.create',
        permission: 'sales.opportunities.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'sales.opportunity', id: opportunityId }),
        event: {
          type: 'sales.opportunity.created',
          data: (_input, result) => result,
          dedupeKey: () => `sales:opportunity:create:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          await this.assertActiveCustomer(transaction, validated.customerId);
          if (validated.ownerMembershipId)
            await this.assertActiveMembership(transaction, validated.ownerMembershipId);
          const stage = await this.activeStage(
            transaction,
            validated.pipelineId,
            validated.stageId,
          );
          if (stage.category !== 'OPEN')
            throw new SalesInvariantError('New opportunity must start in an open stage');
          let lead: LeadRow | undefined;
          if (validated.leadId) {
            lead = await this.lockLead(transaction, validated.leadId);
            if (lead.customer_id !== validated.customerId)
              throw new SalesInvariantError('Lead and opportunity must reference the same customer');
            if (lead.status !== 'QUALIFIED')
              throw new SalesInvariantError('Only a qualified lead can be converted');
          }
          const probability =
            validated.probabilityBasisPoints ?? stage.default_probability_basis_points;
          await sql`insert into sales.opportunities (
              id, tenant_id, customer_id, lead_id, pipeline_id, stage_id,
              owner_membership_id, name, status, expected_value_minor, currency,
              probability_basis_points, expected_close_date
            ) values (
              ${opportunityId}::uuid, ${context.tenantId}::uuid, ${validated.customerId}::uuid,
              ${validated.leadId ?? null}::uuid, ${validated.pipelineId}::uuid,
              ${validated.stageId}::uuid, ${validated.ownerMembershipId ?? null}::uuid,
              ${validated.name}, 'OPEN', ${validated.expectedValueMinor}, ${validated.currency},
              ${probability}, ${validated.expectedCloseDate ?? null}
            )`.execute(transaction);
          if (lead) {
            await sql`update sales.leads set status = 'CONVERTED', converted_at = now(), updated_at = now()
              where id = ${lead.id}::uuid`.execute(transaction);
          }
          await this.timeline(
            transaction,
            context,
            validated.customerId,
            validated.leadId ?? null,
            opportunityId,
            'sales.opportunity_created',
            { pipelineId: validated.pipelineId, stageId: validated.stageId, probability },
          );
          return { opportunityId, status: 'OPEN' as const };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async moveOpportunity(
    context: TenantRequestContext,
    idempotencyKey: string,
    opportunityId: string,
    input: SalesOpportunityMoveInput,
  ): Promise<CommandResult<{ opportunityId: string; stageId: string; probabilityBasisPoints: number }>> {
    const id = uuidSchema.parse(opportunityId);
    const validated = opportunityMoveSchema.parse(input);
    return this.commands.execute(
      {
        action: 'sales.opportunity.move',
        permission: 'sales.opportunities.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'sales.opportunity', id }),
        event: {
          type: 'sales.opportunity.moved',
          data: (_input, result) => result,
          dedupeKey: () => `sales:opportunity:move:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const opportunity = await this.lockOpportunity(transaction, id);
          if (opportunity.status !== 'OPEN')
            throw new SalesInvariantError('Only an open opportunity can move stages');
          const stage = await this.activeStage(transaction, opportunity.pipeline_id, validated.stageId);
          if (stage.category !== 'OPEN')
            throw new SalesInvariantError('Terminal stages must be reached through win/loss closure');
          const probability =
            validated.probabilityBasisPoints ?? stage.default_probability_basis_points;
          await sql`update sales.opportunities set stage_id = ${validated.stageId}::uuid,
              probability_basis_points = ${probability}, updated_at = now()
            where id = ${id}::uuid`.execute(transaction);
          await this.timeline(
            transaction,
            context,
            opportunity.customer_id,
            opportunity.lead_id,
            opportunity.id,
            'sales.opportunity_moved',
            { stageId: validated.stageId, probabilityBasisPoints: probability },
          );
          return { opportunityId: id, stageId: validated.stageId, probabilityBasisPoints: probability };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async closeOpportunity(
    context: TenantRequestContext,
    idempotencyKey: string,
    opportunityId: string,
    input: SalesOpportunityCloseInput,
  ): Promise<CommandResult<{ opportunityId: string; status: 'WON' | 'LOST' | 'CANCELLED' }>> {
    const id = uuidSchema.parse(opportunityId);
    const validated = opportunityCloseSchema.parse(input);
    if (validated.outcome === 'WON' && (!validated.wonStoreId || !validated.wonOrderId))
      throw new SalesInvariantError('Won opportunities require a canonical order link');
    if (validated.outcome === 'LOST' && !validated.lossReason)
      throw new SalesInvariantError('Lost opportunities require a reason');
    return this.commands.execute(
      {
        action: 'sales.opportunity.close',
        permission: 'sales.opportunities.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'sales.opportunity', id }),
        event: {
          type: 'sales.opportunity.closed',
          data: (_input, result) => result,
          dedupeKey: () => `sales:opportunity:close:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const opportunity = await this.lockOpportunity(transaction, id);
          if (opportunity.status !== 'OPEN') {
            if (opportunity.status === validated.outcome)
              return { opportunityId: opportunity.id, status: validated.outcome };
            throw new SalesInvariantError('Opportunity is already closed');
          }
          let destinationStageId = opportunity.stage_id;
          if (validated.outcome === 'WON' || validated.outcome === 'LOST') {
            if (!validated.stageId)
              throw new SalesInvariantError('Win/loss closure requires a matching terminal stage');
            const stage = await this.activeStage(transaction, opportunity.pipeline_id, validated.stageId);
            if (stage.category !== validated.outcome)
              throw new SalesInvariantError('Closure outcome must match the destination stage category');
            destinationStageId = stage.id;
          }
          if (validated.outcome === 'WON') {
            const order = await sql<{
              id: string;
              store_id: string;
              customer_id: string | null;
              status: string;
              currency: string;
            }>`select id, store_id, customer_id, status, currency from commerce.orders
              where id = ${validated.wonOrderId}::uuid and store_id = ${validated.wonStoreId}::uuid
              for share`.execute(transaction);
            const row = order.rows[0];
            if (!row || row.customer_id !== opportunity.customer_id)
              throw new SalesInvariantError('Won order must belong to the opportunity customer');
            if (!['CONFIRMED', 'CLOSED'].includes(row.status))
              throw new SalesInvariantError('Won order must be confirmed or closed');
            if (row.currency !== opportunity.currency)
              throw new SalesInvariantError('Won order currency must match the opportunity');
          }
          await sql`update sales.opportunities set
              status = ${validated.outcome}, stage_id = ${destinationStageId}::uuid,
              probability_basis_points = ${validated.outcome === 'WON' ? 10_000 : 0},
              won_store_id = ${validated.outcome === 'WON' ? validated.wonStoreId : null}::uuid,
              won_order_id = ${validated.outcome === 'WON' ? validated.wonOrderId : null}::uuid,
              loss_reason = ${validated.outcome === 'LOST' ? validated.lossReason : null},
              closed_at = now(), updated_at = now()
            where id = ${id}::uuid`.execute(transaction);
          await this.timeline(
            transaction,
            context,
            opportunity.customer_id,
            opportunity.lead_id,
            opportunity.id,
            `sales.opportunity_${validated.outcome.toLowerCase()}`,
            {
              stageId: destinationStageId,
              wonOrderId: validated.wonOrderId ?? null,
              lossReason: validated.lossReason ?? null,
            },
          );
          return { opportunityId: id, status: validated.outcome };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async createActivity(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: SalesActivityCreateInput,
  ): Promise<CommandResult<{ activityId: string; status: 'OPEN' }>> {
    const validated = activityCreateSchema.parse(input);
    if (!validated.leadId && !validated.opportunityId)
      throw new SalesInvariantError('Sales activity must reference a lead or opportunity');
    const activityId = randomUUID();
    return this.commands.execute(
      {
        action: 'sales.activity.create',
        permission: 'sales.activities.manage',
        risk: 'LOW',
        resource: () => ({ type: 'sales.activity', id: activityId }),
        event: {
          type: 'sales.activity.created',
          data: (_input, result) => result,
          dedupeKey: () => `sales:activity:create:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          await this.assertActiveCustomer(transaction, validated.customerId);
          if (validated.assignedMembershipId)
            await this.assertActiveMembership(transaction, validated.assignedMembershipId);
          if (validated.leadId) {
            const lead = await this.lockLead(transaction, validated.leadId);
            if (lead.customer_id !== validated.customerId)
              throw new SalesInvariantError('Activity lead must reference the same customer');
          }
          if (validated.opportunityId) {
            const opportunity = await this.lockOpportunity(transaction, validated.opportunityId);
            if (opportunity.customer_id !== validated.customerId)
              throw new SalesInvariantError('Activity opportunity must reference the same customer');
          }
          await sql`insert into sales.activities (
              id, tenant_id, customer_id, lead_id, opportunity_id, assigned_membership_id,
              activity_type, status, title, body, due_at, created_by_user_id
            ) values (
              ${activityId}::uuid, ${context.tenantId}::uuid, ${validated.customerId}::uuid,
              ${validated.leadId ?? null}::uuid, ${validated.opportunityId ?? null}::uuid,
              ${validated.assignedMembershipId ?? null}::uuid, ${validated.activityType}, 'OPEN',
              ${validated.title}, ${validated.body ?? null}, ${validated.dueAt ?? null},
              ${context.actorId}::uuid
            )`.execute(transaction);
          await this.timeline(
            transaction,
            context,
            validated.customerId,
            validated.leadId ?? null,
            validated.opportunityId ?? null,
            'sales.activity_created',
            { activityId, type: validated.activityType },
          );
          return { activityId, status: 'OPEN' as const };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async completeActivity(
    context: TenantRequestContext,
    idempotencyKey: string,
    activityId: string,
  ): Promise<CommandResult<{ activityId: string; status: 'COMPLETED' }>> {
    const id = uuidSchema.parse(activityId);
    return this.commands.execute(
      {
        action: 'sales.activity.complete',
        permission: 'sales.activities.manage',
        risk: 'LOW',
        resource: () => ({ type: 'sales.activity', id }),
        event: {
          type: 'sales.activity.completed',
          data: (_input, result) => result,
          dedupeKey: () => `sales:activity:complete:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const result = await sql<{
            customer_id: string;
            lead_id: string | null;
            opportunity_id: string | null;
            status: string;
          }>`select customer_id, lead_id, opportunity_id, status from sales.activities
              where id = ${id}::uuid for update`.execute(transaction);
          const row = result.rows[0];
          if (!row) throw new SalesInvariantError('Sales activity was not found');
          if (row.status === 'CANCELLED')
            throw new SalesInvariantError('Cancelled activity cannot be completed');
          if (row.status !== 'COMPLETED')
            await sql`update sales.activities set status = 'COMPLETED', completed_at = now(),
                updated_at = now() where id = ${id}::uuid`.execute(transaction);
          await this.timeline(
            transaction,
            context,
            row.customer_id,
            row.lead_id,
            row.opportunity_id,
            'sales.activity_completed',
            { activityId: id },
          );
          return { activityId: id, status: 'COMPLETED' as const };
        },
      },
      { context, input: { activityId: id }, idempotencyKey },
    );
  }

  private async assertActiveCustomer(transaction: PlatformTransaction, customerId: string) {
    const result = await sql<{ id: string }>`select id from crm.customers
      where id = ${customerId}::uuid and status = 'ACTIVE' for share`.execute(transaction);
    if (!result.rows[0]) throw new SalesInvariantError('Active CRM customer was not found');
  }

  private async assertActiveMembership(transaction: PlatformTransaction, membershipId: string) {
    const result = await sql<{ id: string }>`select id from identity.memberships
      where id = ${membershipId}::uuid and status = 'ACTIVE' for share`.execute(transaction);
    if (!result.rows[0]) throw new SalesInvariantError('Active sales assignee was not found');
  }

  private async lockLead(transaction: PlatformTransaction, leadId: string): Promise<LeadRow> {
    const result = await sql<LeadRow>`select id, customer_id, owner_membership_id, status, source,
        qualification_score, qualification_grade, qualification_data, disqualification_reason,
        converted_at, created_at, updated_at from sales.leads where id = ${leadId}::uuid for update`
      .execute(transaction);
    const row = result.rows[0];
    if (!row) throw new SalesInvariantError('Sales lead was not found');
    return row;
  }

  private async lockOpportunity(
    transaction: PlatformTransaction,
    opportunityId: string,
  ): Promise<OpportunityRow> {
    const result = await sql<OpportunityRow>`select id, customer_id, lead_id, pipeline_id, stage_id,
        owner_membership_id, name, status, expected_value_minor::text, currency,
        probability_basis_points, expected_close_date, won_store_id, won_order_id, closed_at,
        loss_reason, created_at, updated_at from sales.opportunities
        where id = ${opportunityId}::uuid for update`.execute(transaction);
    const row = result.rows[0];
    if (!row) throw new SalesInvariantError('Sales opportunity was not found');
    return row;
  }

  private async activeStage(
    transaction: PlatformTransaction,
    pipelineId: string,
    stageId: string,
  ) {
    const result = await sql<{
      id: string;
      category: 'OPEN' | 'WON' | 'LOST';
      default_probability_basis_points: number;
    }>`select id, category, default_probability_basis_points from sales.stages
        where pipeline_id = ${pipelineId}::uuid and id = ${stageId}::uuid and status = 'ACTIVE'
        for share`.execute(transaction);
    const row = result.rows[0];
    if (!row) throw new SalesInvariantError('Active pipeline stage was not found');
    return row;
  }

  private assertStageDefinition(stages: z.output<typeof stageInputSchema>[]) {
    const codes = new Set(stages.map((stage) => stage.code));
    const orders = new Set(stages.map((stage) => stage.sortOrder));
    if (codes.size !== stages.length || orders.size !== stages.length)
      throw new SalesInvariantError('Pipeline stage codes and sort order must be unique');
    if (!stages.some((stage) => stage.category === 'OPEN'))
      throw new SalesInvariantError('Pipeline requires at least one open stage');
    if (stages.filter((stage) => stage.category === 'WON').length !== 1)
      throw new SalesInvariantError('Pipeline requires exactly one won stage');
    if (stages.filter((stage) => stage.category === 'LOST').length !== 1)
      throw new SalesInvariantError('Pipeline requires exactly one lost stage');
  }

  private async timeline(
    transaction: PlatformTransaction,
    context: TenantRequestContext,
    customerId: string,
    leadId: string | null,
    opportunityId: string | null,
    eventType: string,
    data: Record<string, unknown>,
  ) {
    await sql`insert into sales.timeline (
        tenant_id, customer_id, lead_id, opportunity_id, event_type, actor_type, actor_id, data
      ) values (
        ${context.tenantId}::uuid, ${customerId}::uuid, ${leadId}::uuid, ${opportunityId}::uuid,
        ${eventType}, ${context.actorType}, ${context.actorId}::uuid, ${JSON.stringify(data)}::jsonb
      )`.execute(transaction);
  }

  private opportunityView(
    row: OpportunityRow & {
      customer_name: string;
      pipeline_name: string;
      stage_name: string;
      stage_category: string;
      owner_name: string | null;
      open_activity_count: string;
    },
  ) {
    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      leadId: row.lead_id,
      pipelineId: row.pipeline_id,
      pipelineName: row.pipeline_name,
      stageId: row.stage_id,
      stageName: row.stage_name,
      stageCategory: row.stage_category,
      ownerMembershipId: row.owner_membership_id,
      ownerName: row.owner_name,
      name: row.name,
      status: row.status,
      expectedValueMinor: Number(row.expected_value_minor),
      currency: row.currency,
      probabilityBasisPoints: row.probability_basis_points,
      expectedCloseDate: row.expected_close_date,
      wonStoreId: row.won_store_id,
      wonOrderId: row.won_order_id,
      closedAt: row.closed_at,
      lossReason: row.loss_reason,
      openActivityCount: Number(row.open_activity_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
