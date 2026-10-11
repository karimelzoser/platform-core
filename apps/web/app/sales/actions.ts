'use server';

import { redirect } from 'next/navigation';
import { apiMessage, platformRequest } from './platform-api';

export async function createSalesLead(formData: FormData): Promise<void> {
  const customerId = required(formData, 'customerId');
  const source = optional(formData, 'source') ?? 'platform';
  if (!customerId) return fail('/sales', 'Choose a customer.');
  const result = await platformRequest('/v1/sales/leads', {
    method: 'POST',
    idempotent: true,
    body: {
      customerId,
      source,
      ...(optional(formData, 'ownerMembershipId')
        ? { ownerMembershipId: optional(formData, 'ownerMembershipId') }
        : {}),
    },
  });
  if (result.kind !== 'success') return fail('/sales', apiMessage(result));
  redirect('/sales?message=Lead%20created.');
}

export async function qualifySalesLead(formData: FormData): Promise<void> {
  const leadId = required(formData, 'leadId');
  const outcome = required(formData, 'outcome');
  const score = integer(formData, 'score');
  const grade = required(formData, 'grade');
  if (!leadId || !outcome || score === undefined || !grade)
    return fail('/sales', 'Qualification outcome, score and grade are required.');
  const reason = optional(formData, 'disqualificationReason');
  const result = await platformRequest(`/v1/sales/leads/${encodeURIComponent(leadId)}/qualification`, {
    method: 'POST',
    idempotent: true,
    body: {
      outcome,
      score,
      grade,
      signals: { source: 'operator', reviewed: true },
      ...(reason ? { disqualificationReason: reason } : {}),
    },
  });
  if (result.kind !== 'success') return fail('/sales', apiMessage(result));
  redirect('/sales?message=Lead%20qualification%20updated.');
}

export async function assignSalesLead(formData: FormData): Promise<void> {
  const leadId = required(formData, 'leadId');
  if (!leadId) return fail('/sales', 'Lead is required.');
  const membershipId = optional(formData, 'membershipId') ?? null;
  const result = await platformRequest(`/v1/sales/leads/${encodeURIComponent(leadId)}/assignment`, {
    method: 'POST',
    idempotent: true,
    body: { membershipId },
  });
  if (result.kind !== 'success') return fail('/sales', apiMessage(result));
  redirect('/sales?message=Lead%20owner%20updated.');
}

export async function createSalesPipeline(formData: FormData): Promise<void> {
  const name = required(formData, 'name');
  if (!name) return fail('/sales', 'Pipeline name is required.');
  const codes = strings(formData, 'stageCode');
  const names = strings(formData, 'stageName');
  const categories = strings(formData, 'stageCategory');
  const orders = strings(formData, 'stageSortOrder');
  const probabilities = strings(formData, 'stageProbability');
  if (
    !codes.length ||
    [names.length, categories.length, orders.length, probabilities.length].some(
      (length) => length !== codes.length,
    )
  )
    return fail('/sales', 'Every pipeline stage needs code, name, category, order and probability.');
  const stages = codes.map((code, index) => ({
    code: code.toUpperCase(),
    name: names[index] ?? '',
    category: categories[index] ?? '',
    sortOrder: Number(orders[index]),
    defaultProbabilityBasisPoints: Number(probabilities[index]),
  }));
  if (
    stages.some(
      (stage) =>
        !stage.name ||
        !Number.isInteger(stage.sortOrder) ||
        !Number.isInteger(stage.defaultProbabilityBasisPoints),
    )
  )
    return fail('/sales', 'Pipeline stage order and probability must be whole numbers.');
  const result = await platformRequest('/v1/sales/pipelines', {
    method: 'POST',
    idempotent: true,
    body: { name, isDefault: formData.get('isDefault') === 'on', stages },
  });
  if (result.kind !== 'success') return fail('/sales', apiMessage(result));
  redirect('/sales?message=Pipeline%20created.');
}

export async function createSalesOpportunity(formData: FormData): Promise<void> {
  const customerId = required(formData, 'customerId');
  const stageRef = required(formData, 'stageRef');
  const name = required(formData, 'name');
  const currency = required(formData, 'currency');
  const expectedValueMinor = integer(formData, 'expectedValueMinor');
  if (!customerId || !stageRef || !name || !currency || expectedValueMinor === undefined)
    return fail('/sales', 'Customer, stage, name, value and currency are required.');
  const [pipelineId, stageId] = stageRef.split('|');
  if (!pipelineId || !stageId) return fail('/sales', 'Choose a valid open pipeline stage.');
  const probabilityBasisPoints = integer(formData, 'probabilityBasisPoints');
  const result = await platformRequest('/v1/sales/opportunities', {
    method: 'POST',
    idempotent: true,
    body: {
      customerId,
      pipelineId,
      stageId,
      name,
      expectedValueMinor,
      currency: currency.toUpperCase(),
      ...(optional(formData, 'leadId') ? { leadId: optional(formData, 'leadId') } : {}),
      ...(optional(formData, 'ownerMembershipId')
        ? { ownerMembershipId: optional(formData, 'ownerMembershipId') }
        : {}),
      ...(probabilityBasisPoints === undefined ? {} : { probabilityBasisPoints }),
      ...(optional(formData, 'expectedCloseDate')
        ? { expectedCloseDate: optional(formData, 'expectedCloseDate') }
        : {}),
    },
  });
  if (result.kind !== 'success') return fail('/sales', apiMessage(result));
  redirect('/sales?message=Opportunity%20created.');
}

