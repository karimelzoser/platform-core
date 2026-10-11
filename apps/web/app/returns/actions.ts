'use server';

import { redirect } from 'next/navigation';
import { apiMessage, platformRequest } from './platform-api';

export async function saveReturnPolicy(formData: FormData): Promise<void> {
  const body = {
    storeId: required(formData, 'storeId'),
    name: required(formData, 'name'),
    returnWindowDays: integer(formData, 'returnWindowDays'),
    requireInspection: checkbox(formData, 'requireInspection'),
    allowExchange: checkbox(formData, 'allowExchange'),
    allowStoreCredit: checkbox(formData, 'allowStoreCredit'),
  };
  const result = await platformRequest('/v1/returns/policies', {
    method: 'POST',
    body,
    idempotent: true,
    approvalId: optional(formData, 'approvalId'),
  });
  redirect(
    `/returns?message=${encodeURIComponent(result.kind === 'success' ? 'Return policy saved.' : apiMessage(result))}`,
  );
}

export async function createReturnRequest(formData: FormData): Promise<void> {
  const kind = required(formData, 'kind');
  const orderLineId = required(formData, 'orderLineId');
  const exchangeVariantId = optional(formData, 'exchangeVariantId');
  const result = await platformRequest<{ result?: { requestId?: string }; requestId?: string }>(
    '/v1/returns/requests',
    {
      method: 'POST',
      idempotent: true,
      body: {
        storeId: required(formData, 'storeId'),
        orderId: required(formData, 'orderId'),
        kind,
        reasonCode: required(formData, 'reasonCode').toUpperCase(),
        customerNote: optional(formData, 'customerNote'),
        lines: [
          {
            orderLineId,
            quantity: integer(formData, 'quantity'),
            ...(kind === 'EXCHANGE' && exchangeVariantId ? { exchangeVariantId } : {}),
          },
        ],
      },
    },
  );
  if (result.kind !== 'success')
    redirect(`/returns/new?message=${encodeURIComponent(apiMessage(result))}`);
  const requestId = result.data.result?.requestId ?? result.data.requestId;
  redirect(
    requestId
      ? `/returns/${encodeURIComponent(requestId)}?message=${encodeURIComponent('Return request created.')}`
      : `/returns?message=${encodeURIComponent('Return request created.')}`,
  );
}

export async function reviewReturnRequest(formData: FormData): Promise<void> {
  const requestId = required(formData, 'requestId');
  const result = await platformRequest(
    `/v1/returns/requests/${encodeURIComponent(requestId)}/review`,
    {
      method: 'POST',
      idempotent: true,
      approvalId: optional(formData, 'approvalId'),
      body: {
        decision: required(formData, 'decision'),
        internalNote: optional(formData, 'internalNote'),
      },
    },
  );
  redirect(
    back(requestId, result.kind === 'success' ? 'Return review recorded.' : apiMessage(result)),
  );
}

export async function inspectReturnLine(formData: FormData): Promise<void> {
  const requestId = required(formData, 'requestId');
  const result = await platformRequest(
    `/v1/returns/requests/${encodeURIComponent(requestId)}/inspection`,
    {
      method: 'POST',
      idempotent: true,
      approvalId: optional(formData, 'approvalId'),
      body: {
        lines: [
          {
            lineId: required(formData, 'lineId'),
            receivedQuantity: integer(formData, 'receivedQuantity'),
            acceptedQuantity: integer(formData, 'acceptedQuantity'),
            inspectionStatus: required(formData, 'inspectionStatus'),
            conditionCode: optional(formData, 'conditionCode')?.toUpperCase(),
            restockDisposition: required(formData, 'restockDisposition'),
          },
        ],
      },
    },
  );
  redirect(
    back(requestId, result.kind === 'success' ? 'Inspection recorded.' : apiMessage(result)),
  );
}

export async function issueRefund(formData: FormData): Promise<void> {
  const requestId = required(formData, 'requestId');
  const result = await platformRequest(
    `/v1/returns/requests/${encodeURIComponent(requestId)}/refunds`,
    {
      method: 'POST',
      idempotent: true,
      approvalId: optional(formData, 'approvalId'),
      body: {
        sourcePaymentId: required(formData, 'sourcePaymentId'),
        connectionId: required(formData, 'connectionId'),
        amountMinor: integer(formData, 'amountMinor'),
        currency: required(formData, 'currency').toUpperCase(),
        reason: required(formData, 'reason'),
      },
    },
  );
  redirect(
    back(
      requestId,
      result.kind === 'success' ? 'Refund queued for provider execution.' : apiMessage(result),
    ),
  );
}

export async function reconcileRefund(formData: FormData): Promise<void> {
  const requestId = required(formData, 'requestId');
  const refundId = required(formData, 'refundId');
  const result = await platformRequest(
    `/v1/returns/refunds/${encodeURIComponent(refundId)}/reconcile`,
    {
      method: 'POST',
      idempotent: true,
    },
  );
  redirect(
    back(requestId, result.kind === 'success' ? 'Refund status reconciled.' : apiMessage(result)),
  );
}

export async function createExchange(formData: FormData): Promise<void> {
  const requestId = required(formData, 'requestId');
  const result = await platformRequest(
    `/v1/returns/requests/${encodeURIComponent(requestId)}/exchanges`,
    {
      method: 'POST',
      idempotent: true,
      approvalId: optional(formData, 'approvalId'),
      body: {
        priceAdjustmentMinor: signedInteger(formData, 'priceAdjustmentMinor'),
        currency: required(formData, 'currency').toUpperCase(),
      },
    },
  );
  redirect(back(requestId, result.kind === 'success' ? 'Exchange approved.' : apiMessage(result)));
}

export async function fulfillExchange(formData: FormData): Promise<void> {
  const requestId = required(formData, 'requestId');
  const exchangeId = required(formData, 'exchangeId');
  const result = await platformRequest(
    `/v1/returns/exchanges/${encodeURIComponent(exchangeId)}/fulfill`,
    {
      method: 'POST',
      idempotent: true,
      body: { replacementOrderId: required(formData, 'replacementOrderId') },
    },
  );
  redirect(
    back(
      requestId,
      result.kind === 'success' ? 'Exchange fulfillment linked.' : apiMessage(result),
    ),
  );
}

export async function resolveReturnRequest(formData: FormData): Promise<void> {
  const requestId = required(formData, 'requestId');
  const result = await platformRequest(
    `/v1/returns/requests/${encodeURIComponent(requestId)}/resolve`,
    {
      method: 'POST',
      idempotent: true,
    },
  );
  redirect(
    back(requestId, result.kind === 'success' ? 'Return request resolved.' : apiMessage(result)),
  );
}

function back(requestId: string, message: string) {
  return `/returns/${encodeURIComponent(requestId)}?message=${encodeURIComponent(message)}` as const;
}

function required(formData: FormData, key: string): string {
  const value = optional(formData, key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function optional(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function integer(formData: FormData, key: string): number {
  const value = Number(required(formData, key));
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${key} must be a non-negative integer`);
  return value;
}

function signedInteger(formData: FormData, key: string): number {
  const value = Number(required(formData, key));
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
}

function checkbox(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on';
}
