'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

const refreshPath = revalidatePath as (path: string) => void;

export interface OrderActionState {
  error?: string;
  completed?: boolean;
}

export async function requestOrderConfirmation(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderId = required(formData, 'orderId');
  const storeId = required(formData, 'storeId');
  if (!orderId || !storeId) return { error: 'Order context is missing.' };
  return sendOrderCommand(orderId, '/confirmation/request', { storeId });
}

export async function respondOrderConfirmation(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderId = required(formData, 'orderId');
  const storeId = required(formData, 'storeId');
  const response = required(formData, 'response');
  if (!orderId || !storeId || (response !== 'CONFIRMED' && response !== 'DECLINED'))
    return { error: 'A valid confirmation response is required.' };
  return sendOrderCommand(orderId, '/confirmation/response', { storeId, response });
}

export async function evaluateOrderDuplicates(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderId = required(formData, 'orderId');
  const storeId = required(formData, 'storeId');
  if (!orderId || !storeId) return { error: 'Order context is missing.' };
  return sendOrderCommand(orderId, '/duplicates/evaluate', {
    storeId,
    lookbackDays: 5,
    threshold: 60,
  });
}

export async function reviewOrderDuplicate(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderId = required(formData, 'orderId');
  const storeId = required(formData, 'storeId');
  const candidateId = required(formData, 'candidateId');
  const decision = required(formData, 'decision');
  if (
    !orderId ||
    !storeId ||
    !candidateId ||
    (decision !== 'DISMISS' && decision !== 'CONFIRM_DUPLICATE')
  )
    return { error: 'A valid duplicate decision is required.' };
  return sendOrderCommand(orderId, `/duplicates/${candidateId}/review`, { storeId, decision });
}

export async function requestOrderModification(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderId = required(formData, 'orderId');
  const storeId = required(formData, 'storeId');
  if (!orderId || !storeId) return { error: 'Order context is missing.' };
  const customerEmail = optional(formData, 'customerEmail');
  const customerPhone = optional(formData, 'customerPhone');
  const note = optional(formData, 'note');
  const reason = optional(formData, 'reason');
  const patch: Record<string, string> = {};
  if (customerEmail) patch.customerEmail = customerEmail;
  if (customerPhone) patch.customerPhone = customerPhone;
  if (note) patch.note = note;
  if (!Object.keys(patch).length)
    return { error: 'Enter at least one field to modify before submitting.' };
  return sendOrderCommand(orderId, '/modifications', {
    storeId,
    patch,
    ...(reason ? { reason } : {}),
  });
}

export async function reviewOrderModification(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderId = required(formData, 'orderId');
  const storeId = required(formData, 'storeId');
  const requestId = required(formData, 'requestId');
  const decision = required(formData, 'decision');
  if (!orderId || !storeId || !requestId || (decision !== 'APPROVE' && decision !== 'REJECT'))
    return { error: 'A valid modification decision is required.' };
  return sendOrderCommand(orderId, `/modifications/${requestId}/review`, { storeId, decision });
}

export async function requestOrderCancellation(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderId = required(formData, 'orderId');
  const storeId = required(formData, 'storeId');
  const reason = required(formData, 'reason');
  if (!orderId || !storeId || !reason) return { error: 'A cancellation reason is required.' };
  return sendOrderCommand(orderId, '/cancellations', { storeId, reason });
}

export async function reviewOrderCancellation(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderId = required(formData, 'orderId');
  const storeId = required(formData, 'storeId');
  const requestId = required(formData, 'requestId');
  const decision = required(formData, 'decision');
  const approvalId = optional(formData, 'approvalId');
  if (!orderId || !storeId || !requestId || (decision !== 'APPROVE' && decision !== 'REJECT'))
    return { error: 'A valid cancellation decision is required.' };
  return sendOrderCommand(
    orderId,
    `/cancellations/${requestId}/review`,
    { storeId, decision },
    approvalId,
  );
}

export async function queueOrderProviderAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderId = required(formData, 'orderId');
  const storeId = required(formData, 'storeId');
  const connectionId = required(formData, 'connectionId');
  const operation = required(formData, 'operation');
  const changeRequestId = optional(formData, 'changeRequestId');
  const approvalId = optional(formData, 'approvalId');
  if (
    !orderId ||
    !storeId ||
    !connectionId ||
    !operation ||
    !['CONFIRM', 'MODIFY', 'CANCEL'].includes(operation)
  )
    return { error: 'A provider connection and valid operation are required.' };
  return sendOrderCommand(
    orderId,
    '/provider-actions',
    {
      storeId,
      connectionId,
      operation,
      ...(changeRequestId ? { changeRequestId } : {}),
    },
    approvalId,
  );
}

async function sendOrderCommand(
  orderId: string,
  suffix: string,
  body: Record<string, unknown>,
  approvalId?: string,
): Promise<OrderActionState> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId) return { error: 'Sign in and select an organization first.' };
  if (!baseUrl) return { error: 'Order workspace configuration is incomplete.' };
  try {
    const response = await fetch(new URL(`/v1/commerce/orders/${orderId}${suffix}`, baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
        'idempotency-key': randomUUID(),
        ...(approvalId ? { 'x-approval-id': approvalId } : {}),
      },
      body: JSON.stringify(body),
    });
    if (response.status === 401 || response.status === 403)
      return { error: 'Your session does not currently allow this operation.' };
    if (!response.ok) {
      const detail = await safeError(response);
      return { error: detail ?? 'The order operation could not be completed.' };
    }
  } catch {
    return { error: 'The commerce API is unavailable.' };
  }
  refreshPath('/orders');
  refreshPath(`/orders/${orderId}`);
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

function optional(formData: FormData, name: string): string | undefined {
  return required(formData, name);
}
