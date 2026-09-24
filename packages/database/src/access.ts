import { sql } from 'kysely';
import { withTenantTransaction, type PlatformDatabase } from './index.js';

export interface TenantAccess {
  userId: string;
  tenantId: string;
  subject: string;
  permissions: readonly string[];
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

      const membershipResult = await sql<{ active: boolean }>`
        select exists(
          select 1 from identity.memberships
          where tenant_id = ${input.tenantId}::uuid
            and user_id = ${user.id}::uuid
            and status = 'ACTIVE'
        ) as active
      `.execute(transaction);
      const membership = membershipResult.rows[0];
      if (!membership) throw new Error('Membership lookup failed');
      if (!membership.active) throw new Error('Inactive tenant membership');

      const permissions = await sql<{ permission_code: string }>`
        select permission_code from identity.current_effective_permissions()
      `.execute(transaction);
      return {
        userId: user.id,
        tenantId: input.tenantId,
        subject: input.subject,
        permissions: permissions.rows.map(({ permission_code }) => permission_code),
      };
    },
  );
}
