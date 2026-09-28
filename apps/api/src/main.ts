import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module.js';
import { loadApiConfig } from './config.js';

async function bootstrap(): Promise<void> {
  const config = loadApiConfig();
  const adapter = new FastifyAdapter({ logger: true, bodyLimit: 1_048_576 });
  adapter.getInstance().removeContentTypeParser('application/json');
  adapter
    .getInstance()
    .addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body);
    });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bodyParser: false,
  });
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      const correlationId = request.headers['x-correlation-id'] ?? randomUUID();
      reply.header('x-correlation-id', correlationId);
      done();
    });
  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
  Logger.log(`API listening on ${String(config.API_PORT)}`, 'Bootstrap');
}

void bootstrap();
