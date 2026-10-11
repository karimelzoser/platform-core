import {
  type CommandExecutor,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';
import { z } from 'zod';

export const recoveryWorkflowReferenceSchema = z.object({
  tenantId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  creationEventId: z.string().uuid(),
  workflowId: z.string().min(1).max(500),
});
export type RecoveryWorkflowReference = z.infer<typeof recoveryWorkflowReferenceSchema>;
export interface RecoveryWorkflowSnapshot {
  status: string;
  expiresAt: string;
}

export function recoveryWorkflowId(tenantId: string, sourceOrderId: string): string {
  return `recovery:${z.string().uuid().parse(tenantId)}:${z.string().uuid().parse(sourceOrderId)}`;
}

export function recoveryIsTerminal(status: string): boolean {
  return ['RECOVERED', 'EXPIRED', 'CANCELLED'].includes(status);
}

/** The same protected expiry command is used by API and Temporal actors. */
export class RecoveryLifecycleCommands {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async snapshot(
    context: TenantRequestContext,
    input: RecoveryWorkflowReference,
  ): Promise<RecoveryWorkflowSnapshot> {
    const reference = recoveryWorkflowReferenceSchema.parse(input);
    if (context.tenantId !== reference.tenantId)
      throw new Error('Recovery workflow tenant mismatch');
    return withTenantTransaction(this.database, context, async (transaction) => {
      // Private queue messages are still not permission to invent business state.
      // Require a real committed creation event and its canonical opportunity.
      const response = await sql<{ status: string; expires_at: Date }>`
        select opportunity.status, opportunity.expires_at
        from recovery.opportunities opportunity
        join platform.outbox_events event on event.tenant_id = opportunity.tenant_id
          and event.id = ${reference.creationEventId}::uuid
          and event.event_type = 'recovery.opportunity.created'
          and event.event_version = 1
          and event.data->>'opportunityId' = opportunity.id::text
          and event.data->>'workflowId' = opportunity.temporal_workflow_id
        where opportunity.id = ${reference.opportunityId}::uuid
          and opportunity.temporal_workflow_id = ${reference.workflowId}
      `.execute(transaction);
      const row = response.rows[0];
      if (!row) throw new Error('Committed recovery workflow origin was not found');
      return { status: row.status, expiresAt: row.expires_at.toISOString() };
    });
  }

  public async expireOpportunity(
    context: TenantRequestContext,
    idempotencyKey: string,
    opportunityId: string,
  ): Promise<CommandResult<{ opportunityId: string; status: string }>> {
    const id = z.string().uuid().parse(opportunityId);
    return this.commands.execute(
      {
        action: 'recovery.opportunity.expire',
        permission: 'recovery.execute',
        risk: 'LOW',
        resource: () => ({ type: 'recovery.opportunity', id }),
        event: {
          type: 'recovery.opportunity.expiry_checked',
          data: (_input, result) => result,
          dedupeKey: () => `recovery:expiry:${idempotencyKey.trim()}`,
        },
        audit: { afterState: (_input, result) => result },
        execute: async (transaction) => {
          const response = await sql<{ status: string; store_id: string; due: boolean }>`
            select status, store_id, expires_at <= now() as due
            from recovery.opportunities where id = ${id}::uuid for update
          `.execute(transaction);
          const row = response.rows[0];
          if (!row) throw new Error('Recovery opportunity was not found');
          if (recoveryIsTerminal(row.status)) return { opportunityId: id, status: row.status };
          // Fail rather than cache an idempotent premature no-op forever. The
          // workflow retries if the database clock is behind the durable timer.
          if (!row.due) throw new Error('Recovery expiry is not due');
          await sql`update recovery.opportunities set status = 'EXPIRED', updated_at = now()
            where id = ${id}::uuid`.execute(transaction);
          await sql`update recovery.offers set status = 'EXPIRED', updated_at = now()
            where opportunity_id = ${id}::uuid and status = 'ACTIVE'`.execute(transaction);
          await sql`update recovery.attempts set status = 'CANCELLED', updated_at = now()
            where opportunity_id = ${id}::uuid and status = 'RESERVED'`.execute(transaction);
          await sql`insert into recovery.timeline (
              tenant_id, store_id, opportunity_id, event_type, actor_type, actor_id, data
            ) values (
              ${context.tenantId}::uuid, ${row.store_id}::uuid, ${id}::uuid,
              'recovery.expired', ${context.actorType}, ${context.actorId}::uuid, '{}'::jsonb
            )`.execute(transaction);
          return { opportunityId: id, status: 'EXPIRED' };
        },
      },
      { context, input: { opportunityId: id }, idempotencyKey },
    );
  }
}
