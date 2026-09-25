import { createHash, randomUUID } from 'node:crypto';
import {
  CommandAuthorizer,
  type ApprovalEvidence,
  type AuthorizationSubject,
} from '@platform/authorization';
import { approvalActionDigest, type ApprovalAction, type EventEnvelope } from '@platform/contracts';
import {
  sql,
  withTenantTransaction,
  type DatabaseContext,
  type PlatformDatabase,
} from '@platform/database';
import type { Transaction } from 'kysely';

type DatabaseTransaction = Transaction<Record<string, never>>;
type ActorType = EventEnvelope['actor']['type'];
type JsonRecord = Record<string, unknown>;

const sensitiveKey = /(?:authorization|cookie|pass(?:word)?|secret|token|private.?key|credential)/i;

export class CommandExecutionError extends Error {
  public constructor(
    public readonly code:
      | 'approval_required'
      | 'authorization_denied'
      | 'idempotency_conflict'
      | 'idempotency_in_progress'
      | 'approval_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'CommandExecutionError';
  }
}

export interface TenantRequestContext extends DatabaseContext {
  permissions: readonly string[];
  actorType: ActorType;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CommandDefinition<Input extends JsonRecord, Result extends JsonRecord> {
  action: string;
  permission: string;
  risk: ApprovalAction['risk'];
  resource: (input: Input) => { type: string; id: string };
  event: {
    type: string;
    source?: string;
    dedupeKey?: (input: Input, result: Result) => string | undefined;
    data: (input: Input, result: Result) => JsonRecord;
  };
  audit?: {
    beforeState?: (input: Input, result: Result) => JsonRecord | undefined;
    afterState?: (input: Input, result: Result) => JsonRecord | undefined;
    metadata?: (input: Input, result: Result) => JsonRecord | undefined;
  };
  execute(transaction: DatabaseTransaction): Promise<Result>;
}

export interface CommandRequest<Input extends JsonRecord> {
  context: TenantRequestContext;
  input: Input;
  idempotencyKey: string;
  approvalId?: string;
}

export interface CommandResult<Result extends JsonRecord> {
  result: Result;
  status: number;
  replayed: boolean;
}

interface IdempotencyRow {
  request_hash: string | null;
  state: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  response_status: number | null;
  response_body: JsonRecord | null;
}

/** A stable input hash detects reuse of an idempotency key with a changed request. */
export function requestFingerprint(value: JsonRecord): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** Removes credentials from audit payloads without mutating domain objects. */
export function sanitizeForAudit(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeForAudit);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, nested]) => [
      key,
      sensitiveKey.test(key) ? '[REDACTED]' : sanitizeForAudit(nested),
    ]),
  );
}

/**
 * The sole write path for protected application commands. It keeps the
 * idempotency record, approved-action consumption, domain mutation, immutable
 * audit record, and outbox row in one tenant-scoped transaction.
 */
