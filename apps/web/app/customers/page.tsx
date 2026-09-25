import type { Metadata } from 'next';
import { cookies } from 'next/headers';

export const metadata: Metadata = { title: 'Customer 360 | Platform' };

interface CustomerListItem {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  status: string;
  updatedAt: string;
}

interface CustomerResponse {
  items: readonly CustomerListItem[];
  nextOffset?: number;
}

interface CustomerPageProps {
  searchParams: Promise<{ search?: string; offset?: string }>;
}

export default async function CustomersPage({ searchParams }: CustomerPageProps) {
  const query = await searchParams;
  const search = query.search?.trim() ?? '';
  const offset = safeOffset(query.offset);
  const result = await loadCustomers({ search, offset });

  return (
    <main className="customers-page" aria-labelledby="customers-title">
      <header className="customers-header">
        <div>
          <p className="eyebrow">CUSTOMER 360</p>
          <h1 id="customers-title">Customers</h1>
          <p>Live customer profiles, identities, contact points, preferences, and history.</p>
        </div>
        <a className="action" href="/customers/new">
          Create customer
        </a>
        <a className="action" href="/segments">
          Segments
        </a>
      </header>

      <form className="customer-search" action="/customers" method="get" role="search">
        <label htmlFor="customer-search">Search customers</label>
        <div>
          <input
            defaultValue={search}
            id="customer-search"
            name="search"
            placeholder="Name or company"
            type="search"
          />
          <button type="submit">Search</button>
        </div>
      </form>

      <CustomerResults result={result} search={search} offset={offset} />
    </main>
  );
}

function CustomerResults({
  result,
  search,
  offset,
}: {
  result: CustomerLoadResult;
  search: string;
  offset: number;
}) {
  if (result.kind === 'authentication_required') {
    return (
      <StatePanel
        title="Sign in to view customers"
        detail="Select an organization after signing in."
      />
    );
  }
  if (result.kind === 'configuration_error') {
    return (
      <StatePanel
        title="Customer workspace is not configured"
        detail="Set the server-only API_INTERNAL_URL before loading tenant data."
      />
    );
  }
  if (result.kind === 'error') {
    return <StatePanel title="Customers could not be loaded" detail={result.detail} retry />;
  }
  if (result.data.items.length === 0) {
    return (
      <StatePanel
        title={search ? 'No customers match this search' : 'No customers yet'}
        detail={
          search
            ? 'Try a different name or company.'
            : 'Create the first customer profile for this organization.'
        }
      />
    );
  }
  return (
    <section className="customer-table-wrap" aria-label="Customer results">
      <table className="customer-table">
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col">Company</th>
            <th scope="col">Status</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {result.data.items.map((customer) => (
            <tr key={customer.id}>
              <td data-label="Customer">
                <a href={`/customers/${customer.id}`}>{customerName(customer)}</a>
              </td>
              <td data-label="Company">{customer.companyName ?? '—'}</td>
              <td data-label="Status">
                <span className="status-pill">{customer.status}</span>
              </td>
              <td data-label="Updated">{formatDate(customer.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <nav className="customer-pagination" aria-label="Customer pagination">
        {offset > 0 ? <a href={pageHref(search, Math.max(0, offset - 25))}>Previous</a> : <span />}
        {result.data.nextOffset !== undefined ? (
          <a href={pageHref(search, result.data.nextOffset)}>Next</a>
        ) : (
          <span />
        )}
      </nav>
    </section>
  );
}

function StatePanel({
  title,
  detail,
  retry = false,
}: {
  title: string;
  detail: string;
  retry?: boolean;
}) {
  return (
    <section className="state-panel customer-state" aria-live="polite">
      <h2>{title}</h2>
      <p>{detail}</p>
      {retry ? (
        <a className="action" href="/customers">
          Try again
        </a>
      ) : null}
    </section>
  );
}

type CustomerLoadResult =
  | { kind: 'success'; data: CustomerResponse }
  | { kind: 'authentication_required' }
  | { kind: 'configuration_error' }
  | { kind: 'error'; detail: string };

async function loadCustomers(input: {
  search: string;
  offset: number;
}): Promise<CustomerLoadResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get('platform_access_token')?.value;
  const tenantId = cookieStore.get('platform_tenant_id')?.value;
  if (!token || !tenantId) return { kind: 'authentication_required' };
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!baseUrl) return { kind: 'configuration_error' };
  const url = new URL('/v1/customers', baseUrl);
  if (input.search) url.searchParams.set('search', input.search);
  if (input.offset) url.searchParams.set('offset', String(input.offset));
  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    if (response.status === 401 || response.status === 403)
      return { kind: 'authentication_required' };
    if (!response.ok)
      return { kind: 'error', detail: `The API returned ${String(response.status)}.` };
    return { kind: 'success', data: (await response.json()) as CustomerResponse };
  } catch {
    return { kind: 'error', detail: 'The customer API is currently unavailable.' };
  }
}

function customerName(customer: CustomerListItem): string {
  return (
    customer.displayName ??
    ([customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Unnamed customer')
  );
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? '—' : parsed.toLocaleDateString();
}

function pageHref(search: string, offset: number): string {
  const parameters = new URLSearchParams();
  if (search) parameters.set('search', search);
  if (offset) parameters.set('offset', String(offset));
  const query = parameters.toString();
  return query ? `/customers?${query}` : '/customers';
}

function safeOffset(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}
