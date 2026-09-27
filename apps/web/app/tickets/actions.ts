'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

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
