import { randomUUID } from 'node:crypto';
import type { TenantRequestContext } from '@platform/command-execution';
import { approvalActionDigest, type ApprovalAction } from '@platform/contracts';
import { sql, withTenantTransaction } from '@platform/database';
import { Injectable } from '@nestjs/common';
import { ConnectorRegistry, type Connector } from '@platform/connectors';
import { z } from 'zod';
import { ApiDatabaseService } from './api-database.service.js';
import type { TicketSlaPolicyInput } from './tickets.service.js';

const mergeRequestSchema = z.object({
  sourceCustomerId: z.string().uuid(),
  targetCustomerId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1_000),
});

const decisionSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) });
const slaPolicyRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  firstResponseMinutes: z.number().int().min(1).max(10080),
  resolutionMinutes: z.number().int().min(1).max(43200),
  escalationMinutes: z.number().int().min(1).max(43200).optional(),
});
const slaPolicyArchiveRequestSchema = z.object({ slaPolicyId: z.string().uuid() });
const providerActionRequestSchema = z.object({
  connectionId: z.string().uuid(),
  actionType: z.string().regex(/^[a-z][a-z0-9_.-]{2,127}$/),
  input: z.record(z.unknown()).default({}),
});

export type ApprovedProviderAction = z.infer<typeof providerActionRequestSchema>;

export class ApprovalError extends Error {}

@Injectable()
export class ApprovalService {
  public constructor(
    private readonly database: ApiDatabaseService,
    private readonly connectors?: ConnectorRegistry,
  ) {}

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

