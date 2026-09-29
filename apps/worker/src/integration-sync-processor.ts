import {
  integrationSyncResultSchema,
  type Connector,
  type ConnectorRegistry,
} from '@platform/connectors';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';

const maximumSyncAttempts = 8;

interface ClaimedSyncRun {
  id: string;
  tenant_id: string;
  connection_id: string;
  kind: 'INITIAL' | 'INCREMENTAL' | 'BACKFILL' | 'RECONCILIATION' | 'MANUAL';
  cursor: Record<string, unknown>;
  attempts: number;
}

interface SyncRoute {
  connectorKey: string;
  settings: Record<string, unknown>;
  secretReference: string;
}

function supportsSync(
  connector: Connector,
): connector is Connector & Required<Pick<Connector, 'sync'>> {
  return typeof connector.sync === 'function';
}

/**
 * Executes a committed integration sync lease. It deliberately resolves the
 * tenant route in a short RLS transaction, invokes the provider outside that
 * transaction, then records the bounded result in a new transaction.
 */
export class IntegrationSyncProcessor {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly connectors: ConnectorRegistry,
    private readonly workerId: string,
  ) {}

  public async processBatch(batchSize = 25): Promise<number> {
    const claimed = await sql<ClaimedSyncRun>`
      select * from integrations.claim_sync_runs(${this.workerId}, ${batchSize}, 60)
    `.execute(this.database);
    for (const run of claimed.rows) {
      try {
        await this.process(run);
      } catch {
        await this.recordFailure(run);
      }
    }
    return claimed.rows.length;
  }

  private async process(run: ClaimedSyncRun): Promise<void> {
    const route = await this.resolveRoute(run);
    const connector = this.connectors.get(route.connectorKey);
    if (!supportsSync(connector))
      throw new Error(`Connector ${route.connectorKey} does not support synchronization`);
    const result = integrationSyncResultSchema.parse(
      await connector.sync({
        connectionId: run.connection_id,
        kind: run.kind,
        cursor: run.cursor,
        settings: route.settings,
        secretReference: route.secretReference,
      }),
    );
    await this.recordResult(run, result);
  }

  private async resolveRoute(run: ClaimedSyncRun): Promise<SyncRoute> {
    return withTenantTransaction(
      this.database,
      {
        tenantId: run.tenant_id,
        actorId: null,
        subject: 'worker:integration-sync',
        requestId: run.id,
      },
      async (transaction) => {
        const result = await sql<{
          connector_key: string;
          settings: Record<string, unknown>;
          reference: string | null;
        }>`select connection.connector_key, connection.settings, secret.reference
          from integrations.sync_runs as run
          join integrations.connections as connection
            on connection.tenant_id = run.tenant_id and connection.id = run.connection_id
          left join integrations.secret_references as secret
            on secret.tenant_id = connection.tenant_id and secret.id = connection.secret_reference_id
          where run.id = ${run.id}::uuid
            and run.claimed_by = ${this.workerId}
            and connection.status in ('CONNECTED', 'DEGRADED')
          for share`.execute(transaction);
        const route = result.rows[0];
        if (!route?.reference) throw new Error('Sync run has no dispatchable connection');
        return {
          connectorKey: route.connector_key,
          settings: route.settings,
          secretReference: route.reference,
        };
      },
    );
  }

  private async recordResult(
    run: ClaimedSyncRun,
    result: { cursor: Record<string, unknown>; pages: number; items: number; hasMore: boolean },
  ): Promise<void> {
    await withTenantTransaction(
      this.database,
      {
        tenantId: run.tenant_id,
        actorId: null,
        subject: 'worker:integration-sync',
        requestId: run.id,
      },
      async (transaction) => {
        const state = result.hasMore ? 'QUEUED' : 'SUCCEEDED';
        const updated = await sql<{ id: string }>`update integrations.sync_runs
          set state = ${state}, cursor = ${JSON.stringify(result.cursor)}::jsonb,
              progress = ${JSON.stringify({ pages: result.pages, items: result.items })}::jsonb,
              claimed_by = null, claimed_at = null, next_attempt_at = now(), last_error = null,
              finished_at = case when ${result.hasMore} then null else now() end
          where id = ${run.id}::uuid and claimed_by = ${this.workerId}
          returning id`.execute(transaction);
        if (!updated.rows[0]) return;
        await sql`insert into platform.outbox_events (
          tenant_id, event_type, source, correlation_id, causation_id, actor_type,
          resource_type, resource_id, data, dedupe_key
        ) values (
          ${run.tenant_id}::uuid,
          ${result.hasMore ? 'integration.sync.progressed' : 'integration.sync.succeeded'},
          'integration-sync-worker', ${run.id}, ${run.id}, 'INTEGRATION',
          'integration.sync_run', ${run.id},
          ${JSON.stringify({ pages: result.pages, items: result.items, hasMore: result.hasMore })}::jsonb,
          ${`integration:sync:${result.hasMore ? 'progressed' : 'succeeded'}:${run.id}:${String(run.attempts)}`}
        )`.execute(transaction);
      },
    );
  }

  private async recordFailure(run: ClaimedSyncRun): Promise<void> {
    await withTenantTransaction(
      this.database,
      {
        tenantId: run.tenant_id,
        actorId: null,
        subject: 'worker:integration-sync',
        requestId: run.id,
      },
      async (transaction) => {
        const updated = await sql<{ attempts: number }>`update integrations.sync_runs
          set attempts = attempts + 1,
              state = 'FAILED',
              last_error = 'CONNECTOR_SYNC_FAILED',
              claimed_by = null, claimed_at = null,
              next_attempt_at = case when attempts + 1 >= ${maximumSyncAttempts} then 'infinity'::timestamptz
                else now() + make_interval(secs => least(3600, 2 ^ least(attempts + 1, 10))) end,
              finished_at = case when attempts + 1 >= ${maximumSyncAttempts} then now() else null end
          where id = ${run.id}::uuid and claimed_by = ${this.workerId}
          returning attempts`.execute(transaction);
        const failure = updated.rows[0];
        if (!failure) return;
        if (failure.attempts < maximumSyncAttempts) return;
        await sql`insert into platform.dead_letters (
          tenant_id, source, event_type, source_event_id, payload, error_code, error_message, attempts
        ) values (
          ${run.tenant_id}::uuid, 'integration-sync-worker', 'integration.sync.requested', ${run.id},
          ${JSON.stringify({ connectionId: run.connection_id, kind: run.kind })}::jsonb,
          'INTEGRATION_SYNC_MAX_ATTEMPTS', 'CONNECTOR_SYNC_FAILED', ${failure.attempts}
        )`.execute(transaction);
        await sql`insert into platform.outbox_events (
          tenant_id, event_type, source, correlation_id, causation_id, actor_type,
          resource_type, resource_id, data, dedupe_key
        ) values (
          ${run.tenant_id}::uuid, 'integration.sync.dead_lettered', 'integration-sync-worker',
          ${run.id}, ${run.id}, 'INTEGRATION', 'integration.sync_run', ${run.id},
          ${JSON.stringify({ attempts: failure.attempts })}::jsonb,
          ${`integration:sync:dead-letter:${run.id}`}
        )`.execute(transaction);
      },
    );
  }
}
