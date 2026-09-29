import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandExecutionError } from '@platform/command-execution';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import {
  IntegrationService,
  type CreateIntegrationSyncRunInput,
  type CreateWebhookSubscriptionInput,
  type ConnectIntegrationInput,
  type SecretRotationInput,
} from './integration.service.js';

@Controller('v1/integrations')
export class IntegrationsController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly integrations: IntegrationService,
  ) {}

  @Get('connections')
  public async list(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'integrations.read');
    return this.integrations.list(context);
  }

  @Post('connections')
  @HttpCode(HttpStatus.CREATED)
  public async connect(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'integrations.manage');
    return this.execute(() =>
      this.integrations.connect(context, idempotencyKey ?? '', parseConnectBody(body), approvalId),
    );
  }

  @Post('connections/:connectionId/disconnect')
  public async disconnect(
    @Param('connectionId') connectionId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'integrations.manage');
    return this.execute(() =>
      this.integrations.disconnect(context, idempotencyKey ?? '', connectionId, approvalId),
    );
  }

  @Get('connections/:connectionId/assets')
  public async listAssets(
    @Param('connectionId') connectionId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'integrations.read');
    return this.integrations.listAssets(context, connectionId);
  }

  @Get('connections/:connectionId/sync-runs')
  public async listSyncRuns(
    @Param('connectionId') connectionId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'integrations.read');
    return this.integrations.listSyncRuns(context, connectionId);
  }

  @Get('connections/:connectionId/webhook-subscriptions')
  public async listWebhookSubscriptions(
    @Param('connectionId') connectionId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'integrations.read');
    return this.integrations.listWebhookSubscriptions(context, connectionId);
  }

  @Post('connections/:connectionId/webhook-subscriptions')
  public async requestWebhookSubscription(
    @Param('connectionId') connectionId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'integrations.manage');
    return this.execute(() =>
      this.integrations.requestWebhookSubscription(
        context,
        idempotencyKey ?? '',
        connectionId,
        parseWebhookSubscriptionBody(body),
        approvalId,
      ),
    );
  }

  @Post('connections/:connectionId/webhook-subscriptions/:subscriptionId/unregister')
  public async requestWebhookUnsubscription(
    @Param('connectionId') connectionId: string,
    @Param('subscriptionId') subscriptionId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'integrations.manage');
    return this.execute(() =>
      this.integrations.requestWebhookUnsubscription(
        context,
        idempotencyKey ?? '',
        connectionId,
        subscriptionId,
        approvalId,
      ),
    );
  }

  @Post('connections/:connectionId/sync-runs')
  public async requestSyncRun(
    @Param('connectionId') connectionId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'integrations.sync.execute');
    return this.execute(() =>
      this.integrations.requestSyncRun(
        context,
        idempotencyKey ?? '',
        connectionId,
        parseSyncRunBody(body),
        approvalId,
      ),
    );
  }

  @Post('connections/:connectionId/assets/refresh')
  public async refreshAssets(
    @Param('connectionId') connectionId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'integrations.manage');
    return this.execute(() =>
      this.integrations.refreshAssets(context, idempotencyKey ?? '', connectionId, approvalId),
    );
  }

  @Post('connections/:connectionId/secret-rotations')
  public async rotateSecret(
    @Param('connectionId') connectionId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'integrations.secrets.rotate');
    return this.execute(() =>
      this.integrations.rotateSecret(
        context,
        idempotencyKey ?? '',
        connectionId,
        parseSecretRotationBody(body),
        approvalId,
      ),
    );
  }

  @Post('connections/:connectionId/health-check')
  public async checkHealth(
    @Param('connectionId') connectionId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'integrations.read');
    return this.execute(() =>
      this.integrations.checkHealth(context, idempotencyKey ?? '', connectionId),
    );
  }

  private async context(
    authorization: string | undefined,
    tenantId: string | undefined,
    correlationId: string | undefined,
  ) {
    try {
      return await this.authentication.resolve({ authorization, tenantId, correlationId });
    } catch {
      throw new UnauthorizedException('Invalid authentication or tenant membership');
    }
  }

  private require(permissions: readonly string[], permission: string): void {
    if (!permissions.includes(permission))
      throw new ForbiddenException(`${permission} permission is required`);
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        if (error.code === 'authorization_denied') throw new ForbiddenException(error.message);
        throw new ConflictException(error.message);
      }
      if (error instanceof Error) throw new BadRequestException(error.message);
      throw error;
    }
  }
}

function parseConnectBody(body: unknown): ConnectIntegrationInput {
  if (!Buffer.isBuffer(body)) throw new BadRequestException('Connection body must be JSON');
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('JSON object required');
    }
    return parsed as ConnectIntegrationInput;
  } catch {
    throw new BadRequestException('Connection body must be a JSON object');
  }
}

function parseSecretRotationBody(body: unknown): SecretRotationInput {
  if (!Buffer.isBuffer(body)) throw new BadRequestException('Secret rotation body must be JSON');
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('JSON object required');
    }
    return parsed as SecretRotationInput;
  } catch {
    throw new BadRequestException('Secret rotation body must be a JSON object');
  }
}

function parseSyncRunBody(body: unknown): CreateIntegrationSyncRunInput {
  if (!Buffer.isBuffer(body)) throw new BadRequestException('Sync run body must be JSON');
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('JSON object required');
    }
    return parsed as CreateIntegrationSyncRunInput;
  } catch {
    throw new BadRequestException('Sync run body must be a JSON object');
  }
}

function parseWebhookSubscriptionBody(body: unknown): CreateWebhookSubscriptionInput {
  if (!Buffer.isBuffer(body))
    throw new BadRequestException('Webhook subscription body must be JSON');
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('JSON object required');
    }
    return parsed as CreateWebhookSubscriptionInput;
  } catch {
    throw new BadRequestException('Webhook subscription body must be a JSON object');
  }
}