export class CommandExecutor {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly authorizer: CommandAuthorizer,
  ) {}

  public async execute<Input extends JsonRecord, Result extends JsonRecord>(
    definition: CommandDefinition<Input, Result>,
    request: CommandRequest<Input>,
  ): Promise<CommandResult<Result>> {
    const idempotencyKey = request.idempotencyKey.trim();
    if (!idempotencyKey)
      throw new CommandExecutionError('idempotency_conflict', 'Idempotency-Key is required');

    const resource = definition.resource(request.input);
    const action: ApprovalAction = {
      action: definition.action,
      permission: definition.permission,
      risk: definition.risk,
      resource: { ...resource, tenantId: request.context.tenantId },
      input: request.input,
    };
    const subject: AuthorizationSubject = {
      id: request.context.actorId ?? request.context.subject,
      tenantId: request.context.tenantId,
      permissions: request.context.permissions,
      authenticated: true,
    };
    const approval = request.approvalId
      ? await this.findApproval(request.context, request.approvalId)
      : undefined;
    const authorization = await this.authorizer.authorize(subject, action, approval);
    if (authorization.kind === 'APPROVAL_REQUIRED') {
      throw new CommandExecutionError('approval_required', authorization.reason);
    }
    if (authorization.kind === 'DENIED') {
      throw new CommandExecutionError('authorization_denied', authorization.reason);
    }

    const requestHash = requestFingerprint(request.input);
    return withTenantTransaction(this.database, request.context, async (transaction) => {
      const reservation = await this.reserveIdempotency(
        transaction,
        request.context.tenantId,
        definition.action,
        idempotencyKey,
        requestHash,
      );
      if (reservation.kind === 'replay') return reservation.result as CommandResult<Result>;

      if (authorization.approvalId) {
        await this.consumeApproval(
          transaction,
          request.context.tenantId,
          authorization.approvalId,
          action,
        );
      }

      const result = await definition.execute(transaction);
      await this.writeAudit(
        transaction,
        request.context,
        definition,
        request.input,
        result,
        resource,
      );
      await this.enqueueEvent(
        transaction,
        request.context,
        definition,
        request.input,
        result,
        resource,
      );
      await this.completeIdempotency(
        transaction,
        request.context.tenantId,
        definition.action,
        idempotencyKey,
        result,
      );
      return { result, status: 200, replayed: false };
    });
  }

  private async findApproval(
    context: TenantRequestContext,
    approvalId: string,
  ): Promise<ApprovalEvidence> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const response = await sql<{
        id: string;
        action_digest: string;
        status: ApprovalEvidence['status'];
        expires_at: Date;
      }>`select id, action_digest, status, expires_at
        from policy.approval_requests where id = ${approvalId}::uuid`.execute(transaction);
      const row = response.rows[0];
      if (!row) throw new CommandExecutionError('approval_unavailable', 'Approval was not found');
      return {
        id: row.id,
        actionDigest: row.action_digest,
        status: row.status,
        expiresAt: row.expires_at,
      };
    });
  }

  private async reserveIdempotency(
    transaction: DatabaseTransaction,
    tenantId: string,
    scope: string,
    key: string,
    requestHash: string,
  ): Promise<{ kind: 'new' } | { kind: 'replay'; result: CommandResult<JsonRecord> }> {
    await sql`delete from platform.idempotency_keys
      where tenant_id = ${tenantId}::uuid and scope = ${scope} and idempotency_key = ${key}
        and expires_at is not null and expires_at <= now()`.execute(transaction);
    const inserted = await sql<{
      id: string;
    }>`insert into platform.idempotency_keys (tenant_id, scope, idempotency_key, request_hash, expires_at)
      values (${tenantId}::uuid, ${scope}, ${key}, ${requestHash}, now() + interval '24 hours')
      on conflict (tenant_id, scope, idempotency_key) do nothing
      returning id`.execute(transaction);
    const response =
      await sql<IdempotencyRow>`select request_hash, state, response_status, response_body
      from platform.idempotency_keys
      where tenant_id = ${tenantId}::uuid and scope = ${scope} and idempotency_key = ${key}
      for update`.execute(transaction);
    const row = response.rows[0];
    if (!row) throw new Error('Idempotency reservation disappeared');
    if (row.request_hash !== requestHash) {
      throw new CommandExecutionError(
        'idempotency_conflict',
        'Idempotency key was used with another request',
      );
    }
    if (row.state === 'COMPLETED' && row.response_body && row.response_status) {
      return {
        kind: 'replay',
        result: { result: row.response_body, status: row.response_status, replayed: true },
      };
    }
    if (row.state === 'IN_PROGRESS' && inserted.rows.length === 0) {
      throw new CommandExecutionError(
        'idempotency_in_progress',
        'An identical command is already executing',
      );
    }
    return { kind: 'new' };
  }

  private async consumeApproval(
    transaction: DatabaseTransaction,
    tenantId: string,
    approvalId: string,
    action: ApprovalAction,
  ): Promise<void> {
    const result = await sql<{ id: string }>`update policy.approval_requests
      set status = 'EXECUTED', execution_id = ${randomUUID()}, updated_at = now()
      where id = ${approvalId}::uuid and tenant_id = ${tenantId}::uuid
        and status = 'APPROVED' and expires_at > now()
        and action_digest = ${approvalActionDigest(action)}
      returning id`.execute(transaction);
    if (result.rows.length !== 1) {
      throw new CommandExecutionError('approval_unavailable', 'Approval is no longer executable');
    }
  }

  private async writeAudit<Input extends JsonRecord, Result extends JsonRecord>(
    transaction: DatabaseTransaction,
    context: TenantRequestContext,
    definition: CommandDefinition<Input, Result>,
    input: Input,
    result: Result,
    resource: { type: string; id: string },
  ): Promise<void> {
    const audit = definition.audit;
    await sql`insert into platform.audit_log (
      tenant_id, actor_type, actor_id, action, resource_type, resource_id,
      request_id, correlation_id, ip_address, user_agent, before_state, after_state, metadata
    ) values (
      ${context.tenantId}::uuid, ${context.actorType}, ${context.actorId}::uuid,
      ${definition.action}, ${resource.type}, ${resource.id}, ${context.requestId},
      ${context.correlationId}, ${context.ipAddress ?? null}::inet, ${context.userAgent ?? null},
      ${JSON.stringify(sanitizeForAudit(audit?.beforeState?.(input, result) ?? null))}::jsonb,
      ${JSON.stringify(sanitizeForAudit(audit?.afterState?.(input, result) ?? result))}::jsonb,
      ${JSON.stringify(sanitizeForAudit(audit?.metadata?.(input, result) ?? {}))}::jsonb
    )`.execute(transaction);
  }

  private async enqueueEvent<Input extends JsonRecord, Result extends JsonRecord>(
    transaction: DatabaseTransaction,
    context: TenantRequestContext,
    definition: CommandDefinition<Input, Result>,
    input: Input,
    result: Result,
    resource: { type: string; id: string },
  ): Promise<void> {
    await sql`insert into platform.outbox_events (
      tenant_id, event_type, source, correlation_id, causation_id, actor_type, actor_id,
      resource_type, resource_id, data, dedupe_key
    ) values (
      ${context.tenantId}::uuid, ${definition.event.type}, ${definition.event.source ?? 'platform'},
      ${context.correlationId}, ${context.requestId}, ${context.actorType}, ${context.actorId}::uuid,
      ${resource.type}, ${resource.id}, ${JSON.stringify(definition.event.data(input, result))}::jsonb,
      ${definition.event.dedupeKey?.(input, result) ?? null}
    )`.execute(transaction);
  }

  private async completeIdempotency(
    transaction: DatabaseTransaction,
    tenantId: string,
    scope: string,
    key: string,
    result: JsonRecord,
  ): Promise<void> {
    await sql`update platform.idempotency_keys
      set state = 'COMPLETED', response_status = 200, response_body = ${JSON.stringify(result)}::jsonb
      where tenant_id = ${tenantId}::uuid and scope = ${scope} and idempotency_key = ${key}`.execute(
      transaction,
    );
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
