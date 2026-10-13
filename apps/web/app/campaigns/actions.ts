'use server';

import { redirect } from 'next/navigation';
import { identityRequest, resultMessage } from '../identity-api';

export async function createCampaign(formData: FormData): Promise<void> {
  const name = required(formData, 'name');
  const channel = required(formData, 'channel');
  const connectionId = required(formData, 'connectionId');
  const templateId = required(formData, 'templateId');
  const segmentId = optional(formData, 'segmentId');
  const timezone = required(formData, 'timezone');
  const sendWindowStartMinute = minuteOfDay(required(formData, 'sendWindowStart'));
  const sendWindowEndMinute = minuteOfDay(required(formData, 'sendWindowEnd'));
  const batchSize = positiveInteger(required(formData, 'batchSize'));
  const attributionWindowHours = positiveInteger(required(formData, 'attributionWindowHours'));
  if (!name || !channel || !connectionId || !templateId || !timezone) {
    return go('Complete every required campaign field.');
  }
  if (!['EMAIL', 'WHATSAPP', 'MESSENGER', 'INSTAGRAM'].includes(channel)) {
    return go('Choose a supported campaign channel.');
  }
  if (
    sendWindowStartMinute === undefined ||
    sendWindowEndMinute === undefined ||
    batchSize === undefined ||
    attributionWindowHours === undefined
  ) {
    return go('Campaign timing and batch fields are invalid.');
  }
  const result = await identityRequest<{ result: { campaignId: string } }>('/v1/campaigns', {
    method: 'POST',
    idempotent: true,
    body: {
      name,
      channel,
      connectionId,
      templateId,
      ...(segmentId ? { segmentId } : {}),
      timezone,
      sendWindowStartMinute,
      sendWindowEndMinute,
      batchSize,
      attributionWindowHours,
    },
  });
  go(result.kind === 'success' ? 'Campaign created.' : resultMessage(result));
}

export async function freezeCampaignAudience(formData: FormData): Promise<void> {
  const campaignId = required(formData, 'campaignId');
  if (!campaignId) return go('Campaign ID is required.');
  const result = await identityRequest<{
    result: { total: number; eligible: number; suppressed: number; batches: number };
  }>(`/v1/campaigns/${encodeURIComponent(campaignId)}/audience/freeze`, {
    method: 'POST',
    idempotent: true,
  });
  if (result.kind !== 'success') return go(resultMessage(result));
  const summary = result.data.result;
  go(
    `Audience frozen: ${String(summary.eligible)} eligible, ${String(summary.suppressed)} suppressed, ${String(summary.batches)} batch(es).`,
  );
}

export async function startCampaign(formData: FormData): Promise<void> {
  const campaignId = required(formData, 'campaignId');
  const approvalId = optional(formData, 'approvalId');
  if (!campaignId) return go('Campaign ID is required.');
  const result = await identityRequest(`/v1/campaigns/${encodeURIComponent(campaignId)}/start`, {
    method: 'POST',
    idempotent: true,
    ...(approvalId ? { approvalId } : {}),
  });
  go(result.kind === 'success' ? 'Campaign started.' : resultMessage(result));
}

export async function pauseCampaign(formData: FormData): Promise<void> {
  return stateCommand(formData, 'pause', 'Campaign paused.');
}

export async function resumeCampaign(formData: FormData): Promise<void> {
  return stateCommand(formData, 'resume', 'Campaign resumed.');
}

export async function cancelCampaign(formData: FormData): Promise<void> {
  return stateCommand(formData, 'cancel', 'Campaign cancelled.');
}

async function stateCommand(
  formData: FormData,
  action: 'pause' | 'resume' | 'cancel',
  successMessage: string,
): Promise<void> {
  const campaignId = required(formData, 'campaignId');
  if (!campaignId) return go('Campaign ID is required.');
  const result = await identityRequest(
    `/v1/campaigns/${encodeURIComponent(campaignId)}/${action}`,
    { method: 'POST', idempotent: true },
  );
  go(result.kind === 'success' ? successMessage : resultMessage(result));
}

function required(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optional(formData: FormData, key: string): string | undefined {
  return required(formData, key);
}

function minuteOfDay(value: string | undefined): number | undefined {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return undefined;
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59)
    return undefined;
  return hour * 60 + minute;
}

function positiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function go(message: string): never {
  redirect(`/campaigns?message=${encodeURIComponent(message)}`);
}
