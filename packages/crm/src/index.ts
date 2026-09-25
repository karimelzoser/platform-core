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

const contactChannelSchema = z.enum([
  'EMAIL',
  'PHONE',
  'WHATSAPP',
  'INSTAGRAM',
  'MESSENGER',
  'TELEGRAM',
  'OTHER',
]);

const preferenceChannelSchema = z.enum([
  'EMAIL',
  'SMS',
  'WHATSAPP',
  'MESSENGER',
  'INSTAGRAM',
  'PUSH',
]);

const createCustomerSchema = z
  .object({
    displayName: z.string().trim().min(1).max(300).optional(),
    firstName: z.string().trim().min(1).max(150).optional(),
    lastName: z.string().trim().min(1).max(150).optional(),
    companyName: z.string().trim().min(1).max(300).optional(),
    preferredLanguage: z.enum(['en', 'ar']).optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    contactPoints: z
      .array(
        z.object({
          channel: contactChannelSchema,
          value: z.string().trim().min(1).max(320),
          label: z.string().trim().max(100).optional(),
          isPrimary: z.boolean().default(false),
          isVerified: z.boolean().default(false),
        }),
      )
      .max(20)
      .default([]),
  })
  .refine((value) => value.displayName || value.firstName || value.lastName || value.companyName, {
    message: 'A customer must have a display name, personal name, or company name',
  });

export type CreateCustomerInput = z.input<typeof createCustomerSchema>;
export type CustomerContactChannel = z.infer<typeof contactChannelSchema>;

const customerImportSchema = z.object({
  customers: z.array(createCustomerSchema).min(1).max(100),
});

export type CustomerImportInput = z.input<typeof customerImportSchema>;

export interface CustomerListItem {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  status: string;
  updatedAt: Date;
}

export interface CustomerDetail extends CustomerListItem {
  preferredLanguage: string | null;
  timezone: string | null;
  contacts: readonly CustomerContactPoint[];
  identities: readonly CustomerIdentity[];
  preferences: readonly CustomerCommunicationPreference[];
  tags: readonly { id: string; name: string }[];
  duplicateCandidates: readonly DuplicateCandidate[];
}

export interface CustomerCommunicationPreference {
  channel: z.infer<typeof preferenceChannelSchema>;
  status: 'UNKNOWN' | 'OPTED_IN' | 'OPTED_OUT';
  reason: string | null;
  capturedAt: Date | null;
  suppressedUntil: Date | null;
}

export interface DuplicateCandidate extends CustomerListItem {
  matchedChannels: readonly CustomerContactChannel[];
}

export interface CustomerContactPoint {
  id: string;
  channel: CustomerContactChannel;
  value: string;
  normalizedValue: string;
  label: string | null;
  isPrimary: boolean;
  isVerified: boolean;
  status: string;
}

export interface CustomerIdentity {
  id: string;
  keyType: 'EMAIL' | 'PHONE' | 'WHATSAPP';
  keyValue: string;
  state: string;
  verified: boolean;
}

export interface CustomerTag {
  id: string;
  name: string;
  description: string | null;
}

export interface CustomerSegment {
  id: string;
  name: string;
  description: string | null;
  mode: 'STATIC' | 'DYNAMIC';
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  memberCount: number;
}

export interface CustomerTimelineItem {
  id: string;
  kind: 'AUDIT' | 'MERGE';
  action: string;
  actorType: string | null;
  detail: string | null;
  occurredAt: Date;
}

export interface CustomerExportRow {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  preferredLanguage: string | null;
  timezone: string | null;
  contactPoints: string;
}

const createTagSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

export type CreateTagInput = z.input<typeof createTagSchema>;

const bulkTagAssignmentSchema = z
  .object({
    tagId: z.string().uuid(),
    customerIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .transform((input) => ({ ...input, customerIds: [...new Set(input.customerIds)].toSorted() }));

export type BulkTagAssignmentInput = z.input<typeof bulkTagAssignmentSchema>;

const suppressCustomerChannelSchema = z.object({
  customerId: z.string().uuid(),
  channel: preferenceChannelSchema,
  reason: z.string().trim().min(3).max(500),
});

export type SuppressCustomerChannelInput = z.input<typeof suppressCustomerChannelSchema>;

const createStaticSegmentSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

export type CreateStaticSegmentInput = z.input<typeof createStaticSegmentSchema>;

const mergeCustomerSchema = z.object({
  sourceCustomerId: z.string().uuid(),
  targetCustomerId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1_000),
});

export type MergeCustomerInput = z.input<typeof mergeCustomerSchema>;

export interface MergeRelationshipCounts {
  contactPoints: number;
  identityKeys: number;
  externalIdentities: number;
  addresses: number;
  preferences: number;
  tags: number;
  segments: number;
}

export class CustomerMergeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CustomerMergeError';
  }
}

export class CustomerIdentityConflictError extends Error {
  public constructor(
    public readonly channel: 'EMAIL' | 'PHONE' | 'WHATSAPP',
    public readonly value: string,
  ) {
    super(`A canonical ${channel.toLowerCase()} identity already belongs to another customer`);
    this.name = 'CustomerIdentityConflictError';
  }
}

