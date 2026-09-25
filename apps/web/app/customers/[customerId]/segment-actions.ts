'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

export interface SegmentAssignmentState {
  error?: string;
  assigned?: boolean;
}

export async function assignCustomerToSegment(
  _state: SegmentAssignmentState,
  formData: FormData,
): Promise<SegmentAssignmentState> {
  const customerId = formData.get('customerId');
  const segmentId = formData.get('segmentId');
  if (typeof customerId !== 'string' || typeof segmentId !== 'string' || !customerId || !segmentId)
    return { error: 'Select a valid static segment.' };

  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { error: 'Sign in and select an organization before assigning a segment.' };

  try {
    const response = await fetch(
      new URL(
        `/v1/customers/segments/${encodeURIComponent(segmentId)}/customers/${encodeURIComponent(customerId)}`,
        baseUrl,
      ),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'idempotency-key': randomUUID(),
          'x-tenant-id': tenantId,
        },
      },
    );
    if (!response.ok) return { error: 'The customer could not be added to that static segment.' };
    const result = (await response.json()) as { result?: { assigned?: unknown } };
    return { assigned: result.result?.assigned === true };
  } catch {
    return { error: 'The segment API is currently unavailable.' };
  }
}
