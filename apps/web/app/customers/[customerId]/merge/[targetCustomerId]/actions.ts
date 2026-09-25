'use server';

import { cookies } from 'next/headers';

export interface MergeRequestState {
  error?: string;
  approvalId?: string;
}

export async function requestMergeApproval(
  _state: MergeRequestState,
  formData: FormData,
): Promise<MergeRequestState> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  const sourceCustomerId = text(formData.get('sourceCustomerId'));
  const targetCustomerId = text(formData.get('targetCustomerId'));
  const reason = text(formData.get('reason'));
  if (!token || !tenantId)
    return { error: 'Sign in and select an organization before requesting approval.' };
  if (!baseUrl || !sourceCustomerId || !targetCustomerId || !reason)
    return { error: 'The merge request is incomplete.' };
  try {
    const response = await fetch(new URL('/v1/approvals/merge-request', baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({ sourceCustomerId, targetCustomerId, reason }),
    });
    if (!response.ok)
      return {
        error: 'Approval could not be requested. Verify your permission and customer selection.',
      };
    const body = (await response.json()) as { approvalId?: unknown };
    return typeof body.approvalId === 'string'
      ? { approvalId: body.approvalId }
      : { error: 'Approval service returned an invalid response.' };
  } catch {
    return { error: 'Approval service is currently unavailable.' };
  }
}
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
