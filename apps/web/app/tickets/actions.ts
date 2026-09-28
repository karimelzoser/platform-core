'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

const refreshPath = revalidatePath as (path: string) => void;

export interface TicketActionState {
  error?: string;
  completed?: boolean;
}

export async function createTicket(
  _previousState: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const title = requiredText(formData, 'title');
  const priority = requiredText(formData, 'priority');
  if (!title || !priority) return { error: 'A ticket title and priority are required.' };
  const customerId = optionalText(formData, 'customerId');
  const conversationId = optionalText(formData, 'conversationId');
  return sendTicketCollectionCommand({
    title,
    priority,
    ...(customerId ? { customerId } : {}),
    ...(conversationId ? { conversationId } : {}),
  });
}

export async function requestSlaPolicy(
  _previousState: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const name = requiredText(formData, 'name');
  const priority = requiredText(formData, 'priority');
  const firstResponseMinutes = boundedWholeNumber(formData, 'firstResponseMinutes', 10080);
  const resolutionMinutes = boundedWholeNumber(formData, 'resolutionMinutes', 43200);
  const escalationValue = optionalText(formData, 'escalationMinutes');
  const escalationMinutes = optionalBoundedWholeNumber(formData, 'escalationMinutes', 43200);
  if (
    !name ||
    !priority ||
    !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority) ||
    firstResponseMinutes === undefined ||
    resolutionMinutes === undefined ||
    (escalationValue !== undefined && escalationMinutes === undefined)
  )
    return { error: 'Provide a name, priority, and valid whole-minute SLA clocks.' };
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId)
    return { error: 'Sign in and select an organization before requesting an SLA policy.' };
  if (!baseUrl) return { error: 'Ticket workspace configuration is incomplete.' };
  try {
    const response = await fetch(new URL('/v1/approvals/ticket-sla-policy-request', baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({
        name,
        priority,
        firstResponseMinutes,
        resolutionMinutes,
        ...(escalationMinutes === undefined ? {} : { escalationMinutes }),
      }),
    });
    if (response.status === 401 || response.status === 403)
      return { error: 'Your session no longer has permission to request this SLA policy.' };
    if (!response.ok) return { error: 'The SLA policy approval request could not be recorded.' };
  } catch {
    return { error: 'The approval API is unavailable.' };
  }
  return { completed: true };
}

export async function requestSlaPolicyArchive(
  _previousState: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const slaPolicyId = requiredText(formData, 'slaPolicyId');
  if (!slaPolicyId) return { error: 'The SLA policy could not be identified.' };
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId)
    return { error: 'Sign in and select an organization before archiving an SLA policy.' };
  if (!baseUrl) return { error: 'Ticket workspace configuration is incomplete.' };
  try {
    const response = await fetch(
      new URL('/v1/approvals/ticket-sla-policy-archive-request', baseUrl),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({ slaPolicyId }),
      },
    );
    if (response.status === 401 || response.status === 403)
      return { error: 'Your session no longer has permission to archive this SLA policy.' };
    if (!response.ok) return { error: 'The SLA policy archive request could not be recorded.' };
  } catch {
    return { error: 'The approval API is unavailable.' };
  }
  return { completed: true };
}

export async function updateTicket(
  _previousState: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const ticketId = requiredText(formData, 'ticketId');
  const title = requiredText(formData, 'title');
  const priority = requiredText(formData, 'priority');
  if (!ticketId || !title || !priority) return { error: 'Ticket details are required.' };
  return sendTicketCommand(ticketId, '', 'PATCH', { title, priority });
}

export async function assignTicket(
  _previousState: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const ticketId = requiredText(formData, 'ticketId');
  if (!ticketId) return { error: 'The ticket could not be identified.' };
  const assigneeId = optionalText(formData, 'assigneeId');
  return sendTicketCommand(ticketId, '/assignment', 'POST', { assigneeId: assigneeId || null });
}

export async function setTicketResolution(
  _previousState: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const ticketId = requiredText(formData, 'ticketId');
  const status = requiredText(formData, 'status');
  if (!ticketId || (status !== 'OPEN' && status !== 'RESOLVED'))
    return { error: 'A valid ticket state is required.' };
  return sendTicketCommand(ticketId, '/resolution', 'POST', { status });
}

export async function setTicketSlaStatus(
  _previousState: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const ticketId = requiredText(formData, 'ticketId');
  const status = requiredText(formData, 'status');
  if (!ticketId || (status !== 'OPEN' && status !== 'PENDING'))
    return { error: 'A valid SLA clock state is required.' };
  return sendTicketCommand(ticketId, '/sla-status', 'POST', { status });
}

export async function addTicketComment(
  _previousState: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const ticketId = requiredText(formData, 'ticketId');
  const body = requiredText(formData, 'body');
  const visibility = requiredText(formData, 'visibility');
  if (!ticketId || !body || (visibility !== 'INTERNAL' && visibility !== 'CUSTOMER_VISIBLE'))
    return { error: 'A comment and visibility are required.' };
  return sendTicketCommand(ticketId, '/comments', 'POST', { body, visibility });
}

async function sendTicketCommand(
  ticketId: string,
  suffix: string,
  method: 'PATCH' | 'POST',
  body: Record<string, string | null>,
): Promise<TicketActionState> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId)
    return { error: 'Sign in and select an organization before updating tickets.' };
  if (!baseUrl) return { error: 'Ticket workspace configuration is incomplete.' };
  try {
    const response = await fetch(
      new URL(`/v1/tickets/${encodeURIComponent(ticketId)}${suffix}`, baseUrl),
      {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify(body),
      },
    );
    if (response.status === 401 || response.status === 403)
      return { error: 'Your session no longer has permission to update this ticket.' };
    if (response.status === 409)
      return { error: 'This update conflicts with an existing request. Refresh and try again.' };
    if (!response.ok) return { error: 'The ticket update could not be recorded.' };
  } catch {
    return { error: 'The ticket API is unavailable.' };
  }
  refreshPath('/tickets');
  refreshPath(`/tickets/${ticketId}`);
  return { completed: true };
}

async function sendTicketCollectionCommand(
  body: Record<string, string>,
): Promise<TicketActionState> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId)
    return { error: 'Sign in and select an organization before creating tickets.' };
  if (!baseUrl) return { error: 'Ticket workspace configuration is incomplete.' };
  try {
    const response = await fetch(new URL('/v1/tickets', baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify(body),
    });
    if (response.status === 401 || response.status === 403)
      return { error: 'Your session no longer has permission to create tickets.' };
    if (!response.ok) return { error: 'The ticket could not be created.' };
  } catch {
    return { error: 'The ticket API is unavailable.' };
  }
  refreshPath('/tickets');
  return { completed: true };
}

function requiredText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function boundedWholeNumber(formData: FormData, key: string, maximum: number): number | undefined {
  const value = optionalText(formData, key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : undefined;
}

function optionalBoundedWholeNumber(
  formData: FormData,
  key: string,
  maximum: number,
): number | undefined {
  const value = optionalText(formData, key);
  return value ? boundedWholeNumber(formData, key, maximum) : undefined;
}
