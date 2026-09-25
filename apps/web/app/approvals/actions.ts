'use server';

import { cookies } from 'next/headers';

export async function decideApproval(formData: FormData): Promise<void> {
  const approvalId = formData.get('approvalId');
  const decision = formData.get('decision');
  if (typeof approvalId !== 'string' || (decision !== 'APPROVED' && decision !== 'REJECTED'))
    return;
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) return;
  const response = await fetch(
    new URL(`/v1/approvals/${encodeURIComponent(approvalId)}/decision`, baseUrl),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({ decision }),
    },
  );
  if (!response.ok) throw new Error('Approval decision could not be recorded');
}
