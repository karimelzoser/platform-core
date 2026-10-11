import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { RecoveryWorkflowReference } from '@platform/recovery';
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { bundleWorkflowCode, NativeConnection, Worker } from '@temporalio/worker';
import type { RecoveryActivities } from '../../apps/worker/src/recovery-activities.js';

// These are orchestration fixtures, not provider/DB adapters. Canonical command,
// outbox and two-tenant/RLS behavior is exercised separately by recovery-lifecycle.
const address = process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233';
assert.match(
  address,
  /^(127\.0\.0\.1|localhost):[0-9]+$/u,
  'Only disposable loopback Temporal is permitted',
);
const namespace = process.env.TEMPORAL_NAMESPACE ?? 'platform';
const taskQueue = `recovery-acceptance-${randomUUID()}`;
const connection = await Connection.connect({ address });
const native = await NativeConnection.connect({ address });
const client = new Client({ connection, namespace });
const workflowBundle = await bundleWorkflowCode({
  workflowsPath: fileURLToPath(
    new URL('../../apps/worker/dist/recovery-workflows.js', import.meta.url),
  ),
});
const states = new Map<
  string,
  { status: string; expiresAt: string; failures: number; expiryCalls: number }
>();
const activities: RecoveryActivities = {
  recoverySnapshot: (reference) => {
    const state = states.get(reference.workflowId);
    assert.ok(state, 'Unknown workflow reference is not authorized by the fixture');
    if (state.failures > 0) {
      state.failures -= 1;
      return Promise.reject(new Error('Retryable activity fixture outage'));
    }
    return Promise.resolve({ status: state.status, expiresAt: state.expiresAt });
  },
  expireRecovery: (reference) => {
    const state = states.get(reference.workflowId);
    assert.ok(state);
    assert.ok(Date.parse(state.expiresAt) <= Date.now(), 'Durable timer must not expire early');
    state.expiryCalls += 1;
    state.status = 'EXPIRED';
    return Promise.resolve({ status: state.status });
  },
};

function reference(ttl: number, failures = 0): RecoveryWorkflowReference {
  const workflowId = `recovery-test:${randomUUID()}`;
  states.set(workflowId, {
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + ttl).toISOString(),
    failures,
    expiryCalls: 0,
  });
  return {
    tenantId: randomUUID(),
    opportunityId: randomUUID(),
    creationEventId: randomUUID(),
    workflowId,
  };
}

async function worker(): Promise<Worker> {
  return Worker.create({
    connection: native,
    namespace,
    taskQueue,
    workflowBundle,
    activities: { ...activities },
  });
}

async function waitUntilActive(workflowId: string): Promise<void> {
  const handle = client.workflow.getHandle(workflowId);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await handle.query<string>('recoveryCoordinationState')) === 'ACTIVE') return;
    } catch {
      // The query handler is not registered before the initial workflow task.
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Recovery workflow did not enter its durable wait');
}

try {
  const expiry = reference(250, 2);
  const running = await worker();
  await running.runUntil(async () => {
    const handle = await client.workflow.start('recoveryExpiryWorkflow', {
      taskQueue,
      workflowId: expiry.workflowId,
      args: [expiry],
      workflowIdReusePolicy: 'REJECT_DUPLICATE',
    });
    await assert.rejects(
      client.workflow.start('recoveryExpiryWorkflow', {
        taskQueue,
        workflowId: expiry.workflowId,
        args: [expiry],
        workflowIdReusePolicy: 'REJECT_DUPLICATE',
      }),
      WorkflowExecutionAlreadyStartedError,
    );
    assert.equal(await handle.result(), 'EXPIRED');
    assert.equal(states.get(expiry.workflowId)?.expiryCalls, 1);
    assert.equal(
      states.get(expiry.workflowId)?.failures,
      0,
      'Activity retries must recover an outage',
    );
    await Worker.runReplayHistory(
      { workflowBundle },
      await handle.fetchHistory(),
      expiry.workflowId,
    );

    const conversion = reference(60_000);
    const converted = await client.workflow.start('recoveryExpiryWorkflow', {
      taskQueue,
      workflowId: conversion.workflowId,
      args: [conversion],
    });
    await waitUntilActive(conversion.workflowId);
    const state = states.get(conversion.workflowId);
    assert.ok(state);
    state.status = 'RECOVERED';
    await converted.signal('refreshRecovery');
    assert.equal(await converted.result(), 'RECOVERED');
    assert.equal(state.expiryCalls, 0, 'Conversion signal must not expire recovered state');

    const cancellation = reference(60_000);
    const cancelled = await client.workflow.start('recoveryExpiryWorkflow', {
      taskQueue,
      workflowId: cancellation.workflowId,
      args: [cancellation],
    });
    await waitUntilActive(cancellation.workflowId);
    await cancelled.cancel();
    await assert.rejects(
      cancelled.result(),
      (error: unknown) =>
        error instanceof Error &&
        error.cause instanceof Error &&
        error.cause.name === 'CancelledFailure',
    );
    assert.equal(states.get(cancellation.workflowId)?.expiryCalls, 0);
  });

  const restart = reference(5_000);
  const first = await worker();
  await first.runUntil(async () => {
    await client.workflow.start('recoveryExpiryWorkflow', {
      taskQueue,
      workflowId: restart.workflowId,
      args: [restart],
    });
    await waitUntilActive(restart.workflowId);
  });
  const second = await worker();
  await second.runUntil(async () => {
    assert.equal(await client.workflow.getHandle(restart.workflowId).result(), 'EXPIRED');
  });
  assert.equal(
    states.get(restart.workflowId)?.expiryCalls,
    1,
    'Restart preserves the durable timer',
  );
  console.log(
    JSON.stringify({
      recoveryTemporal: 'passed',
      retry: true,
      duplicateStart: true,
      signal: true,
      cancellation: true,
      replay: true,
      workerRestart: true,
    }),
  );
} finally {
  await native.close();
  await connection.close();
}
