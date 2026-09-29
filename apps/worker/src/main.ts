import { connect } from 'nats';
import { ConnectorRegistry, developmentWebChatConnector } from '@platform/connectors';
import { createDatabase, destroyDatabase } from '@platform/database';
import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { z } from 'zod';
import { MessagingWebhookProcessor } from './messaging-webhook-processor.js';
import { IntegrationSyncProcessor } from './integration-sync-processor.js';
import { OutboundMessageProcessor } from './outbound-message-processor.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { TicketSlaProcessor } from './ticket-sla-processor.js';
import { WebhookSubscriptionProcessor } from './webhook-subscription-processor.js';

const environmentSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  DATABASE_URL: z.string().url(),
  NATS_URL: z.string().url(),
  WORKER_HEALTH_PORT: z.coerce.number().default(3002),
  SLA_EVALUATION_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(10_000),
});

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const nats = await connect({ servers: environment.NATS_URL, name: 'platform-worker' });
  const db = createDatabase(environment.DATABASE_URL);
  const publisher = new OutboxPublisher(db, nats, `${hostname()}-${String(process.pid)}`);
  const workerId = `${hostname()}-${String(process.pid)}`;
  const connectors = new ConnectorRegistry();
  if (environment.APP_ENV !== 'production' && environment.ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES)
    connectors.register(developmentWebChatConnector);
  const webhookProcessor = new MessagingWebhookProcessor(db, connectors, workerId);
  const outboundMessageProcessor = new OutboundMessageProcessor(db, connectors, workerId);
  const integrationSyncProcessor = new IntegrationSyncProcessor(db, connectors, workerId);
  const webhookSubscriptionProcessor = new WebhookSubscriptionProcessor(db, connectors, workerId);
  const ticketSlaProcessor = new TicketSlaProcessor(db);
  let nextSlaEvaluationAt = 0;
  const startedAt = new Date().toISOString();
  const healthServer = createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ok', service: 'worker', startedAt }));
  });
  await new Promise<void>((resolve, reject) => {
    healthServer.once('error', reject);
    healthServer.listen(environment.WORKER_HEALTH_PORT, resolve);
  });
  await publisher.ensureEventStream();
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'worker_started',
      natsServer: nats.getServer(),
      healthPort: environment.WORKER_HEALTH_PORT,
      slaEvaluationIntervalMs: environment.SLA_EVALUATION_INTERVAL_MS,
    }),
  );
  const shutdown = new AbortController();
  const close = async (): Promise<void> => {
    shutdown.abort();
    await Promise.all([
      nats.drain(),
      destroyDatabase(db),
      new Promise<void>((resolve, reject) =>
        healthServer.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      ),
    ]);
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());

  while (!shutdown.signal.aborted) {
    const published = await publisher.publishBatch();
    const processed = await webhookProcessor.processBatch();
    const dispatched = await outboundMessageProcessor.processBatch();
    const synchronized = await integrationSyncProcessor.processBatch();
    const subscriptions = await webhookSubscriptionProcessor.processBatch();
    const now = Date.now();
    const evaluatedSla = now >= nextSlaEvaluationAt ? await ticketSlaProcessor.processBatch() : 0;
    if (now >= nextSlaEvaluationAt)
      nextSlaEvaluationAt = now + environment.SLA_EVALUATION_INTERVAL_MS;
    if (
      published === 0 &&
      processed === 0 &&
      dispatched === 0 &&
      synchronized === 0 &&
      subscriptions === 0 &&
      evaluatedSla === 0
    )
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }
}

void main();
