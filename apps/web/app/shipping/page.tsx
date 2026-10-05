import Link from 'next/link';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface ShipmentItem {
  id: string;
  storeId: string;
  orderId: string;
  fulfillmentId: string;
  status: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  estimatedDeliveryAt: string | null;
  providerSyncState: string;
  updatedAt: string;
}

interface OrderItem {
  id: string;
  orderNumber: string;
}

export default async function ShippingPage() {
  const [shipments, orders] = await Promise.all([loadShipments(), loadOrders()]);
  const orderNumbers = new Map(
    orders.kind === 'success'
      ? orders.items.map((order) => [order.id, order.orderNumber] as const)
      : [],
  );
  const items = shipments.kind === 'success' ? shipments.items : [];
  const exceptions = items.filter((item) => item.status === 'EXCEPTION').length;
  const syncPending = items.filter((item) => item.providerSyncState !== 'IN_SYNC').length;
  const active = items.filter(
    (item) => !['DELIVERED', 'RETURNED', 'CANCELLED'].includes(item.status),
  ).length;

  return (
    <main className="customers-page">
      <header className="customer-profile-header">
        <div>
          <p className="eyebrow">SHIPPING</p>
          <h1>Shipping operations</h1>
          <p>
            Carrier-neutral fulfillment visibility, tracking normalization, provider sync health,
            and delivery rescue from one tenant-isolated workspace.
          </p>
        </div>
      </header>

      {shipments.kind === 'success' ? (
        <section className="shipping-summary-strip" aria-label="Shipping operations summary">
          <SummaryMetric label="Shipments" value={String(items.length)} />
          <SummaryMetric label="Active" value={String(active)} />
          <SummaryMetric label="Exceptions" value={String(exceptions)} />
          <SummaryMetric label="Provider sync attention" value={String(syncPending)} />
        </section>
      ) : null}

      {shipments.kind === 'success' ? (
        items.length ? (
          <section className="customer-card customer-card-wide order-list-card">
            <div className="order-table" role="table" aria-label="Shipments">
              <div className="order-table-row order-table-head shipping-list-row" role="row">
                <span role="columnheader">Shipment</span>
                <span role="columnheader">Order</span>
                <span role="columnheader">State</span>
                <span role="columnheader">Provider sync</span>
                <span role="columnheader">Delivery / updated</span>
              </div>
              {items.map((shipment) => (
                <Link
                  className="order-table-row order-table-link shipping-list-row"
                  href={`/shipping/${shipment.id}`}
                  key={shipment.id}
                >
                  <span>
                    <strong>{shipment.trackingNumber ?? 'Tracking pending'}</strong>
                    <small>{shipment.id}</small>
                  </span>
                  <span>
                    {orderNumbers.get(shipment.orderId) ?? shipment.orderId}
                    <small>{shipment.fulfillmentId}</small>
                  </span>
                  <span>
                    <Status value={shipment.status} />
                  </span>
                  <span>{shipment.providerSyncState}</span>
                  <span>
                    {shipment.estimatedDeliveryAt
                      ? `ETA ${new Date(shipment.estimatedDeliveryAt).toLocaleString()}`
                      : 'ETA unavailable'}
                    <small>Updated {new Date(shipment.updatedAt).toLocaleString()}</small>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <section className="state-panel customer-state">
            <h2>No canonical shipments yet</h2>
            <p>
              Shipments appear here after fulfillment enters the provider-neutral shipping domain.
              The workspace never fabricates carrier data.
            </p>
          </section>
        )
      ) : (
        <section className="state-panel customer-state">
          <h2>Shipping unavailable</h2>
          <p>{shipments.detail}</p>
        </section>
      )}
    </main>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="order-summary-metric">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const className = value === 'EXCEPTION' ? 'status-pill shipping-status-exception' : 'status-pill';
  return <span className={className}>{value}</span>;
}

async function loadShipments(): Promise<
  { kind: 'success'; items: ShipmentItem[] } | { kind: 'error'; detail: string }
> {
  const session = await sessionHeaders();
  if (!session) return { kind: 'error', detail: 'Sign in and select an organization.' };
  try {
    const response = await fetch(new URL('/v1/shipping/shipments?limit=100', session.baseUrl), {
      headers: session.headers,
      cache: 'no-store',
    });
    if (!response.ok) return { kind: 'error', detail: 'Shipping request failed.' };
    const payload = (await response.json()) as { items?: ShipmentItem[] };
    return { kind: 'success', items: Array.isArray(payload.items) ? payload.items : [] };
  } catch {
    return { kind: 'error', detail: 'Shipping API is unavailable.' };
  }
}

async function loadOrders(): Promise<
  { kind: 'success'; items: OrderItem[] } | { kind: 'error' }
> {
  const session = await sessionHeaders();
  if (!session) return { kind: 'error' };
  try {
    const response = await fetch(new URL('/v1/commerce/orders?limit=100', session.baseUrl), {
      headers: session.headers,
      cache: 'no-store',
    });
    if (!response.ok) return { kind: 'error' };
    const payload = (await response.json()) as { items?: OrderItem[] };
    return { kind: 'success', items: Array.isArray(payload.items) ? payload.items : [] };
  } catch {
    return { kind: 'error' };
  }
}

async function sessionHeaders(): Promise<
  { baseUrl: string; headers: Record<string, string> } | undefined
> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) return undefined;
  return {
    baseUrl,
    headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
  };
}
