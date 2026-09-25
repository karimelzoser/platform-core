import { Controller, Get, Module } from '@nestjs/common';
import { ConnectorRegistry } from '@platform/connectors';
import { SessionController } from './session.controller.js';
import { WebhookController } from './webhook.controller.js';
import { WebhookIngressService } from './webhook-ingress.service.js';

@Controller('health')
class HealthController {
  @Get()
  public health(): { status: 'ok'; service: 'api' } {
    return { status: 'ok', service: 'api' };
  }
}

@Module({
  controllers: [HealthController, SessionController, WebhookController],
  providers: [
    WebhookIngressService,
    { provide: ConnectorRegistry, useValue: new ConnectorRegistry() },
  ],
})
// A Nest module is a declarative boundary; it intentionally has no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppModule {}
