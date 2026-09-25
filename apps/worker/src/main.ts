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
  console.log(
    JSON.stringify({ level: 'info', message: 'worker_started', natsServer: nats.getServer() }),
  );
  let stopped = false;
  const close = async (): Promise<void> => {
    stopped = true;
    await Promise.all([nats.drain(), destroyDatabase(db)]);
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());

  while (!stopped) {
    const published = await publisher.publishBatch();
    if (published === 0) await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }
}

void main();
