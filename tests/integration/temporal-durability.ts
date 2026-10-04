import assert from 'node:assert/strict';
import { Client, Connection } from '@temporalio/client';

const address = process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233';
const namespace = process.env.TEMPORAL_NAMESPACE ?? 'platform';
const workflowId = process.env.TEMPORAL_DURABILITY_WORKFLOW_ID;
const phase = process.env.TEMPORAL_DURABILITY_PHASE;

assert.ok(workflowId, 'TEMPORAL_DURABILITY_WORKFLOW_ID is required');
assert.ok(
  phase === 'start' || phase === 'verify',
  'TEMPORAL_DURABILITY_PHASE must be start or verify',
);

const connection = await connectWithRetry();
try {
  const client = new Client({ connection, namespace });

  if (phase === 'start') {
    const handle = await client.workflow.start('preneuraDurabilityProbe', {
      taskQueue: 'preneura-durability-probe',
      workflowId,
      args: [{ startedAt: new Date().toISOString() }],
    });
    await handle.describe();
    console.log(JSON.stringify({ phase, workflowId, namespace, durable: false }));
  } else {
    const handle = client.workflow.getHandle(workflowId);
    await handle.describe();
    await handle.terminate('PRENEURA Temporal durability probe completed after server restart');
    console.log(JSON.stringify({ phase, workflowId, namespace, durable: true }));
  }
} finally {
  await connection.close();
}

async function connectWithRetry(): Promise<Connection> {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      return await Connection.connect({ address });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  const message = `Temporal at ${address} did not become reachable within 60 seconds.`;
  if (lastError instanceof Error) throw new Error(message, { cause: lastError });
  throw new Error(message);
}
