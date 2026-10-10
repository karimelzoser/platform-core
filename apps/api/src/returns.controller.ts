import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ReturnWorkflowService } from '@platform/commerce/returns';
import { AuthenticatedContextService } from './authenticated-context.service.js';

@Controller('v1/returns')
export class ReturnsController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly returns: ReturnWorkflowService,
  ) {}

  @Get()
  public async list(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'returns.read');
    return this.returns.list(context);
  }

  @Post()
  public async create(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const object = parsedObject(body);
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'returns.create');
    return this.returns.create(context, requireIdempotency(idempotencyKey), {
      storeId: requiredUuid(object.storeId, 'storeId'),
      orderId: requiredUuid(object.orderId, 'orderId'),
      resolution: requiredEnum(object.resolution, 'resolution', ['REFUND', 'EXCHANGE'] as const),
      reasonCode: requiredString(object.reasonCode, 'reasonCode', 64),
      ...(typeof object.reason === 'string' ? { reason: requiredString(object.reason, 'reason', 4_000) } : {}),
      lines: requiredArray(object.lines, 'lines').map((item, index) => {
        const line = parsedObject(item, `lines[${String(index)}]`);
        return {
          orderLineId: requiredUuid(line.orderLineId, `lines[${String(index)}].orderLineId`),
          quantity: requiredPositiveInteger(line.quantity, `lines[${String(index)}].quantity`),
        };
      }),
    });
  }

  @Post(':returnId/review')
  public async review(
    @Param('returnId') returnId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'returns.approve');
    const object = parsedObject(body);
    return this.returns.review(
      context,
      requireIdempotency(idempotencyKey),
      { returnId: requiredUuid(returnId, 'returnId'), decision: requiredEnum(object.decision, 'decision', ['APPROVE', 'REJECT'] as const) },
      approvalId,
    );
  }

  @Post(':returnId/receive')
  public async receive(
    @Param('returnId') returnId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'returns.manage');
    const object = parsedObject(body);
    return this.returns.receive(context, requireIdempotency(idempotencyKey), {
      returnId: requiredUuid(returnId, 'returnId'),
      lines: requiredArray(object.lines, 'lines').map((item, index) => {
        const line = parsedObject(item, `lines[${String(index)}]`);
        return {
          returnLineId: requiredUuid(line.returnLineId, `lines[${String(index)}].returnLineId`),
          quantity: requiredNonNegativeInteger(line.quantity, `lines[${String(index)}].quantity`),
        };
      }),
    });
  }

  @Post(':returnId/lines/:returnLineId/inspect')
  public async inspectLine(
    @Param('returnId') returnId: string,
    @Param('returnLineId') returnLineId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'returns.manage');
    const object = parsedObject(body);
    return this.returns.inspectLine(context, requireIdempotency(idempotencyKey), {
      returnId: requiredUuid(returnId, 'returnId'),
      returnLineId: requiredUuid(returnLineId, 'returnLineId'),
      quantity: requiredNonNegativeInteger(object.quantity, 'quantity'),
      condition: requiredEnum(object.condition, 'condition', ['NEW', 'OPEN_BOX', 'USED', 'DAMAGED', 'DEFECTIVE', 'MISSING'] as const),
      disposition: requiredEnum(object.disposition, 'disposition', ['RESTOCK', 'QUARANTINE', 'SCRAP', 'RETURN_TO_VENDOR'] as const),
      refundableMinor: requiredNonNegativeInteger(object.refundableMinor, 'refundableMinor'),
      ...(typeof object.restockLocationId === 'string'
        ? { restockLocationId: requiredUuid(object.restockLocationId, 'restockLocationId') }
        : {}),
    });
  }

  @Post(':returnId/lines/:returnLineId/restock')
  public async restockLine(
    @Param('returnId') returnId: string,
    @Param('returnLineId') returnLineId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'commerce.inventory.manage');
    const object = parsedObject(body);
    return this.returns.restockLine(
      context,
      requireIdempotency(idempotencyKey),
      {
        returnId: requiredUuid(returnId, 'returnId'),
        returnLineId: requiredUuid(returnLineId, 'returnLineId'),
        locationId: requiredUuid(object.locationId, 'locationId'),
      },
      approvalId,
    );
  }

  @Post(':returnId/refunds')
  public async requestRefund(
    @Param('returnId') returnId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'returns.manage');
    const object = parsedObject(body);
    return this.returns.requestRefund(context, requireIdempotency(idempotencyKey), {
      returnId: requiredUuid(returnId, 'returnId'),
      amountMinor: requiredPositiveInteger(object.amountMinor, 'amountMinor'),
      ...(typeof object.sourcePaymentId === 'string'
        ? { sourcePaymentId: requiredUuid(object.sourcePaymentId, 'sourcePaymentId') }
        : {}),
      ...(typeof object.reason === 'string' ? { reason: requiredString(object.reason, 'reason', 4_000) } : {}),
    });
  }

  @Post('refunds/:refundId/approve')
  public async approveRefund(
    @Param('refundId') refundId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'commerce.refunds.issue');
    return this.returns.approveRefund(
      context,
      requireIdempotency(idempotencyKey),
      { refundId: requiredUuid(refundId, 'refundId') },
      approvalId,
    );
  }

  @Post(':returnId/exchanges')
  public async createExchange(
    @Param('returnId') returnId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'returns.approve');
    const object = parsedObject(body);
    return this.returns.createExchange(
      context,
      requireIdempotency(idempotencyKey),
      {
        returnId: requiredUuid(returnId, 'returnId'),
        lines: requiredArray(object.lines, 'lines').map((item, index) => {
          const line = parsedObject(item, `lines[${String(index)}]`);
          return {
            returnLineId: requiredUuid(line.returnLineId, `lines[${String(index)}].returnLineId`),
            replacementVariantId: requiredUuid(line.replacementVariantId, `lines[${String(index)}].replacementVariantId`),
            quantity: requiredPositiveInteger(line.quantity, `lines[${String(index)}].quantity`),
          };
        }),
      },
      approvalId,
    );
  }

  private async context(authorization: string | undefined, tenantId: string | undefined, correlationId: string | undefined) {
    try {
      return await this.authentication.resolve({ authorization, tenantId, correlationId });
    } catch (error) {
      throw new UnauthorizedException(error instanceof Error ? error.message : 'Authentication failed');
    }
  }

  private assertPermission(permissions: readonly string[], permission: string): void {
    if (!permissions.includes(permission)) throw new ForbiddenException(`Missing permission: ${permission}`);
  }
}

function parsedObject(value: unknown, field = 'body'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${field} must be an object`);
  return value as Record<string, unknown>;
}
function requiredArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new BadRequestException(`${field} must be a non-empty array`);
  return value;
}
function requiredString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximum)
    throw new BadRequestException(`${field} is invalid`);
  return value.trim();
}
function requiredUuid(value: unknown, field: string): string {
  const text = requiredString(value, field, 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(text))
    throw new BadRequestException(`${field} must be a UUID`);
  return text;
}
function requiredPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new BadRequestException(`${field} must be a positive integer`);
  return value;
}
function requiredNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new BadRequestException(`${field} must be a non-negative integer`);
  return value;
}
function requiredEnum<const T extends readonly string[]>(value: unknown, field: string, choices: T): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) throw new BadRequestException(`${field} is invalid`);
  return value as T[number];
}
function requireIdempotency(value: string | undefined): string {
  if (!value || value.trim().length === 0 || value.length > 200) throw new BadRequestException('idempotency-key is required');
  return value.trim();
}
