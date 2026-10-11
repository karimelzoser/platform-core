'use server';

import { redirect } from 'next/navigation';
import { apiMessage, platformRequest } from './platform-api';

export async function createSalesPipeline(formData: FormData): Promise<void> {
  const names = strings(formData, 'stageName');
  const probabilities = strings(formData, 'stageProbabilityPercent');
  const terminals = strings(formData, 'stageTerminalKind');
  if (
    names.length === 0 ||
    names.length !== probabilities.length ||
    names.length !== terminals.length
  ) {
    throw new Error('Pipeline stage fields are incomplete');
  }

  const stages = names.map((name, index) => {
    const probabilityText = probabilities.at(index);
    const terminalKind = terminals.at(index);
    if (probabilityText === undefined || terminalKind === undefined) {
      throw new Error('Pipeline stage fields are incomplete');
    }
    const probability = Number(probabilityText);
    if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
      throw new Error('Stage probability must be between 0 and 100');
    }
    if (terminalKind !== 'OPEN' && terminalKind !== 'WON' && terminalKind !== 'LOST') {
      throw new Error('Stage outcome is invalid');
    }
    return { name, probabilityBps: Math.round(probability * 100), terminalKind };
  });

  if (!stages.some((stage) => stage.terminalKind === 'WON')) {
    throw new Error('Pipeline requires a Won terminal stage');
  }
  if (!stages.some((stage) => stage.terminalKind === 'LOST')) {
    throw new Error('Pipeline requires a Lost terminal stage');
  }

  const result = await platformRequest('/v1/sales/pipelines', {
    method: 'POST',
    idempotent: true,
    body: {
      name: required(formData, 'name'),
      description: optional(formData, 'description'),
      isDefault: formData.get('isDefault') === 'on',
      stages,
    },
  });
  redirect(
    `/sales?message=${encodeURIComponent(
      result.kind === 'success' ? 'Sales pipeline created.' : apiMessage(result),
    )}`,
  );
}

export async function createSalesLead(formData: FormData): Promise<void> {
  const result = await platformRequest('/v1/sales/leads', {
    method: 'POST',
    idempotent: true,
    body: {
      customerId: required(formData, 'customerId'),
      source: required(formData, 'source'),
    },
  });
  redirect(
    `/sales?message=${encodeURIComponent(
      result.kind === 'success'
        ? 'Sales lead created from the CRM customer.'
        : apiMessage(result),
    )}`,
  );
}

export async function qualifySalesLead(formData: FormData): Promise<void> {
  const leadId = required(formData, 'leadId');
  const status = required(formData, 'status');
  const result = await platformRequest(
    `/v1/sales/leads/${encodeURIComponent(leadId)}/qualification`,
    {
      method: 'POST',
      idempotent: true,
      body: {
        score: integer(formData, 'score', 0, 100),
        grade: required(formData, 'grade'),
        status,
        notes: optional(formData, 'notes'),
        disqualificationReason:
          status === 'DISQUALIFIED' ? required(formData, 'reason') : undefined,
      },
    },
  );
  redirect(
    `/sales?message=${encodeURIComponent(
      result.kind === 'success' ? 'Lead qualification updated.' : apiMessage(result),
    )}`,
  );
}

export async function createSalesOpportunity(formData: FormData): Promise<void> {
  const [pipelineId, stageId] = splitStage(required(formData, 'pipelineStage'));
  const result = await platformRequest('/v1/sales/opportunities', {
    method: 'POST',
    idempotent: true,
    body: {
      customerId: required(formData, 'customerId'),
      leadId: optional(formData, 'leadId'),
      pipelineId,
      stageId,
      name: required(formData, 'name'),
      currencyCode: required(formData, 'currencyCode').toUpperCase(),
      expectedValueMinor: integer(formData, 'expectedValueMinor', 0),
      expectedCloseDate: optional(formData, 'expectedCloseDate'),
    },
  });
  redirect(
    `/sales?message=${encodeURIComponent(
      result.kind === 'success' ? 'Sales opportunity created.' : apiMessage(result),
    )}`,
  );
}

export async function moveSalesOpportunity(formData: FormData): Promise<void> {
  const opportunityId = required(formData, 'opportunityId');
  const result = await platformRequest(
    `/v1/sales/opportunities/${encodeURIComponent(opportunityId)}/stage`,
    {
      method: 'POST',
      idempotent: true,
      body: {
        stageId: required(formData, 'stageId'),
        reason: optional(formData, 'reason'),
      },
    },
  );
  redirect(
    `/sales?message=${encodeURIComponent(
      result.kind === 'success' ? 'Opportunity stage updated.' : apiMessage(result),
    )}`,
  );
}

export async function closeSalesOpportunity(formData: FormData): Promise<void> {
  const opportunityId = required(formData, 'opportunityId');
  const status = required(formData, 'status');
  if (status !== 'WON' && status !== 'LOST') {
    throw new Error('Opportunity outcome is invalid');
  }

  const reason = optional(formData, 'reason');
  const orderId = status === 'WON' ? optional(formData, 'orderId') : undefined;
  if (status === 'LOST' && !reason) throw new Error('Lost opportunity requires a reason');

  const result = await platformRequest(
    `/v1/sales/opportunities/${encodeURIComponent(opportunityId)}/close`,
    {
      method: 'POST',
      idempotent: true,
      body: {
        status,
        stageId: required(formData, 'stageId'),
        reason,
        ...(orderId ? { orderId } : {}),
      },
    },
  );
  redirect(
    `/sales?message=${encodeURIComponent(
      result.kind === 'success'
        ? `Opportunity marked ${status.toLowerCase()}.`
        : apiMessage(result),
    )}`,
  );
}

export async function addSalesActivity(formData: FormData): Promise<void> {
  const result = await platformRequest('/v1/sales/activities', {
    method: 'POST',
    idempotent: true,
    body: {
      customerId: required(formData, 'customerId'),
      opportunityId: optional(formData, 'opportunityId'),
      leadId: optional(formData, 'leadId'),
      type: required(formData, 'type'),
      subject: required(formData, 'subject'),
      body: optional(formData, 'body'),
      dueAt: optionalDateTime(formData, 'dueAt'),
    },
  });
  redirect(
    `/sales?message=${encodeURIComponent(
      result.kind === 'success' ? 'Sales activity created.' : apiMessage(result),
    )}`,
  );
}

export async function completeSalesActivity(formData: FormData): Promise<void> {
  const activityId = required(formData, 'activityId');
  const result = await platformRequest(
    `/v1/sales/activities/${encodeURIComponent(activityId)}/complete`,
    {
      method: 'POST',
      idempotent: true,
    },
  );
  redirect(
    `/sales?message=${encodeURIComponent(
      result.kind === 'success' ? 'Sales activity completed.' : apiMessage(result),
    )}`,
  );
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

function strings(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim());
}

function integer(
  formData: FormData,
  key: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const value = Number(required(formData, key));
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${String(min)} and ${String(max)}`);
  }
  return value;
}

function splitStage(value: string): [string, string] {
  const [pipelineId, stageId, extra] = value.split(':');
  if (!pipelineId || !stageId || extra) throw new Error('Pipeline stage selection is invalid');
  return [pipelineId, stageId];
}

function optionalDateTime(formData: FormData, key: string): string | undefined {
  const value = optional(formData, key);
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${key} must be a valid date and time`);
  return parsed.toISOString();
}
