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
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandExecutionError } from '@platform/command-execution';
import {
  CustomerIdentityConflictError,
  CustomerService,
  type CreateCustomerInput,
  type CreateTagInput,
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
    try {
      return await this.customers.create(
        context,
        idempotencyKey ?? '',
        parseCustomerBody(body),
        approvalId,
      );
    } catch (error) {
      if (error instanceof CustomerIdentityConflictError)
        throw new ConflictException(error.message);
      if (error instanceof CommandExecutionError) throw new ConflictException(error.message);
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

  private async executeTagCommand<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CommandExecutionError) throw new ConflictException(error.message);
      if (error instanceof Error) throw new BadRequestException(error.message);
      throw error;
    }
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

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new BadRequestException('Pagination must be a non-negative integer');
  }
  return parsed;
}
