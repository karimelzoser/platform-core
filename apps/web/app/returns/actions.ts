'use server';

import { redirect } from 'next/navigation';
import { identityRequest, resultMessage } from '../identity-api';

interface CommandEnvelope {
  result?: Record<string, unknown>;
}

export async function createReturn(formData: FormData): Promise<void> {
  const orderId = required(formData, 'orderId');
  if (!orderId) redirect('/returns/new?message=Order%20is%20required.');
  const selected = formData.getAll('selectedLine').filter((value): value is string => typeof value === 'string');
  if (!selected.length) {
    redirect(`/returns/new?orderId=${encodeURIComponent(orderId)}&message=${encodeURIComponent('Select at least one return line.')}`);
  }
  const lines = selected.map((lineId) => ({
    orderLineId: lineId,
    quantity: positiveInteger(formData, `quantity:${lineId}`),
    reasonCode: required(formData, `reason:${lineId}`) ?? 'OTHER',
    requestedResolution: required(formData, `resolution:${lineId}`) ?? 'REFUND',
    proposedRefundMinor: nonNegativeInteger(formData, `refund:${lineId}`),
  }));
  const result = await identityRequest<CommandEnvelope>('/v1/returns', {
    method: 'POST',
    idempotent: true,
    body: {
      orderId,
      reasonCode: required(formData, 'reasonCode') ?? 'OTHER',
      customerNote: optional(formData, 'customerNote'),
      lines,
    },
  });
  if (result.kind !== 'success') {
    redirect(`/returns/new?orderId=${encodeURIComponent(orderId)}&message=${encodeURIComponent(resultMessage(result))}`);
  }
  const returnId = result.data.result?.returnId;
  if (typeof returnId !== 'string') {
    redirect(`/returns?message=${encodeURIComponent('Return was created but its ID was unavailable.')}`);
  }
  redirect(`/returns/${encodeURIComponent(returnId)}?message=${encodeURIComponent('Return request created.')}`);
}

export async function requestReturnApproval(formData: FormData): Promise<void> {
  const returnId = required(formData, 'returnId');
  const kind = required(formData, 'kind');
  if (!returnId || !kind) redirect('/returns?message=Return%20approval%20request%20is%20incomplete.');
  const body = approvalBody(kind, formData);
  const result = await identityRequest<{ approvalId: string; status: string }>(
    `/v1/returns/${encodeURIComponent(returnId)}/approval/${encodeURIComponent(kind)}`,
    { method: 'POST', body },
  );
  const message =
    result.kind === 'success'
      ? `Approval requested: ${result.data.approvalId}. Ask an independent approver to approve it, then execute the action here.`
      : resultMessage(result);
  redirect(`/returns/${encodeURIComponent(returnId)}?message=${encodeURIComponent(message)}`);
}

export async function executeDecision(formData: FormData): Promise<void> {
  const returnId = requireReturnId(formData);
  const result = await identityRequest<CommandEnvelope>(
    `/v1/returns/${encodeURIComponent(returnId)}/decision`,
    {
      method: 'POST',
      idempotent: true,
      approvalId: required(formData, 'approvalId'),
      body: {
        decision: required(formData, 'decision') ?? 'APPROVE',
        reason: optional(formData, 'reason'),
      },
    },
  );
  redirectWithResult(returnId, result, 'Return decision executed.');
}

export async function markReturnReceived(formData: FormData): Promise<void> {
  const returnId = requireReturnId(formData);
  const result = await identityRequest<CommandEnvelope>(
    `/v1/returns/${encodeURIComponent(returnId)}/received`,
    { method: 'POST', idempotent: true },
  );
  redirectWithResult(returnId, result, 'Return marked received.');
}

export async function inspectReturn(formData: FormData): Promise<void> {
  const returnId = requireReturnId(formData);
  const lineIds = formData.getAll('returnLineId').filter((value): value is string => typeof value === 'string');
  const lines = lineIds.map((lineId) => ({
    returnLineId: lineId,
    acceptedQuantity: nonNegativeInteger(formData, `accepted:${lineId}`),
    rejectedQuantity: nonNegativeInteger(formData, `rejected:${lineId}`),
    condition: required(formData, `condition:${lineId}`) ?? 'OTHER',
    note: optional(formData, `note:${lineId}`),
  }));
  const result = await identityRequest<CommandEnvelope>(
    `/v1/returns/${encodeURIComponent(returnId)}/inspections`,
    {
      method: 'POST',
      idempotent: true,
      body: { note: optional(formData, 'inspectionNote'), lines },
    },
  );
  redirectWithResult(returnId, result, 'Inspection completed.');
}

