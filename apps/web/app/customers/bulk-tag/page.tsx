import { cookies } from 'next/headers';
import { BulkTagForm } from './bulk-tag-form';

export const dynamic = 'force-dynamic';

interface Customer {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}

interface Tag {
  id: string;
  name: string;
}

export default async function BulkTagPage() {
  const result = await loadData();
  return (
    <main className="customers-page">
      <a className="back-link" href="/customers">
        Back to customers
      </a>
      <header className="customer-profile-header">
        <div>
          <p className="eyebrow">CUSTOMER 360</p>
          <h1>Bulk tag customers</h1>
          <p>
            Assignments are permission-checked, audited, idempotent, and limited to 100 customers.
          </p>
        </div>
      </header>
      <section className="customer-card customer-card-wide">
        {result.kind === 'success' ? (
          <BulkTagForm customers={result.customers} tags={result.tags} />
        ) : (
          <p className="muted">Customer or tag data is currently unavailable.</p>
        )}
      </section>
    </main>
  );
}

async function loadData(): Promise<
  | { kind: 'success'; customers: readonly { id: string; name: string }[]; tags: readonly Tag[] }
  | { kind: 'error' }
> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) return { kind: 'error' };
  const headers = { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId };
  try {
    const [customersResponse, tagsResponse] = await Promise.all([
      fetch(new URL('/v1/customers?limit=100', baseUrl), { headers }),
      fetch(new URL('/v1/customers/tags', baseUrl), { headers }),
    ]);
    if (!customersResponse.ok || !tagsResponse.ok) return { kind: 'error' };
    const customers = (await customersResponse.json()) as { items?: Customer[] };
    const tags = (await tagsResponse.json()) as Tag[];
    if (!Array.isArray(customers.items) || !Array.isArray(tags)) return { kind: 'error' };
    return {
      kind: 'success',
      customers: customers.items.map((customer) => ({
        id: customer.id,
        name: customerName(customer),
      })),
      tags,
    };
  } catch {
    return { kind: 'error' };
  }
}

function customerName(customer: Customer): string {
  return (
    customer.displayName ??
    ([customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
      customer.companyName ||
      'Unnamed customer')
  );
}
