'use server';

import { cookies } from 'next/headers';

export interface SuppressionState {
  error?: string;
  suppressed?: boolean;
}

export async function suppressCustomerChannel(
  _state: SuppressionState,
  formData: FormData,
): Promise<SuppressionState> {
  const customerId = value(formData.get('customerId'));
  const channel = value(formData.get('channel'));
  const reason = value(formData.get('reason'));
  const idempotencyKey = value(formData.get('submissionId'));
  if (!customerId || !channel || !reason || !idempotencyKey)
    return { error: 'Choose a channel and provide a reason.' };

  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { error: 'Sign in and select an organization before recording an opt-out.' };
  try {
    const response = await fetch(
      new URL(`/v1/customers/${encodeURIComponent(customerId)}/suppressions`, baseUrl),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({ channel, reason }),
      },
    );
    if (!response.ok) return { error: 'The opt-out could not be recorded.' };
    return { suppressed: true };
  } catch {
    return { error: 'The customer API is currently unavailable.' };
  }
}

function value(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim() ? input.trim() : undefined;
}
