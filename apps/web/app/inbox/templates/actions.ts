'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

export interface TemplateState {
  error?: string;
  created?: boolean;
}

export async function createTemplate(
  _previous: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const name = formData.get('name');
  const body = formData.get('body');
  const locale = formData.get('locale');
  if (typeof name !== 'string' || !name.trim() || typeof body !== 'string' || !body.trim())
    return { error: 'A template name and body are required.' };
  if (name.length > 100 || body.length > 20_000 || (locale !== 'en' && locale !== 'ar'))
    return { error: 'Template fields are invalid.' };
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) return { error: 'Sign in and select an organization.' };
  try {
    const response = await fetch(new URL('/v1/conversations/templates', baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({ name: name.trim(), body: body.trim(), locale }),
    });
    if (response.status === 401 || response.status === 403)
      return { error: 'You do not have permission to manage templates.' };
    if (response.status === 409)
      return { error: 'A template with this name and language already exists.' };
    return response.ok ? { created: true } : { error: 'The template could not be saved.' };
  } catch {
    return { error: 'The template API is unavailable.' };
  }
}
