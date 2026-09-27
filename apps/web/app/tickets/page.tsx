import { cookies } from 'next/headers';
import { CreateTicketForm } from './create-ticket-form';

export const dynamic = 'force-dynamic';

interface Ticket {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

interface SessionAccess {
  permissions: string[];
}

export default async function TicketsPage() {
  const [result, access] = await Promise.all([loadTickets(), loadAccess()]);
  const canCreate =
    access.kind === 'success' && access.access.permissions.includes('tickets.create');
  return (
    <main className="customers-page">
      <header className="customer-profile-header">
        <div>
          <p className="eyebrow">TICKETS</p>
          <h1>Support tickets</h1>
          <p>Tenant-scoped operational tickets with protected lifecycle controls.</p>
        </div>
      </header>
      {canCreate ? <CreateTicketForm /> : null}
      {result.kind === 'success' ? (
        result.items.length ? (
          <section className="customer-card customer-card-wide">
            <ul className="detail-list">
              {result.items.map((ticket) => (
                <li key={ticket.id}>
                  <a href={`/tickets/${ticket.id}`}>{ticket.title}</a>
                  <span>
                    {ticket.status} · {ticket.priority}
                  </span>
                  <small>{new Date(ticket.createdAt).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="state-panel customer-state">
            <h2>No tickets yet</h2>
            <p>The protected ticket creation surface is under development.</p>
          </section>
        )
      ) : (
        <section className="state-panel customer-state">
          <h2>Tickets unavailable</h2>
          <p>{result.detail}</p>
        </section>
      )}
    </main>
  );
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

async function loadTickets(): Promise<
  { kind: 'success'; items: Ticket[] } | { kind: 'error'; detail: string }
> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { kind: 'error', detail: 'Sign in and select an organization.' };
  try {
    const response = await fetch(new URL('/v1/tickets', baseUrl), {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    return response.ok
      ? { kind: 'success', items: (await response.json()) as Ticket[] }
      : { kind: 'error', detail: 'Ticket API request failed.' };
  } catch {
    return { kind: 'error', detail: 'Ticket API is unavailable.' };
  }
}
