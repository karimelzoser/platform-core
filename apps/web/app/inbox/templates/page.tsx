import { cookies } from 'next/headers';
import { TemplateForm } from './template-form';

export const dynamic = 'force-dynamic';

interface Template {
  id: string;
  name: string;
  locale: string;
  channel: string | null;
  body: string;
}

export default async function TemplatesPage() {
  const result = await loadTemplates();
  return (
    <main className="customers-page">
      <a className="back-link" href="/inbox">
        Back to inbox
      </a>
      <header className="customer-profile-header">
        <div>
          <p className="eyebrow">MESSAGING</p>
          <h1>Message templates</h1>
          <p>Reusable tenant-scoped replies. Template creation is being completed next.</p>
        </div>
      </header>
      <TemplateForm />
      {result.kind === 'success' ? (
        result.items.length ? (
          <section className="customer-card customer-card-wide">
            <ul className="detail-list">
              {result.items.map((template) => (
                <li key={template.id}>
                  <strong>{template.name}</strong>
                  <span>{template.body}</span>
                  <small>
                    {template.locale.toUpperCase()}
                    {template.channel ? ` · ${template.channel}` : ''}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="state-panel customer-state">
            <h2>No active templates yet</h2>
            <p>Use the protected template API while the creation surface is completed.</p>
          </section>
        )
      ) : (
        <section className="state-panel customer-state">
          <h2>Templates unavailable</h2>
          <p>{result.detail}</p>
        </section>
      )}
    </main>
  );
}

async function loadTemplates(): Promise<
  { kind: 'success'; items: Template[] } | { kind: 'error'; detail: string }
> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { kind: 'error', detail: 'Sign in and select an organization.' };
  try {
    const response = await fetch(new URL('/v1/conversations/templates', baseUrl), {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    return response.ok
      ? { kind: 'success', items: (await response.json()) as Template[] }
      : { kind: 'error', detail: 'Template API request failed or is not permitted.' };
  } catch {
    return { kind: 'error', detail: 'Template API is unavailable.' };
  }
}
