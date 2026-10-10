import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { TenantRequestContext } from '@platform/command-execution';
import { approvalActionDigest } from '@platform/contracts';
import { sql, withTenantTransaction } from '@platform/database';
import { ApiDatabaseService } from './api-database.service.js';
import {
  buildReturnsApprovalAction,
  type ReturnsApprovalKind,
} from './returns.service.js';

export class ReturnsApprovalError extends Error {}

@Injectable()
export class ReturnsApprovalService {
  public constructor(private readonly database: ApiDatabaseService) {}

  public async request(
    context: TenantRequestContext,
    returnId: string,
    kind: ReturnsApprovalKind,
    input: unknown,
  ) {
    const action = buildReturnsApprovalAction(context.tenantId, returnId, kind, input);
    if (!context.permissions.includes(action.permission)) {
      throw new ReturnsApprovalError(`${action.permission} permission is required`);
    }
    const digest = approvalActionDigest(action);
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const request = await sql<{ id: string }>`select id from returns.return_requests
        where id = ${returnId}::uuid`.execute(transaction);
      if (!request.rows[0]) throw new ReturnsApprovalError('Return request was not found');

      const result = await sql<{ id: string; status: string; expires_at: Date }>`
        insert into policy.approval_requests (
          id, tenant_id, requested_by, action, permission, risk, resource_type, resource_id,
          action_digest, request_snapshot, policy_reason, status, expires_at
        ) values (
          ${randomUUID()}::uuid, ${context.tenantId}::uuid, ${context.actorId}::uuid,
          ${action.action}, ${action.permission}, ${action.risk}, ${action.resource.type},
          ${action.resource.id}, ${digest}, ${JSON.stringify(action)}::jsonb,
          'approval_required', 'REQUESTED', now() + interval '24 hours'
        )
        on conflict (tenant_id, action_digest, status) do update set updated_at = now()
        returning id, status, expires_at
      `.execute(transaction);
      const approval = result.rows[0];
      if (!approval) throw new ReturnsApprovalError('Approval request could not be stored');

      await sql`insert into platform.audit_log (
          tenant_id, actor_type, actor_id, action, resource_type, resource_id,
          request_id, correlation_id, metadata
        ) values (
          ${context.tenantId}::uuid, ${context.actorType}, ${context.actorId}::uuid,
          'policy.approval.request', ${action.resource.type}, ${action.resource.id},
          ${context.requestId}, ${context.correlationId},
          ${JSON.stringify({ approvalId: approval.id, actionDigest: digest, requestedAction: action.action })}::jsonb
        )`.execute(transaction);

      return {
        approvalId: approval.id,
        status: approval.status,
        expiresAt: approval.expires_at.toISOString(),
        action: action.action,
        actionDigest: digest,
      };
    });
  }
}
