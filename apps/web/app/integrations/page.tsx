import { cookies } from 'next/headers';

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
          This workspace reports real connection records only. Development Web Chat is the sole
          disposable preview fixture; Meta, Shopify, WooCommerce, and production providers are not
          represented as working integrations.
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
                  </span>
                  <small>
                    {connection.lastValidatedAt
                      ? `Validated ${new Date(connection.lastValidatedAt).toLocaleString()}`
                      : 'Not validated yet'}
                    {connection.health?.latencyMs === null || connection.health === null
                      ? ''
                      : ` · ${String(connection.health.latencyMs)} ms`}
                    {connection.lastErrorCode ? ` · ${connection.lastErrorCode}` : ''}
                  </small>
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
  { kind: 'success'; items: IntegrationConnection[] } | { kind: 'error'; detail: string }
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
    return response.ok
      ? { kind: 'success', items: (await response.json()) as IntegrationConnection[] }
      : { kind: 'error', detail: 'Integration API request failed or is not permitted.' };
  } catch {
    return { kind: 'error', detail: 'Integration API is unavailable.' };
  }
}
