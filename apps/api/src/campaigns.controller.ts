import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandExecutionError } from '@platform/command-execution';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import {
  CampaignsService,
  type CampaignConversionInput,
  type CampaignInput,
  type CampaignScheduleInput,
} from './campaigns.service.js';

@Controller('v1/campaigns')
export class CampaignsController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly campaigns: CampaignsService,
  ) {}

  @Get()
  public async dashboard(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'campaigns.read');
    return this.campaigns.dashboard(context);
  }

  @Post()
  public async create(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'campaigns.create');
    return this.execute(() =>
      this.campaigns.create(
        context,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Campaign body') as CampaignInput,
      ),
    );
  }

  @Post(':campaignId/audience/freeze')
  public async freezeAudience(
    @Param('campaignId') campaignId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'campaigns.audiences.manage');
    return this.execute(() =>
      this.campaigns.freezeAudience(context, requireIdempotency(idempotencyKey), campaignId),
    );
  }

  @Post(':campaignId/schedule')
  public async schedule(
    @Param('campaignId') campaignId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'campaigns.send');
    return this.execute(() =>
      this.campaigns.schedule(
        context,
        requireIdempotency(idempotencyKey),
        campaignId,
        parseJsonObject(body, 'Campaign schedule body') as CampaignScheduleInput,
        approvalId,
      ),
    );
  }

  @Post(':campaignId/start')
  public async start(
    @Param('campaignId') campaignId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'campaigns.send');
    return this.execute(() =>
      this.campaigns.start(context, requireIdempotency(idempotencyKey), campaignId, approvalId),
    );
  }

  @Post(':campaignId/pause')
  public async pause(
    @Param('campaignId') campaignId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'campaigns.stop');
    return this.execute(() =>
      this.campaigns.setOperationalState(
        context,
        requireIdempotency(idempotencyKey),
        campaignId,
        'PAUSED',
      ),
    );
  }

  @Post(':campaignId/resume')
  public async resume(
    @Param('campaignId') campaignId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'campaigns.stop');
    return this.execute(() =>
      this.campaigns.setOperationalState(
        context,
        requireIdempotency(idempotencyKey),
        campaignId,
        'RUNNING',
      ),
    );
  }

  @Post(':campaignId/cancel')
  public async cancel(
    @Param('campaignId') campaignId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'campaigns.stop');
    return this.execute(() =>
      this.campaigns.setOperationalState(
        context,
        requireIdempotency(idempotencyKey),
        campaignId,
        'CANCELLED',
      ),
    );
  }

  @Post(':campaignId/batches/:batchId/dispatch')
  public async dispatchBatch(
    @Param('campaignId') campaignId: string,
    @Param('batchId') batchId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'campaigns.send');
    return this.execute(() =>
      this.campaigns.dispatchBatch(
        context,
        requireIdempotency(idempotencyKey),
        campaignId,
        batchId,
      ),
    );
  }

  @Post(':campaignId/conversions')
  public async attributeConversion(
    @Param('campaignId') campaignId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'campaigns.update');
    return this.execute(() =>
      this.campaigns.attributeConversion(
        context,
        requireIdempotency(idempotencyKey),
        campaignId,
        parseJsonObject(body, 'Campaign conversion body') as CampaignConversionInput,
      ),
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

function parseJsonObject(body: unknown, label: string): Record<string, unknown> {
  if (!Buffer.isBuffer(body)) throw new BadRequestException(`${label} must be JSON`);
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object')
      throw new Error('JSON object required');
    return parsed as Record<string, unknown>;
  } catch {
    throw new BadRequestException(`${label} must be a JSON object`);
  }
}

function requireIdempotency(value: string | undefined): string {
  if (!value?.trim()) throw new BadRequestException('Idempotency-Key header is required');
  return value.trim();
}
