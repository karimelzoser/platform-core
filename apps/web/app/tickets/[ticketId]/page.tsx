import { cookies } from 'next/headers';
import { TicketMutationForms } from './ticket-mutation-forms';

export const dynamic = 'force-dynamic';

interface TicketDetail {
  id: string;
  title: string;
  status: string;
  priority: string;
  customerId: string | null;
  conversationId: string | null;
  assignedTo: string | null;
  resolvedAt: string | null;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  firstResponseAt: string | null;
  slaPausedAt: string | null;
  slaPolicyId: string | null;
  createdAt: string;
  updatedAt: string;
  comments: Array<{
    id: string;
    authorId: string | null;
    body: string;
    visibility: string;
    createdAt: string;
  }>;
  slaEvents: Array<{
    id: string;
    eventType: string;
    occurredAt: string;
  }>;
}

interface SessionAccess {
  permissions: string[];
}

interface Assignee {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const [result, access, assignees] = await Promise.all([
    loadTicket(ticketId),
    loadAccess(),
    loadAssignees(),
  ]);
  const permissions = access.kind === 'success' ? access.access.permissions : [];
  return (
    <main className="customers-page">
      <a className="back-link" href="/tickets">
        Back to tickets
      </a>
      {result.kind === 'success' ? (
        <>
          <header className="customer-profile-header">
            <div>
              <p className="eyebrow">TICKETS</p>
              <h1>{result.ticket.title}</h1>
              <p>
                {result.ticket.status} · {result.ticket.priority}
              </p>
            </div>
          </header>
          <section
            className="customer-card customer-card-wide"
            aria-labelledby="ticket-links-heading"
          >
            <h2 id="ticket-links-heading">Linked records</h2>
            <ul className="detail-list">
              <li>
                <strong>Customer</strong>
                {result.ticket.customerId ? (
                  <a href={`/customers/${result.ticket.customerId}`}>Open linked customer</a>
                ) : (
                  <span>Not linked</span>
                )}
              </li>
              <li>
                <strong>Conversation</strong>
                {result.ticket.conversationId ? (
                  <a href={`/inbox/${result.ticket.conversationId}`}>Open linked conversation</a>
                ) : (
                  <span>Not linked</span>
                )}
              </li>
            </ul>
          </section>
          <TicketMutationForms
            ticket={result.ticket}
            permissions={permissions}
            assignees={assignees.kind === 'success' ? assignees.items : []}
          />
          {result.ticket.slaPolicyId ? (
            <section
              className="customer-card customer-card-wide"
              aria-labelledby="ticket-sla-heading"
            >
              <h2 id="ticket-sla-heading">SLA</h2>
              <ul className="detail-list">
                <li>
                  <strong>First response</strong>
                  <span>
                    {result.ticket.firstResponseAt
                      ? `Responded ${new Date(result.ticket.firstResponseAt).toLocaleString()}`
                      : formatDue(result.ticket.firstResponseDueAt)}
                  </span>
                </li>
                <li>
                  <strong>Resolution</strong>
                  <span>{formatDue(result.ticket.resolutionDueAt)}</span>
                </li>
              </ul>
              {result.ticket.slaEvents.length ? (
                <ul className="detail-list">
                  {result.ticket.slaEvents.map((event) => (
                    <li key={event.id}>
                      <strong>{event.eventType.replaceAll('_', ' ')}</strong>
                      <small>{new Date(event.occurredAt).toLocaleString()}</small>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
          <section
            className="customer-card customer-card-wide"
            aria-labelledby="ticket-comments-heading"
          >
            <h2 id="ticket-comments-heading">Timeline</h2>
            {result.ticket.comments.length ? (
              <ul className="detail-list">
                {result.ticket.comments.map((comment) => (
                  <li key={comment.id}>
                    <strong>{comment.visibility}</strong>
                    <span>{comment.body}</span>
                    <small>
                      {new Date(comment.createdAt).toLocaleString()}
                      {comment.authorId ? ` · ${comment.authorId}` : ''}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No comments recorded.</p>
            )}
          </section>
        </>
      ) : (
        <section className="state-panel customer-state">
          <h1>Ticket unavailable</h1>
          <p>{result.detail}</p>
        </section>
      )}
    </main>
  );
}

function formatDue(value: string | null): string {
  return value ? `Due ${new Date(value).toLocaleString()}` : 'No SLA policy is assigned.';
}

async function loadAccess(): Promise<
  { kind: 'success'; access: SessionAccess } | { kind: 'error' }
> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) return { kind: 'error' };
  try {
    const response = await fetch(new URL('/v1/session', baseUrl), {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    return response.ok
      ? { kind: 'success', access: (await response.json()) as SessionAccess }
      : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

async function loadAssignees(): Promise<
  { kind: 'success'; items: Assignee[] } | { kind: 'error' }
> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) return { kind: 'error' };
  try {
    const response = await fetch(new URL('/v1/tickets/assignees', baseUrl), {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    return response.ok
      ? { kind: 'success', items: (await response.json()) as Assignee[] }
      : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

async function loadTicket(
  ticketId: string,
): Promise<{ kind: 'success'; ticket: TicketDetail } | { kind: 'error'; detail: string }> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { kind: 'error', detail: 'Sign in and select an organization.' };
  try {
    const response = await fetch(new URL(`/v1/tickets/${encodeURIComponent(ticketId)}`, baseUrl), {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    if (response.status === 404) return { kind: 'error', detail: 'Ticket not found.' };
    return response.ok
      ? { kind: 'success', ticket: (await response.json()) as TicketDetail }
      : { kind: 'error', detail: 'Ticket API request failed.' };
  } catch {
    return { kind: 'error', detail: 'Ticket API is unavailable.' };
  }
}
