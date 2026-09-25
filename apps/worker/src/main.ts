import { connect } from 'nats';
import { createDatabase, destroyDatabase } from '@platform/database';
import { hostname } from 'node:os';
import { z } from 'zod';
import { OutboxPublisher } from './outbox-publisher.js';

const environmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  NATS_URL: z.string().url(),
  WORKER_HEALTH_PORT: z.coerce.number().default(3002),
});

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const nats = await connect({ servers: environment.NATS_URL, name: 'platform-worker' });
  const db = createDatabase(environment.DATABASE_URL);
  const publisher = new OutboxPublisher(db, nats, `${hostname()}-${String(process.pid)}`);
  await publisher.ensureEventStream();
  console.log(
    JSON.stringify({ level: 'info', message: 'worker_started', natsServer: nats.getServer() }),
  );
  const shutdown = new AbortController();
  const close = async (): Promise<void> => {
    shutdown.abort();
    await Promise.all([nats.drain(), destroyDatabase(db)]);
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());

  while (!shutdown.signal.aborted) {
    const published = await publisher.publishBatch();
    if (published === 0) await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }
}

void main();
