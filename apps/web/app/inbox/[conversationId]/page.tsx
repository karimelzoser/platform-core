import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface Message {
  id: string;
  direction: string;
  senderType: string;
  body: string;
  sentAt: string;
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const result = await loadMessages(conversationId);
  return (
    <main className="customers-page">
      <a className="back-link" href="/inbox">
        Back to inbox
      </a>
      <header className="customer-profile-header">
        <div>
          <p className="eyebrow">MESSAGING</p>
          <h1>Conversation</h1>
          <p>Tenant-scoped message history.</p>
        </div>
      </header>
      {result.kind === 'success' ? (
        result.items.length ? (
          <section className="customer-card customer-card-wide">
            <ul className="detail-list">
              {result.items.map((message) => (
                <li key={message.id}>
                  <strong>
                    {message.direction} · {message.senderType}
                  </strong>
                  <span>{message.body}</span>
                  <small>{new Date(message.sentAt).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="muted">No messages recorded.</p>
        )
      ) : (
        <section className="state-panel customer-state">
          <h2>Conversation unavailable</h2>
          <p>{result.detail}</p>
        </section>
      )}
    </main>
  );
}

async function loadMessages(
  conversationId: string,
): Promise<{ kind: 'success'; items: Message[] } | { kind: 'error'; detail: string }> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { kind: 'error', detail: 'Sign in and select an organization.' };
  try {
    const response = await fetch(
      new URL(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, baseUrl),
      { headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId } },
    );
    return response.ok
      ? { kind: 'success', items: (await response.json()) as Message[] }
      : { kind: 'error', detail: 'Message API request failed.' };
  } catch {
    return { kind: 'error', detail: 'Message API is unavailable.' };
  }
}
