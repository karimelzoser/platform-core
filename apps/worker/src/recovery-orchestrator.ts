import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor } from '@platform/command-execution';
import { eventEnvelopeSchema } from '@platform/contracts';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';
import {
  recoveryWorkflowReferenceSchema,
  type RecoveryWorkflowReference,
} from '@platform/recovery';
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { NativeConnection, Worker } from '@temporalio/worker';
import { AckPolicy, DeliverPolicy, StringCodec, type NatsConnection } from 'nats';
import { fileURLToPath } from 'node:url';
import { createRecoveryActivities } from './recovery-activities.js';

const taskQueue = 'platform-recovery-v1';
const codec = StringCodec();

/** A durable consumer starts/signals workflows only from verified committed events. */
export async function startRecoveryOrchestrator(options: {
  database: PlatformDatabase;
  nats: NatsConnection;
  address: string;
  namespace: string;
  opaUrl: string;
}): Promise<{ ready(): boolean; close(): Promise<void> }> {
  const connection = await Connection.connect({ address: options.address });
  const native = await NativeConnection.connect({ address: options.address });
  const client = new Client({ connection, namespace: options.namespace });
  const commands = new CommandExecutor(
    options.database,
    new CommandAuthorizer(
      new OpaClient({
        endpoint: new URL('/v1/data/platform/authorization/decision', options.opaUrl),
      }),
    ),
  );
  const activities = createRecoveryActivities(options.database, commands);
  const worker = await Worker.create({
    connection: native,
    namespace: options.namespace,
    taskQueue,
    workflowsPath: fileURLToPath(new URL('./recovery-workflows.js', import.meta.url)),
    activities: { ...activities },
  });
  const manager = await options.nats.jetstreamManager();
  const durable = 'platform-recovery-v1';
  try {
    await manager.consumers.info('PLATFORM_EVENTS', durable);
  } catch {
    await manager.consumers.add('PLATFORM_EVENTS', {
      durable_name: durable,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      filter_subject: 'platform.recovery.>',
      max_deliver: 8,
      ack_wait: 30_000_000_000,
    });
  }
  const consumer = await options.nats.jetstream().consumers.get('PLATFORM_EVENTS', durable);
  const messages = await consumer.consume({ max_messages: 10 });
  const execution = worker.run();
  let failed = false;
  const consumption = (async () => {
    for await (const message of messages) {
      try {
        const event = eventEnvelopeSchema.parse(JSON.parse(codec.decode(message.data)) as unknown);
        if (
          event.type !== 'recovery.opportunity.created' &&
          event.type !== 'recovery.opportunity.recovered'
        ) {
          message.ack();
          continue;
        }
        const reference = await committedReference(options.database, event);
        await activities.recoverySnapshot(reference);
        if (event.type === 'recovery.opportunity.created') {
          try {
            await client.workflow.start('recoveryExpiryWorkflow', {
              taskQueue,
              workflowId: reference.workflowId,
              args: [reference],
              workflowIdReusePolicy: 'REJECT_DUPLICATE',
            });
          } catch (error) {
            if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
          }
        } else {
          // signalWithStart covers recovery arriving before the creation delivery.
          try {
            await client.workflow.signalWithStart('recoveryExpiryWorkflow', {
              taskQueue,
              workflowId: reference.workflowId,
              args: [reference],
              signal: 'refreshRecovery',
              signalArgs: [],
              workflowIdReusePolicy: 'REJECT_DUPLICATE',
            });
          } catch (error) {
            // Duplicate conversion delivery must not restart a terminal history.
            if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
          }
        }
        message.ack();
      } catch {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'recovery_event_coordination_failed',
            streamSequence: message.info.streamSequence,
            attempt: message.info.deliveryCount,
          }),
        );
        message.nak(5_000);
      }
    }
  })();
  // Keep asynchronous failures visible; shutdown does not silently orphan pollers.
  void execution.catch(() => {
    failed = true;
    messages.stop();
  });
  void consumption.catch(() => {
    failed = true;
  });
  return {
    ready: () => !failed && worker.getState() === 'RUNNING',
    close: async () => {
      messages.stop();
      if (worker.getState() === 'RUNNING') worker.shutdown();
      await Promise.all([execution, consumption]);
      await native.close();
      await connection.close();
    },
  };
}

async function committedReference(
  database: PlatformDatabase,
  event: ReturnType<typeof eventEnvelopeSchema.parse>,
): Promise<RecoveryWorkflowReference> {
  return withTenantTransaction(
    database,
    {
      tenantId: event.tenantId,
      actorId: null,
      subject: 'worker:recovery-orchestrator',
      requestId: event.id,
    },
    async (transaction) => {
      const result = await sql<{
        opportunity_id: string;
        workflow_id: string;
        creation_event_id: string;
      }>`
      select opportunity.id as opportunity_id, opportunity.temporal_workflow_id as workflow_id,
        origin.id as creation_event_id
      from platform.outbox_events delivered
      join recovery.opportunities opportunity on opportunity.tenant_id = delivered.tenant_id
        and opportunity.id::text = case when delivered.event_type = 'recovery.opportunity.created'
          then delivered.data->>'opportunityId' else delivered.resource_id end
      join platform.outbox_events origin on origin.tenant_id = opportunity.tenant_id
        and origin.event_type = 'recovery.opportunity.created' and origin.event_version = 1
        and origin.data->>'opportunityId' = opportunity.id::text
      where delivered.id = ${event.id}::uuid and delivered.event_type = ${event.type}
        and delivered.event_version = ${event.version}
    `.execute(transaction);
      const row = result.rows[0];
      if (!row) throw new Error('Committed recovery event was not found');
      return recoveryWorkflowReferenceSchema.parse({
        tenantId: event.tenantId,
        opportunityId: row.opportunity_id,
        creationEventId: row.creation_event_id,
        workflowId: row.workflow_id,
      });
    },
  );
}
