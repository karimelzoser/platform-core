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
  ReturnsService,
  type CreateExchangeInput,
  type CreateReturnRequestInput,
  type FulfillExchangeInput,
  type InspectReturnInput,
  type IssueRefundInput,
  type ReturnPolicyInput,
  type ReviewReturnRequestInput,
} from './returns.service.js';

@Controller('v1/returns')
export class ReturnsController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly returns: ReturnsService,
  ) {}

  @Get()
  public async list(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.read');
    return this.returns.list(context);
  }

  @Get(':requestId')
  public async get(
    @Param('requestId') requestId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.read');
    const result = await this.returns.get(context, requestId);
    if (!result) throw new NotFoundException('Return request was not found');
    return result;
  }

  @Post('policies')
  public async upsertPolicy(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.manage');
    return this.execute(() =>
      this.returns.upsertPolicy(
        context,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Return policy body') as ReturnPolicyInput,
        approvalId,
      ),
    );
  }

  @Post('requests')
  public async createRequest(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.create');
    return this.execute(() =>
      this.returns.createRequest(
        context,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Return request body') as CreateReturnRequestInput,
      ),
    );
  }

  @Post('requests/:requestId/review')
  public async reviewRequest(
    @Param('requestId') requestId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.approve');
    const input = parseJsonObject(body, 'Return review body');
    return this.execute(() =>
      this.returns.reviewRequest(
        context,
        requireIdempotency(idempotencyKey),
        { ...input, requestId } as ReviewReturnRequestInput,
        approvalId,
      ),
    );
  }

  @Post('requests/:requestId/inspection')
  public async inspect(
    @Param('requestId') requestId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.manage');
    const input = parseJsonObject(body, 'Return inspection body');
    return this.execute(() =>
      this.returns.receiveAndInspect(
        context,
        requireIdempotency(idempotencyKey),
        { ...input, requestId } as InspectReturnInput,
        approvalId,
      ),
    );
  }

  @Post('requests/:requestId/refunds')
  public async issueRefund(
    @Param('requestId') requestId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'commerce.refunds.issue');
    const input = parseJsonObject(body, 'Refund body');
    return this.execute(() =>
      this.returns.issueRefund(
        context,
        requireIdempotency(idempotencyKey),
        { ...input, requestId } as IssueRefundInput,
        approvalId,
      ),
    );
  }

  @Post('refunds/:refundId/reconcile')
  public async reconcileRefund(
    @Param('refundId') refundId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.manage');
    return this.execute(() =>
      this.returns.reconcileRefund(context, requireIdempotency(idempotencyKey), refundId),
    );
  }

  @Post('requests/:requestId/exchanges')
  public async createExchange(
    @Param('requestId') requestId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.approve');
    const input = parseJsonObject(body, 'Exchange body');
    return this.execute(() =>
      this.returns.createExchange(
        context,
        requireIdempotency(idempotencyKey),
        { ...input, requestId } as CreateExchangeInput,
        approvalId,
      ),
    );
  }

  @Post('exchanges/:exchangeId/fulfill')
  public async fulfillExchange(
    @Param('exchangeId') exchangeId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.manage');
    const input = parseJsonObject(body, 'Exchange fulfillment body');
    return this.execute(() =>
      this.returns.fulfillExchange(context, requireIdempotency(idempotencyKey), {
        ...input,
        exchangeId,
      } as FulfillExchangeInput),
    );
  }

  @Post('requests/:requestId/resolve')
  public async resolveRequest(
    @Param('requestId') requestId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.manage');
    return this.execute(() =>
      this.returns.resolveRequest(context, requireIdempotency(idempotencyKey), requestId),
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
