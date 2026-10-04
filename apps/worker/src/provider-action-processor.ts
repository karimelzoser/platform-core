import {
  providerActionResultSchema,
  toConnectorError,
  type Connector,
  type ConnectorRegistry,
} from '@platform/connectors';
import {
  sql,
  withTenantTransaction,
  type PlatformDatabase,
  type PlatformTransaction,
} from '@platform/database';

const maximumProviderActionAttempts = 8;

interface ClaimedProviderAction {
  id: string;
  tenant_id: string;
  connection_id: string;
  action_type: string;
  input: Record<string, unknown>;
  attempts: number;
}

interface ProviderActionRoute {
  connectorKey: string;
  settings: Record<string, unknown>;
  secretReference: string;
}

interface CommerceOrderProviderLink {
  store_id: string;
  order_id: string;
  operation: string;
}

function supportsProviderAction(
  connector: Connector,
  actionType: string,
): connector is Connector & Required<Pick<Connector, 'executeAction' | 'supportedActionTypes'>> {
  return (
    typeof connector.executeAction === 'function' &&
    Array.isArray(connector.supportedActionTypes) &&
    connector.supportedActionTypes.includes(actionType)
  );
}

function providerActionFailureDetail(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return `Non-Error rejection: ${String(error)}`;
}

/**
 * Calls only previously committed, typed connector actions. It resolves the
 * tenant route in a short transaction, calls the provider outside it, then
 * records the result, audit event, and outbox event in a new transaction.
 */
