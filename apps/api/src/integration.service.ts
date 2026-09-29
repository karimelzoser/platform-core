import { randomUUID } from 'node:crypto';
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
}

function parseCapabilities(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((capability): capability is string => typeof capability === 'string');
}
