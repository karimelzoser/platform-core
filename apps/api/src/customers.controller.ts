import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandExecutionError } from '@platform/command-execution';
import {
  type BulkTagAssignmentInput,
  CustomerIdentityConflictError,
  CustomerMergeError,
  CustomerService,
  customerExportCsv,
  type CreateCustomerInput,
  type CreateStaticSegmentInput,
  type CreateTagInput,
  type MergeCustomerInput,
  type SuppressCustomerChannelInput,
} from '@platform/crm';
import { AuthenticatedContextService } from './authenticated-context.service.js';

@Controller('v1/customers')
export class CustomersController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly customers: CustomerService,
  ) {}

  @Get()
  public async list(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Query('search') search: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertReadPermission(context.permissions);
    const parsedLimit = parseOptionalNumber(limit);
    const parsedOffset = parseOptionalNumber(offset);
    return this.customers.list(context, {
      ...(search ? { search } : {}),
      ...(parsedLimit === undefined ? {} : { limit: parsedLimit }),
      ...(parsedOffset === undefined ? {} : { offset: parsedOffset }),
    });
  }

  @Get('/tags')
  public async listTags(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertReadPermission(context.permissions);
    return this.customers.listTags(context);
  }

  @Post('/tags')
  @HttpCode(HttpStatus.CREATED)
  public async createTag(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Tag body must be JSON');
    const context = await this.context(authorization, tenantId, correlationId);
    return this.executeTagCommand(() =>
      this.customers.createTag(context, idempotencyKey ?? '', parseTagBody(body), approvalId),
    );
  }

  @Get('/segments')
  public async listSegments(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertSegmentReadPermission(context.permissions);
    return this.customers.listSegments(context);
  }

  @Get('/export.csv')
  @Header('content-disposition', 'attachment; filename="customers.csv"')
  @Header('content-type', 'text/csv; charset=utf-8')
  public async exportCsv(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ): Promise<string> {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertExportPermission(context.permissions);
    return customerExportCsv(await this.customers.exportCustomers(context));
  }

  @Post('/segments')
  @HttpCode(HttpStatus.CREATED)
  public async createStaticSegment(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Segment body must be JSON');
    const context = await this.context(authorization, tenantId, correlationId);
    return this.executeTagCommand(() =>
      this.customers.createStaticSegment(
        context,
        idempotencyKey ?? '',
        parseStaticSegmentBody(body),
        approvalId,
      ),
    );
  }

  @Post('/segments/:segmentId/customers/:customerId')
  public async assignSegmentMember(
    @Param('segmentId') segmentId: string,
    @Param('customerId') customerId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    return this.executeTagCommand(() =>
      this.customers.assignSegmentMember(
        context,
        idempotencyKey ?? '',
        { segmentId, customerId },
        approvalId,
      ),
    );
  }

  @Get(':customerId')
  public async detail(
    @Param('customerId') customerId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertReadPermission(context.permissions);
    const customer = await this.customers.detail(context, customerId);
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  @Get(':customerId/timeline')
  public async timeline(
    @Param('customerId') customerId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertReadPermission(context.permissions);
    return this.customers.timeline(context, customerId);
  }

  @Post(':customerId/tags/:tagId')
  public async assignTag(
    @Param('customerId') customerId: string,
    @Param('tagId') tagId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    return this.executeTagCommand(() =>
      this.customers.assignTag(context, idempotencyKey ?? '', { customerId, tagId }, approvalId),
    );
  }

  @Post('/tags/:tagId/assignments')
  public async assignTagBulk(
    @Param('tagId') tagId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Bulk tag body must be JSON');
    const context = await this.context(authorization, tenantId, correlationId);
    return this.executeTagCommand(() =>
      this.customers.assignTagBulk(
        context,
        idempotencyKey ?? '',
        parseBulkTagBody(body, tagId),
        approvalId,
      ),
    );
  }

  @Post(':customerId/merge')
  public async merge(
    @Param('customerId') sourceCustomerId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Merge body must be JSON');
    const context = await this.context(authorization, tenantId, correlationId);
    return this.executeCustomerCommand(() =>
      this.customers.merge(
        context,
        idempotencyKey ?? '',
        parseMergeBody(body, sourceCustomerId),
        approvalId,
      ),
    );
  }

  @Post(':customerId/suppressions')
  public async suppressChannel(
    @Param('customerId') customerId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Suppression body must be JSON');
    const context = await this.context(authorization, tenantId, correlationId);
    return this.executeCustomerCommand(() =>
      this.customers.suppressChannel(
        context,
        idempotencyKey ?? '',
        parseSuppressionBody(body, customerId),
        approvalId,
      ),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async create(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Customer body must be JSON');
    const context = await this.context(authorization, tenantId, correlationId);
    return this.executeCustomerCommand(() =>
      this.customers.create(context, idempotencyKey ?? '', parseCustomerBody(body), approvalId),
    );
  }

  private async executeCustomerCommand<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CustomerIdentityConflictError || error instanceof CustomerMergeError)
        throw new ConflictException(error.message);
      this.rethrowCommandError(error);
      if (error instanceof Error) throw new BadRequestException(error.message);
      throw error;
    }
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

  private assertReadPermission(permissions: readonly string[]): void {
    if (!permissions.includes('crm.customers.read')) {
      throw new ForbiddenException('Customer read permission is required');
    }
  }

  private assertSegmentReadPermission(permissions: readonly string[]): void {
    if (!permissions.includes('crm.segments.read')) {
      throw new ForbiddenException('Customer segment read permission is required');
    }
  }

  private assertExportPermission(permissions: readonly string[]): void {
    if (!permissions.includes('crm.customers.export')) {
      throw new ForbiddenException('Customer export permission is required');
    }
  }

  private async executeTagCommand<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.rethrowCommandError(error);
      if (error instanceof Error) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private rethrowCommandError(error: unknown): void {
    if (!(error instanceof CommandExecutionError)) return;
    if (error.code === 'authorization_denied') throw new ForbiddenException(error.message);
    throw new ConflictException(error.message);
  }
}

