import { randomUUID } from 'node:crypto';
import {
  CommandExecutor,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import {
  sql,
  withSubjectTransaction,
  withTenantTransaction,
  type PlatformDatabase,
} from '@platform/database';
import { z } from 'zod';
import type {
  AuthenticatedTenantContext,
  IdentitySubjectContext,
} from './authenticated-context.service.js';

const uuidSchema = z.string().uuid();
const localeSchema = z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/u);
const timezoneSchema = z.string().trim().min(1).max(100);
const emailSchema = z.string().trim().toLowerCase().email().max(320);
const roleCodeSchema = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{1,62}$/u);
const nameSchema = z.string().trim().min(2).max(200);
const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/u);

const createOrganizationSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  locale: localeSchema.default('en'),
  timezone: timezoneSchema.default('UTC'),
});

const profileSchema = z.object({
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  locale: localeSchema,
  timezone: timezoneSchema,
});

const organizationUpdateSchema = z.object({
  name: nameSchema,
  locale: localeSchema,
  timezone: timezoneSchema,
  profileOwnerMembershipId: uuidSchema.optional(),
});

const mfaPolicySchema = z.enum(['OPTIONAL', 'REQUIRED_FOR_PRIVILEGED', 'REQUIRED_FOR_ALL']);

const invitationSchema = z.object({
  email: emailSchema,
  roleIds: z.array(uuidSchema).min(1).max(20),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(168),
});

const memberStatusSchema = z.object({
  membershipId: uuidSchema,
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REMOVED']),
  reason: z.string().trim().min(1).max(500).optional(),
});

const memberRolesSchema = z.object({
  membershipId: uuidSchema,
  roleIds: z.array(uuidSchema).min(1).max(20),
});

const customRoleSchema = z.object({
  code: roleCodeSchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  permissionCodes: z.array(z.string().trim().min(3).max(160)).max(250).default([]),
});

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;
export type UpdateProfileInput = z.input<typeof profileSchema>;
export type UpdateOrganizationInput = z.input<typeof organizationUpdateSchema>;
export type CreateInvitationInput = z.input<typeof invitationSchema>;
export type SetMemberStatusInput = z.input<typeof memberStatusSchema>;
export type SetMemberRolesInput = z.input<typeof memberRolesSchema>;
export type CustomRoleInput = z.input<typeof customRoleSchema>;

interface OrganizationAccessRow {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  membership_id: string;
  role_codes: string[];
}

interface ProfileRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  locale: string;
  timezone: string;
  updated_at: Date;
}

export class IdentityInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'IdentityInvariantError';
  }
}

