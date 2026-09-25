import { randomUUID } from 'node:crypto';
import type { TenantRequestContext } from '@platform/command-execution';
import { approvalActionDigest, type ApprovalAction } from '@platform/contracts';
import { sql, withTenantTransaction } from '@platform/database';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ApiDatabaseService } from './api-database.service.js';

const mergeRequestSchema = z.object({
  sourceCustomerId: z.string().uuid(),
  targetCustomerId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1_000),
});

const decisionSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) });

export class ApprovalError extends Error {}

@Injectable()
export class ApprovalService {
  public constructor(private readonly database: ApiDatabaseService) {}

  public async requestMerge(context: TenantRequestContext, input: unknown) {
    this.require(context, 'crm.customers.merge');
    const request = mergeRequestSchema.parse(input);
    if (request.sourceCustomerId === request.targetCustomerId) {
      throw new ApprovalError('Source and target customers must be different');
    }
    const action: ApprovalAction = {
      action: 'crm.customer.merge',
      permission: 'crm.customers.merge',
      risk: 'HIGH',
      resource: { type: 'crm.customer', id: request.sourceCustomerId, tenantId: context.tenantId },
      input: request,
    };
    const digest = approvalActionDigest(action);
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const result = await sql<{
        id: string;
        status: string;
        expires_at: Date;
      }>`insert into policy.approval_requests (
        id, tenant_id, requested_by, action, permission, risk, resource_type, resource_id,
        action_digest, request_snapshot, policy_reason, status, expires_at
      ) values (
        ${randomUUID()}::uuid, ${context.tenantId}::uuid, ${context.actorId}::uuid,
        ${action.action}, ${action.permission}, ${action.risk}, ${action.resource.type}, ${action.resource.id},
        ${digest}, ${JSON.stringify(action)}::jsonb, 'approval_required', 'REQUESTED', now() + interval '24 hours'
      ) on conflict (tenant_id, action_digest, status) do update set updated_at = now()
      returning id, status, expires_at`.execute(transaction);
      const approval = result.rows[0];
      if (!approval) throw new ApprovalError('Approval request could not be stored');
      await sql`insert into platform.audit_log (
        tenant_id, actor_type, actor_id, action, resource_type, resource_id, request_id, correlation_id, metadata
      ) values (
        ${context.tenantId}::uuid, ${context.actorType}, ${context.actorId}::uuid,
        'policy.approval.request', ${action.resource.type}, ${action.resource.id},
        ${context.requestId}, ${context.correlationId}, ${JSON.stringify({ approvalId: approval.id, actionDigest: digest })}::jsonb
      )`.execute(transaction);
      return {
        approvalId: approval.id,
        status: approval.status,
        expiresAt: approval.expires_at,
        actionDigest: digest,
      };
    });
  }

  public async list(context: TenantRequestContext) {
    this.require(context, 'policy.approvals.read');
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const result = await sql<{
        id: string;
        action: string;
        resource_type: string;
        resource_id: string;
        status: string;
        expires_at: Date;
      }>`select id, action, resource_type, resource_id, status, expires_at from policy.approval_requests
        order by created_at desc limit 100`.execute(transaction);
      return result.rows;
    });
  }

  public async decide(context: TenantRequestContext, approvalId: string, input: unknown) {
    this.require(context, 'policy.approvals.decide');
    const decision = decisionSchema.parse(input);
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      await sql`update policy.approval_requests set status = 'EXPIRED', updated_at = now()
        where id = ${approvalId}::uuid and status = 'REQUESTED' and expires_at <= now()`.execute(
        transaction,
      );
      const result = await sql<{ id: string; status: string }>`update policy.approval_requests
        set status = ${decision.decision}, decided_by = ${context.actorId}::uuid, decided_at = now(), updated_at = now()
        where id = ${approvalId}::uuid and status = 'REQUESTED' and expires_at > now()
          and requested_by is distinct from ${context.actorId}::uuid
        returning id, status`.execute(transaction);
      const approval = result.rows[0];
      if (!approval)
        throw new ApprovalError('Approval is unavailable, expired, or cannot be self-approved');
      return approval;
    });
  }

  private require(context: TenantRequestContext, permission: string): void {
    if (!context.permissions.includes(permission)) throw new ApprovalError('Permission denied');
  }
}
