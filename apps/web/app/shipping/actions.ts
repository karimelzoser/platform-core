'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

const refreshPath = revalidatePath as (path: string) => void;

export interface ShippingActionState {
  error?: string;
  completed?: boolean;
}

export async function updateShippingRescueCase(
  _previous: ShippingActionState,
  formData: FormData,
): Promise<ShippingActionState> {
  const shipmentId = required(formData, 'shipmentId');
  const rescueCaseId = required(formData, 'rescueCaseId');
  const storeId = required(formData, 'storeId');
  const state = required(formData, 'state');
  const summary = required(formData, 'summary');
  if (!shipmentId || !rescueCaseId || !storeId || !state || !summary)
    return { error: 'Shipping rescue context is incomplete.' };
  if (!['CONTACTED', 'RESOLVED'].includes(state))
    return { error: 'This rescue transition is not available from the workspace.' };

  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId) return { error: 'Sign in and select an organization first.' };
  if (!baseUrl) return { error: 'Shipping workspace configuration is incomplete.' };

  try {
    const response = await fetch(
      new URL(`/v1/shipping/rescue-cases/${rescueCaseId}/state`, baseUrl),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-tenant-id': tenantId,
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({ storeId, state, summary }),
      },
    );
    if (response.status === 401 || response.status === 403)
      return { error: 'Your session does not currently allow this operation.' };
    if (!response.ok) {
      const detail = await safeError(response);
      return { error: detail ?? 'The shipping rescue operation could not be completed.' };
    }
  } catch {
    return { error: 'The shipping API is unavailable.' };
  }

  refreshPath('/shipping');
  refreshPath(`/shipping/${shipmentId}`);
  return { completed: true };
}

async function safeError(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message.length <= 300
      ? body.message
      : undefined;
  } catch {
    return undefined;
  }
}

function required(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
