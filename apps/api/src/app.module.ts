import { Controller, Get, Module } from '@nestjs/common';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor } from '@platform/command-execution';
import { ConnectorRegistry, developmentWebChatConnector } from '@platform/connectors';
import { CustomerService } from '@platform/crm';
import { LocalMediaStore } from '@platform/media';
import { ApprovalService } from './approval.service.js';
import { ApprovalsController } from './approvals.controller.js';
import { ApiDatabaseService } from './api-database.service.js';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import { loadApiConfig } from './config.js';
import { CustomersController } from './customers.controller.js';
import { SessionController } from './session.controller.js';
import { WebhookController } from './webhook.controller.js';
import { WebhookIngressService } from './webhook-ingress.service.js';
import { MessagingController } from './messaging.controller.js';
import { MessagingService } from './messaging.service.js';
import { MediaService } from './media.service.js';
import { MediaController } from './media.controller.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { IntegrationsController } from './integrations.controller.js';
import { IntegrationService } from './integration.service.js';

@Controller('health')
class HealthController {
  @Get()
  public health(): { status: 'ok'; service: 'api' } {
    return { status: 'ok', service: 'api' };
  }
}

function createRuntimeConnectorRegistry(): ConnectorRegistry {
  const registry = new ConnectorRegistry();
  const config = loadApiConfig();
  if (config.APP_ENV !== 'production' && config.ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES)
    registry.register(developmentWebChatConnector);
  return registry;
}

@Module({
  controllers: [
    HealthController,
    SessionController,
    WebhookController,
    CustomersController,
    ApprovalsController,
    MessagingController,
    TicketsController,
    MediaController,
    IntegrationsController,
  ],
  providers: [
    ApiDatabaseService,
    AuthenticatedContextService,
    ApprovalService,
    WebhookIngressService,
    MessagingService,
    MediaService,
    TicketsService,
    {
      provide: IntegrationService,
      useFactory: (
        database: ApiDatabaseService,
        commands: CommandExecutor,
        connectors: ConnectorRegistry,
      ) => new IntegrationService(database.database, commands, connectors),
      inject: [ApiDatabaseService, CommandExecutor, ConnectorRegistry],
    },
    {
      provide: LocalMediaStore,
      useFactory: () => new LocalMediaStore(loadApiConfig().MEDIA_LOCAL_ROOT),
    },
    { provide: ConnectorRegistry, useFactory: createRuntimeConnectorRegistry },
    {
      provide: CommandExecutor,
      useFactory: (database: ApiDatabaseService) =>
        new CommandExecutor(
          database.database,
          new CommandAuthorizer(
            new OpaClient({
              endpoint: new URL(
                '/v1/data/platform/authorization/decision',
                loadApiConfig().OPA_URL,
              ),
            }),
          ),
        ),
      inject: [ApiDatabaseService],
    },
    {
      provide: CustomerService,
      useFactory: (database: ApiDatabaseService, commands: CommandExecutor) =>
        new CustomerService(database.database, commands),
      inject: [ApiDatabaseService, CommandExecutor],
    },
  ],
})
// A Nest module is a declarative boundary; it intentionally has no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppModule {}
