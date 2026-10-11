import { connect } from 'nats';
import {
  ConnectorRegistry,
  developmentApiConnector,
  developmentEmailConnector,
  developmentInstagramMessagingConnector,
  developmentMessengerPlatformConnector,
  developmentMetaEmbeddedSignupConnector,
  developmentShopifyPublicAppConnector,
  developmentWebChatConnector,
  developmentWhatsAppCloudApiConnector,
  developmentWooCommerceConnector,
} from '@platform/connectors';
import { createDatabase, destroyDatabase } from '@platform/database';
import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { z } from 'zod';
import { MessagingWebhookProcessor } from './messaging-webhook-processor.js';
import { IntegrationSyncProcessor } from './integration-sync-processor.js';
import { OutboundMessageProcessor } from './outbound-message-processor.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { ProviderActionProcessor } from './provider-action-processor.js';
import { TicketSlaProcessor } from './ticket-sla-processor.js';
import { WebhookSubscriptionProcessor } from './webhook-subscription-processor.js';
import { startRecoveryOrchestrator } from './recovery-orchestrator.js';

const environmentSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  DATABASE_URL: z.string().url(),
  NATS_URL: z.string().url(),
  OPA_URL: z.string().url().default('http://127.0.0.1:8181'),
  TEMPORAL_ADDRESS: z.string().min(1).optional(),
  TEMPORAL_NAMESPACE: z.string().min(1).default('platform'),
  WORKER_HEALTH_PORT: z.coerce.number().default(3002),
  SLA_EVALUATION_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(10_000),
});

async function main(): Promise<void> {
  const environment = environmentSchema.parse({
    ...process.env,
    WORKER_HEALTH_PORT: process.env.WORKER_HEALTH_PORT ?? process.env.PORT,
  });
  if (environment.APP_ENV === 'production' && !environment.TEMPORAL_ADDRESS) {
    throw new Error(
      'Production worker requires TEMPORAL_ADDRESS for durable Recovery coordination',
    );
  }
  const nats = await connect({ servers: environment.NATS_URL, name: 'platform-worker' });
  const db = createDatabase(environment.DATABASE_URL);
  const publisher = new OutboxPublisher(db, nats, `${hostname()}-${String(process.pid)}`);
  const workerId = `${hostname()}-${String(process.pid)}`;
  const connectors = new ConnectorRegistry();
  if (environment.APP_ENV !== 'production' && environment.ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES) {
    connectors.register(developmentApiConnector);
    connectors.register(developmentEmailConnector);
    connectors.register(developmentInstagramMessagingConnector);
    connectors.register(developmentMessengerPlatformConnector);
    connectors.register(developmentMetaEmbeddedSignupConnector);
    connectors.register(developmentShopifyPublicAppConnector);
    connectors.register(developmentWebChatConnector);
    connectors.register(developmentWhatsAppCloudApiConnector);
    connectors.register(developmentWooCommerceConnector);
  }
  const webhookProcessor = new MessagingWebhookProcessor(db, connectors, workerId);
  const outboundMessageProcessor = new OutboundMessageProcessor(db, connectors, workerId);
  const integrationSyncProcessor = new IntegrationSyncProcessor(db, connectors, workerId);
  const webhookSubscriptionProcessor = new WebhookSubscriptionProcessor(db, connectors, workerId);
  const providerActionProcessor = new ProviderActionProcessor(db, connectors, workerId);
  const ticketSlaProcessor = new TicketSlaProcessor(db);
  await publisher.ensureEventStream();
  const recoveryOrchestrator = environment.TEMPORAL_ADDRESS
    ? await startRecoveryOrchestrator({
        database: db,
        nats,
        address: environment.TEMPORAL_ADDRESS,
        namespace: environment.TEMPORAL_NAMESPACE,
        opaUrl: environment.OPA_URL,
      })
    : undefined;
  let nextSlaEvaluationAt = 0;
  const startedAt = new Date().toISOString();
  const healthServer = createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }
    const ready = !recoveryOrchestrator || recoveryOrchestrator.ready();
    response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json; charset=utf-8' });
    response.end(
      JSON.stringify({
        status: ready ? 'ok' : 'not_ready',
        service: 'worker',
        startedAt,
        recoveryCoordination: recoveryOrchestrator
          ? ready
            ? 'running'
            : 'not_ready'
          : 'not_configured_development_only',
      }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    healthServer.once('error', reject);
    healthServer.listen(environment.WORKER_HEALTH_PORT, resolve);
  });
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'worker_started',
      natsServer: nats.getServer(),
      healthPort: environment.WORKER_HEALTH_PORT,
      slaEvaluationIntervalMs: environment.SLA_EVALUATION_INTERVAL_MS,
      recoveryCoordination: recoveryOrchestrator ? 'enabled' : 'not_configured_development_only',
    }),
  );
  const shutdown = new AbortController();
  const close = async (): Promise<void> => {
    shutdown.abort();
    await recoveryOrchestrator?.close();
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
    const providerActions = await providerActionProcessor.processBatch();
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
      providerActions === 0 &&
      evaluatedSla === 0
    )
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }
}

void main();
