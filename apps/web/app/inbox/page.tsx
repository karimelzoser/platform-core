import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface Conversation {
  id: string;
  channel: string;
  status: string;
  mode: string;
  lastMessageAt: string | null;
  customerId: string | null;
}

export default async function InboxPage() {
  const result = await loadInbox();
  return (
    <main className="customers-page">
      <header className="customer-profile-header">
        <div>
          <p className="eyebrow">MESSAGING</p>
          <h1>Unified inbox</h1>
          <p>
            Live tenant-scoped conversations. Sending, assignment, handover, and tickets are under
            active implementation.
          </p>
        </div>
        <a className="surface-link" href="/inbox/templates">
          Templates
        </a>
      </header>
      {result.kind === 'success' ? (
        result.items.length ? (
          <section className="customer-card customer-card-wide">
            <ul className="detail-list">
              {result.items.map((conversation) => (
                <li key={conversation.id}>
                  <a href={`/inbox/${conversation.id}`}>{conversation.channel} conversation</a>
                  <span>
                    {conversation.status} · {conversation.mode}
                  </span>
                  <small>
                    {conversation.lastMessageAt
                      ? new Date(conversation.lastMessageAt).toLocaleString()
                      : 'No messages yet'}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="state-panel customer-state">
            <h2>No conversations yet</h2>
            <p>
              Inbound provider processing will create conversation records after connector
              normalization.
            </p>
          </section>
        )
      ) : (
        <section className="state-panel customer-state">
          <h2>Inbox unavailable</h2>
          <p>{result.detail}</p>
        </section>
      )}
    </main>
  );
}

async function loadInbox(): Promise<
  { kind: 'success'; items: Conversation[] } | { kind: 'error'; detail: string }
> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { kind: 'error', detail: 'Sign in and select an organization.' };
  try {
    const response = await fetch(new URL('/v1/conversations', baseUrl), {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    return response.ok
      ? { kind: 'success', items: (await response.json()) as Conversation[] }
      : { kind: 'error', detail: 'Conversation API request failed.' };
  } catch {
    return { kind: 'error', detail: 'Conversation API is unavailable.' };
  }
}
