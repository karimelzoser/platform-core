'use server';

import { cookies } from 'next/headers';

export interface BulkTagState {
  error?: string;
  assignedCount?: number;
  alreadyAssignedCount?: number;
}

export async function assignBulkTag(
  _state: BulkTagState,
  formData: FormData,
): Promise<BulkTagState> {
  const tagId = text(formData.get('tagId'));
  const submissionId = text(formData.get('submissionId'));
  const customerIds = formData
    .getAll('customerId')
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (!tagId || !submissionId || !customerIds.length || customerIds.length > 100) {
    return { error: 'Select one to 100 customers and a tag.' };
  }

  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { error: 'Sign in and select an organization before assigning a tag.' };
  try {
    const response = await fetch(
      new URL(`/v1/customers/tags/${encodeURIComponent(tagId)}/assignments`, baseUrl),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': submissionId,
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({ customerIds }),
      },
    );
    if (!response.ok) return { error: 'The bulk tag assignment could not be completed.' };
    const result = (await response.json()) as {
      result?: { customerCount?: unknown; assignedCount?: unknown };
    };
    if (
      typeof result.result?.customerCount !== 'number' ||
      typeof result.result.assignedCount !== 'number'
    ) {
      return { error: 'The customer API returned an invalid bulk assignment response.' };
    }
    return {
      assignedCount: result.result.assignedCount,
      alreadyAssignedCount: result.result.customerCount - result.result.assignedCount,
    };
  } catch {
    return { error: 'The customer API is currently unavailable.' };
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
