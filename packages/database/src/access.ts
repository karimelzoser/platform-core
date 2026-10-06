import { sql } from 'kysely';
import { withTenantTransaction, type PlatformDatabase } from './index.js';

export interface TenantAccess {
  userId: string;
  membershipId: string;
  tenantId: string;
  tenantName: string;
  subject: string;
  permissions: readonly string[];
  roleCodes: readonly string[];
  mfaPolicy: 'OPTIONAL' | 'REQUIRED_FOR_PRIVILEGED' | 'REQUIRED_FOR_ALL';
}

/** Resolves only an active membership inside transaction-local RLS context. */
export async function resolveTenantAccess(
  db: PlatformDatabase,
  input: { tenantId: string; subject: string; requestId: string },
): Promise<TenantAccess> {
  return withTenantTransaction(
    db,
    { tenantId: input.tenantId, actorId: null, subject: input.subject, requestId: input.requestId },
    async (transaction) => {
      const userResult = await sql<{ id: string }>`
        select id from identity.users where keycloak_subject = ${input.subject}
      `.execute(transaction);
      const user = userResult.rows[0];
      if (!user) throw new Error('Unknown application user');

      const membershipResult = await sql<{ id: string }>`
        select id
        from identity.memberships
        where tenant_id = ${input.tenantId}::uuid
          and user_id = ${user.id}::uuid
          and status = 'ACTIVE'
      `.execute(transaction);
      const membership = membershipResult.rows[0];
      if (!membership) throw new Error('Inactive tenant membership');

      const organizationResult = await sql<{
        name: string;
        mfa_policy: TenantAccess['mfaPolicy'];
      }>`
        select name, mfa_policy
        from identity.organizations
        where id = ${input.tenantId}::uuid and status = 'ACTIVE'
      `.execute(transaction);
      const organization = organizationResult.rows[0];
      if (!organization) throw new Error('Inactive tenant organization');

      const roleResult = await sql<{ code: string }>`
        select distinct role.code
        from identity.membership_roles membership_role
        join identity.roles role
          on role.tenant_id = membership_role.tenant_id
         and role.id = membership_role.role_id
        where membership_role.tenant_id = ${input.tenantId}::uuid
          and membership_role.membership_id = ${membership.id}::uuid
        order by role.code
      `.execute(transaction);

      const permissions = await sql<{ permission_code: string }>`
        select permission_code from identity.current_effective_permissions()
      `.execute(transaction);
      return {
        userId: user.id,
        membershipId: membership.id,
        tenantId: input.tenantId,
        tenantName: organization.name,
        subject: input.subject,
        permissions: permissions.rows.map(({ permission_code }) => permission_code),
        roleCodes: roleResult.rows.map(({ code }) => code),
        mfaPolicy: organization.mfa_policy,
      };
    },
  );
}
