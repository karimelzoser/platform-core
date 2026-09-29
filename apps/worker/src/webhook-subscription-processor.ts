import {
  webhookSubscriptionResultSchema,
  type Connector,
  type ConnectorRegistry,
} from '@platform/connectors';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';

const maximumSubscriptionAttempts = 8;

interface ClaimedSubscription {
  id: string;
  tenant_id: string;
  connection_id: string;
  callback_url: string;
  provider_subscription_id: string | null;
  operation: 'REGISTER' | 'UNREGISTER';
}

interface SubscriptionRoute {
  connectorKey: string;
  settings: Record<string, unknown>;
  secretReference: string;
}

function supportsWebhookRegistration(
  connector: Connector,
): connector is Connector & Required<Pick<Connector, 'registerWebhook' | 'unregisterWebhook'>> {
  return (
    typeof connector.registerWebhook === 'function' &&
    typeof connector.unregisterWebhook === 'function'
  );
}

/** Performs provider subscription changes only after the desired state commits. */
export class WebhookSubscriptionProcessor {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly connectors: ConnectorRegistry,
    private readonly workerId: string,
  ) {}

  public async processBatch(batchSize = 25): Promise<number> {
    const claimed = await sql<ClaimedSubscription>`
      select * from integrations.claim_webhook_subscriptions(${this.workerId}, ${batchSize}, 60)
    `.execute(this.database);
    for (const subscription of claimed.rows) {
      try {
        await this.process(subscription);
      } catch {
        await this.recordFailure(subscription);
      }
    }
    return claimed.rows.length;
  }

  private async process(subscription: ClaimedSubscription): Promise<void> {
    const route = await this.resolveRoute(subscription);
    const connector = this.connectors.get(route.connectorKey);
    if (!supportsWebhookRegistration(connector))
      throw new Error(`Connector ${route.connectorKey} does not support webhook subscriptions`);
    if (subscription.operation === 'REGISTER') {
      const result = webhookSubscriptionResultSchema.parse(
        await connector.registerWebhook({
          connectionId: subscription.connection_id,
          callbackUrl: subscription.callback_url,
          settings: route.settings,
          secretReference: route.secretReference,
        }),
      );
      await this.recordSuccess(
        subscription,
        'ACTIVE',
        result.providerSubscriptionId,
        'integrations.webhook.registered',
      );
      return;
    }
    if (!subscription.provider_subscription_id)
      throw new Error('Webhook unregistration is missing a provider subscription identifier');
    await connector.unregisterWebhook({
      connectionId: subscription.connection_id,
      callbackUrl: subscription.callback_url,
      settings: route.settings,
      secretReference: route.secretReference,
      providerSubscriptionId: subscription.provider_subscription_id,
    });
    await this.recordSuccess(subscription, 'REMOVED', null, 'integrations.webhook.unregistered');
  }

  private async resolveRoute(subscription: ClaimedSubscription): Promise<SubscriptionRoute> {
    return withTenantTransaction(
      this.database,
      {
        tenantId: subscription.tenant_id,
        actorId: null,
        subject: 'worker:webhook-subscription',
        requestId: subscription.id,
      },
      async (transaction) => {
        const result = await sql<{
          connector_key: string;
          settings: Record<string, unknown>;
          reference: string | null;
        }>`select connection.connector_key, connection.settings, secret.reference
          from integrations.webhook_subscriptions as subscription
          join integrations.connections as connection
            on connection.tenant_id = subscription.tenant_id and connection.id = subscription.connection_id
          left join integrations.secret_references as secret
            on secret.tenant_id = connection.tenant_id and secret.id = connection.secret_reference_id
          where subscription.id = ${subscription.id}::uuid
            and subscription.claimed_by = ${this.workerId}
            and connection.status in ('CONNECTED', 'DEGRADED')
          for share`.execute(transaction);
        const route = result.rows[0];
        if (!route?.reference)
          throw new Error('Webhook subscription has no dispatchable connection');
        return {
          connectorKey: route.connector_key,
          settings: route.settings,
          secretReference: route.reference,
        };
      },
    );
  }

  private async recordSuccess(
    subscription: ClaimedSubscription,
    state: 'ACTIVE' | 'REMOVED',
    providerSubscriptionId: string | null,
    eventType: string,
  ): Promise<void> {
    await withTenantTransaction(
      this.database,
      {
        tenantId: subscription.tenant_id,
        actorId: null,
        subject: 'worker:webhook-subscription',
        requestId: subscription.id,
      },
      async (transaction) => {
        const updated = await sql<{ id: string }>`update integrations.webhook_subscriptions
          set state = ${state}, provider_subscription_id = ${providerSubscriptionId},
              claimed_by = null, claimed_at = null, last_error = null, updated_at = now(),
              removed_at = case when ${state} = 'REMOVED' then now() else null end
          where id = ${subscription.id}::uuid and claimed_by = ${this.workerId}
          returning id`.execute(transaction);
        if (!updated.rows[0]) return;
        await sql`insert into platform.outbox_events (
          tenant_id, event_type, source, correlation_id, causation_id, actor_type,
          resource_type, resource_id, data, dedupe_key
        ) values (
          ${subscription.tenant_id}::uuid, ${eventType}, 'webhook-subscription-worker',
          ${subscription.id}, ${subscription.id}, 'INTEGRATION',
          'integration.webhook_subscription', ${subscription.id},
          ${JSON.stringify({ connectionId: subscription.connection_id, state })}::jsonb,
          ${`integration:webhook-subscription:${state.toLowerCase()}:${subscription.id}`}
        )`.execute(transaction);
      },
    );
  }

  private async recordFailure(subscription: ClaimedSubscription): Promise<void> {
    await withTenantTransaction(
      this.database,
      {
        tenantId: subscription.tenant_id,
        actorId: null,
        subject: 'worker:webhook-subscription',
        requestId: subscription.id,
      },
      async (transaction) => {
        const updated = await sql<{ attempts: number }>`update integrations.webhook_subscriptions
          set attempts = attempts + 1, state = 'FAILED', last_error = 'CONNECTOR_WEBHOOK_SUBSCRIPTION_FAILED',
              claimed_by = null, claimed_at = null, updated_at = now(),
              next_attempt_at = case when attempts + 1 >= ${maximumSubscriptionAttempts} then 'infinity'::timestamptz
                else now() + make_interval(secs => least(3600, 2 ^ least(attempts + 1, 10))) end
          where id = ${subscription.id}::uuid and claimed_by = ${this.workerId}
          returning attempts`.execute(transaction);
        const failure = updated.rows[0];
        if (!failure || failure.attempts < maximumSubscriptionAttempts) return;
        await sql`insert into platform.dead_letters (
          tenant_id, source, event_type, source_event_id, payload, error_code, error_message, attempts
        ) values (
          ${subscription.tenant_id}::uuid, 'webhook-subscription-worker',
          'integrations.webhook.subscription_requested', ${subscription.id},
          ${JSON.stringify({ connectionId: subscription.connection_id, operation: subscription.operation })}::jsonb,
          'WEBHOOK_SUBSCRIPTION_MAX_ATTEMPTS', 'CONNECTOR_WEBHOOK_SUBSCRIPTION_FAILED', ${failure.attempts}
        )`.execute(transaction);
      },
    );
  }
}