export async function executeExchange(formData: FormData): Promise<void> {
  const returnId = requireReturnId(formData);
  const returnLineId = required(formData, 'returnLineId');
  const replacementVariantId = required(formData, 'replacementVariantId');
  if (!returnLineId || !replacementVariantId) {
    redirect(`/returns/${encodeURIComponent(returnId)}?message=${encodeURIComponent('Exchange line and replacement variant are required.')}`);
  }
  const body = {
    lines: [
      {
        returnLineId,
        replacementVariantId,
        quantity: positiveInteger(formData, 'quantity'),
        unitPriceDeltaMinor: integer(formData, 'unitPriceDeltaMinor'),
      },
    ],
  };
  const result = await identityRequest<CommandEnvelope>(
    `/v1/returns/${encodeURIComponent(returnId)}/exchanges`,
    {
      method: 'POST',
      idempotent: true,
      approvalId: required(formData, 'approvalId'),
      body,
    },
  );
  redirectWithResult(returnId, result, 'Exchange created.');
}

export async function executeRefund(formData: FormData): Promise<void> {
  const returnId = requireReturnId(formData);
  const body = {
    amountMinor: positiveInteger(formData, 'amountMinor'),
    currency: required(formData, 'currency') ?? 'EGP',
    reason: required(formData, 'reason') ?? 'Approved return refund',
    ...(optional(formData, 'paymentId') ? { paymentId: optional(formData, 'paymentId') } : {}),
  };
  const result = await identityRequest<CommandEnvelope>(
    `/v1/returns/${encodeURIComponent(returnId)}/refunds`,
    {
      method: 'POST',
      idempotent: true,
      approvalId: required(formData, 'approvalId'),
      body,
    },
  );
  redirectWithResult(returnId, result, 'Refund recorded and provider action queued when available.');
}

export async function executeRestock(formData: FormData): Promise<void> {
  const returnId = requireReturnId(formData);
  const body = {
    returnLineId: required(formData, 'returnLineId'),
    locationId: required(formData, 'locationId'),
    quantity: positiveInteger(formData, 'quantity'),
    note: optional(formData, 'note'),
  };
  const result = await identityRequest<CommandEnvelope>(
    `/v1/returns/${encodeURIComponent(returnId)}/restocks`,
    {
      method: 'POST',
      idempotent: true,
      approvalId: required(formData, 'approvalId'),
      body,
    },
  );
  redirectWithResult(returnId, result, 'Inventory restock recorded.');
}

function approvalBody(kind: string, formData: FormData): Record<string, unknown> {
  if (kind === 'DECISION') {
    return {
      decision: required(formData, 'decision') ?? 'APPROVE',
      reason: optional(formData, 'reason'),
    };
  }
  if (kind === 'REFUND') {
    return {
      amountMinor: positiveInteger(formData, 'amountMinor'),
      currency: required(formData, 'currency') ?? 'EGP',
      reason: required(formData, 'reason') ?? 'Approved return refund',
      ...(optional(formData, 'paymentId') ? { paymentId: optional(formData, 'paymentId') } : {}),
    };
  }
  if (kind === 'EXCHANGE') {
    return {
      lines: [
        {
          returnLineId: required(formData, 'returnLineId'),
          replacementVariantId: required(formData, 'replacementVariantId'),
          quantity: positiveInteger(formData, 'quantity'),
          unitPriceDeltaMinor: integer(formData, 'unitPriceDeltaMinor'),
        },
      ],
    };
  }
  return {
    returnLineId: required(formData, 'returnLineId'),
    locationId: required(formData, 'locationId'),
    quantity: positiveInteger(formData, 'quantity'),
    note: optional(formData, 'note'),
  };
}

function redirectWithResult(
  returnId: string,
  result: Awaited<ReturnType<typeof identityRequest<CommandEnvelope>>>,
  success: string,
): never {
  const message = result.kind === 'success' ? success : resultMessage(result);
  redirect(`/returns/${encodeURIComponent(returnId)}?message=${encodeURIComponent(message)}`);
}

function requireReturnId(formData: FormData): string {
  const value = required(formData, 'returnId');
  if (!value) redirect('/returns?message=Return%20ID%20is%20required.');
  return value;
}

function required(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optional(formData: FormData, key: string): string | undefined {
  return required(formData, key);
}

function integer(formData: FormData, key: string): number {
  const value = Number(required(formData, key) ?? '0');
  return Number.isSafeInteger(value) ? value : 0;
}

function positiveInteger(formData: FormData, key: string): number {
  return Math.max(1, integer(formData, key));
}

function nonNegativeInteger(formData: FormData, key: string): number {
  return Math.max(0, integer(formData, key));
}
