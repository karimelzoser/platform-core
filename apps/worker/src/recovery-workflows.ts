import {
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import type { RecoveryWorkflowReference } from '@platform/recovery';
import type { RecoveryActivities } from './recovery-activities.js';

export const refreshRecovery = defineSignal('refreshRecovery');
export const recoveryCoordinationState = defineQuery<string>('recoveryCoordinationState');

const activities = proxyActivities<RecoveryActivities>({
  startToCloseTimeout: '30 seconds',
  scheduleToCloseTimeout: '10 minutes',
  retry: { initialInterval: '1 second', maximumInterval: '30 seconds', maximumAttempts: 12 },
});

/** Only IDs and a committed-event reference enter history; PostgreSQL owns state. */
export async function recoveryExpiryWorkflow(
  reference: RecoveryWorkflowReference,
): Promise<string> {
  let revision = 0;
  let status = 'STARTING';
  setHandler(refreshRecovery, () => {
    revision += 1;
  });
  setHandler(recoveryCoordinationState, () => status);
  for (;;) {
    const observedRevision = revision;
    const snapshot = await activities.recoverySnapshot(reference);
    status = snapshot.status;
    if (['RECOVERED', 'EXPIRED', 'CANCELLED'].includes(status)) return status;
    const wait = Date.parse(snapshot.expiresAt) - Date.now();
    if (!Number.isFinite(wait)) throw new Error('Invalid canonical recovery expiry');
    if (wait > 0 && (await condition(() => revision !== observedRevision, wait))) continue;
    // Expiry is rechecked under row lock and OPA by the same command as the API.
    // No provider action or contact body is ever executed from this workflow.
    const expired = await activities.expireRecovery(reference);
    status = expired.status;
    return status;
  }
}