export class ProviderActionProcessor {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly connectors: ConnectorRegistry,
    private readonly workerId: string,
  ) {}

  public async processBatch(batchSize = 25): Promise<number> {
    const claimed = await sql<ClaimedProviderAction>`
      select * from integrations.claim_provider_actions(${this.workerId}, ${batchSize}, 60)
    `.execute(this.database);
    for (const action of claimed.rows) {
      try {
        await this.process(action);
      } catch (error) {
        process.stderr.write(
          `[provider-action] id=${action.id} type=${action.action_type} failure=${providerActionFailureDetail(error)}\n`,
        );
        await this.recordFailure(action, error);
      }
    }
    return claimed.rows.length;
  }

  private async process(action: ClaimedProviderAction): Promise<void> {
    const route = await this.resolveRoute(action);
    const connector = this.connectors.get(route.connectorKey);
    if (!supportsProviderAction(connector, action.action_type))
      throw new Error(`Connector ${route.connectorKey} cannot execute this provider action`);
    const result = providerActionResultSchema.parse(
      await connector.executeAction({
        connectionId: action.connection_id,
        actionType: action.action_type,
        input: action.input,
        idempotencyKey: action.id,
        settings: route.settings,
        secretReference: route.secretReference,
      }),
    );
    await this.recordSuccess(action, result.providerActionId, result.result, result.completedAt);
  }

  private async resolveRoute(action: ClaimedProviderAction): Promise<ProviderActionRoute> {
    return withTenantTransaction(
      this.database,
      {
        tenantId: action.tenant_id,
        actorId: null,
        subject: 'worker:provider-action',
        requestId: action.id,
      },
      async (transaction) => {
        const result = await sql<{
          connector_key: string;
          settings: Record<string, unknown>;
          reference: string;
        }>`select connection.connector_key, connection.settings, secret.reference
          from integrations.provider_actions as action
          join integrations.connections as connection
            on connection.tenant_id = action.tenant_id and connection.id = action.connection_id
          join integrations.secret_references as secret
            on secret.tenant_id = connection.tenant_id and secret.id = connection.secret_reference_id
          where action.id = ${action.id}::uuid
            and action.claimed_by = ${this.workerId}
            and connection.status in ('CONNECTED', 'DEGRADED')
            and secret.state in ('ACTIVE', 'ROTATING')
          for share of action, connection, secret`.execute(transaction);
        const route = result.rows[0];
        if (!route) throw new Error('Provider action has no dispatchable connection');
        return {
          connectorKey: route.connector_key,
          settings: route.settings,
          secretReference: route.reference,
        };
      },
    );
  }

  private async recordSuccess(
    action: ClaimedProviderAction,
    providerActionId: string,
    result: Record<string, unknown>,
    completedAt: string,
  ): Promise<void> {
    await withTenantTransaction(
      this.database,
      {
        tenantId: action.tenant_id,
        actorId: null,
        subject: 'worker:provider-action',
        requestId: action.id,
      },
      async (transaction) => {
        const updated = await sql<{ id: string }>`update integrations.provider_actions
          set state = 'SUCCEEDED', provider_action_id = ${providerActionId},
              result = ${JSON.stringify(result)}::jsonb, last_error = null,
              claimed_by = null, claimed_at = null, next_attempt_at = now(),
              finished_at = ${completedAt}::timestamptz, updated_at = now()
          where id = ${action.id}::uuid and claimed_by = ${this.workerId}
          returning id`.execute(transaction);
        if (!updated.rows[0]) return;

        const commerceLink =
          await sql<CommerceOrderProviderLink>`update commerce.order_provider_actions
          set state = 'SUCCEEDED', completed_at = ${completedAt}::timestamptz, updated_at = now()
          where tenant_id = ${action.tenant_id}::uuid and provider_action_id = ${action.id}::uuid
          returning store_id, order_id, operation`.execute(transaction);
        const link = commerceLink.rows[0];
        if (link) {
          await this.refreshOrderProviderSyncState(
            transaction,
            action.tenant_id,
            link.order_id,
            completedAt,
          );
          await sql`insert into commerce.order_timeline (
            tenant_id, store_id, order_id, event_type, actor_type, data
          ) values (
            ${action.tenant_id}::uuid, ${link.store_id}::uuid, ${link.order_id}::uuid,
            'commerce.order.provider_action_succeeded', 'INTEGRATION',
            ${JSON.stringify({
              providerActionId: action.id,
              providerReference: providerActionId,
              operation: link.operation,
            })}::jsonb
          )`.execute(transaction);
        }

        await sql`insert into platform.audit_log (
          tenant_id, actor_type, action, resource_type, resource_id, request_id, correlation_id, metadata
        ) values (
          ${action.tenant_id}::uuid, 'INTEGRATION', 'integrations.provider_action.executed',
          'integration.provider_action', ${action.id}, ${action.id}, ${action.id},
          ${JSON.stringify({ actionType: action.action_type, providerActionId })}::jsonb
        )`.execute(transaction);
        await sql`insert into platform.outbox_events (
          tenant_id, event_type, source, correlation_id, causation_id, actor_type,
          resource_type, resource_id, data, dedupe_key
        ) values (
          ${action.tenant_id}::uuid, 'integrations.provider_action.succeeded', 'provider-action-worker',
          ${action.id}, ${action.id}, 'INTEGRATION', 'integration.provider_action', ${action.id},
          ${JSON.stringify({ actionType: action.action_type, providerActionId })}::jsonb,
          ${`integration:provider-action:succeeded:${action.id}`}
        )`.execute(transaction);
      },
    );
  }

  private async recordFailure(action: ClaimedProviderAction, error: unknown): Promise<void> {
    const failure = toConnectorError(error);
    await withTenantTransaction(
      this.database,
      {
        tenantId: action.tenant_id,
        actorId: null,
        subject: 'worker:provider-action',
        requestId: action.id,
      },
      async (transaction) => {
        const updated = await sql<{
          state: string;
          attempts: number;
        }>`update integrations.provider_actions
          set attempts = case when ${failure.retryable} then attempts + 1 else ${maximumProviderActionAttempts} end,
              state = case when not ${failure.retryable} or attempts + 1 >= ${maximumProviderActionAttempts}
                then 'DEAD_LETTER' else 'FAILED' end,
              last_error = ${failure.code}, claimed_by = null, claimed_at = null,
              next_attempt_at = case when not ${failure.retryable} or attempts + 1 >= ${maximumProviderActionAttempts}
                then 'infinity'::timestamptz
                else now() + make_interval(secs => greatest(
                  ${failure.retryAfterSeconds ?? 0}, least(3600, 2 ^ least(attempts + 1, 10))
                )) end,
              finished_at = case when not ${failure.retryable} or attempts + 1 >= ${maximumProviderActionAttempts}
                then now() else null end,
              updated_at = now()
          where id = ${action.id}::uuid and claimed_by = ${this.workerId}
          returning state, attempts`.execute(transaction);
        const result = updated.rows[0];
        if (!result || result.state !== 'DEAD_LETTER') return;

        const commerceLink =
          await sql<CommerceOrderProviderLink>`update commerce.order_provider_actions
          set state = 'DEAD_LETTER', completed_at = now(), updated_at = now()
          where tenant_id = ${action.tenant_id}::uuid and provider_action_id = ${action.id}::uuid
          returning store_id, order_id, operation`.execute(transaction);
        const link = commerceLink.rows[0];
        if (link) {
          await sql`update commerce.order_workflows
            set provider_sync_state = 'OUT_OF_SYNC', updated_at = now()
            where tenant_id = ${action.tenant_id}::uuid and order_id = ${link.order_id}::uuid`.execute(
            transaction,
          );
          await sql`insert into commerce.order_timeline (
            tenant_id, store_id, order_id, event_type, actor_type, data
          ) values (
            ${action.tenant_id}::uuid, ${link.store_id}::uuid, ${link.order_id}::uuid,
            'commerce.order.provider_action_dead_lettered', 'INTEGRATION',
            ${JSON.stringify({
              providerActionId: action.id,
              operation: link.operation,
              errorCode: failure.code,
              attempts: result.attempts,
            })}::jsonb
          )`.execute(transaction);
        }

        await sql`insert into platform.dead_letters (
          tenant_id, source, event_type, source_event_id, payload, error_code, error_message, attempts
        ) values (
          ${action.tenant_id}::uuid, 'provider-action-worker', 'integrations.provider_action.requested',
          ${action.id}, ${JSON.stringify({ connectionId: action.connection_id, actionType: action.action_type })}::jsonb,
          ${failure.retryable ? 'PROVIDER_ACTION_MAX_ATTEMPTS' : 'PROVIDER_ACTION_NON_RETRYABLE'},
          ${failure.code}, ${result.attempts}
        )`.execute(transaction);
        await sql`insert into platform.outbox_events (
          tenant_id, event_type, source, correlation_id, causation_id, actor_type,
          resource_type, resource_id, data, dedupe_key
        ) values (
          ${action.tenant_id}::uuid, 'integrations.provider_action.dead_lettered', 'provider-action-worker',
          ${action.id}, ${action.id}, 'INTEGRATION', 'integration.provider_action', ${action.id},
          ${JSON.stringify({ actionType: action.action_type, attempts: result.attempts })}::jsonb,
          ${`integration:provider-action:dead-letter:${action.id}`}
        )`.execute(transaction);
      },
    );
  }

  private async refreshOrderProviderSyncState(
    transaction: PlatformTransaction,
    tenantId: string,
    orderId: string,
    completedAt: string,
  ): Promise<void> {
    const states = await sql<{ dead_letter: number; queued: number }>`select
        count(*) filter (where state = 'DEAD_LETTER')::integer as dead_letter,
        count(*) filter (where state = 'QUEUED')::integer as queued
      from commerce.order_provider_actions
      where tenant_id = ${tenantId}::uuid and order_id = ${orderId}::uuid`.execute(transaction);
    const state = states.rows[0] ?? { dead_letter: 0, queued: 0 };
    const providerSyncState =
      state.dead_letter > 0 ? 'OUT_OF_SYNC' : state.queued > 0 ? 'PENDING' : 'IN_SYNC';
    await sql`update commerce.order_workflows
      set provider_sync_state = ${providerSyncState},
          last_provider_sync_at = ${completedAt}::timestamptz,
          updated_at = now()
      where tenant_id = ${tenantId}::uuid and order_id = ${orderId}::uuid`.execute(transaction);
  }
}
