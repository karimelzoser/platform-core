import Link from 'next/link';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface OrderItem {
  id: string;
  storeId: string;
  customerId: string | null;
  orderNumber: string;
  status: string;
  financialStatus: string;
  fulfillmentStatus: string;
  currency: string;
  totalMinor: string;
  createdAt: string;
  updatedAt: string;
}

interface StoreItem {
  id: string;
  name: string;
  status: string;
  defaultCurrency: string;
}

export default async function OrdersPage() {
  const [orders, stores] = await Promise.all([loadOrders(), loadStores()]);
  const storeNames = new Map(
    stores.kind === 'success' ? stores.items.map((store) => [store.id, store.name] as const) : [],
  );
  return (
    <main className="customers-page">
      <header className="customer-profile-header">
        <div>
          <p className="eyebrow">COMMERCE</p>
          <h1>Orders</h1>
          <p>
            Canonical, tenant-isolated order operations with confirmation, duplicate protection,
            guarded changes, cancellation, and provider synchronization.
          </p>
        </div>
      </header>

      {stores.kind === 'success' && stores.items.length ? (
        <section className="order-summary-strip" aria-label="Connected canonical stores">
          {stores.items.map((store) => (
            <div className="order-summary-metric" key={store.id}>
              <strong>{store.name}</strong>
              <span>{store.status}</span>
              <small>{store.defaultCurrency}</small>
            </div>
          ))}
        </section>
      ) : null}

      {orders.kind === 'success' ? (
        orders.items.length ? (
          <section className="customer-card customer-card-wide order-list-card">
            <div className="order-table" role="table" aria-label="Orders">
              <div className="order-table-row order-table-head" role="row">
                <span role="columnheader">Order</span>
                <span role="columnheader">Store</span>
                <span role="columnheader">Commercial state</span>
                <span role="columnheader">Total</span>
                <span role="columnheader">Updated</span>
              </div>
              {orders.items.map((order) => (
                <Link
                  className="order-table-row order-table-link"
                  href={`/orders/${order.id}`}
                  key={order.id}
                >
                  <span>
                    <strong>{order.orderNumber}</strong>
                    <small>{order.id}</small>
                  </span>
                  <span>{storeNames.get(order.storeId) ?? order.storeId}</span>
                  <span>
                    {order.status}
                    <small>
                      {order.financialStatus} · {order.fulfillmentStatus}
                    </small>
                  </span>
                  <span>{formatMoney(order.totalMinor, order.currency)}</span>
                  <span>{new Date(order.updatedAt).toLocaleString()}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <section className="state-panel customer-state">
            <h2>No canonical orders yet</h2>
            <p>
              Orders appear here after provider synchronization or canonical order creation. The
              workspace deliberately does not fabricate provider data.
            </p>
          </section>
        )
      ) : (
        <section className="state-panel customer-state">
          <h2>Orders unavailable</h2>
          <p>{orders.detail}</p>
        </section>
      )}
    </main>
  );
}

async function loadOrders(): Promise<
  { kind: 'success'; items: OrderItem[] } | { kind: 'error'; detail: string }
> {
  const session = await sessionHeaders();
  if (!session) return { kind: 'error', detail: 'Sign in and select an organization.' };
  try {
    const response = await fetch(new URL('/v1/commerce/orders?limit=100', session.baseUrl), {
      headers: session.headers,
      cache: 'no-store',
    });
    if (!response.ok) return { kind: 'error', detail: 'Commerce order request failed.' };
    const payload = (await response.json()) as { items?: OrderItem[] };
    return { kind: 'success', items: Array.isArray(payload.items) ? payload.items : [] };
  } catch {
    return { kind: 'error', detail: 'Commerce API is unavailable.' };
  }
}

async function loadStores(): Promise<{ kind: 'success'; items: StoreItem[] } | { kind: 'error' }> {
  const session = await sessionHeaders();
  if (!session) return { kind: 'error' };
  try {
    const response = await fetch(new URL('/v1/commerce/stores', session.baseUrl), {
      headers: session.headers,
      cache: 'no-store',
    });
    if (!response.ok) return { kind: 'error' };
    const payload = (await response.json()) as { items?: StoreItem[] };
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

function formatMoney(minor: string, currency: string): string {
  const value = Number(minor);
  if (!Number.isSafeInteger(value)) return `${minor} ${currency}`;
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(value / 100);
}
