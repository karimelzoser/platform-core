import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { SegmentAssignmentForm } from './segment-assignment-form';

export const metadata: Metadata = { title: 'Customer profile | Platform' };

interface CustomerDetail {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  status: string;
  preferredLanguage: string | null;
  timezone: string | null;
  contacts: readonly {
    id: string;
    channel: string;
    value: string;
    normalizedValue: string;
    label: string | null;
    isPrimary: boolean;
    isVerified: boolean;
    status: string;
  }[];
  identities: readonly {
    id: string;
    keyType: string;
    keyValue: string;
    state: string;
    verified: boolean;
  }[];
  tags: readonly { id: string; name: string }[];
  duplicateCandidates: readonly {
    id: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    matchedChannels: readonly string[];
  }[];
}

interface CustomerSegment {
  id: string;
  name: string;
  mode: 'STATIC' | 'DYNAMIC';
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
}

interface CustomerTimelineItem {
  id: string;
  kind: 'AUDIT' | 'MERGE';
  action: string;
  actorType: string | null;
  detail: string | null;
  occurredAt: string;
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const [result, segmentResult, timelineResult] = await Promise.all([
    loadCustomer(customerId),
    loadSegments(),
    loadTimeline(customerId),
  ]);
  if (result.kind === 'not_found') notFound();
  if (result.kind !== 'success') {
    return (
      <main className="customers-page">
        <a className="back-link" href="/customers">
          Back to customers
        </a>
        <section className="state-panel customer-state" aria-live="polite">
          <h1>{result.title}</h1>
          <p>{result.detail}</p>
        </section>
      </main>
    );
  }
  const customer = result.data;
  return (
    <main className="customers-page" aria-labelledby="customer-name">
      <a className="back-link" href="/customers">
        Back to customers
      </a>
      <header className="customer-profile-header">
        <div>
          <p className="eyebrow">CUSTOMER 360</p>
          <h1 id="customer-name">{displayName(customer)}</h1>
          <p>{customer.companyName ?? 'Individual customer'}</p>
        </div>
        <span className="status-pill">{customer.status}</span>
      </header>
      <div className="customer-detail-grid">
        <section className="customer-card" aria-labelledby="contact-heading">
          <h2 id="contact-heading">Contact points</h2>
          {customer.contacts.length ? (
            <ul className="detail-list">
              {customer.contacts.map((contact) => (
                <li key={contact.id}>
                  <strong>{contact.channel}</strong>
                  <span>{contact.value}</span>
                  <small>
                    {contact.isPrimary ? 'Primary · ' : ''}
                    {contact.isVerified ? 'Verified' : contact.status}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No contact points recorded.</p>
          )}
        </section>
        <section className="customer-card" aria-labelledby="profile-heading">
          <h2 id="profile-heading">Profile</h2>
          <dl className="detail-list definitions">
            <div>
              <dt>Language</dt>
              <dd>{customer.preferredLanguage ?? 'Not set'}</dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>{customer.timezone ?? 'Not set'}</dd>
            </div>
            <div>
              <dt>Tags</dt>
              <dd>
                {customer.tags.length ? customer.tags.map((tag) => tag.name).join(', ') : 'None'}
              </dd>
            </div>
          </dl>
        </section>
        <section className="customer-card" aria-labelledby="segments-heading">
          <h2 id="segments-heading">Static segments</h2>
          {segmentResult.kind === 'success' ? (
            <SegmentAssignmentForm
              customerId={customer.id}
              segments={segmentResult.data.filter(
                (segment) => segment.mode === 'STATIC' && segment.status === 'ACTIVE',
              )}
            />
          ) : (
            <p className="muted">Static segments are currently unavailable.</p>
          )}
          <p className="muted">
            Dynamic segment rules are under development and cannot be assigned here.
          </p>
        </section>
        <section className="customer-card customer-card-wide" aria-labelledby="identity-heading">
          <h2 id="identity-heading">Canonical identities</h2>
          {customer.identities.length ? (
            <ul className="detail-list">
              {customer.identities.map((identity) => (
                <li key={identity.id}>
                  <strong>{identity.keyType}</strong>
                  <span>{identity.keyValue}</span>
                  <small>{identity.verified ? 'Verified' : identity.state}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No canonical identities recorded.</p>
          )}
        </section>
        <section className="customer-card customer-card-wide" aria-labelledby="timeline-heading">
          <h2 id="timeline-heading">Timeline</h2>
          {timelineResult.kind === 'success' ? (
            timelineResult.items.length ? (
              <ul className="detail-list">
                {timelineResult.items.map((item) => (
                  <li key={`${item.kind}:${item.id}`}>
                    <strong>{item.action}</strong>
                    <span>{item.detail ?? 'Recorded customer activity'}</span>
                    <small>
                      {item.actorType ?? 'Historical record'} · {formatTimestamp(item.occurredAt)}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No customer activity has been recorded.</p>
            )
          ) : (
            <p className="muted">Customer timeline is currently unavailable.</p>
          )}
        </section>
        <section className="customer-card customer-card-wide" aria-labelledby="duplicates-heading">
          <h2 id="duplicates-heading">Possible duplicates</h2>
          {customer.duplicateCandidates.length ? (
            <ul className="detail-list">
              {customer.duplicateCandidates.map((candidate) => (
                <li key={candidate.id}>
                  <a href={`/customers/${candidate.id}`}>{candidateName(candidate)}</a>
                  <span>{candidate.companyName ?? 'Individual customer'}</span>
                  <small>
                    Shared {candidate.matchedChannels.join(', ')} contact point ·{' '}
                    <a href={`/customers/${customer.id}/merge/${candidate.id}`}>Review merge</a>
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No contact-based duplicate candidates found.</p>
          )}
        </section>
      </div>
    </main>
  );
}

type CustomerLoadResult =
  | { kind: 'success'; data: CustomerDetail }
  | { kind: 'not_found' }
  | { kind: 'error'; title: string; detail: string };

async function loadCustomer(customerId: string): Promise<CustomerLoadResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get('platform_access_token')?.value;
  const tenantId = cookieStore.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId)
    return {
      kind: 'error',
      title: 'Sign in to view this customer',
      detail: 'Select an organization after signing in.',
    };
  if (!baseUrl)
    return {
      kind: 'error',
      title: 'Customer workspace is not configured',
      detail: 'Set API_INTERNAL_URL before loading tenant data.',
    };
  try {
    const response = await fetch(
      new URL(`/v1/customers/${encodeURIComponent(customerId)}`, baseUrl),
      {
        headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
      },
    );
    if (response.status === 404) return { kind: 'not_found' };
    if (!response.ok)
      return {
        kind: 'error',
        title: 'Customer could not be loaded',
        detail: `The API returned ${String(response.status)}.`,
      };
    return { kind: 'success', data: (await response.json()) as CustomerDetail };
  } catch {
    return {
      kind: 'error',
      title: 'Customer could not be loaded',
      detail: 'The customer API is currently unavailable.',
    };
  }
}

async function loadSegments(): Promise<
  { kind: 'success'; data: readonly CustomerSegment[] } | { kind: 'error' }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get('platform_access_token')?.value;
  const tenantId = cookieStore.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) return { kind: 'error' };
  try {
    const response = await fetch(new URL('/v1/customers/segments', baseUrl), {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    if (!response.ok) return { kind: 'error' };
    return { kind: 'success', data: (await response.json()) as CustomerSegment[] };
  } catch {
    return { kind: 'error' };
  }
}

async function loadTimeline(
  customerId: string,
): Promise<{ kind: 'success'; items: readonly CustomerTimelineItem[] } | { kind: 'error' }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('platform_access_token')?.value;
  const tenantId = cookieStore.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) return { kind: 'error' };
  try {
    const response = await fetch(
      new URL(`/v1/customers/${encodeURIComponent(customerId)}/timeline`, baseUrl),
      { headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId } },
    );
    if (!response.ok) return { kind: 'error' };
    return { kind: 'success', items: (await response.json()) as CustomerTimelineItem[] };
  } catch {
    return { kind: 'error' };
  }
}

function displayName(customer: CustomerDetail): string {
  return (
    customer.displayName ??
    ([customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Unnamed customer')
  );
}

function candidateName(customer: CustomerDetail['duplicateCandidates'][number]): string {
  return (
    customer.displayName ??
    ([customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Unnamed customer')
  );
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? 'Unknown time' : parsed.toLocaleString();
}
