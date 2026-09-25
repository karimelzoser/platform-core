'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

export interface CreateSegmentState {
  error?: string;
  created?: boolean;
}

export async function createStaticSegment(
  _state: CreateSegmentState,
  formData: FormData,
): Promise<CreateSegmentState> {
  const name = text(formData.get('name'));
  const description = text(formData.get('description'));
  if (!name) return { error: 'A segment name is required.' };

  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { error: 'Sign in and select an organization before creating a segment.' };
  try {
    const response = await fetch(new URL('/v1/customers/segments', baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({ name, ...(description ? { description } : {}) }),
    });
    if (!response.ok) return { error: 'The static segment could not be created.' };
    return { created: true };
  } catch {
    return { error: 'The segment API is currently unavailable.' };
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
