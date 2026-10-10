import { Injectable } from '@nestjs/common';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { sql } from '@platform/database';

export class ReturnsResolutionError extends Error {}

@Injectable()
export class ReturnsResolutionService {
  public constructor(private readonly commands: CommandExecutor) {}

  public async resolve(
    context: TenantRequestContext,
    returnId: string,
    idempotencyKey: string,
  ) {
    return this.commands.execute(
      {
        action: 'returns.request.resolve',
        permission: 'returns.manage',
        risk: 'MEDIUM',
        resource: () => ({ type: 'returns.request', id: returnId }),
        event: {
          type: 'returns.request.resolved',
          data: () => ({ returnId }),
          dedupeKey: () => `returns:resolved:${returnId}:${idempotencyKey}`,
        },
        audit: {
          afterState: () => ({ returnId, status: 'RESOLVED' }),
        },
        execute: async (transaction) => {
          const request = await sql<{ id: string }>`select id from returns.return_requests
            where id = ${returnId}::uuid and status = 'INSPECTED'
            for update`.execute(transaction);
          if (!request.rows[0]) {
            throw new ReturnsResolutionError('Only inspected returns can be resolved');
          }

          const unresolved = await sql<{
            return_line_id: string;
            requested_resolution: string;
            accepted_quantity: number;
            required_refund_minor: string;
            refunded_minor: string;
            exchanged_quantity: string;
          }>`
            select
              line.id as return_line_id,
              line.requested_resolution,
              coalesce(sum(inspection.accepted_quantity), 0)::integer as accepted_quantity,
              coalesce(sum(
                floor(line.proposed_refund_minor::numeric * inspection.accepted_quantity / line.quantity)
              ), 0)::bigint::text as required_refund_minor,
              coalesce((
                select sum(refund.amount_minor)
                from returns.refunds refund
                where refund.tenant_id = line.tenant_id
                  and refund.return_id = line.return_id
                  and refund.status not in ('FAILED', 'CANCELLED')
              ), 0)::bigint::text as refunded_minor,
              coalesce((
                select sum(exchange_line.quantity)
                from returns.exchange_lines exchange_line
                join returns.exchange_requests exchange
                  on exchange.tenant_id = exchange_line.tenant_id
                 and exchange.id = exchange_line.exchange_id
                where exchange_line.tenant_id = line.tenant_id
                  and exchange_line.return_line_id = line.id
                  and exchange.status not in ('FAILED', 'CANCELLED')
              ), 0)::bigint::text as exchanged_quantity
            from returns.return_lines line
            left join returns.inspection_lines inspection
              on inspection.tenant_id = line.tenant_id
             and inspection.return_id = line.return_id
             and inspection.return_line_id = line.id
            where line.return_id = ${returnId}::uuid
            group by line.tenant_id, line.return_id, line.id, line.requested_resolution
          `.execute(transaction);

          const refundRequired = unresolved.rows
            .filter((line) => line.requested_resolution === 'REFUND' && line.accepted_quantity > 0)
            .reduce((sum, line) => sum + BigInt(line.required_refund_minor), 0n);
          const refunded = unresolved.rows.length
            ? BigInt(unresolved.rows[0]?.refunded_minor ?? '0')
            : 0n;
          if (refunded < refundRequired) {
            throw new ReturnsResolutionError('Accepted refund value has not been fully resolved');
          }

          const incompleteExchange = unresolved.rows.find(
            (line) =>
              line.requested_resolution === 'EXCHANGE' &&
              line.accepted_quantity > Number(line.exchanged_quantity),
          );
          if (incompleteExchange) {
            throw new ReturnsResolutionError('Accepted exchange quantity has not been fully resolved');
          }

          await sql`update returns.return_requests
            set status = 'RESOLVED', resolved_at = now(), updated_at = now()
            where id = ${returnId}::uuid`.execute(transaction);
          await sql`insert into returns.timeline (
              tenant_id, return_id, event_type, actor_type, actor_id, data
            ) values (
              ${context.tenantId}::uuid, ${returnId}::uuid, 'returns.request.resolved',
              ${context.actorType}, ${context.actorId}::uuid,
              ${JSON.stringify({ refundRequiredMinor: refundRequired.toString(), refundedMinor: refunded.toString() })}::jsonb
            )`.execute(transaction);
          return { returnId, status: 'RESOLVED' as const };
        },
      },
      { context, input: { returnId }, idempotencyKey },
    );
  }
}