/** Customer 360 application service; all tenant reads use transaction-local RLS context. */
export class CustomerService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async create(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateCustomerInput,
    approvalId?: string,
  ): Promise<CommandResult<{ customerId: string }>> {
    const validated = createCustomerSchema.parse(input);
    const contacts = validated.contactPoints.map(normalizeContactPoint);
    validateContactPointSet(contacts);
    const customerId = randomUUID();
    return this.commands.execute(
      {
        action: 'crm.customer.create',
        permission: 'crm.customers.write',
        risk: 'LOW',
        resource: () => ({ type: 'customer', id: customerId }),
        event: {
          type: 'crm.customer.created',
          data: (_commandInput, result) => ({ customerId: result.customerId }),
          dedupeKey: () => `crm.customer.created:${customerId}`,
        },
        audit: {
          afterState: () => ({ customerId, displayName: customerDisplayName(validated) }),
          metadata: () => ({ contactPointCount: contacts.length }),
        },
        execute: async (transaction) => {
          await this.assertNoIdentityConflict(transaction, contacts);
          await sql`insert into crm.customers (
            id, tenant_id, display_name, first_name, last_name, company_name,
            preferred_language, timezone, source
          ) values (
            ${customerId}::uuid, ${context.tenantId}::uuid, ${customerDisplayName(validated)},
            ${validated.firstName ?? null}, ${validated.lastName ?? null}, ${validated.companyName ?? null},
            ${validated.preferredLanguage ?? null}, ${validated.timezone ?? null}, 'platform'
          )`.execute(transaction);
          for (const contact of contacts)
            await this.insertContact(transaction, context, customerId, contact);
          return { customerId };
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

  public async importCustomers(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CustomerImportInput,
    approvalId?: string,
  ): Promise<CommandResult<{ customerIds: readonly string[] }>> {
    const validated = customerImportSchema.parse(input);
    const customers = validated.customers.map((customer) => ({
      customer,
      contacts: customer.contactPoints.map(normalizeContactPoint),
      customerId: randomUUID(),
    }));
    for (const imported of customers) validateContactPointSet(imported.contacts);
    return this.commands.execute(
      {
        action: 'crm.customer.import',
        permission: 'crm.customers.import',
        risk: 'MEDIUM',
        resource: () => ({ type: 'crm.customer.import', id: 'batch' }),
        event: {
          type: 'crm.customer.imported',
          data: (_commandInput, result) => ({ customerCount: result.customerIds.length }),
          dedupeKey: () => `crm.customer.imported:${idempotencyKey.trim()}`,
        },
        audit: {
          afterState: (_commandInput, result) => ({ customerCount: result.customerIds.length }),
        },
        execute: async (transaction) => {
          for (const imported of customers) {
            await this.assertNoIdentityConflict(transaction, imported.contacts);
            await sql`insert into crm.customers (
              id, tenant_id, display_name, first_name, last_name, company_name,
              preferred_language, timezone, source
            ) values (
              ${imported.customerId}::uuid, ${context.tenantId}::uuid,
              ${customerDisplayName(imported.customer)}, ${imported.customer.firstName ?? null},
              ${imported.customer.lastName ?? null}, ${imported.customer.companyName ?? null},
              ${imported.customer.preferredLanguage ?? null}, ${imported.customer.timezone ?? null}, 'csv_import'
            )`.execute(transaction);
            for (const contact of imported.contacts)
              await this.insertContact(
                transaction,
                context,
                imported.customerId,
                contact,
                'csv_import',
              );
          }
          return { customerIds: customers.map((customer) => customer.customerId) };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async list(
    context: TenantRequestContext,
    input: { search?: string; limit?: number; offset?: number } = {},
  ): Promise<{ items: readonly CustomerListItem[]; nextOffset: number | undefined }> {
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);
    const search = input.search?.trim() || null;
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        company_name: string | null;
        status: string;
        updated_at: Date;
      }>`select id, display_name, first_name, last_name, company_name, status, updated_at
        from crm.customers
        where status <> 'MERGED'
          and (
            ${search}::text is null
            or coalesce(display_name, '') ilike '%' || ${search} || '%'
            or coalesce(first_name, '') ilike '%' || ${search} || '%'
            or coalesce(last_name, '') ilike '%' || ${search} || '%'
            or coalesce(company_name, '') ilike '%' || ${search} || '%'
          )
        order by updated_at desc, id desc
        limit ${limit + 1} offset ${offset}`.execute(transaction);
      const hasMore = result.rows.length > limit;
      return {
        items: result.rows.slice(0, limit).map(toListItem),
        nextOffset: hasMore ? offset + limit : undefined,
      };
    });
  }

  public async listTags(context: TenantRequestContext): Promise<readonly CustomerTag[]> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{ id: string; name: string; description: string | null }>`
        select id, name, description from crm.tags order by lower(name), id
      `.execute(transaction);
      return result.rows;
    });
  }

  public async createTag(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateTagInput,
    approvalId?: string,
  ): Promise<CommandResult<{ tagId: string }>> {
    const validated = createTagSchema.parse(input);
    const tagId = randomUUID();
    return this.commands.execute(
      {
        action: 'crm.tag.create',
        permission: 'crm.tags.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'crm.tag', id: tagId }),
        event: {
          type: 'crm.tag.created',
          data: (_commandInput, result) => ({ tagId: result.tagId }),
          dedupeKey: () => `crm.tag.created:${tagId}`,
        },
        audit: {
          afterState: () => ({ tagId, name: validated.name }),
        },
        execute: async (transaction) => {
          await sql`insert into crm.tags (id, tenant_id, name, description)
            values (${tagId}::uuid, ${context.tenantId}::uuid, ${validated.name}, ${validated.description ?? null})`.execute(
            transaction,
          );
          return { tagId };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async listSegments(context: TenantRequestContext): Promise<readonly CustomerSegment[]> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        id: string;
        name: string;
        description: string | null;
        mode: CustomerSegment['mode'];
        status: CustomerSegment['status'];
        member_count: number;
      }>`select s.id, s.name, s.description, s.mode, s.status, count(sm.customer_id)::integer as member_count
        from crm.segments s
        left join crm.segment_memberships sm on sm.tenant_id = s.tenant_id and sm.segment_id = s.id
        group by s.id, s.name, s.description, s.mode, s.status
        order by lower(s.name), s.id`.execute(transaction);
      return result.rows.map((segment) => ({
        id: segment.id,
        name: segment.name,
        description: segment.description,
        mode: segment.mode,
        status: segment.status,
        memberCount: segment.member_count,
      }));
    });
  }

  public async timeline(
    context: TenantRequestContext,
    customerId: string,
  ): Promise<readonly CustomerTimelineItem[]> {
    const validatedCustomerId = z.string().uuid().parse(customerId);
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        id: string;
        kind: CustomerTimelineItem['kind'];
        action: string;
        actor_type: string | null;
        detail: string | null;
        occurred_at: Date;
      }>`select id, kind, action, actor_type, detail, occurred_at from (
          select a.id::text as id, 'AUDIT'::text as kind, a.action, a.actor_type,
            a.metadata ->> 'reason' as detail, a.created_at as occurred_at
          from platform.audit_log a
          where a.resource_id = ${validatedCustomerId}
            and a.resource_type in ('customer', 'crm.customer')
          union all
          select h.id::text as id, 'MERGE'::text as kind, 'crm.customer.merged' as action,
            null::text as actor_type, h.reason as detail, h.merged_at as occurred_at
          from crm.customer_merge_history h
          where h.source_customer_id = ${validatedCustomerId}::uuid
             or h.target_customer_id = ${validatedCustomerId}::uuid
        ) timeline
        order by occurred_at desc, id desc
        limit 100`.execute(transaction);
      return result.rows.map((item) => ({
        id: item.id,
        kind: item.kind,
        action: item.action,
        actorType: item.actor_type,
        detail: item.detail,
        occurredAt: item.occurred_at,
      }));
    });
  }

  public async exportCustomers(
    context: TenantRequestContext,
  ): Promise<readonly CustomerExportRow[]> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        company_name: string | null;
        preferred_language: string | null;
        timezone: string | null;
        contact_points: string;
      }>`select c.id, c.display_name, c.first_name, c.last_name, c.company_name,
          c.preferred_language, c.timezone,
          coalesce(string_agg(cp.channel || ':' || cp.normalized_value, '; ' order by cp.channel, cp.normalized_value), '') as contact_points
        from crm.customers c
        left join crm.contact_points cp on cp.tenant_id = c.tenant_id and cp.customer_id = c.id
          and cp.status = 'ACTIVE'
        where c.status <> 'MERGED'
        group by c.id, c.display_name, c.first_name, c.last_name, c.company_name,
          c.preferred_language, c.timezone, c.updated_at
        order by c.updated_at desc, c.id desc
        limit 10000`.execute(transaction);
      await sql`insert into platform.audit_log (
        tenant_id, actor_type, actor_id, action, resource_type, request_id, correlation_id, metadata
      ) values (
        ${context.tenantId}::uuid, ${context.actorType}, ${context.actorId}::uuid,
        'crm.customer.export', 'crm.customer.export', ${context.requestId}, ${context.correlationId},
        ${JSON.stringify({ rowCount: result.rows.length, maximumRows: 10000 })}::jsonb
      )`.execute(transaction);
      return result.rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        firstName: row.first_name,
        lastName: row.last_name,
        companyName: row.company_name,
        preferredLanguage: row.preferred_language,
        timezone: row.timezone,
        contactPoints: row.contact_points,
      }));
    });
  }

  public async createStaticSegment(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateStaticSegmentInput,
    approvalId?: string,
  ): Promise<CommandResult<{ segmentId: string }>> {
    const validated = createStaticSegmentSchema.parse(input);
    const segmentId = randomUUID();
    return this.commands.execute(
      {
        action: 'crm.segment.create',
        permission: 'crm.segments.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'crm.segment', id: segmentId }),
        event: {
          type: 'crm.segment.created',
          data: (_commandInput, result) => ({ segmentId: result.segmentId, mode: 'STATIC' }),
          dedupeKey: () => `crm.segment.created:${segmentId}`,
        },
        audit: {
          afterState: () => ({ segmentId, name: validated.name, mode: 'STATIC' }),
        },
        execute: async (transaction) => {
          await sql`insert into crm.segments (id, tenant_id, name, description, mode)
            values (${segmentId}::uuid, ${context.tenantId}::uuid, ${validated.name},
              ${validated.description ?? null}, 'STATIC')`.execute(transaction);
          return { segmentId };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async assignSegmentMember(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: { segmentId: string; customerId: string },
    approvalId?: string,
  ): Promise<CommandResult<{ segmentId: string; customerId: string; assigned: boolean }>> {
    const validated = z
      .object({ segmentId: z.string().uuid(), customerId: z.string().uuid() })
      .parse(input);
    return this.commands.execute(
      {
        action: 'crm.segment.member.assign',
        permission: 'crm.segments.manage',
        risk: 'MEDIUM',
        resource: (commandInput) => ({ type: 'crm.segment', id: commandInput.segmentId }),
        event: {
          type: 'crm.segment.member.assigned',
          data: (_commandInput, result) => result,
        },
        audit: {
          metadata: (_commandInput, result) => result,
        },
        execute: async (transaction) => {
          const [segment, customer] = await Promise.all([
            sql<{ id: string }>`select id from crm.segments
              where id = ${validated.segmentId}::uuid and mode = 'STATIC' and status = 'ACTIVE'`.execute(
              transaction,
            ),
            sql<{ id: string }>`select id from crm.customers
              where id = ${validated.customerId}::uuid and status = 'ACTIVE'`.execute(transaction),
          ]);
          if (!segment.rows[0]) throw new Error('Active static segment not found');
          if (!customer.rows[0]) throw new Error('Active customer not found');
          const assigned = await sql<{ tenant_id: string }>`insert into crm.segment_memberships (
            tenant_id, segment_id, customer_id, source
          ) values (
            ${context.tenantId}::uuid, ${validated.segmentId}::uuid,
            ${validated.customerId}::uuid, 'MANUAL'
          ) on conflict (tenant_id, segment_id, customer_id) do nothing returning tenant_id`.execute(
            transaction,
          );
          return {
            segmentId: validated.segmentId,
            customerId: validated.customerId,
            assigned: assigned.rows.length === 1,
          };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async assignTag(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: { customerId: string; tagId: string },
    approvalId?: string,
  ): Promise<CommandResult<{ customerId: string; tagId: string; assigned: boolean }>> {
    const validated = z
      .object({ customerId: z.string().uuid(), tagId: z.string().uuid() })
      .parse(input);
    return this.commands.execute(
      {
        action: 'crm.customer.tag.assign',
        permission: 'crm.tags.manage',
        risk: 'MEDIUM',
        resource: (commandInput) => ({ type: 'crm.customer', id: commandInput.customerId }),
        event: {
          type: 'crm.customer.tag.assigned',
          data: (_commandInput, result) => result,
        },
        audit: {
          metadata: (commandInput, result) => ({ ...commandInput, assigned: result.assigned }),
        },
        execute: async (transaction) => {
          const [customer, tag] = await Promise.all([
            sql<{ id: string }>`select id from crm.customers
              where id = ${validated.customerId}::uuid and status <> 'MERGED'`.execute(transaction),
            sql<{
              id: string;
            }>`select id from crm.tags where id = ${validated.tagId}::uuid`.execute(transaction),
          ]);
          if (!customer.rows[0]) throw new Error('Customer not found');
          if (!tag.rows[0]) throw new Error('Tag not found');
          const assigned = await sql<{ tenant_id: string }>`insert into crm.customer_tags (
            tenant_id, customer_id, tag_id, assigned_by
          ) values (
            ${context.tenantId}::uuid, ${validated.customerId}::uuid, ${validated.tagId}::uuid,
            ${context.actorId}::uuid
          ) on conflict (tenant_id, customer_id, tag_id) do nothing returning tenant_id`.execute(
            transaction,
          );
          return {
            customerId: validated.customerId,
            tagId: validated.tagId,
            assigned: assigned.rows.length === 1,
          };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async assignTagBulk(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: BulkTagAssignmentInput,
    approvalId?: string,
  ): Promise<CommandResult<{ tagId: string; customerCount: number; assignedCount: number }>> {
    const validated = bulkTagAssignmentSchema.parse(input);
    return this.commands.execute(
      {
        action: 'crm.customer.tag.assign_bulk',
        permission: 'crm.tags.manage',
        risk: 'MEDIUM',
        resource: (commandInput) => ({ type: 'crm.tag', id: commandInput.tagId }),
        event: {
          type: 'crm.customer.tag.bulk_assigned',
          data: (_commandInput, result) => result,
        },
        audit: {
          metadata: (commandInput, result) => ({
            tagId: commandInput.tagId,
            customerIds: commandInput.customerIds,
            assignedCount: result.assignedCount,
          }),
        },
        execute: async (transaction) => {
          const tag = await sql<{ id: string }>`select id from crm.tags
            where id = ${validated.tagId}::uuid`.execute(transaction);
          if (!tag.rows[0]) throw new Error('Tag not found');
          const customerIds = sql.join(
            validated.customerIds.map((customerId) => sql`${customerId}::uuid`),
          );
          const customers = await sql<{ id: string }>`select id from crm.customers
            where id in (${customerIds}) and status = 'ACTIVE'`.execute(transaction);
          if (customers.rows.length !== validated.customerIds.length) {
            throw new Error('One or more active customers were not found');
          }
          const assigned = await sql<{ customer_id: string }>`insert into crm.customer_tags (
            tenant_id, customer_id, tag_id, assigned_by
          ) select ${context.tenantId}::uuid, id, ${validated.tagId}::uuid, ${context.actorId}::uuid
            from crm.customers where id in (${customerIds}) and status = 'ACTIVE'
          on conflict (tenant_id, customer_id, tag_id) do nothing returning customer_id`.execute(
            transaction,
          );
          return {
            tagId: validated.tagId,
            customerCount: validated.customerIds.length,
            assignedCount: assigned.rows.length,
          };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async suppressChannel(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: SuppressCustomerChannelInput,
    approvalId?: string,
  ): Promise<CommandResult<{ customerId: string; channel: string; status: 'OPTED_OUT' }>> {
    const validated = suppressCustomerChannelSchema.parse(input);
    return this.commands.execute(
      {
        action: 'crm.customer.communication.suppress',
        permission: 'crm.customers.write',
        risk: 'MEDIUM',
        resource: (commandInput) => ({ type: 'crm.customer', id: commandInput.customerId }),
        event: {
          type: 'crm.customer.communication.suppressed',
          data: (_commandInput, result) => result,
        },
        audit: {
          afterState: (_commandInput, result) => result,
          metadata: (commandInput) => ({ reason: commandInput.reason }),
        },
        execute: async (transaction) => {
          const customer = await sql<{ id: string }>`select id from crm.customers
            where id = ${validated.customerId}::uuid and status = 'ACTIVE'`.execute(transaction);
          if (!customer.rows[0]) throw new Error('Active customer not found');
          await sql`insert into crm.communication_preferences (
            tenant_id, customer_id, channel, status, source, captured_at, suppressed_until, reason
          ) values (
            ${context.tenantId}::uuid, ${validated.customerId}::uuid, ${validated.channel},
            'OPTED_OUT', 'platform', now(), null, ${validated.reason}
          ) on conflict (tenant_id, customer_id, channel) do update set
            status = 'OPTED_OUT', source = 'platform', captured_at = excluded.captured_at,
            suppressed_until = null, reason = excluded.reason, updated_at = now()`.execute(
            transaction,
          );
          return {
            customerId: validated.customerId,
            channel: validated.channel,
            status: 'OPTED_OUT' as const,
          };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async merge(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: MergeCustomerInput,
    approvalId?: string,
  ): Promise<
    CommandResult<{
      sourceCustomerId: string;
      targetCustomerId: string;
      movedRelationshipCounts: MergeRelationshipCounts;
    }>
  > {
    const validated = mergeCustomerSchema.parse(input);
    if (validated.sourceCustomerId === validated.targetCustomerId) {
      throw new CustomerMergeError('Source and target customers must be different');
    }
    return this.commands.execute(
      {
        action: 'crm.customer.merge',
        permission: 'crm.customers.merge',
        risk: 'HIGH',
        resource: (commandInput) => ({ type: 'crm.customer', id: commandInput.sourceCustomerId }),
        event: {
          type: 'crm.customer.merged',
          data: (commandInput, result) => ({
            sourceCustomerId: commandInput.sourceCustomerId,
            targetCustomerId: commandInput.targetCustomerId,
            reason: commandInput.reason,
            movedRelationshipCounts: result.movedRelationshipCounts,
          }),
          dedupeKey: (commandInput) =>
            `crm.customer.merged:${commandInput.sourceCustomerId}:${commandInput.targetCustomerId}`,
        },
        audit: {
          beforeState: (commandInput) => ({
            sourceCustomerId: commandInput.sourceCustomerId,
            targetCustomerId: commandInput.targetCustomerId,
            sourceStatus: 'ACTIVE',
            targetStatus: 'ACTIVE',
          }),
          afterState: (_commandInput, result) => ({
            sourceCustomerId: result.sourceCustomerId,
            targetCustomerId: result.targetCustomerId,
            sourceStatus: 'MERGED',
            targetStatus: 'ACTIVE',
          }),
          metadata: (commandInput, result) => ({
            reason: commandInput.reason,
            movedRelationshipCounts: result.movedRelationshipCounts,
          }),
        },
        execute: async (transaction) => {
          await this.lockMergePair(transaction, validated);
          const movedRelationshipCounts = await this.reconcileMergeRelationships(
            transaction,
            validated.sourceCustomerId,
            validated.targetCustomerId,
          );
          await sql`insert into crm.customer_merge_history (
            tenant_id, source_customer_id, target_customer_id, reason, actor_id, metadata
          ) values (
            ${context.tenantId}::uuid, ${validated.sourceCustomerId}::uuid,
            ${validated.targetCustomerId}::uuid, ${validated.reason}, ${context.actorId}::uuid,
            ${JSON.stringify({ movedRelationshipCounts })}::jsonb
          )`.execute(transaction);
          await sql`update crm.customers set status = 'MERGED',
            merged_into_customer_id = ${validated.targetCustomerId}::uuid
            where id = ${validated.sourceCustomerId}::uuid`.execute(transaction);
          return {
            sourceCustomerId: validated.sourceCustomerId,
            targetCustomerId: validated.targetCustomerId,
            movedRelationshipCounts,
          };
        },
      },
      { context, input: validated, idempotencyKey, ...(approvalId ? { approvalId } : {}) },
    );
  }

  public async detail(
    context: TenantRequestContext,
    customerId: string,
  ): Promise<CustomerDetail | undefined> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const customer = await sql<{
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        company_name: string | null;
        status: string;
        preferred_language: string | null;
        timezone: string | null;
        updated_at: Date;
      }>`select id, display_name, first_name, last_name, company_name, status, preferred_language, timezone, updated_at
        from crm.customers where id = ${customerId}::uuid`.execute(transaction);
      const row = customer.rows[0];
      if (!row) return undefined;
      const [contacts, identities, preferences, tags, duplicateCandidates] = await Promise.all([
        sql<{
          id: string;
          channel: CustomerContactChannel;
          value_original: string;
          normalized_value: string;
          label: string | null;
          is_primary: boolean;
          is_verified: boolean;
          status: string;
        }>`select id, channel, value_original, normalized_value, label, is_primary, is_verified, status
          from crm.contact_points where customer_id = ${customerId}::uuid order by is_primary desc, created_at`.execute(
          transaction,
        ),
        sql<{
          id: string;
          key_type: CustomerIdentity['keyType'];
          key_value: string;
          state: string;
          verified: boolean;
        }>`
          select id, key_type, key_value, state, verified from crm.identity_keys
          where customer_id = ${customerId}::uuid order by created_at`.execute(transaction),
        sql<{
          channel: CustomerCommunicationPreference['channel'];
          status: CustomerCommunicationPreference['status'];
          reason: string | null;
          captured_at: Date | null;
          suppressed_until: Date | null;
        }>`select channel, status, reason, captured_at, suppressed_until
          from crm.communication_preferences where customer_id = ${customerId}::uuid
          order by channel`.execute(transaction),
        sql<{ id: string; name: string }>`select t.id, t.name from crm.customer_tags ct
          join crm.tags t on t.tenant_id = ct.tenant_id and t.id = ct.tag_id
          where ct.customer_id = ${customerId}::uuid order by t.name`.execute(transaction),
        this.duplicateCandidates(transaction, customerId),
      ]);
      return {
        ...toListItem(row),
        preferredLanguage: row.preferred_language,
        timezone: row.timezone,
        contacts: contacts.rows.map((contact) => ({
          id: contact.id,
          channel: contact.channel,
          value: contact.value_original,
          normalizedValue: contact.normalized_value,
          label: contact.label,
          isPrimary: contact.is_primary,
          isVerified: contact.is_verified,
          status: contact.status,
        })),
        identities: identities.rows.map((identity) => ({
          id: identity.id,
          keyType: identity.key_type,
          keyValue: identity.key_value,
          state: identity.state,
          verified: identity.verified,
        })),
        preferences: preferences.rows.map((preference) => ({
          channel: preference.channel,
          status: preference.status,
          reason: preference.reason,
          capturedAt: preference.captured_at,
          suppressedUntil: preference.suppressed_until,
        })),
        tags: tags.rows,
        duplicateCandidates,
      };
    });
  }

  private async duplicateCandidates(
    transaction: DatabaseTransaction,
    customerId: string,
  ): Promise<readonly DuplicateCandidate[]> {
    const result = await sql<{
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      company_name: string | null;
      status: string;
      updated_at: Date;
      matched_channels: CustomerContactChannel[];
    }>`select candidate.id, candidate.display_name, candidate.first_name, candidate.last_name,
        candidate.company_name, candidate.status, candidate.updated_at,
        array_agg(distinct candidate_contact.channel order by candidate_contact.channel) as matched_channels
      from crm.contact_points source_contact
      join crm.contact_points candidate_contact
        on candidate_contact.tenant_id = source_contact.tenant_id
       and candidate_contact.channel = source_contact.channel
       and candidate_contact.normalized_value = source_contact.normalized_value
       and candidate_contact.status = 'ACTIVE'
      join crm.customers candidate
        on candidate.tenant_id = candidate_contact.tenant_id
       and candidate.id = candidate_contact.customer_id
       and candidate.status = 'ACTIVE'
      where source_contact.customer_id = ${customerId}::uuid
        and source_contact.status = 'ACTIVE'
        and candidate.id <> ${customerId}::uuid
      group by candidate.id, candidate.display_name, candidate.first_name, candidate.last_name,
        candidate.company_name, candidate.status, candidate.updated_at
      order by count(*) desc, candidate.updated_at desc, candidate.id
      limit 20`.execute(transaction);
    return result.rows.map((row) => ({
      ...toListItem(row),
      matchedChannels: row.matched_channels,
    }));
  }

  private async lockMergePair(
    transaction: DatabaseTransaction,
    input: z.infer<typeof mergeCustomerSchema>,
  ): Promise<void> {
    const rows = await sql<{ id: string; status: string }>`select id, status from crm.customers
      where id in (${input.sourceCustomerId}::uuid, ${input.targetCustomerId}::uuid)
      order by id for update`.execute(transaction);
    const source = rows.rows.find((row) => row.id === input.sourceCustomerId);
    const target = rows.rows.find((row) => row.id === input.targetCustomerId);
    if (!source || !target) throw new CustomerMergeError('Source or target customer was not found');
    if (source.status === 'MERGED')
      throw new CustomerMergeError('Source customer is already merged');
    if (source.status !== 'ACTIVE') throw new CustomerMergeError('Source customer is not active');
    if (target.status !== 'ACTIVE') throw new CustomerMergeError('Target customer must be active');
  }

  private async reconcileMergeRelationships(
    transaction: DatabaseTransaction,
    sourceCustomerId: string,
    targetCustomerId: string,
  ): Promise<MergeRelationshipCounts> {
    const counts = {
      contactPoints: await this.countCustomerRows(
        transaction,
        'crm.contact_points',
        sourceCustomerId,
      ),
      identityKeys: await this.countCustomerRows(
        transaction,
        'crm.identity_keys',
        sourceCustomerId,
      ),
      externalIdentities: await this.countCustomerRows(
        transaction,
        'crm.external_identities',
        sourceCustomerId,
      ),
      addresses: await this.countCustomerRows(transaction, 'crm.addresses', sourceCustomerId),
      preferences: await this.countCustomerRows(
        transaction,
        'crm.communication_preferences',
        sourceCustomerId,
      ),
      tags: await this.countCustomerRows(transaction, 'crm.customer_tags', sourceCustomerId),
      segments: await this.countCustomerRows(
        transaction,
        'crm.segment_memberships',
        sourceCustomerId,
      ),
    };
    await this.reconcileContactPoints(transaction, sourceCustomerId, targetCustomerId);
    await this.reconcileIdentityKeys(transaction, sourceCustomerId, targetCustomerId);
    await this.reconcileExternalIdentities(transaction, sourceCustomerId, targetCustomerId);
    await this.reconcileAddresses(transaction, sourceCustomerId, targetCustomerId);
    await this.reconcilePreferences(transaction, sourceCustomerId, targetCustomerId);
    await sql`insert into crm.customer_tags (tenant_id, customer_id, tag_id, assigned_by, source)
      select tenant_id, ${targetCustomerId}::uuid, tag_id, assigned_by, source
      from crm.customer_tags where customer_id = ${sourceCustomerId}::uuid
      on conflict (tenant_id, customer_id, tag_id) do nothing`.execute(transaction);
    await sql`delete from crm.customer_tags where customer_id = ${sourceCustomerId}::uuid`.execute(
      transaction,
    );
    await sql`insert into crm.segment_memberships (
      tenant_id, segment_id, customer_id, source, matched_at, expires_at, metadata
    ) select tenant_id, segment_id, ${targetCustomerId}::uuid, source, matched_at, expires_at, metadata
      from crm.segment_memberships where customer_id = ${sourceCustomerId}::uuid
      on conflict (tenant_id, segment_id, customer_id) do nothing`.execute(transaction);
    await sql`delete from crm.segment_memberships where customer_id = ${sourceCustomerId}::uuid`.execute(
      transaction,
    );
    return counts;
  }

  private async countCustomerRows(
    transaction: DatabaseTransaction,
    table:
      | 'crm.contact_points'
      | 'crm.identity_keys'
      | 'crm.external_identities'
      | 'crm.addresses'
      | 'crm.communication_preferences'
      | 'crm.customer_tags'
      | 'crm.segment_memberships',
    customerId: string,
  ): Promise<number> {
    const result = await sql<{
      count: number;
    }>`select count(*)::int as count from ${sql.table(table)}
      where customer_id = ${customerId}::uuid`.execute(transaction);
    return result.rows[0]?.count ?? 0;
  }

  private async reconcileContactPoints(
    transaction: DatabaseTransaction,
    sourceId: string,
    targetId: string,
  ): Promise<void> {
    await sql`update crm.contact_points target set is_verified = true
      where target.customer_id = ${targetId}::uuid and exists (
        select 1 from crm.contact_points source where source.customer_id = ${sourceId}::uuid
          and source.channel = target.channel and source.normalized_value = target.normalized_value
          and source.is_verified
      )`.execute(transaction);
    await sql`delete from crm.contact_points source where source.customer_id = ${sourceId}::uuid
      and exists (select 1 from crm.contact_points target where target.customer_id = ${targetId}::uuid
        and target.channel = source.channel and target.normalized_value = source.normalized_value)`.execute(
      transaction,
    );
    await sql`update crm.contact_points source set is_primary = false where source.customer_id = ${sourceId}::uuid
      and source.is_primary and exists (select 1 from crm.contact_points target
        where target.customer_id = ${targetId}::uuid and target.channel = source.channel
          and target.is_primary and target.status = 'ACTIVE')`.execute(transaction);
    await sql`update crm.contact_points set customer_id = ${targetId}::uuid
      where customer_id = ${sourceId}::uuid`.execute(transaction);
  }

  private async reconcileIdentityKeys(
    transaction: DatabaseTransaction,
    sourceId: string,
    targetId: string,
  ): Promise<void> {
    await sql`update crm.identity_keys target set verified = true where target.customer_id = ${targetId}::uuid
      and exists (select 1 from crm.identity_keys source where source.customer_id = ${sourceId}::uuid
        and source.key_type = target.key_type and source.key_value = target.key_value and source.verified)`.execute(
      transaction,
    );
    await sql`delete from crm.identity_keys source where source.customer_id = ${sourceId}::uuid
      and exists (select 1 from crm.identity_keys target where target.customer_id = ${targetId}::uuid
        and target.key_type = source.key_type and target.key_value = source.key_value)`.execute(
      transaction,
    );
    await sql`update crm.identity_keys set customer_id = ${targetId}::uuid
      where customer_id = ${sourceId}::uuid`.execute(transaction);
  }

  private async reconcileExternalIdentities(
    transaction: DatabaseTransaction,
    sourceId: string,
    targetId: string,
  ): Promise<void> {
    await sql`delete from crm.external_identities source where source.customer_id = ${sourceId}::uuid
      and exists (select 1 from crm.external_identities target where target.customer_id = ${targetId}::uuid
        and target.provider = source.provider and target.account_ref = source.account_ref
        and target.external_id = source.external_id)`.execute(transaction);
    await sql`update crm.external_identities set customer_id = ${targetId}::uuid
      where customer_id = ${sourceId}::uuid`.execute(transaction);
  }

  private async reconcileAddresses(
    transaction: DatabaseTransaction,
    sourceId: string,
    targetId: string,
  ): Promise<void> {
    await sql`update crm.addresses source set is_default_shipping = false where source.customer_id = ${sourceId}::uuid
      and source.is_default_shipping and exists (select 1 from crm.addresses target
        where target.customer_id = ${targetId}::uuid and target.is_default_shipping and target.status = 'ACTIVE')`.execute(
      transaction,
    );
    await sql`update crm.addresses source set is_default_billing = false where source.customer_id = ${sourceId}::uuid
      and source.is_default_billing and exists (select 1 from crm.addresses target
        where target.customer_id = ${targetId}::uuid and target.is_default_billing and target.status = 'ACTIVE')`.execute(
      transaction,
    );
    await sql`update crm.addresses set customer_id = ${targetId}::uuid where customer_id = ${sourceId}::uuid`.execute(
      transaction,
    );
  }

  private async reconcilePreferences(
    transaction: DatabaseTransaction,
    sourceId: string,
    targetId: string,
  ): Promise<void> {
    await sql`update crm.communication_preferences target set
      status = case when target.status = 'OPTED_OUT' or source.status = 'OPTED_OUT' then 'OPTED_OUT'
        when target.status = 'OPTED_IN' or source.status = 'OPTED_IN' then 'OPTED_IN' else 'UNKNOWN' end,
      suppressed_until = greatest(target.suppressed_until, source.suppressed_until),
      captured_at = greatest(target.captured_at, source.captured_at)
      from crm.communication_preferences source
      where source.customer_id = ${sourceId}::uuid and target.customer_id = ${targetId}::uuid
        and target.channel = source.channel`.execute(transaction);
    await sql`delete from crm.communication_preferences source where source.customer_id = ${sourceId}::uuid
      and exists (select 1 from crm.communication_preferences target where target.customer_id = ${targetId}::uuid
        and target.channel = source.channel)`.execute(transaction);
    await sql`update crm.communication_preferences set customer_id = ${targetId}::uuid
      where customer_id = ${sourceId}::uuid`.execute(transaction);
  }

  private async assertNoIdentityConflict(
    transaction: DatabaseTransaction,
    contacts: readonly NormalizedContactPoint[],
  ): Promise<void> {
    for (const contact of contacts) {
      if (!isCanonicalIdentityChannel(contact.channel)) continue;
      const result = await sql<{ customer_id: string }>`select customer_id from crm.identity_keys
        where key_type = ${contact.channel} and key_value = ${contact.normalizedValue} and state = 'ACTIVE'
        limit 1`.execute(transaction);
      if (result.rows[0])
        throw new CustomerIdentityConflictError(contact.channel, contact.normalizedValue);
    }
  }

  private async insertContact(
    transaction: DatabaseTransaction,
    context: TenantRequestContext,
    customerId: string,
    contact: NormalizedContactPoint,
    source = 'platform',
  ): Promise<void> {
    await sql`insert into crm.contact_points (
      tenant_id, customer_id, channel, value_original, normalized_value, label, is_primary, is_verified, source
    ) values (
      ${context.tenantId}::uuid, ${customerId}::uuid, ${contact.channel}, ${contact.value},
      ${contact.normalizedValue}, ${contact.label ?? null}, ${contact.isPrimary}, ${contact.isVerified}, ${source}
    )`.execute(transaction);
    if (isCanonicalIdentityChannel(contact.channel)) {
      await sql`insert into crm.identity_keys (
        tenant_id, customer_id, key_type, key_value, verified, source
      ) values (
        ${context.tenantId}::uuid, ${customerId}::uuid, ${contact.channel},
        ${contact.normalizedValue}, ${contact.isVerified}, ${source}
      )`.execute(transaction);
    }
  }
}

interface NormalizedContactPoint {
  channel: CustomerContactChannel;
  value: string;
  normalizedValue: string;
  label?: string;
  isPrimary: boolean;
  isVerified: boolean;
}

/** Produces a spreadsheet-safe UTF-8 CSV from tenant-authorized export rows. */
export function customerExportCsv(rows: readonly CustomerExportRow[]): string {
  const headers = [
    'id',
    'display_name',
    'first_name',
    'last_name',
    'company_name',
    'preferred_language',
    'timezone',
    'contact_points',
  ];
  const data = rows.map((row) =>
    [
      row.id,
      row.displayName,
      row.firstName,
      row.lastName,
      row.companyName,
      row.preferredLanguage,
      row.timezone,
      row.contactPoints,
    ]
      .map(csvCell)
      .join(','),
  );
  return `${headers.join(',')}\r\n${data.join('\r\n')}${data.length ? '\r\n' : ''}`;
}

function csvCell(value: string | null): string {
  const plain = value ?? '';
  const safe = /^[=+\-@\t\r]/.test(plain) ? `'${plain}` : plain;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function normalizeContactPoint(
  input: z.infer<typeof createCustomerSchema>['contactPoints'][number],
): NormalizedContactPoint {
  const { label: rawLabel, ...contact } = input;
  const value = contact.value.trim();
  const normalizedValue =
    contact.channel === 'EMAIL'
      ? value.toLowerCase()
      : contact.channel === 'PHONE' || contact.channel === 'WHATSAPP'
        ? normalizePhone(value)
        : value;
  const label = rawLabel?.trim();
  return { ...contact, value, normalizedValue, ...(label ? { label } : {}) };
}

function normalizePhone(value: string): string {
  const normalized = value.replace(/[\s().-]/g, '');
  if (!/^\+[1-9][0-9]{6,14}$/.test(normalized))
    throw new Error('Phone and WhatsApp values must be E.164');
  return normalized;
}

function validateContactPointSet(contacts: readonly NormalizedContactPoint[]): void {
  const primaryChannels = new Set<CustomerContactChannel>();
  const identityValues = new Set<string>();
  for (const contact of contacts) {
    if (contact.isPrimary && primaryChannels.has(contact.channel)) {
      throw new Error(`Only one primary ${contact.channel} contact point is allowed`);
    }
    if (contact.isPrimary) primaryChannels.add(contact.channel);
    if (isCanonicalIdentityChannel(contact.channel)) {
      const identity = `${contact.channel}:${contact.normalizedValue}`;
      if (identityValues.has(identity))
        throw new Error('Duplicate canonical identity in customer request');
      identityValues.add(identity);
    }
  }
}

function isCanonicalIdentityChannel(
  channel: CustomerContactChannel,
): channel is 'EMAIL' | 'PHONE' | 'WHATSAPP' {
  return channel === 'EMAIL' || channel === 'PHONE' || channel === 'WHATSAPP';
}

function customerDisplayName(input: z.infer<typeof createCustomerSchema>): string | null {
  return (
    input.displayName ??
    ([input.firstName, input.lastName].filter(Boolean).join(' ') || input.companyName) ??
    null
  );
}

function toListItem(row: {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  status: string;
  updated_at: Date;
}): CustomerListItem {
  return {
    id: row.id,
    displayName: row.display_name,
    firstName: row.first_name,
    lastName: row.last_name,
    companyName: row.company_name,
    status: row.status,
    updatedAt: row.updated_at,
  };
}