function parseCustomerBody(body: Buffer): CreateCustomerInput {
  const parsed: unknown = JSON.parse(body.toString('utf8'));
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Customer body must be a JSON object');
  }
  return parsed as CreateCustomerInput;
}

function parseTagBody(body: Buffer): CreateTagInput {
  const parsed: unknown = JSON.parse(body.toString('utf8'));
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Tag body must be a JSON object');
  }
  return parsed as CreateTagInput;
}

function parseStaticSegmentBody(body: Buffer): CreateStaticSegmentInput {
  const parsed: unknown = JSON.parse(body.toString('utf8'));
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Segment body must be a JSON object');
  }
  return parsed as CreateStaticSegmentInput;
}

function parseBulkTagBody(body: Buffer, tagId: string): BulkTagAssignmentInput {
  const parsed: unknown = JSON.parse(body.toString('utf8'));
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Bulk tag body must be a JSON object');
  }
  const record = parsed as { customerIds?: unknown };
  return { tagId, customerIds: record.customerIds } as BulkTagAssignmentInput;
}

function parseMergeBody(body: Buffer, sourceCustomerId: string): MergeCustomerInput {
  const parsed: unknown = JSON.parse(body.toString('utf8'));
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Merge body must be a JSON object');
  }
  const record = parsed as { targetCustomerId?: unknown; reason?: unknown };
  return {
    sourceCustomerId,
    targetCustomerId: record.targetCustomerId as string,
    reason: record.reason as string,
  };
}

function parseSuppressionBody(body: Buffer, customerId: string): SuppressCustomerChannelInput {
  const parsed: unknown = JSON.parse(body.toString('utf8'));
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Suppression body must be a JSON object');
  }
  const record = parsed as { channel?: unknown; reason?: unknown };
  return {
    customerId,
    channel: record.channel,
    reason: record.reason,
  } as SuppressCustomerChannelInput;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new BadRequestException('Pagination must be a non-negative integer');
  }
  return parsed;
}
