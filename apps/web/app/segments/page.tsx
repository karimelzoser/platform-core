import { cookies } from 'next/headers';
import { CreateDynamicSegmentForm, CreateSegmentForm } from './create-segment-form';

export const dynamic = 'force-dynamic';

interface Segment {
  id: string;
  name: string;
  description: string | null;
  mode: 'STATIC' | 'DYNAMIC';
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  memberCount: number;
}

export default async function SegmentsPage() {
  const result = await loadSegments();
  return (
    <main className="customers-page">
      <header className="customers-header">
        <div>
          <p className="eyebrow">CUSTOMER 360</p>
          <h1>Segments</h1>
          <p>Static and tag-rule dynamic segments are live.</p>
        </div>
      </header>
      <div className="customer-detail-grid">
        <section className="customer-card" aria-labelledby="create-segment-heading">
          <h2 id="create-segment-heading">Create static segment</h2>
          <CreateSegmentForm />
        </section>
        <section className="customer-card" aria-labelledby="create-dynamic-segment-heading">
          <h2 id="create-dynamic-segment-heading">Create dynamic segment</h2>
          <CreateDynamicSegmentForm />
        </section>
        <section className="customer-card" aria-labelledby="segment-list-heading">
          <h2 id="segment-list-heading">Tenant segments</h2>
          {result.kind === 'success' ? (
            result.items.length ? (
              <ul className="detail-list">
                {result.items.map((segment) => (
                  <li key={segment.id}>
                    <strong>{segment.name}</strong>
                    <span>{segment.description ?? 'No description'}</span>
                    <small>
                      {segment.mode} · {segment.status} · {segment.memberCount} members
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No segments exist for this tenant.</p>
            )
          ) : (
            <p className="muted">Segments are currently unavailable.</p>
          )}
        </section>
      </div>
    </main>
  );
}

async function loadSegments(): Promise<
  { kind: 'success'; items: readonly Segment[] } | { kind: 'error' }
> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) return { kind: 'error' };
  try {
    const response = await fetch(new URL('/v1/customers/segments', baseUrl), {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    if (!response.ok) return { kind: 'error' };
    return { kind: 'success', items: (await response.json()) as Segment[] };
  } catch {
    return { kind: 'error' };
  }
}
