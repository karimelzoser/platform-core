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
  SalesService,
  type SalesActivityInput,
  type SalesCloseInput,
  type SalesLeadInput,
  type SalesMoveInput,
  type SalesOpportunityInput,
  type SalesPipelineInput,
  type SalesQualificationInput,
} from './sales.service.js';

@Controller('v1/sales')
export class SalesController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly sales: SalesService,
  ) {}

  @Get()
  public async dashboard(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.requireAll(context.permissions, [
      'sales.leads.read',
      'sales.pipelines.read',
      'sales.opportunities.read',
      'sales.activities.read',
    ]);
    return this.sales.dashboard(context);
  }

  @Post('pipelines')
  public async createPipeline(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.pipelines.manage');
    return this.execute(() =>
      this.sales.createPipeline(
        context,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Sales pipeline body') as SalesPipelineInput,
      ),
    );
  }

  @Post('leads')
  public async createLead(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.leads.create');
    return this.execute(() =>
      this.sales.createLead(
        context,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Sales lead body') as SalesLeadInput,
      ),
    );
  }

  @Post('leads/:leadId/qualification')
  public async qualifyLead(
    @Param('leadId') leadId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.leads.update');
    return this.execute(() =>
      this.sales.qualifyLead(
        context,
        requireIdempotency(idempotencyKey),
        leadId,
        parseJsonObject(body, 'Sales qualification body') as SalesQualificationInput,
      ),
    );
  }

  @Post('opportunities')
  public async createOpportunity(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.opportunities.manage');
    return this.execute(() =>
      this.sales.createOpportunity(
        context,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Sales opportunity body') as SalesOpportunityInput,
      ),
    );
  }

  @Post('opportunities/:opportunityId/stage')
  public async moveOpportunity(
    @Param('opportunityId') opportunityId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.opportunities.manage');
    return this.execute(() =>
      this.sales.moveOpportunity(
        context,
        requireIdempotency(idempotencyKey),
        opportunityId,
        parseJsonObject(body, 'Sales stage body') as SalesMoveInput,
      ),
    );
  }

  @Post('opportunities/:opportunityId/close')
  public async closeOpportunity(
    @Param('opportunityId') opportunityId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.opportunities.manage');
    return this.execute(() =>
      this.sales.closeOpportunity(
        context,
        requireIdempotency(idempotencyKey),
        opportunityId,
        parseJsonObject(body, 'Sales close body') as SalesCloseInput,
      ),
    );
  }

  @Post('activities')
  public async addActivity(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.activities.manage');
    return this.execute(() =>
      this.sales.addActivity(
        context,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Sales activity body') as SalesActivityInput,
      ),
    );
  }

  @Post('activities/:activityId/complete')
  public async completeActivity(
    @Param('activityId') activityId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.activities.manage');
    return this.execute(() =>
      this.sales.completeActivity(context, requireIdempotency(idempotencyKey), activityId),
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

  private requireAll(permissions: readonly string[], required: readonly string[]): void {
    const missing = required.filter((permission) => !permissions.includes(permission));
    if (missing.length > 0)
      throw new ForbiddenException(`Sales read permissions are required: ${missing.join(', ')}`);
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