export class IdentityService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async listOrganizations(context: IdentitySubjectContext) {
    return withSubjectTransaction(
      this.database,
      {
        actorId: null,
        subject: context.subject,
        requestId: context.requestId,
      },
      async (transaction) => {
        const result = await sql<OrganizationAccessRow>`
          select organization_id, organization_name, organization_slug,
                 membership_id, role_codes
          from identity.current_user_organizations()
        `.execute(transaction);
        return {
          items: result.rows.map((row) => ({
            id: row.organization_id,
            name: row.organization_name,
            slug: row.organization_slug,
            membershipId: row.membership_id,
            roleCodes: row.role_codes,
          })),
        };
      },
    );
  }

  public async createOrganization(
    context: IdentitySubjectContext,
    input: CreateOrganizationInput,
  ): Promise<{ organizationId: string; membershipId: string; userId: string }> {
    if (!context.claims.email || context.claims.email_verified !== true) {
      throw new IdentityInvariantError('A verified Keycloak email is required');
    }
    const validated = createOrganizationSchema.parse(input);
    return withSubjectTransaction(
      this.database,
      { actorId: null, subject: context.subject, requestId: context.requestId },
      async (transaction) => {
        const result = await sql<{
          organization_id: string;
          membership_id: string;
          user_id: string;
        }>`
          select * from identity.create_organization_for_current_subject(
            ${validated.name},
            ${validated.slug},
            ${context.claims.email},
            ${context.claims.given_name ?? null},
            ${context.claims.family_name ?? null},
            ${validated.locale},
            ${validated.timezone}
          )
        `.execute(transaction);
        const row = result.rows[0];
        if (!row) throw new IdentityInvariantError('Organization creation did not return a tenant');
        return {
          organizationId: row.organization_id,
          membershipId: row.membership_id,
          userId: row.user_id,
        };
      },
    );
  }

  public async acceptInvitation(
    context: IdentitySubjectContext,
    invitationId: string,
    preferences?: { locale?: string; timezone?: string },
  ): Promise<{ organizationId: string; membershipId: string; userId: string }> {
    const id = uuidSchema.parse(invitationId);
    if (!context.claims.email || context.claims.email_verified !== true) {
      throw new IdentityInvariantError('A verified Keycloak email is required');
    }
    const locale = localeSchema.parse(preferences?.locale ?? context.claims.locale ?? 'en');
    const timezone = timezoneSchema.parse(preferences?.timezone ?? 'UTC');
    return withSubjectTransaction(
      this.database,
      { actorId: null, subject: context.subject, requestId: context.requestId },
      async (transaction) => {
        const result = await sql<{
          organization_id: string;
          membership_id: string;
          user_id: string;
        }>`
          select * from identity.accept_organization_invitation(
            ${id}::uuid,
            ${context.claims.email},
            ${context.claims.given_name ?? null},
            ${context.claims.family_name ?? null},
            ${locale},
            ${timezone}
          )
        `.execute(transaction);
        const row = result.rows[0];
        if (!row) throw new IdentityInvariantError('Invitation acceptance did not return a tenant');
        return {
          organizationId: row.organization_id,
          membershipId: row.membership_id,
          userId: row.user_id,
        };
      },
    );
  }

  public async getProfile(context: TenantRequestContext) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<ProfileRow>`
        select id, email, first_name, last_name, locale, timezone, updated_at
        from identity.users
        where id = ${context.actorId}::uuid
      `.execute(transaction);
      const row = result.rows[0];
      if (!row) throw new IdentityInvariantError('Profile was not found');
      return this.profileView(row);
    });
  }

  public async updateProfile(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: UpdateProfileInput,
  ): Promise<CommandResult<Record<string, unknown>>> {
    const validated = profileSchema.parse(input);
    await this.assertTimezone(context, validated.timezone);
    return this.commands.execute(
      {
        action: 'identity.profile.update',
        permission: 'identity.profile.update',
        risk: 'LOW',
        resource: () => ({ type: 'identity.user', id: context.actorId ?? context.subject }),
        event: {
          type: 'identity.profile.updated',
          data: (_input, result) => result,
          dedupeKey: () => `identity:profile:updated:${idempotencyKey}`,
        },
        execute: async (transaction) => {
          const result = await sql<ProfileRow>`
            update identity.users
            set first_name = ${validated.firstName?.trim() || null},
                last_name = ${validated.lastName?.trim() || null},
                locale = ${validated.locale},
                timezone = ${validated.timezone},
                updated_at = now()
            where id = ${context.actorId}::uuid
            returning id, email, first_name, last_name, locale, timezone, updated_at
          `.execute(transaction);
          const row = result.rows[0];
          if (!row) throw new IdentityInvariantError('Profile update was not permitted');
          return this.profileView(row);
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async getOrganization(context: TenantRequestContext) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        id: string;
        name: string;
        slug: string;
        status: string;
        timezone: string;
        locale: string;
        mfa_policy: string;
        profile_owner_membership_id: string | null;
        updated_at: Date;
      }>`
        select id, name, slug, status, timezone, locale, mfa_policy,
               profile_owner_membership_id, updated_at
        from identity.organizations
        where id = ${context.tenantId}::uuid
      `.execute(transaction);
      const row = result.rows[0];
      if (!row) throw new IdentityInvariantError('Organization was not found');
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        timezone: row.timezone,
        locale: row.locale,
        mfaPolicy: row.mfa_policy,
        profileOwnerMembershipId: row.profile_owner_membership_id,
        updatedAt: row.updated_at.toISOString(),
      };
    });
  }

  public async updateOrganization(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: UpdateOrganizationInput,
  ): Promise<CommandResult<Record<string, unknown>>> {
    const validated = organizationUpdateSchema.parse(input);
    await this.assertTimezone(context, validated.timezone);
    return this.commands.execute(
      {
        action: 'identity.organization.update',
        permission: 'organization.update',
        risk: 'MEDIUM',
        resource: () => ({ type: 'identity.organization', id: context.tenantId }),
        event: {
          type: 'identity.organization.updated',
          data: (_input, result) => result,
          dedupeKey: () => `identity:organization:updated:${idempotencyKey}`,
        },
        execute: async (transaction) => {
          if (validated.profileOwnerMembershipId) {
            const owner = await sql<{ exists: boolean }>`
              select exists(
                select 1 from identity.memberships
                where tenant_id = ${context.tenantId}::uuid
                  and id = ${validated.profileOwnerMembershipId}::uuid
                  and status = 'ACTIVE'
              ) as exists
            `.execute(transaction);
            if (!owner.rows[0]?.exists) {
              throw new IdentityInvariantError('Profile owner must be an active member');
            }
          }
          const result = await sql<{
            name: string;
            locale: string;
            timezone: string;
            profile_owner_membership_id: string | null;
          }>`
            update identity.organizations
            set name = ${validated.name},
                locale = ${validated.locale},
                timezone = ${validated.timezone},
                profile_owner_membership_id = ${validated.profileOwnerMembershipId ?? null}::uuid,
                updated_at = now()
            where id = ${context.tenantId}::uuid
            returning name, locale, timezone, profile_owner_membership_id
          `.execute(transaction);
          const row = result.rows[0];
          if (!row) throw new IdentityInvariantError('Organization update failed');
          return {
            organizationId: context.tenantId,
            name: row.name,
            locale: row.locale,
            timezone: row.timezone,
            profileOwnerMembershipId: row.profile_owner_membership_id,
          };
        },
      },
      { context, input: validated, idempotencyKey },
    );
  }

  public async updateMfaPolicy(
    context: AuthenticatedTenantContext,
    idempotencyKey: string,
    policy: z.input<typeof mfaPolicySchema>,
    approvalId?: string,
  ): Promise<CommandResult<{ organizationId: string; mfaPolicy: string }>> {
    const validated = mfaPolicySchema.parse(policy);
    if (!context.mfaSatisfied) {
      throw new IdentityInvariantError('MFA is required to change tenant MFA policy');
    }
    return this.commands.execute(
      {
        action: 'identity.organization.security.update',
        permission: 'organization.security.manage',
        risk: 'CRITICAL',
        resource: () => ({ type: 'identity.organization', id: context.tenantId }),
        event: {
          type: 'identity.organization.mfa_policy_updated',
          data: () => ({ organizationId: context.tenantId, mfaPolicy: validated }),
          dedupeKey: () => `identity:organization:mfa:${idempotencyKey}`,
        },
        execute: async (transaction) => {
          await sql`
            update identity.organizations
            set mfa_policy = ${validated}, updated_at = now()
            where id = ${context.tenantId}::uuid
          `.execute(transaction);
          return { organizationId: context.tenantId, mfaPolicy: validated };
        },
      },
      { context, input: { mfaPolicy: validated }, idempotencyKey, approvalId },
    );
  }

  public async listMembers(context: TenantRequestContext) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        membership_id: string;
        user_id: string;
        email: string | null;
        first_name: string | null;
        last_name: string | null;
        status: string;
        title: string | null;
        joined_at: Date | null;
        status_reason: string | null;
        role_codes: string[];
        role_ids: string[];
      }>`
        select membership.id as membership_id, user_record.id as user_id,
               user_record.email, user_record.first_name, user_record.last_name,
               membership.status, membership.title, membership.joined_at,
               membership.status_reason,
               coalesce(array_agg(distinct role.code) filter (where role.id is not null), array[]::text[]) as role_codes,
               coalesce(array_agg(distinct role.id::text) filter (where role.id is not null), array[]::text[]) as role_ids
        from identity.memberships membership
        join identity.users user_record on user_record.id = membership.user_id
        left join identity.membership_roles membership_role
          on membership_role.tenant_id = membership.tenant_id
         and membership_role.membership_id = membership.id
        left join identity.roles role
          on role.tenant_id = membership_role.tenant_id
         and role.id = membership_role.role_id
        where membership.tenant_id = ${context.tenantId}::uuid
        group by membership.id, user_record.id
        order by case membership.status when 'ACTIVE' then 0 when 'SUSPENDED' then 1 else 2 end,
                 lower(coalesce(user_record.first_name, '')), lower(coalesce(user_record.email, ''))
      `.execute(transaction);
      return {
        items: result.rows.map((row) => ({
          membershipId: row.membership_id,
          userId: row.user_id,
          email: row.email,
          firstName: row.first_name,
          lastName: row.last_name,
          status: row.status,
          title: row.title,
          joinedAt: row.joined_at?.toISOString() ?? null,
          statusReason: row.status_reason,
          roleCodes: row.role_codes,
          roleIds: row.role_ids,
        })),
      };
    });
  }

  public async listInvitations(context: TenantRequestContext) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      await sql`
        update identity.organization_invitations
        set status = 'EXPIRED', updated_at = now()
        where tenant_id = ${context.tenantId}::uuid
          and status = 'PENDING' and expires_at <= now()
      `.execute(transaction);
      const result = await sql<{
        id: string;
        email: string;
        status: string;
        expires_at: Date;
        created_at: Date;
        role_codes: string[];
      }>`
        select invitation.id, invitation.email, invitation.status,
               invitation.expires_at, invitation.created_at,
               coalesce(array_agg(role.code order by role.code) filter (where role.id is not null), array[]::text[]) as role_codes
        from identity.organization_invitations invitation
        left join identity.organization_invitation_roles invitation_role
          on invitation_role.tenant_id = invitation.tenant_id
         and invitation_role.invitation_id = invitation.id
        left join identity.roles role
          on role.tenant_id = invitation_role.tenant_id
         and role.id = invitation_role.role_id
        where invitation.tenant_id = ${context.tenantId}::uuid
        group by invitation.id
        order by invitation.created_at desc
        limit 100
      `.execute(transaction);
      return {
        items: result.rows.map((row) => ({
          id: row.id,
          email: row.email,
          status: row.status,
          expiresAt: row.expires_at.toISOString(),
          createdAt: row.created_at.toISOString(),
          roleCodes: row.role_codes,
        })),
      };
    });
  }

  public async createInvitation(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CreateInvitationInput,
    approvalId?: string,
  ): Promise<CommandResult<Record<string, unknown>>> {
    const validated = invitationSchema.parse(input);
    const invitationId = randomUUID();
    const expiresAt = new Date(Date.now() + validated.expiresInHours * 60 * 60 * 1000);
    return this.commands.execute(
      {
        action: 'identity.organization.invitation.create',
        permission: 'organization.members.invite',
        risk: 'HIGH',
        resource: () => ({ type: 'identity.organization_invitation', id: invitationId }),
        event: {
          type: 'identity.organization.invitation_created',
          data: () => ({ invitationId, roleCount: validated.roleIds.length, expiresAt: expiresAt.toISOString() }),
          dedupeKey: () => `identity:invitation:created:${invitationId}`,
        },
        execute: async (transaction) => {
          await sql`
            update identity.organization_invitations
            set status = 'EXPIRED', updated_at = now()
            where tenant_id = ${context.tenantId}::uuid
              and lower(email) = lower(${validated.email})
              and status = 'PENDING' and expires_at <= now()
          `.execute(transaction);

          const roles = await sql<{ id: string }>`
            select id from identity.roles
            where tenant_id = ${context.tenantId}::uuid
              and id = any(${validated.roleIds}::uuid[])
          `.execute(transaction);
          if (roles.rows.length !== new Set(validated.roleIds).size) {
            throw new IdentityInvariantError('One or more invitation roles are invalid');
          }

          await sql`
            insert into identity.organization_invitations (
              id, tenant_id, email, invited_by_user_id, expires_at
            ) values (
              ${invitationId}::uuid, ${context.tenantId}::uuid, ${validated.email},
              ${context.actorId}::uuid, ${expiresAt.toISOString()}::timestamptz
            )
          `.execute(transaction);
          for (const roleId of new Set(validated.roleIds)) {
            await sql`
              insert into identity.organization_invitation_roles (tenant_id, invitation_id, role_id)
              values (${context.tenantId}::uuid, ${invitationId}::uuid, ${roleId}::uuid)
            `.execute(transaction);
          }
          return {
            invitationId,
            email: validated.email,
            status: 'PENDING',
            expiresAt: expiresAt.toISOString(),
          };
        },
      },
      { context, input: validated, idempotencyKey, approvalId },
    );
  }

  public async revokeInvitation(
    context: TenantRequestContext,
    idempotencyKey: string,
    invitationId: string,
  ): Promise<CommandResult<{ invitationId: string; status: string }>> {
    const id = uuidSchema.parse(invitationId);
    return this.commands.execute(
      {
        action: 'identity.organization.invitation.revoke',
        permission: 'organization.members.invite',
        risk: 'MEDIUM',
        resource: () => ({ type: 'identity.organization_invitation', id }),
        event: {
          type: 'identity.organization.invitation_revoked',
          data: () => ({ invitationId: id }),
          dedupeKey: () => `identity:invitation:revoked:${id}`,
        },
        execute: async (transaction) => {
          const updated = await sql<{ id: string }>`
            update identity.organization_invitations
            set status = 'REVOKED', revoked_at = now(), updated_at = now()
            where tenant_id = ${context.tenantId}::uuid
              and id = ${id}::uuid and status = 'PENDING'
            returning id
          `.execute(transaction);
          if (!updated.rows[0]) throw new IdentityInvariantError('Pending invitation was not found');
          return { invitationId: id, status: 'REVOKED' };
        },
      },
      { context, input: { invitationId: id }, idempotencyKey },
    );
  }

  public async setMemberStatus(
    context: AuthenticatedTenantContext,
    idempotencyKey: string,
    input: SetMemberStatusInput,
    approvalId?: string,
  ): Promise<CommandResult<Record<string, unknown>>> {
    const validated = memberStatusSchema.parse(input);
    if (validated.membershipId === context.membershipId && validated.status !== 'ACTIVE') {
      throw new IdentityInvariantError('A member cannot suspend or remove their own membership');
    }
    return this.commands.execute(
      {
        action: 'identity.organization.member.status.update',
        permission: 'organization.members.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'identity.membership', id: validated.membershipId }),
        event: {
          type: 'identity.organization.member_status_updated',
          data: () => ({ membershipId: validated.membershipId, status: validated.status }),
          dedupeKey: () => `identity:member:status:${idempotencyKey}`,
        },
        execute: async (transaction) => {
          const updated = await sql<{ user_id: string; status: string }>`
            update identity.memberships
            set status = ${validated.status},
                status_reason = ${validated.reason ?? null},
                suspended_at = case when ${validated.status} = 'SUSPENDED' then now() else null end,
                suspended_by_user_id = case when ${validated.status} = 'SUSPENDED' then ${context.actorId}::uuid else null end,
                removed_at = case when ${validated.status} = 'REMOVED' then now() else null end,
                removed_by_user_id = case when ${validated.status} = 'REMOVED' then ${context.actorId}::uuid else null end,
                joined_at = case when ${validated.status} = 'ACTIVE' then coalesce(joined_at, now()) else joined_at end,
                updated_at = now()
            where tenant_id = ${context.tenantId}::uuid
              and id = ${validated.membershipId}::uuid
            returning user_id, status
          `.execute(transaction);
          const row = updated.rows[0];
          if (!row) throw new IdentityInvariantError('Membership was not found');
          return { membershipId: validated.membershipId, userId: row.user_id, status: row.status };
        },
      },
      { context, input: validated, idempotencyKey, approvalId },
    );
  }

  public async setMemberRoles(
    context: AuthenticatedTenantContext,
    idempotencyKey: string,
    input: SetMemberRolesInput,
    approvalId?: string,
  ): Promise<CommandResult<Record<string, unknown>>> {
    const validated = memberRolesSchema.parse(input);
    const uniqueRoleIds = [...new Set(validated.roleIds)];
    return this.commands.execute(
      {
        action: 'identity.organization.member.roles.update',
        permission: 'organization.members.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'identity.membership', id: validated.membershipId }),
        event: {
          type: 'identity.organization.member_roles_updated',
          data: () => ({ membershipId: validated.membershipId, roleCount: uniqueRoleIds.length }),
          dedupeKey: () => `identity:member:roles:${idempotencyKey}`,
        },
        execute: async (transaction) => {
          const member = await sql<{ exists: boolean }>`
            select exists(
              select 1 from identity.memberships
              where tenant_id = ${context.tenantId}::uuid
                and id = ${validated.membershipId}::uuid
                and status <> 'REMOVED'
            ) as exists
          `.execute(transaction);
          if (!member.rows[0]?.exists) throw new IdentityInvariantError('Membership was not found');

          const roles = await sql<{ id: string }>`
            select id from identity.roles
            where tenant_id = ${context.tenantId}::uuid
              and id = any(${uniqueRoleIds}::uuid[])
          `.execute(transaction);
          if (roles.rows.length !== uniqueRoleIds.length) {
            throw new IdentityInvariantError('One or more roles are invalid');
          }

          await sql`
            delete from identity.membership_roles
            where tenant_id = ${context.tenantId}::uuid
              and membership_id = ${validated.membershipId}::uuid
              and not (role_id = any(${uniqueRoleIds}::uuid[]))
          `.execute(transaction);
          for (const roleId of uniqueRoleIds) {
            await sql`
              insert into identity.membership_roles (tenant_id, membership_id, role_id)
              values (${context.tenantId}::uuid, ${validated.membershipId}::uuid, ${roleId}::uuid)
              on conflict do nothing
            `.execute(transaction);
          }
          return { membershipId: validated.membershipId, roleIds: uniqueRoleIds };
        },
      },
      { context, input: { ...validated, roleIds: uniqueRoleIds }, idempotencyKey, approvalId },
    );
  }

  public async listRoles(context: TenantRequestContext) {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const roleResult = await sql<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        is_system: boolean;
        permission_codes: string[];
      }>`
        select role.id, role.code, role.name, role.description, role.is_system,
               coalesce(array_agg(role_permission.permission_code order by role_permission.permission_code)
                 filter (where role_permission.permission_code is not null), array[]::text[]) as permission_codes
        from identity.roles role
        left join identity.role_permissions role_permission
          on role_permission.tenant_id = role.tenant_id
         and role_permission.role_id = role.id
        where role.tenant_id = ${context.tenantId}::uuid
        group by role.id
        order by role.is_system desc, role.name
      `.execute(transaction);
      const permissionResult = await sql<{
        code: string;
        category: string;
        description: string;
        default_risk: string;
      }>`
        select code, category, description, default_risk
        from identity.permissions
        order by category, code
      `.execute(transaction);
      return {
        items: roleResult.rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          system: row.is_system,
          permissionCodes: row.permission_codes,
        })),
        permissions: permissionResult.rows.map((row) => ({
          code: row.code,
          category: row.category,
          description: row.description,
          risk: row.default_risk,
        })),
      };
    });
  }

  public async createRole(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: CustomRoleInput,
    approvalId?: string,
  ): Promise<CommandResult<Record<string, unknown>>> {
    const validated = customRoleSchema.parse(input);
    const roleId = randomUUID();
    return this.commands.execute(
      this.roleDefinition(context, roleId, validated, true),
      { context, input: validated, idempotencyKey, approvalId },
    );
  }

  public async updateRole(
    context: TenantRequestContext,
    idempotencyKey: string,
    roleId: string,
    input: CustomRoleInput,
    approvalId?: string,
  ): Promise<CommandResult<Record<string, unknown>>> {
    const id = uuidSchema.parse(roleId);
    const validated = customRoleSchema.parse(input);
    return this.commands.execute(
      this.roleDefinition(context, id, validated, false),
      { context, input: validated, idempotencyKey, approvalId },
    );
  }

  public async deleteRole(
    context: TenantRequestContext,
    idempotencyKey: string,
    roleId: string,
    approvalId?: string,
  ): Promise<CommandResult<{ roleId: string; deleted: boolean }>> {
    const id = uuidSchema.parse(roleId);
    return this.commands.execute(
      {
        action: 'identity.organization.role.delete',
        permission: 'organization.roles.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'identity.role', id }),
        event: {
          type: 'identity.organization.role_deleted',
          data: () => ({ roleId: id }),
          dedupeKey: () => `identity:role:deleted:${id}`,
        },
        execute: async (transaction) => {
          const deleted = await sql<{ id: string }>`
            delete from identity.roles
            where tenant_id = ${context.tenantId}::uuid
              and id = ${id}::uuid and is_system = false
            returning id
          `.execute(transaction);
          if (!deleted.rows[0]) throw new IdentityInvariantError('Custom role was not found');
          return { roleId: id, deleted: true };
        },
      },
      { context, input: { roleId: id }, idempotencyKey, approvalId },
    );
  }

  private roleDefinition(
    context: TenantRequestContext,
    roleId: string,
    validated: z.output<typeof customRoleSchema>,
    create: boolean,
  ) {
    return {
      action: create ? 'identity.organization.role.create' : 'identity.organization.role.update',
      permission: 'organization.roles.manage',
      risk: 'HIGH' as const,
      resource: () => ({ type: 'identity.role', id: roleId }),
      event: {
        type: create ? 'identity.organization.role_created' : 'identity.organization.role_updated',
        data: () => ({ roleId, code: validated.code, permissionCount: validated.permissionCodes.length }),
        dedupeKey: () => `identity:role:${create ? 'created' : 'updated'}:${roleId}`,
      },
      execute: async (transaction: Parameters<Parameters<CommandExecutor['execute']>[0]['execute']>[0]) => {
        const permissionCodes = [...new Set(validated.permissionCodes)];
        if (permissionCodes.length > 0) {
          const permissions = await sql<{ code: string }>`
            select code from identity.permissions
            where code = any(${permissionCodes}::text[])
          `.execute(transaction);
          if (permissions.rows.length !== permissionCodes.length) {
            throw new IdentityInvariantError('One or more permissions are invalid');
          }
        }

        if (create) {
          await sql`
            insert into identity.roles (id, tenant_id, code, name, description, is_system)
            values (
              ${roleId}::uuid, ${context.tenantId}::uuid, ${validated.code},
              ${validated.name}, ${validated.description ?? null}, false
            )
          `.execute(transaction);
        } else {
          const updated = await sql<{ id: string }>`
            update identity.roles
            set code = ${validated.code}, name = ${validated.name},
                description = ${validated.description ?? null}, updated_at = now()
            where tenant_id = ${context.tenantId}::uuid
              and id = ${roleId}::uuid and is_system = false
            returning id
          `.execute(transaction);
          if (!updated.rows[0]) throw new IdentityInvariantError('Custom role was not found');
          await sql`
            delete from identity.role_permissions
            where tenant_id = ${context.tenantId}::uuid and role_id = ${roleId}::uuid
          `.execute(transaction);
        }
        for (const permissionCode of permissionCodes) {
          await sql`
            insert into identity.role_permissions (tenant_id, role_id, permission_code)
            values (${context.tenantId}::uuid, ${roleId}::uuid, ${permissionCode})
            on conflict do nothing
          `.execute(transaction);
        }
        return {
          roleId,
          code: validated.code,
          name: validated.name,
          description: validated.description ?? null,
          permissionCodes,
          system: false,
        };
      },
    };
  }

  private async assertTimezone(context: TenantRequestContext, timezone: string): Promise<void> {
    await withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{ valid: boolean }>`
        select exists(select 1 from pg_timezone_names where name = ${timezone}) as valid
      `.execute(transaction);
      if (!result.rows[0]?.valid) throw new IdentityInvariantError('Unknown timezone');
    });
  }

  private profileView(row: ProfileRow): Record<string, unknown> {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      locale: row.locale,
      timezone: row.timezone,
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
