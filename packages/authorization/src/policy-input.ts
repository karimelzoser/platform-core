import type { ApprovalAction } from '@platform/contracts';

export interface AuthorizationSubject {
  id: string;
  tenantId: string;
  permissions: readonly string[];
  authenticated: true;
}

export function toOpaInput(
  subject: AuthorizationSubject,
  action: ApprovalAction,
): Record<string, unknown> {
  return {
    tenant_id: subject.tenantId,
    subject: {
      authenticated: subject.authenticated,
      id: subject.id,
      tenant_id: subject.tenantId,
      permissions: [...subject.permissions],
    },
    action: { name: action.action, permission: action.permission, risk: action.risk },
    resource: {
      type: action.resource.type,
      id: action.resource.id,
      tenant_id: action.resource.tenantId,
    },
  };
}
