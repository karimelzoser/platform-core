import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';

const { Pool } = pg;

export interface DatabaseContext {
  tenantId: string;
  actorId: string | null;
  subject: string;
  requestId: string;
}

export type PlatformDatabase = Kysely<Record<string, never>>;

export function createDatabase(connectionString: string, maxConnections = 10): PlatformDatabase {
  return new Kysely({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: maxConnections }) }),
  });
}

/**
 * Installs RLS context with PostgreSQL's transaction-local helper. Callers
 * cannot accidentally leak tenant context across pooled connections.
 */
export async function withTenantTransaction<T>(
  db: PlatformDatabase,
  context: DatabaseContext,
  operation: (transaction: Transaction<Record<string, never>>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (transaction) => {
    await sql`select platform.set_request_context(
      ${context.tenantId}::uuid,
      ${context.actorId}::uuid,
      ${context.subject},
      ${context.requestId}
    )`.execute(transaction);
    return operation(transaction);
  });
}

export async function destroyDatabase(db: PlatformDatabase): Promise<void> {
  await db.destroy();
}

export { resolveTenantAccess, type TenantAccess } from './access.js';
export { sql } from 'kysely';
