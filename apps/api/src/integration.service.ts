import { createHash, randomUUID } from 'node:crypto';
import {
  CommandExecutor,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import { ConnectorRegistry } from '@platform/connectors';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';
import { z } from 'zod';

const connectInputSchema = z.object({
  connectorKey: z.string().regex(/^[a-z][a-z0-9-]*$/),
  displayName: z.string().trim().min(1).max(200),
  secretReference: z.string().trim().min(1).max(500),
  keyVersion: z.string().trim().min(1).max(100),
  settings: z.record(z.unknown()).default({}),
});

export type ConnectIntegrationInput = z.input<typeof connectInputSchema>;

const secretRotationInputSchema = z.object({
  secretReference: z.string().trim().min(1).max(500),
  keyVersion: z.string().trim().min(1).max(100),
});

export type SecretRotationInput = z.input<typeof secretRotationInputSchema>;

export interface IntegrationConnection {
  id: string;
  connectorKey: string;
  displayName: string;
  status: 'PENDING' | 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED' | 'REVOKED' | 'FAILED';
  capabilities: readonly string[];
  lastValidatedAt: Date | null;
  lastErrorCode: string | null;
  health: {
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
    checkedAt: Date;
    latencyMs: number | null;
  } | null;
}

/**
 * Tenant-scoped connection lifecycle. The only credential value accepted here
 * is an opaque secret-manager reference; validation occurs before the command
 * transaction and secrets never enter audit or outbox records.
 */
export class IntegrationService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
    private readonly connectors: ConnectorRegistry,
  ) {}

  public async list(context: TenantRequestContext): Promise<readonly IntegrationConnection[]> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        id: string;
        connector_key: string;
        display_name: string;
        status: IntegrationConnection['status'];
        capabilities: unknown;
        last_validated_at: Date | null;
        last_error_code: string | null;
        health_status: IntegrationConnection['health'] extends { status: infer Status }
          ? Status
          : never;
        health_checked_at: Date | null;
        latency_ms: number | null;
      }>`select connection.id, connection.connector_key, connection.display_name, connection.status,
          connection.capabilities, connection.last_validated_at, connection.last_error_code,
          health.status as health_status, health.checked_at as health_checked_at, health.latency_ms
        from integrations.connections as connection
        left join integrations.connection_health as health
          on health.tenant_id = connection.tenant_id and health.connection_id = connection.id
        order by lower(connection.display_name), connection.id`.execute(transaction);
      return result.rows.map((connection) => ({
        id: connection.id,
        connectorKey: connection.connector_key,
        displayName: connection.display_name,
        status: connection.status,
        capabilities: parseCapabilities(connection.capabilities),
        lastValidatedAt: connection.last_validated_at,
        lastErrorCode: connection.last_error_code,
        health:
          connection.health_checked_at === null
            ? null
            : {
                status: connection.health_status,
                checkedAt: connection.health_checked_at,
                latencyMs: connection.latency_ms,
              },
      }));
    });
  }

  public async connect(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: ConnectIntegrationInput,
    approvalId?: string,
  ): Promise<CommandResult<{ connectionId: string; status: 'CONNECTED' }>> {
    const validated = connectInputSchema.parse(input);
    const connector = this.connectors.get(validated.connectorKey);
    await connector.validateConnection({
      settings: validated.settings,
      secretReference: validated.secretReference,
    });
    const connectionId = randomUUID();
    const secretReferenceId = randomUUID();
    const capabilities = [...connector.manifest.capabilities];

    return this.commands.execute(
      {
        action: 'integrations.connection.connect',
        permission: 'integrations.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'integration.connection', id: connectionId }),
        event: {
          type: 'integration.connection.connected',
          data: (_input, result) => ({
            connectionId: result.connectionId,
            connectorKey: validated.connectorKey,
          }),
          dedupeKey: () => `integration:connection:connected:${connectionId}`,
        },
        audit: {
          afterState: (_input, result) => ({
            connectionId: result.connectionId,
            connectorKey: validated.connectorKey,
            displayName: validated.displayName,
            status: 'CONNECTED',
          }),
          metadata: () => ({ keyVersion: validated.keyVersion }),
        },
        execute: async (transaction) => {
          const definition = await sql<{ key: string }>`select key
            from integrations.connector_definitions
            where key = ${validated.connectorKey} and enabled
            for share`.execute(transaction);
          if (!definition.rows[0])
            throw new Error('Connector is not available in this environment');
          await sql`insert into integrations.secret_references (
            id, tenant_id, provider, reference, key_version, metadata
          ) values (
            ${secretReferenceId}::uuid, ${context.tenantId}::uuid, ${validated.connectorKey},
            ${validated.secretReference}, ${validated.keyVersion}, '{"referenceOnly":true}'::jsonb
          )`.execute(transaction);
          await sql`insert into integrations.connections (
            id, tenant_id, connector_key, secret_reference_id, display_name, status,
            settings, capabilities, last_validated_at
          ) values (
            ${connectionId}::uuid, ${context.tenantId}::uuid, ${validated.connectorKey},
            ${secretReferenceId}::uuid, ${validated.displayName}, 'CONNECTED',
            ${JSON.stringify(validated.settings)}::jsonb, ${JSON.stringify(capabilities)}::jsonb, now()
          )`.execute(transaction);
          return { connectionId, status: 'CONNECTED' as const };
        },
      },
      {
        context,
        input: {
          connectorKey: validated.connectorKey,
          displayName: validated.displayName,
          keyVersion: validated.keyVersion,
          secretReferenceFingerprint: secretReferenceFingerprint(validated.secretReference),
          settings: validated.settings,
        },
        idempotencyKey,
        ...(approvalId ? { approvalId } : {}),
      },
    );
  }

  public async disconnect(
    context: TenantRequestContext,
    idempotencyKey: string,
    connectionId: string,
    approvalId?: string,
  ): Promise<CommandResult<{ connectionId: string; status: 'DISCONNECTED' }>> {
    const id = z.string().uuid().parse(connectionId);
    return this.commands.execute(
      {
        action: 'integrations.connection.disconnect',
        permission: 'integrations.manage',
        risk: 'HIGH',
        resource: () => ({ type: 'integration.connection', id }),
        event: {
          type: 'integration.connection.disconnected',
          data: (_input, result) => result,
          dedupeKey: () => `integration:connection:disconnected:${id}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const updated = await sql<{ id: string }>`update integrations.connections
            set status = 'DISCONNECTED', updated_at = now()
            where id = ${id}::uuid and status <> 'REVOKED'
            returning id`.execute(transaction);
          if (!updated.rows[0]) throw new Error('Connection was not found or has been revoked');
          return { connectionId: id, status: 'DISCONNECTED' as const };
        },
      },
      {
        context,
        input: { connectionId: id },
        idempotencyKey,
        ...(approvalId ? { approvalId } : {}),
      },
    );
  }

  public async rotateSecret(
    context: TenantRequestContext,
    idempotencyKey: string,
    connectionId: string,
    input: SecretRotationInput,
    approvalId?: string,
  ): Promise<CommandResult<{ connectionId: string; keyVersion: string }>> {
    const id = z.string().uuid().parse(connectionId);
    const validated = secretRotationInputSchema.parse(input);
    const target = await withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        connector_key: string;
        settings: Record<string, unknown>;
        secret_reference_id: string;
      }>`select connector_key, settings, secret_reference_id
        from integrations.connections where id = ${id}::uuid for share`.execute(transaction);
      return result.rows[0];
    });
    if (!target?.secret_reference_id)
      throw new Error('Connection was not found or has no secret reference');
    const connector = this.connectors.get(target.connector_key);
    await connector.validateConnection({
      settings: target.settings,
      secretReference: validated.secretReference,
    });
    const newReferenceId = randomUUID();
    return this.commands.execute(
      {
        action: 'integrations.connection.secret.rotate',
        permission: 'integrations.secrets.rotate',
        risk: 'CRITICAL',
        resource: () => ({ type: 'integration.connection', id }),
        event: {
          type: 'integration.connection.secret_rotated',
          data: (_input, result) => result,
          dedupeKey: () => `integration:connection:secret-rotated:${id}:${newReferenceId}`,
        },
        audit: {
          afterState: (_input, result) => result,
          metadata: () => ({ connectorKey: target.connector_key }),
        },
        execute: async (transaction) => {
          await sql`insert into integrations.secret_references (
            id, tenant_id, provider, reference, key_version, state, metadata, rotated_at
          ) values (
            ${newReferenceId}::uuid, ${context.tenantId}::uuid, ${target.connector_key},
            ${validated.secretReference}, ${validated.keyVersion}, 'ACTIVE',
            '{"referenceOnly":true}'::jsonb, now()
          )`.execute(transaction);
          const updated = await sql<{
            id: string;
            secret_reference_id: string;
          }>`update integrations.connections
            set secret_reference_id = ${newReferenceId}::uuid, last_validated_at = now(),
                last_error_code = null, last_error_detail = null, updated_at = now()
            where id = ${id}::uuid and secret_reference_id = ${target.secret_reference_id}::uuid
            returning id, secret_reference_id`.execute(transaction);
          if (!updated.rows[0]) throw new Error('Connection changed during secret rotation');
          const remaining = await sql<{ count: number }>`select count(*)::integer as count
            from integrations.connections where secret_reference_id = ${target.secret_reference_id}::uuid`.execute(
            transaction,
          );
          await sql`update integrations.secret_references
            set state = case when ${remaining.rows[0]?.count ?? 0} = 0 then 'REVOKED' else 'ACTIVE' end,
                revoked_at = case when ${remaining.rows[0]?.count ?? 0} = 0 then now() else null end,
                rotated_at = now()
            where id = ${target.secret_reference_id}::uuid`.execute(transaction);
          return { connectionId: id, keyVersion: validated.keyVersion };
        },
      },
      {
        context,
        input: {
          connectionId: id,
          keyVersion: validated.keyVersion,
          secretReferenceFingerprint: secretReferenceFingerprint(validated.secretReference),
        },
        idempotencyKey,
        ...(approvalId ? { approvalId } : {}),
      },
    );
  }

  public async checkHealth(
    context: TenantRequestContext,
    idempotencyKey: string,
    connectionId: string,
  ): Promise<
    CommandResult<{
      connectionId: string;
      status: 'HEALTHY' | 'UNHEALTHY';
      latencyMs: number | null;
    }>
  > {
    const id = z.string().uuid().parse(connectionId);
    const target = await withTenantTransaction(this.database, context, async (transaction) => {
      const result = await sql<{
        connector_key: string;
        settings: Record<string, unknown>;
        reference: string | null;
      }>`select connection.connector_key, connection.settings, secret.reference
        from integrations.connections as connection
        left join integrations.secret_references as secret
          on secret.tenant_id = connection.tenant_id and secret.id = connection.secret_reference_id
        where connection.id = ${id}::uuid
        for share`.execute(transaction);
      return result.rows[0];
    });
    if (!target?.reference) throw new Error('Connection was not found or has no secret reference');
    const connector = this.connectors.get(target.connector_key);
    let status: 'HEALTHY' | 'UNHEALTHY' = 'HEALTHY';
    let latencyMs: number | null = null;
    try {
      latencyMs = (
        await connector.health({
          settings: target.settings,
          secretReference: target.reference,
        })
      ).latencyMs;
    } catch {
      status = 'UNHEALTHY';
    }
    return this.commands.execute(
      {
        action: 'integrations.connection.health_check',
        permission: 'integrations.read',
        risk: 'LOW',
        resource: () => ({ type: 'integration.connection', id }),
        event: {
          type: 'integration.connection.health_recorded',
          data: (_input, result) => result,
          dedupeKey: () => `integration:connection:health:${id}:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          await sql`insert into integrations.connection_health (
            tenant_id, connection_id, status, checked_at, latency_ms, detail
          ) values (
            ${context.tenantId}::uuid, ${id}::uuid, ${status}, now(), ${latencyMs},
            ${JSON.stringify(status === 'HEALTHY' ? {} : { code: 'CONNECTOR_HEALTH_CHECK_FAILED' })}::jsonb
          ) on conflict (tenant_id, connection_id) do update
            set status = excluded.status, checked_at = excluded.checked_at,
                latency_ms = excluded.latency_ms, detail = excluded.detail`.execute(transaction);
          const updated = await sql<{ id: string }>`update integrations.connections
            set status = case
                  when status in ('CONNECTED', 'DEGRADED') and ${status} = 'HEALTHY' then 'CONNECTED'
                  when status in ('CONNECTED', 'DEGRADED') and ${status} = 'UNHEALTHY' then 'DEGRADED'
                  else status end,
                last_error_code = case when ${status} = 'UNHEALTHY'
                  then 'CONNECTOR_HEALTH_CHECK_FAILED' else null end,
                last_error_detail = null,
                updated_at = now()
            where id = ${id}::uuid
            returning id`.execute(transaction);
          if (!updated.rows[0]) throw new Error('Connection was not found');
          return { connectionId: id, status, latencyMs };
        },
      },
      { context, input: { connectionId: id }, idempotencyKey },
    );
  }
}

function parseCapabilities(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((capability): capability is string => typeof capability === 'string');
}

function secretReferenceFingerprint(reference: string): string {
  return createHash('sha256').update(reference).digest('hex');
}