export async function moveSalesOpportunity(formData: FormData): Promise<void> {
  const opportunityId = required(formData, 'opportunityId');
  const stageId = required(formData, 'stageId');
  const returnTo = safeReturn(formData);
  if (!opportunityId || !stageId) return fail(returnTo, 'Opportunity and stage are required.');
  const probabilityBasisPoints = integer(formData, 'probabilityBasisPoints');
  const result = await platformRequest(
    `/v1/sales/opportunities/${encodeURIComponent(opportunityId)}/move`,
    {
      method: 'POST',
      idempotent: true,
      body: {
        stageId,
        ...(probabilityBasisPoints === undefined ? {} : { probabilityBasisPoints }),
      },
    },
  );
  if (result.kind !== 'success') return fail(returnTo, apiMessage(result));
  redirect(`${returnTo}?message=Opportunity%20stage%20updated.`);
}

export async function closeSalesOpportunity(formData: FormData): Promise<void> {
  const opportunityId = required(formData, 'opportunityId');
  const outcome = required(formData, 'outcome');
  const returnTo = safeReturn(formData);
  if (!opportunityId || !outcome) return fail(returnTo, 'Opportunity and outcome are required.');

  const wonOrderRef = optional(formData, 'wonOrderRef');
  let wonStoreId = optional(formData, 'wonStoreId');
  let wonOrderId = optional(formData, 'wonOrderId');
  if (wonOrderRef) {
    const [selectedStoreId, selectedOrderId] = wonOrderRef.split('|');
    if (!selectedStoreId || !selectedOrderId)
      return fail(returnTo, 'Choose a valid canonical Commerce order.');
    wonStoreId = selectedStoreId;
    wonOrderId = selectedOrderId;
  }
  if (outcome === 'WON' && (!wonStoreId || !wonOrderId))
    return fail(returnTo, 'A confirmed or closed canonical order is required to mark the opportunity won.');

  const result = await platformRequest(
    `/v1/sales/opportunities/${encodeURIComponent(opportunityId)}/close`,
    {
      method: 'POST',
      idempotent: true,
      body: {
        outcome,
        ...(optional(formData, 'stageId') ? { stageId: optional(formData, 'stageId') } : {}),
        ...(wonStoreId ? { wonStoreId } : {}),
        ...(wonOrderId ? { wonOrderId } : {}),
        ...(optional(formData, 'lossReason')
          ? { lossReason: optional(formData, 'lossReason') }
          : {}),
      },
    },
  );
  if (result.kind !== 'success') return fail(returnTo, apiMessage(result));
  redirect(`${returnTo}?message=Opportunity%20closed.`);
}

export async function createSalesActivity(formData: FormData): Promise<void> {
  const customerId = required(formData, 'customerId');
  const activityType = required(formData, 'activityType');
  const title = required(formData, 'title');
  const returnTo = safeReturn(formData);
  if (!customerId || !activityType || !title)
    return fail(returnTo, 'Customer, activity type and title are required.');
  const result = await platformRequest('/v1/sales/activities', {
    method: 'POST',
    idempotent: true,
    body: {
      customerId,
      activityType,
      title,
      ...(optional(formData, 'leadId') ? { leadId: optional(formData, 'leadId') } : {}),
      ...(optional(formData, 'opportunityId')
        ? { opportunityId: optional(formData, 'opportunityId') }
        : {}),
      ...(optional(formData, 'assignedMembershipId')
        ? { assignedMembershipId: optional(formData, 'assignedMembershipId') }
        : {}),
      ...(optional(formData, 'body') ? { body: optional(formData, 'body') } : {}),
      ...(optional(formData, 'dueAt') ? { dueAt: optional(formData, 'dueAt') } : {}),
    },
  });
  if (result.kind !== 'success') return fail(returnTo, apiMessage(result));
  redirect(`${returnTo}?message=Sales%20activity%20created.`);
}

export async function completeSalesActivity(formData: FormData): Promise<void> {
  const activityId = required(formData, 'activityId');
  const returnTo = safeReturn(formData);
  if (!activityId) return fail(returnTo, 'Activity is required.');
  const result = await platformRequest(
    `/v1/sales/activities/${encodeURIComponent(activityId)}/complete`,
    { method: 'POST', idempotent: true },
  );
  if (result.kind !== 'success') return fail(returnTo, apiMessage(result));
  redirect(`${returnTo}?message=Sales%20activity%20completed.`);
}

function required(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optional(formData: FormData, key: string): string | undefined {
  return required(formData, key);
}

function strings(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

function integer(formData: FormData, key: string): number | undefined {
  const value = optional(formData, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function safeReturn(formData: FormData): string {
  const value = optional(formData, 'returnTo') ?? '/sales';
  return value === '/sales' || /^\/sales\/[0-9a-f-]{36}$/iu.test(value) ? value : '/sales';
}

function fail(path: string, message: string): never {
  redirect(`${path}?message=${encodeURIComponent(message)}`);
}
