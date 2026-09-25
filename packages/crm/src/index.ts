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
  tags: readonly { id: string; name: string }[];
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
      const [contacts, identities, tags] = await Promise.all([
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
        sql<{ id: string; name: string }>`select t.id, t.name from crm.customer_tags ct
          join crm.tags t on t.tenant_id = ct.tenant_id and t.id = ct.tag_id
          where ct.customer_id = ${customerId}::uuid order by t.name`.execute(transaction),
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
        tags: tags.rows,
      };
    });
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
  ): Promise<void> {
    await sql`insert into crm.contact_points (
      tenant_id, customer_id, channel, value_original, normalized_value, label, is_primary, is_verified, source
    ) values (
      ${context.tenantId}::uuid, ${customerId}::uuid, ${contact.channel}, ${contact.value},
      ${contact.normalizedValue}, ${contact.label ?? null}, ${contact.isPrimary}, ${contact.isVerified}, 'platform'
    )`.execute(transaction);
    if (isCanonicalIdentityChannel(contact.channel)) {
      await sql`insert into crm.identity_keys (
        tenant_id, customer_id, key_type, key_value, verified, source
      ) values (
        ${context.tenantId}::uuid, ${customerId}::uuid, ${contact.channel},
        ${contact.normalizedValue}, ${contact.isVerified}, 'platform'
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
