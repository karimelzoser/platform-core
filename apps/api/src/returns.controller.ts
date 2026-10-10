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
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandExecutionError } from '@platform/command-execution';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import {
  ReturnsInvariantError,
  ReturnsService,
  type CreateReturnInput,
  type ExchangeInput,
  type RefundInput,
  type RestockInput,
  type ReturnDecisionInput,
  type ReturnInspectionInput,
  type ReturnShipmentInput,
} from './returns.service.js';

@Controller('v1/returns')
export class ReturnsController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly returns: ReturnsService,
  ) {}

  @Get()
  public async list(
    @Query('limit') limit: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.read');
    return this.returns.list(context, limit ? boundedInteger(limit, 'limit', 1, 100) : 50);
  }

  @Get('eligibility/:orderId')
  public async eligibility(
    @Param('orderId') orderId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.read');
    return this.execute(() => this.returns.eligibility(context, orderId));
  }

  @Get(':returnId')
  public async detail(
    @Param('returnId') returnId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.read');
    const detail = await this.execute(() => this.returns.detail(context, returnId));
    if (!detail) throw new NotFoundException('Return not found');
    return detail;
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
    this.require(context.permissions, 'returns.create');
    return this.execute(() =>
      this.returns.create(
        context,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Return request') as CreateReturnInput,
      ),
    );
  }

  @Post(':returnId/decision')
  public async decide(
    @Param('returnId') returnId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.approve');
    return this.execute(() =>
      this.returns.decide(
        context,
        returnId,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Return decision') as ReturnDecisionInput,
        approvalId,
      ),
    );
  }

  @Post(':returnId/received')
  public async received(
    @Param('returnId') returnId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.manage');
    return this.execute(() =>
      this.returns.markReceived(context, returnId, requireIdempotency(idempotencyKey)),
    );
  }

  @Post(':returnId/inspections')
  public async inspect(
    @Param('returnId') returnId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.manage');
    return this.execute(() =>
      this.returns.inspect(
        context,
        returnId,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Return inspection') as ReturnInspectionInput,
      ),
    );
  }

  @Post(':returnId/exchanges')
  public async exchange(
    @Param('returnId') returnId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.approve');
    return this.execute(() =>
      this.returns.createExchange(
        context,
        returnId,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Exchange request') as ExchangeInput,
        approvalId,
      ),
    );
  }

  @Post(':returnId/refunds')
  public async refund(
    @Param('returnId') returnId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'commerce.refunds.issue');
    return this.execute(() =>
      this.returns.requestRefund(
        context,
        returnId,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Refund request') as RefundInput,
        approvalId,
      ),
    );
  }

  @Post(':returnId/restocks')
  public async restock(
    @Param('returnId') returnId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'commerce.inventory.manage');
    return this.execute(() =>
      this.returns.restock(
        context,
        returnId,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Restock request') as RestockInput,
        approvalId,
      ),
    );
  }

  @Post(':returnId/shipment')
  public async shipment(
    @Param('returnId') returnId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'returns.manage');
    return this.execute(() =>
      this.returns.linkShipment(
        context,
        returnId,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Return shipment') as ReturnShipmentInput,
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
    if (!permissions.includes(permission)) {
      throw new ForbiddenException(`${permission} permission is required`);
    }
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        if (error.code === 'authorization_denied') throw new ForbiddenException(error.message);
        throw new ConflictException(error.message);
      }
      if (error instanceof ReturnsInvariantError) throw new ConflictException(error.message);
      if (error instanceof zodLikeError) throw new BadRequestException(error.message);
      if (error instanceof Error) throw new BadRequestException(error.message);
      throw error;
    }
  }
}

class zodLikeError extends Error {}

function parseJsonObject(body: unknown, label: string): Record<string, unknown> {
  if (!Buffer.isBuffer(body)) throw new BadRequestException(`${label} body must be JSON`);
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('JSON object required');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new BadRequestException(`${label} body must be a JSON object`);
  }
}

function requireIdempotency(value: string | undefined): string {
  if (!value?.trim()) throw new BadRequestException('Idempotency-Key header is required');
  return value.trim();
}

function boundedInteger(value: string, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new BadRequestException(`${name} must be an integer between ${String(min)} and ${String(max)}`);
  }
  return parsed;
}
