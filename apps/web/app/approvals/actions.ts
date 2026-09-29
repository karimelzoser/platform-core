'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const refreshPath = revalidatePath as (path: string) => void;

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
  refreshPath('/approvals');
}

export interface ExecuteApprovalState {
  error?: string;
  completed?: boolean;
}

export async function executeMergeApproval(
  _state: ExecuteApprovalState,
  formData: FormData,
): Promise<ExecuteApprovalState> {
  const approvalId = formData.get('approvalId');
  if (typeof approvalId !== 'string' || !approvalId) return { error: 'Invalid approval request.' };

  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { error: 'Sign in and select an organization before executing the merge.' };

  try {
    const response = await fetch(
      new URL(`/v1/approvals/${encodeURIComponent(approvalId)}/execute`, baseUrl),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'idempotency-key': `approval-execution:${approvalId}`,
          'x-tenant-id': tenantId,
        },
      },
    );
    if (!response.ok)
      return {
        error: 'The approved merge could not be executed. Verify its status and your permission.',
      };
    return { completed: true };
  } catch {
    return { error: 'The approval service is currently unavailable.' };
  }
}

export async function executeSlaPolicyApproval(
  _state: ExecuteApprovalState,
  formData: FormData,
): Promise<ExecuteApprovalState> {
  const approvalId = formData.get('approvalId');
  if (typeof approvalId !== 'string' || !approvalId) return { error: 'Invalid approval request.' };
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { error: 'Sign in and select an organization before executing the SLA policy.' };
  try {
    const response = await fetch(
      new URL(`/v1/approvals/${encodeURIComponent(approvalId)}/execute-sla-policy`, baseUrl),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'idempotency-key': `approval-execution:${approvalId}`,
          'x-tenant-id': tenantId,
        },
      },
    );
    if (!response.ok)
      return {
        error: 'The approved SLA policy could not be created. Verify its status and permission.',
      };
    return { completed: true };
  } catch {
    return { error: 'The approval service is currently unavailable.' };
  }
}

export async function executeSlaPolicyArchiveApproval(
  _state: ExecuteApprovalState,
  formData: FormData,
): Promise<ExecuteApprovalState> {
  const approvalId = formData.get('approvalId');
  if (typeof approvalId !== 'string' || !approvalId) return { error: 'Invalid approval request.' };
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { error: 'Sign in and select an organization before executing the SLA policy archive.' };
  try {
    const response = await fetch(
      new URL(
        `/v1/approvals/${encodeURIComponent(approvalId)}/execute-sla-policy-archive`,
        baseUrl,
      ),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'idempotency-key': `approval-execution:${approvalId}`,
          'x-tenant-id': tenantId,
        },
      },
    );
    if (!response.ok)
      return {
        error:
          'The approved SLA policy archive could not be executed. Verify its status and permission.',
      };
    return { completed: true };
  } catch {
    return { error: 'The approval service is currently unavailable.' };
  }
}