  public async requestSlaPolicy(context: TenantRequestContext, input: unknown) {
    this.require(context, 'tickets.sla.manage');
    const request = slaPolicyRequestSchema.parse(input);
    const slaPolicyId = randomUUID();
    const action: ApprovalAction = {
      action: 'tickets.sla_policy.create',
      permission: 'tickets.sla.manage',
      risk: 'HIGH',
      resource: { type: 'ticket_sla_policy', id: slaPolicyId, tenantId: context.tenantId },
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
      if (!approval) throw new ApprovalError('SLA policy approval request could not be stored');
      await sql`insert into platform.audit_log (
        tenant_id, actor_type, actor_id, action, resource_type, resource_id, request_id, correlation_id, metadata
      ) values (
        ${context.tenantId}::uuid, ${context.actorType}, ${context.actorId}::uuid,
        'policy.approval.request', ${action.resource.type}, ${action.resource.id},
        ${context.requestId}, ${context.correlationId}, ${JSON.stringify({ approvalId: approval.id, actionDigest: digest })}::jsonb
      )`.execute(transaction);
      return { approvalId: approval.id, status: approval.status, expiresAt: approval.expires_at };
    });
  }

  public async requestSlaPolicyArchive(context: TenantRequestContext, input: unknown) {
    this.require(context, 'tickets.sla.manage');
    const request = slaPolicyArchiveRequestSchema.parse(input);
    const action: ApprovalAction = {
      action: 'tickets.sla_policy.archive',
      permission: 'tickets.sla.manage',
      risk: 'HIGH',
      resource: { type: 'ticket_sla_policy', id: request.slaPolicyId, tenantId: context.tenantId },
      input: {},
    };
    const digest = approvalActionDigest(action);
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const policy = await sql<{ id: string }>`select id from tickets.sla_policies
        where id = ${request.slaPolicyId}::uuid and active`.execute(transaction);
      if (!policy.rows[0]) throw new ApprovalError('Active SLA policy was not found');
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
      if (!approval) throw new ApprovalError('SLA policy archive approval could not be stored');
      await sql`insert into platform.audit_log (
        tenant_id, actor_type, actor_id, action, resource_type, resource_id, request_id, correlation_id, metadata
      ) values (
        ${context.tenantId}::uuid, ${context.actorType}, ${context.actorId}::uuid,
        'policy.approval.request', ${action.resource.type}, ${action.resource.id},
        ${context.requestId}, ${context.correlationId}, ${JSON.stringify({ approvalId: approval.id, actionDigest: digest })}::jsonb
      )`.execute(transaction);
      return { approvalId: approval.id, status: approval.status, expiresAt: approval.expires_at };
    });
  }

  public async requestProviderAction(context: TenantRequestContext, input: unknown) {
    this.require(context, 'integrations.manage');
    const request = providerActionRequestSchema.parse(input);
    const action: ApprovalAction = {
      action: 'integrations.provider_action.request',
      permission: 'integrations.manage',
      risk: 'HIGH',
      resource: {
        type: 'integration.connection',
        id: request.connectionId,
        tenantId: context.tenantId,
      },
      input: request,
    };
    const digest = approvalActionDigest(action);
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const connection = await sql<{ id: string; connector_key: string }>`select id, connector_key
        from integrations.connections
        where id = ${request.connectionId}::uuid and status in ('CONNECTED', 'DEGRADED')
        for share`.execute(transaction);
      if (!connection.rows[0]) throw new ApprovalError('Connected integration was not found');
      if (!this.connectors)
        throw new ApprovalError('Connector registry is unavailable for provider action approval');
      const connector = this.connectors.get(connection.rows[0].connector_key);
      if (!supportsProviderAction(connector, request.actionType))
        throw new ApprovalError('Connector does not support this typed provider action');
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
      if (!approval) throw new ApprovalError('Provider action approval could not be stored');
      await sql`insert into platform.audit_log (
        tenant_id, actor_type, actor_id, action, resource_type, resource_id, request_id, correlation_id, metadata
      ) values (
        ${context.tenantId}::uuid, ${context.actorType}, ${context.actorId}::uuid,
        'policy.approval.request', ${action.resource.type}, ${action.resource.id},
        ${context.requestId}, ${context.correlationId}, ${JSON.stringify({ approvalId: approval.id, actionDigest: digest })}::jsonb
      )`.execute(transaction);
      return { approvalId: approval.id, status: approval.status, expiresAt: approval.expires_at };
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

  public async executableMerge(context: TenantRequestContext, approvalId: string) {
    this.require(context, 'crm.customers.merge');
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const result = await sql<{
        request_snapshot: unknown;
        status: string;
      }>`select request_snapshot, status
        from policy.approval_requests where id = ${approvalId}::uuid and action = 'crm.customer.merge'`.execute(
        transaction,
      );
      const approval = result.rows[0];
      if (!approval || approval.status !== 'APPROVED')
        throw new ApprovalError('Merge approval is not executable');
      const snapshot = approval.request_snapshot as { input?: unknown };
      return mergeRequestSchema.parse(snapshot.input);
    });
  }

  public async executableSlaPolicy(
    context: TenantRequestContext,
    approvalId: string,
  ): Promise<{ slaPolicyId: string; input: TicketSlaPolicyInput }> {
    this.require(context, 'tickets.sla.manage');
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const result = await sql<{
        request_snapshot: unknown;
        status: string;
      }>`select request_snapshot, status from policy.approval_requests
        where id = ${approvalId}::uuid and action = 'tickets.sla_policy.create'`.execute(
        transaction,
      );
      const approval = result.rows[0];
      if (!approval || approval.status !== 'APPROVED')
        throw new ApprovalError('SLA policy approval is not executable');
      const snapshot = approval.request_snapshot as {
        input?: unknown;
        resource?: { id?: unknown; type?: unknown };
      };
      if (
        snapshot.resource?.type !== 'ticket_sla_policy' ||
        typeof snapshot.resource.id !== 'string'
      )
        throw new ApprovalError('SLA policy approval snapshot is invalid');
      const input = slaPolicyRequestSchema.parse(snapshot.input);
      return {
        slaPolicyId: snapshot.resource.id,
        input: {
          name: input.name,
          priority: input.priority,
          firstResponseMinutes: input.firstResponseMinutes,
          resolutionMinutes: input.resolutionMinutes,
          ...(input.escalationMinutes === undefined
            ? {}
            : { escalationMinutes: input.escalationMinutes }),
        },
      };
    });
  }

  public async executableSlaPolicyArchive(
    context: TenantRequestContext,
    approvalId: string,
  ): Promise<{ slaPolicyId: string }> {
    this.require(context, 'tickets.sla.manage');
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const result = await sql<{
        request_snapshot: unknown;
        status: string;
      }>`select request_snapshot, status from policy.approval_requests
        where id = ${approvalId}::uuid and action = 'tickets.sla_policy.archive'`.execute(
        transaction,
      );
      const approval = result.rows[0];
      if (!approval || approval.status !== 'APPROVED')
        throw new ApprovalError('SLA policy archive approval is not executable');
      const snapshot = approval.request_snapshot as { resource?: { id?: unknown; type?: unknown } };
      if (snapshot.resource?.type !== 'ticket_sla_policy')
        throw new ApprovalError('SLA policy archive approval snapshot is invalid');
      return {
        slaPolicyId: slaPolicyArchiveRequestSchema.parse({ slaPolicyId: snapshot.resource.id })
          .slaPolicyId,
      };
    });
  }

  public async executableProviderAction(
    context: TenantRequestContext,
    approvalId: string,
  ): Promise<ApprovedProviderAction> {
    this.require(context, 'integrations.manage');
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const result = await sql<{
        request_snapshot: unknown;
        status: string;
      }>`select request_snapshot, status
        from policy.approval_requests
        where id = ${approvalId}::uuid and action = 'integrations.provider_action.request'`.execute(
        transaction,
      );
      const approval = result.rows[0];
      if (!approval || approval.status !== 'APPROVED')
        throw new ApprovalError('Provider action approval is not executable');
      const snapshot = approval.request_snapshot as {
        input?: unknown;
        resource?: { id?: unknown; type?: unknown };
      };
      if (
        snapshot.resource?.type !== 'integration.connection' ||
        typeof snapshot.resource.id !== 'string'
      )
        throw new ApprovalError('Provider action approval snapshot is invalid');
      const input = providerActionRequestSchema.parse({
        connectionId: snapshot.resource.id,
        ...(typeof snapshot.input === 'object' && snapshot.input !== null ? snapshot.input : {}),
      });
      return input;
    });
  }

  private require(context: TenantRequestContext, permission: string): void {
    if (!context.permissions.includes(permission)) throw new ApprovalError('Permission denied');
  }
}

function supportsProviderAction(
  connector: Connector,
  actionType: string,
): connector is Connector & Required<Pick<Connector, 'executeAction' | 'supportedActionTypes'>> {
  return (
    typeof connector.executeAction === 'function' &&
    Array.isArray(connector.supportedActionTypes) &&
    connector.supportedActionTypes.includes(actionType)
  );
}
