import { connect } from 'nats';
import { z } from 'zod';

const environmentSchema = z.object({
  NATS_URL: z.string().url(),
  WORKER_HEALTH_PORT: z.coerce.number().default(3002),
});

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const nats = await connect({ servers: environment.NATS_URL, name: 'platform-worker' });
  console.log(
    JSON.stringify({ level: 'info', message: 'worker_started', natsServer: nats.getServer() }),
  );
  const close = async (): Promise<void> => nats.drain();
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());
}

void main();
