'use server';

import { redirect } from 'next/navigation';
import { identityRequest, resultMessage } from '../identity-api';

export async function inviteMember(formData: FormData): Promise<void> {
  const email = required(formData, 'email');
  const roleId = required(formData, 'roleId');
  if (!email || !roleId) redirectWith('Email and role are required.');
  const result = await identityRequest('/v1/identity/invitations', {
    method: 'POST',
    idempotent: true,
    approvalId: optional(formData, 'approvalId'),
    body: { email, roleIds: [roleId], expiresInHours: 168 },
  });
  redirectWith(result.kind === 'success' ? 'Invitation created.' : resultMessage(result));
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const invitationId = required(formData, 'invitationId');
  if (!invitationId) redirectWith('Invitation is required.');
  const result = await identityRequest(`/v1/identity/invitations/${invitationId}/revoke`, {
    method: 'POST',
    idempotent: true,
  });
  redirectWith(result.kind === 'success' ? 'Invitation revoked.' : resultMessage(result));
}

export async function setMemberStatus(formData: FormData): Promise<void> {
  const membershipId = required(formData, 'membershipId');
  const status = required(formData, 'status');
  if (!membershipId || !status) redirectWith('Member and status are required.');
  const result = await identityRequest(`/v1/identity/members/${membershipId}/status`, {
    method: 'POST',
    idempotent: true,
    approvalId: optional(formData, 'approvalId'),
    body: {
      status,
      ...(optional(formData, 'reason') ? { reason: optional(formData, 'reason') } : {}),
    },
  });
  redirectWith(result.kind === 'success' ? 'Member status updated.' : resultMessage(result));
}

export async function setMemberRoles(formData: FormData): Promise<void> {
  const membershipId = required(formData, 'membershipId');
  const roleIds = formData
    .getAll('roleIds')
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
  if (!membershipId || roleIds.length === 0) redirectWith('Select at least one role.');
  const result = await identityRequest(`/v1/identity/members/${membershipId}/roles`, {
    method: 'POST',
    idempotent: true,
    approvalId: optional(formData, 'approvalId'),
    body: { roleIds },
  });
  redirectWith(result.kind === 'success' ? 'Member roles updated.' : resultMessage(result));
}

export async function saveRole(formData: FormData): Promise<void> {
  const roleId = optional(formData, 'roleId');
  const code = required(formData, 'code');
  const name = required(formData, 'name');
  if (!code || !name) redirectWith('Role code and name are required.');
  const permissionCodes = (optional(formData, 'permissionCodes') ?? '')
    .split(/[\s,]+/u)
    .map((value) => value.trim())
    .filter(Boolean);
  const result = await identityRequest(roleId ? `/v1/identity/roles/${roleId}` : '/v1/identity/roles', {
    method: 'POST',
    idempotent: true,
    approvalId: optional(formData, 'approvalId'),
    body: {
      code,
      name,
      ...(optional(formData, 'description') ? { description: optional(formData, 'description') } : {}),
      permissionCodes,
    },
  });
  redirectWith(result.kind === 'success' ? (roleId ? 'Custom role updated.' : 'Custom role created.') : resultMessage(result));
}

export async function deleteRole(formData: FormData): Promise<void> {
  const roleId = required(formData, 'roleId');
  if (!roleId) redirectWith('Role is required.');
  const result = await identityRequest(`/v1/identity/roles/${roleId}/delete`, {
    method: 'POST',
    idempotent: true,
    approvalId: optional(formData, 'approvalId'),
  });
  redirectWith(result.kind === 'success' ? 'Custom role deleted.' : resultMessage(result));
}

function redirectWith(message: string): never {
  redirect(`/team?message=${encodeURIComponent(message)}`);
}

function required(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optional(formData: FormData, key: string): string | undefined {
  return required(formData, key);
}
