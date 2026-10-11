import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandExecutionError } from '@platform/command-execution';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import {
  SalesService,
  type SalesActivityCreateInput,
  type SalesLeadAssignmentInput,
  type SalesLeadCreateInput,
  type SalesLeadQualificationInput,
  type SalesOpportunityCloseInput,
  type SalesOpportunityCreateInput,
  type SalesOpportunityMoveInput,
  type SalesPipelineCreateInput,
} from './sales.service.js';

@Controller('v1/sales')
export class SalesController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly sales: SalesService,
  ) {}

  @Get('leads')
  public async leads(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.leads.read');
    return this.sales.listLeads(context);
  }

  @Get('pipelines')
  public async pipelines(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.pipelines.read');
    return this.sales.listPipelines(context);
  }

  @Get('opportunities')
  public async opportunities(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.opportunities.read');
    return this.sales.listOpportunities(context);
  }

  @Get('opportunities/:opportunityId')
  public async opportunity(
    @Param('opportunityId') opportunityId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.opportunities.read');
    const result = await this.sales.getOpportunity(context, opportunityId);
    if (!result) throw new NotFoundException('Sales opportunity was not found');
    return result;
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
        parseJsonObject(body, 'Sales lead body') as SalesLeadCreateInput,
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
    const input = parseJsonObject(body, 'Sales qualification body');
    return this.execute(() =>
      this.sales.qualifyLead(context, requireIdempotency(idempotencyKey), {
        ...input,
        leadId,
      } as SalesLeadQualificationInput),
    );
  }

  @Post('leads/:leadId/assignment')
  public async assignLead(
    @Param('leadId') leadId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.leads.assign');
    return this.execute(() =>
      this.sales.assignLead(
        context,
        requireIdempotency(idempotencyKey),
        leadId,
        parseJsonObject(body, 'Sales lead assignment body') as SalesLeadAssignmentInput,
      ),
    );
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
        parseJsonObject(body, 'Sales pipeline body') as SalesPipelineCreateInput,
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
        parseJsonObject(body, 'Sales opportunity body') as SalesOpportunityCreateInput,
      ),
    );
  }

  @Post('opportunities/:opportunityId/move')
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
        parseJsonObject(body, 'Sales opportunity move body') as SalesOpportunityMoveInput,
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
        parseJsonObject(body, 'Sales opportunity close body') as SalesOpportunityCloseInput,
      ),
    );
  }

  @Post('activities')
  public async createActivity(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'sales.activities.manage');
    return this.execute(() =>
      this.sales.createActivity(
        context,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Sales activity body') as SalesActivityCreateInput,
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
