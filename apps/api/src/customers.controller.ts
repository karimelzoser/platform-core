import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
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
    const parsedLimit = parseOptionalNumber(limit);
    const parsedOffset = parseOptionalNumber(offset);
    return this.customers.list(context, {
      ...(search ? { search } : {}),
      ...(parsedLimit === undefined ? {} : { limit: parsedLimit }),
      ...(parsedOffset === undefined ? {} : { offset: parsedOffset }),
    });
  }

  @Get(':customerId')
  public async detail(
    @Param('customerId') customerId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    const customer = await this.customers.detail(context, customerId);
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
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
}

function parseCustomerBody(body: Buffer): CreateCustomerInput {
  const parsed: unknown = JSON.parse(body.toString('utf8'));
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Customer body must be a JSON object');
  }
  return parsed as CreateCustomerInput;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new BadRequestException('Pagination must be a non-negative integer');
  }
  return parsed;
}
