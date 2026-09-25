import { Controller, Get, Module } from '@nestjs/common';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor } from '@platform/command-execution';
import { ConnectorRegistry } from '@platform/connectors';
import { CustomerService } from '@platform/crm';
import { ApprovalService } from './approval.service.js';
import { ApprovalsController } from './approvals.controller.js';
import { ApiDatabaseService } from './api-database.service.js';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import { loadApiConfig } from './config.js';
import { CustomersController } from './customers.controller.js';
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
  controllers: [
    HealthController,
    SessionController,
    WebhookController,
    CustomersController,
    ApprovalsController,
  ],
  providers: [
    ApiDatabaseService,
    AuthenticatedContextService,
    ApprovalService,
    WebhookIngressService,
    { provide: ConnectorRegistry, useValue: new ConnectorRegistry() },
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
