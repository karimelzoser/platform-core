import { cookies } from 'next/headers';
import { ConnectionControls } from './connection-controls';
import { DevelopmentProviderActionControls } from './development-provider-action-controls';
import { WebhookSubscriptionControls } from './webhook-subscription-controls';

export const dynamic = 'force-dynamic';

interface IntegrationConnection {
  id: string;
  connectorKey: string;
  displayName: string;
  status: string;
  capabilities: string[];
  lastValidatedAt: string | null;
  lastErrorCode: string | null;
  health: { status: string; checkedAt: string; latencyMs: number | null } | null;
}

interface SyncRun {
  state: string;
  kind: string;
  progress: { pages?: number; items?: number };
  finishedAt: string | null;
}

interface WebhookSubscription {
  id: string;
  callbackUrl: string;
  state: string;
}

interface ProviderAction {
  state: string;
  actionType: string;
  providerActionId: string | null;
  finishedAt: string | null;
}

interface ConnectionView extends IntegrationConnection {
  latestSync: SyncRun | null;
  activeWebhookCount: number;
  webhookSubscriptions: WebhookSubscription[];
  latestProviderAction: ProviderAction | null;
}

export default async function IntegrationsPage() {
  const result = await loadConnections();
  return (
    <main className="customers-page">
      <header className="customer-profile-header">
        <div>
          <p className="eyebrow">INTEGRATIONS</p>
          <h1>Connection health</h1>
          <p>Live tenant-scoped connection state and recorded health checks.</p>
        </div>
      </header>
      <section className="state-panel customer-state" aria-labelledby="integration-preview-heading">
        <h2 id="integration-preview-heading">Provider adapters are under development</h2>
        <p>
          This workspace reports real connection records only. Development Web Chat and Development
          API are disposable preview fixtures; Meta, Shopify, WooCommerce, and production providers
          are not represented as working integrations.
        </p>
      </section>
      {result.kind === 'success' ? (
        result.items.length ? (
          <section
            className="customer-card customer-card-wide"
            aria-label="Integration connections"
          >
            <ul className="detail-list">
              {result.items.map((connection) => (
                <li key={connection.id}>
                  <strong>{connection.displayName}</strong>
                  <span>
                    {connection.connectorKey} · {connection.status}
                    {connection.health ? ` · health ${connection.health.status}` : ''}
                    {connection.latestSync
                      ? ` · ${connection.latestSync.kind.toLowerCase()} sync ${connection.latestSync.state.toLowerCase()}`
                      : ' · no sync recorded'}
                  </span>
                  <small>
                    {connection.lastValidatedAt
                      ? `Validated ${new Date(connection.lastValidatedAt).toLocaleString()}`
                      : 'Not validated yet'}
                    {connection.health?.latencyMs === null || connection.health === null
                      ? ''
                      : ` · ${String(connection.health.latencyMs)} ms`}
                    {connection.lastErrorCode ? ` · ${connection.lastErrorCode}` : ''}
                    {connection.latestSync
                      ? ` · ${String(connection.latestSync.progress.items ?? 0)} item(s)`
                      : ''}
                    {connection.activeWebhookCount
                      ? ` · ${String(connection.activeWebhookCount)} active webhook(s)`
                      : ''}
                    {connection.latestProviderAction
                      ? ` · latest action ${connection.latestProviderAction.actionType} ${connection.latestProviderAction.state.toLowerCase()}`
                      : ''}
                  </small>
                  {connection.status === 'CONNECTED' || connection.status === 'DEGRADED' ? (
                    <>
                      <ConnectionControls connectionId={connection.id} />
                      <WebhookSubscriptionControls
                        connectionId={connection.id}
                        subscriptions={connection.webhookSubscriptions}
                      />
                      {isDevelopmentConnector(connection.connectorKey) ? (
                        <DevelopmentProviderActionControls
                          connectionId={connection.id}
                          connectorKey={connection.connectorKey}
                        />
                      ) : null}
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="state-panel customer-state">
            <h2>No connections yet</h2>
            <p>
              There are no tenant integration records. Provider connection setup is intentionally
              unavailable until its adapter is implemented and reviewed.
            </p>
          </section>
        )
      ) : (
        <section className="state-panel customer-state">
          <h2>Integrations unavailable</h2>
          <p>{result.detail}</p>
        </section>
      )}
    </main>
  );
}

async function loadConnections(): Promise<
  { kind: 'success'; items: ConnectionView[] } | { kind: 'error'; detail: string }
> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { kind: 'error', detail: 'Sign in and select an organization to load integrations.' };
  try {
    const response = await fetch(new URL('/v1/integrations/connections', baseUrl), {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    if (!response.ok)
      return { kind: 'error', detail: 'Integration API request failed or is not permitted.' };
    const connections = (await response.json()) as IntegrationConnection[];
    const items = await Promise.all(
      connections.map(async (connection): Promise<ConnectionView> => {
        const headers = { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId };
        const [syncResponse, webhookResponse, actionResponse] = await Promise.all([
          fetch(
            new URL(
              `/v1/integrations/connections/${encodeURIComponent(connection.id)}/sync-runs`,
              baseUrl,
            ),
            { headers },
          ),
          fetch(
            new URL(
              `/v1/integrations/connections/${encodeURIComponent(connection.id)}/webhook-subscriptions`,
              baseUrl,
            ),
            { headers },
          ),
          fetch(
            new URL(
              `/v1/integrations/connections/${encodeURIComponent(connection.id)}/provider-actions`,
              baseUrl,
            ),
            { headers },
          ),
        ]);
        const syncRuns = syncResponse.ok ? ((await syncResponse.json()) as SyncRun[]) : [];
        const subscriptions = webhookResponse.ok
          ? ((await webhookResponse.json()) as WebhookSubscription[])
          : [];
        const actions = actionResponse.ok
          ? ((await actionResponse.json()) as ProviderAction[])
          : [];
        return {
          ...connection,
          latestSync: syncRuns[0] ?? null,
          webhookSubscriptions: subscriptions,
          activeWebhookCount: subscriptions.filter(
            (subscription) => subscription.state === 'ACTIVE',
          ).length,
          latestProviderAction: actions[0] ?? null,
        };
      }),
    );
    return { kind: 'success', items };
  } catch {
    return { kind: 'error', detail: 'Integration API is unavailable.' };
  }
}

function isDevelopmentConnector(
  connectorKey: string,
): connectorKey is 'development-api' | 'development-web-chat' {
  return connectorKey === 'development-api' || connectorKey === 'development-web-chat';
}
