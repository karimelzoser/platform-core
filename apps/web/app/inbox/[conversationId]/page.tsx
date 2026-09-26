import { cookies } from 'next/headers';
import { assignConversation, handoverConversation, updateConversationStatus } from './actions';

export const dynamic = 'force-dynamic';

interface Message {
  id: string;
  direction: string;
  senderType: string;
  body: string;
  sentAt: string;
}

interface Assignee {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface SessionAccess {
  permissions: string[];
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const [result, assignees, access] = await Promise.all([
    loadMessages(conversationId),
    loadAssignees(),
    loadAccess(),
  ]);
  const permissions =
    access.kind === 'success' ? new Set(access.access.permissions) : new Set<string>();
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
      {permissions.has('messaging.conversations.handover') ? (
        <form action={handoverConversation} className="customer-form">
          <input type="hidden" name="conversationId" value={conversationId} />
          <label>
            Conversation mode
            <select name="mode" defaultValue="HUMAN">
              <option>HUMAN</option>
              <option>COPILOT</option>
              <option>AI</option>
              <option>PAUSED</option>
            </select>
          </label>
          <button className="action" type="submit">
            Update handover
          </button>
        </form>
      ) : (
        <p className="muted">Handover requires the conversation handover permission.</p>
      )}
      {permissions.has('messaging.conversations.assign') && assignees.kind === 'success' ? (
        <form action={assignConversation} className="customer-form">
          <input type="hidden" name="conversationId" value={conversationId} />
          <label>
            Assign to a tenant member
            <select name="assigneeId" defaultValue="">
              <option disabled value="">
                Choose a member
              </option>
              {assignees.items.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assigneeName(assignee)}
                </option>
              ))}
            </select>
          </label>
          <button className="action" type="submit" disabled={!assignees.items.length}>
            Assign conversation
          </button>
        </form>
      ) : (
        <p className="muted">
          Assignment unavailable:{' '}
          {permissions.has('messaging.conversations.assign') && assignees.kind === 'error'
            ? assignees.detail
            : 'requires the conversation assignment permission.'}
        </p>
      )}
      {permissions.has('messaging.conversations.close') ? (
        <form action={updateConversationStatus} className="customer-form">
          <input type="hidden" name="conversationId" value={conversationId} />
          <label>
            Conversation status
            <select name="status" defaultValue="OPEN">
              <option value="OPEN">OPEN</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </label>
          <button className="action" type="submit">
            Update status
          </button>
        </form>
      ) : (
        <p className="muted">Closing or reopening requires the conversation close permission.</p>
      )}
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

function assigneeName(assignee: Assignee): string {
  const fullName = [assignee.firstName, assignee.lastName].filter(Boolean).join(' ');
  return fullName || assignee.email || assignee.id;
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

async function loadAssignees(): Promise<
  { kind: 'success'; items: Assignee[] } | { kind: 'error'; detail: string }
> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { kind: 'error', detail: 'Sign in and select an organization.' };
  try {
    const response = await fetch(new URL('/v1/conversations/assignees', baseUrl), {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    return response.ok
      ? { kind: 'success', items: (await response.json()) as Assignee[] }
      : { kind: 'error', detail: 'You may not assign conversations in this organization.' };
  } catch {
    return { kind: 'error', detail: 'The assignment API is unavailable.' };
  }
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
