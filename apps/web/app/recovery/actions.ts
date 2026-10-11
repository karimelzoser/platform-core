'use server';

import { redirect } from 'next/navigation';
import { apiMessage, platformRequest } from './platform-api';

export async function saveRecoveryPolicy(formData: FormData): Promise<void> {
  const channels = formData
    .getAll('channels')
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  const result = await platformRequest('/v1/recovery/policies', {
    method: 'POST',
    idempotent: true,
    approvalId: optional(formData, 'approvalId'),
    body: {
      storeId: required(formData, 'storeId'),
      name: required(formData, 'name'),
      abandonmentDelayMinutes: integer(formData, 'abandonmentDelayMinutes'),
      opportunityTtlHours: integer(formData, 'opportunityTtlHours'),
      maxAttempts: integer(formData, 'maxAttempts'),
      cooldownMinutes: integer(formData, 'cooldownMinutes'),
      attributionWindowHours: integer(formData, 'attributionWindowHours'),
      channels,
      maxOfferPercentBasisPoints: integer(formData, 'maxOfferPercentBasisPoints'),
      maxOfferAmountMinor: integer(formData, 'maxOfferAmountMinor'),
    },
  });
  redirect(
    `/recovery?message=${encodeURIComponent(result.kind === 'success' ? 'Recovery policy saved.' : apiMessage(result))}`,
  );
}

export async function detectRecoveryOpportunity(formData: FormData): Promise<void> {
  const orderId = required(formData, 'orderId');
  const result = await platformRequest<{
    result?: { opportunityId?: string };
    opportunityId?: string;
  }>(`/v1/recovery/detect/${encodeURIComponent(orderId)}`, { method: 'POST', idempotent: true });
  if (result.kind !== 'success')
    redirect(`/recovery?message=${encodeURIComponent(apiMessage(result))}`);
  const opportunityId = result.data.result?.opportunityId ?? result.data.opportunityId;
  redirect(
    opportunityId
      ? `/recovery/${encodeURIComponent(opportunityId)}?message=${encodeURIComponent('Recovery opportunity detected.')}`
      : `/recovery?message=${encodeURIComponent('Recovery opportunity detected.')}`,
  );
}

export async function createRecoveryOffer(formData: FormData): Promise<void> {
  const opportunityId = required(formData, 'opportunityId');
  const offerType = required(formData, 'offerType');
  const body: Record<string, unknown> = {
    offerType,
    code: optional(formData, 'code'),
    expiresAt: required(formData, 'expiresAt'),
  };
  if (offerType === 'PERCENT') body.percentBasisPoints = integer(formData, 'percentBasisPoints');
  if (offerType === 'FIXED') {
    body.amountMinor = integer(formData, 'amountMinor');
    body.currency = required(formData, 'currency').toUpperCase();
  }
  const result = await platformRequest(`/v1/recovery/${encodeURIComponent(opportunityId)}/offers`, {
    method: 'POST',
    idempotent: true,
    approvalId: optional(formData, 'approvalId'),
    body,
  });
  redirect(
    back(opportunityId, result.kind === 'success' ? 'Recovery offer created.' : apiMessage(result)),
  );
}

export async function dispatchRecoveryAttempt(formData: FormData): Promise<void> {
  const opportunityId = required(formData, 'opportunityId');
  const result = await platformRequest(
    `/v1/recovery/${encodeURIComponent(opportunityId)}/attempts`,
    {
      method: 'POST',
      idempotent: true,
      body: {
        conversationId: required(formData, 'conversationId'),
        channel: required(formData, 'channel'),
        body: required(formData, 'body'),
        offerId: optional(formData, 'offerId'),
      },
    },
  );
  redirect(
    back(
      opportunityId,
      result.kind === 'success' ? 'Recovery message queued through Messaging.' : apiMessage(result),
    ),
  );
}

export async function markRecoveryAttributed(formData: FormData): Promise<void> {
  const opportunityId = required(formData, 'opportunityId');
  const result = await platformRequest(
    `/v1/recovery/${encodeURIComponent(opportunityId)}/recovered`,
    {
      method: 'POST',
      idempotent: true,
      body: { recoveredOrderId: required(formData, 'recoveredOrderId') },
    },
  );
  redirect(
    back(
      opportunityId,
      result.kind === 'success' ? 'Recovered order attributed.' : apiMessage(result),
    ),
  );
}

export async function expireRecoveryOpportunities(): Promise<void> {
  const result = await platformRequest('/v1/recovery/expire-due', {
    method: 'POST',
    idempotent: true,
  });
  redirect(
    `/recovery?message=${encodeURIComponent(result.kind === 'success' ? 'Due recovery opportunities expired.' : apiMessage(result))}`,
  );
}

function back(opportunityId: string, message: string) {
  return `/recovery/${encodeURIComponent(opportunityId)}?message=${encodeURIComponent(message)}`;
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
