import { type CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { type PlatformDatabase } from '@platform/database';
import {
  RecoveryLifecycleCommands,
  recoveryWorkflowReferenceSchema,
  type RecoveryWorkflowReference,
  type RecoveryWorkflowSnapshot,
} from '@platform/recovery';

export interface RecoveryActivities {
  recoverySnapshot(reference: RecoveryWorkflowReference): Promise<RecoveryWorkflowSnapshot>;
  expireRecovery(reference: RecoveryWorkflowReference): Promise<{ status: string }>;
}

export function createRecoveryActivities(
  database: PlatformDatabase,
  commands: CommandExecutor,
): RecoveryActivities {
  const lifecycle = new RecoveryLifecycleCommands(database, commands);
  const context = (reference: RecoveryWorkflowReference): TenantRequestContext => ({
    tenantId: reference.tenantId,
    actorId: null,
    subject: 'worker:recovery-lifecycle',
    requestId: reference.creationEventId,
    correlationId: reference.workflowId,
    actorType: 'SERVICE',
    permissions: ['recovery.execute'],
  });
  return {
    recoverySnapshot: (input) => {
      const reference = recoveryWorkflowReferenceSchema.parse(input);
      return lifecycle.snapshot(context(reference), reference);
    },
    expireRecovery: async (input) => {
      const reference = recoveryWorkflowReferenceSchema.parse(input);
      const requestContext = context(reference);
      const snapshot = await lifecycle.snapshot(requestContext, reference);
      const expired = await lifecycle.expireOpportunity(
        requestContext,
        `${reference.workflowId}:expiry:${snapshot.expiresAt}`,
        reference.opportunityId,
      );
      return { status: expired.result.status };
    },
  };
}
