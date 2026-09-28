'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

const refreshPath = revalidatePath as (path: string) => void;

export interface CreateSegmentState {
  error?: string;
  created?: boolean;
}

export interface EvaluateSegmentState {
  error?: string;
  memberCount?: number;
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

export async function createDynamicSegment(
  _state: CreateSegmentState,
  formData: FormData,
): Promise<CreateSegmentState> {
  const name = text(formData.get('name'));
  const description = text(formData.get('description'));
  const allTagIds = text(formData.get('allTagIds'))
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (!name || !allTagIds?.length) return { error: 'A name and at least one tag ID are required.' };
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { error: 'Sign in and select an organization before creating a segment.' };
  try {
    const response = await fetch(new URL('/v1/customers/segments/dynamic', baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({ name, ...(description ? { description } : {}), allTagIds }),
    });
    return response.ok ? { created: true } : { error: 'The dynamic segment could not be created.' };
  } catch {
    return { error: 'The segment API is currently unavailable.' };
  }
}

export async function evaluateDynamicSegment(
  _state: EvaluateSegmentState,
  formData: FormData,
): Promise<EvaluateSegmentState> {
  const segmentId = text(formData.get('segmentId'));
  if (!segmentId) return { error: 'The dynamic segment could not be identified.' };

  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { error: 'Sign in and select an organization before evaluating a segment.' };

  try {
    const response = await fetch(
      new URL(`/v1/customers/segments/${encodeURIComponent(segmentId)}/evaluate`, baseUrl),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'idempotency-key': randomUUID(),
          'x-tenant-id': tenantId,
        },
      },
    );
    if (response.status === 401 || response.status === 403)
      return { error: 'Your session no longer has permission to evaluate this segment.' };
    if (!response.ok) return { error: 'The dynamic segment could not be evaluated.' };
    const payload: unknown = await response.json();
    const memberCount = memberCountFrom(payload);
    if (memberCount === undefined) return { error: 'The segment API returned an invalid result.' };
    refreshPath('/segments');
    return { memberCount };
  } catch {
    return { error: 'The segment API is currently unavailable.' };
  }
}

function memberCountFrom(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const result = (value as { result?: unknown }).result;
  if (!result || typeof result !== 'object') return undefined;
  const memberCount = (result as { memberCount?: unknown }).memberCount;
  return typeof memberCount === 'number' && Number.isInteger(memberCount) && memberCount >= 0
    ? memberCount
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
