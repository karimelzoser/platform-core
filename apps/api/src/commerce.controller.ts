import {
  BadRequestException,
  Body,
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
import { CommerceService } from '@platform/commerce';
import {
  OrderWorkflowService,
  type OrderModificationPatch,
} from '@platform/commerce/order-workflows';
import { AuthenticatedContextService } from './authenticated-context.service.js';

@Controller('v1/commerce')
export class CommerceController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly commerce: CommerceService,
    private readonly workflows: OrderWorkflowService,
  ) {}

  @Get('stores')
  public async stores(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'commerce.orders.read');
    return { items: await this.commerce.listStores(context) };
  }

  @Get('orders')
  public async orders(
    @Query('storeId') storeId: string | undefined,
    @Query('customerId') customerId: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'commerce.orders.read');
    if (storeId) assertUuid(storeId, 'storeId');
    if (customerId) assertUuid(customerId, 'customerId');
    return this.commerce.listOrders(context, {
      ...(storeId ? { storeId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(limit ? { limit: parseInteger(limit, 'limit', 1, 100) } : {}),
      ...(offset ? { offset: parseInteger(offset, 'offset', 0, 1_000_000) } : {}),
    });
  }

  @Get('orders/:orderId')
  public async order(
    @Param('orderId') orderId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    assertUuid(orderId, 'orderId');
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'commerce.orders.read');
    const [order, workflow] = await Promise.all([
      this.commerce.getOrder(context, orderId),
      this.workflows.get(context, orderId),
    ]);
    if (!order) throw new NotFoundException('Order not found');
    return { order, workflow: workflow ?? null };
  }

  @Post('orders/:orderId/confirmation/request')
  public async requestConfirmation(
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const parsed = parseOrderBody(body, orderId);
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'commerce.orders.confirm');
    return this.workflows.requestConfirmation(context, requireIdempotency(idempotencyKey), parsed);
  }

  @Post('orders/:orderId/confirmation/response')
  public async confirmationResponse(
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const parsed = parseOrderBody(body, orderId);
    const response = parsedObject(body).response;
    if (response !== 'CONFIRMED' && response !== 'DECLINED')
      throw new BadRequestException('response must be CONFIRMED or DECLINED');
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'commerce.orders.confirm');
    return this.workflows.recordConfirmationResponse(context, requireIdempotency(idempotencyKey), {
      ...parsed,
      response,
    });
  }

  @Post('orders/:orderId/duplicates/evaluate')
  public async evaluateDuplicates(
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const parsed = parseOrderBody(body, orderId);
    const object = parsedObject(body);
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'commerce.orders.update');
    return this.workflows.evaluateDuplicates(context, requireIdempotency(idempotencyKey), {
      ...parsed,
      ...(object.lookbackDays === undefined
        ? {}
        : { lookbackDays: wholeNumber(object.lookbackDays, 'lookbackDays', 1, 30) }),
      ...(object.threshold === undefined
        ? {}
        : { threshold: wholeNumber(object.threshold, 'threshold', 40, 100) }),
    });
  }

  @Post('orders/:orderId/duplicates/:candidateId/review')
  public async reviewDuplicate(
    @Param('orderId') orderId: string,
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    assertUuid(candidateId, 'candidateId');
    const parsed = parseOrderBody(body, orderId);
    const decision = parsedObject(body).decision;
    if (decision !== 'DISMISS' && decision !== 'CONFIRM_DUPLICATE')
      throw new BadRequestException('decision must be DISMISS or CONFIRM_DUPLICATE');
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'commerce.orders.update');
    return this.workflows.reviewDuplicate(context, requireIdempotency(idempotencyKey), {
      ...parsed,
      candidateId,
      decision,
    });
  }

  @Post('orders/:orderId/modifications')
  public async requestModification(
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const parsed = parseOrderBody(body, orderId);
    const object = parsedObject(body);
    if (!object.patch || typeof object.patch !== 'object' || Array.isArray(object.patch))
      throw new BadRequestException('patch must be an object');
    const reason = optionalString(object.reason, 'reason', 4_000);
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'commerce.orders.update');
    return this.workflows.requestModification(context, requireIdempotency(idempotencyKey), {
      ...parsed,
      patch: object.patch as OrderModificationPatch,
      ...(reason === undefined ? {} : { reason }),
    });
  }

  @Post('orders/:orderId/modifications/:requestId/review')
  public async reviewModification(
    @Param('orderId') orderId: string,
    @Param('requestId') requestId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    assertUuid(requestId, 'requestId');
    const parsed = parseOrderBody(body, orderId);
    const decision = parseReviewDecision(body);
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'commerce.orders.update');
    return this.workflows.reviewModification(context, requireIdempotency(idempotencyKey), {
      ...parsed,
      requestId,
      decision,
    });
  }

  @Post('orders/:orderId/cancellations')
  public async requestCancellation(
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const parsed = parseOrderBody(body, orderId);
    const reason = requiredString(parsedObject(body).reason, 'reason', 4_000);
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'commerce.orders.cancel');
    return this.workflows.requestCancellation(context, requireIdempotency(idempotencyKey), {
      ...parsed,
      reason,
    });
  }

  @Post('orders/:orderId/cancellations/:requestId/review')
  public async reviewCancellation(
    @Param('orderId') orderId: string,
    @Param('requestId') requestId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    assertUuid(requestId, 'requestId');
    const parsed = parseOrderBody(body, orderId);
    const decision = parseReviewDecision(body);
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'commerce.orders.cancel');
    return this.workflows.reviewCancellation(
      context,
      requireIdempotency(idempotencyKey),
      { ...parsed, requestId, decision },
      approvalId,
    );
  }

  @Post('orders/:orderId/provider-actions')
  public async providerAction(
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const parsed = parseOrderBody(body, orderId);
    const object = parsedObject(body);
    assertUuid(object.connectionId, 'connectionId');
    const operation = object.operation;
    if (operation !== 'CONFIRM' && operation !== 'MODIFY' && operation !== 'CANCEL')
      throw new BadRequestException('operation must be CONFIRM, MODIFY, or CANCEL');
    if (object.changeRequestId !== undefined) assertUuid(object.changeRequestId, 'changeRequestId');
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(
      context.permissions,
      operation === 'CANCEL'
        ? 'commerce.orders.cancel'
        : operation === 'CONFIRM'
          ? 'commerce.orders.confirm'
          : 'commerce.orders.update',
    );
    return this.workflows.queueProviderAction(
      context,
      requireIdempotency(idempotencyKey),
      {
        ...parsed,
        connectionId: object.connectionId,
        operation,
        ...(typeof object.changeRequestId === 'string'
          ? { changeRequestId: object.changeRequestId }
          : {}),
      },
      approvalId,
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

  private assertPermission(permissions: readonly string[], permission: string): void {
    if (!permissions.includes(permission))
      throw new ForbiddenException(`${permission} permission is required`);
  }
}

function parseOrderBody(body: unknown, orderId: string): { storeId: string; orderId: string } {
  assertUuid(orderId, 'orderId');
  const object = parsedObject(body);
  assertUuid(object.storeId, 'storeId');
  return { storeId: object.storeId, orderId };
}

function parsedObject(body: unknown): Record<string, unknown> {
  if (!Buffer.isBuffer(body)) throw new BadRequestException('Commerce body must be JSON');
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new BadRequestException('Commerce body must be a JSON object');
  }
}

function parseReviewDecision(body: unknown): 'APPROVE' | 'REJECT' {
  const decision = parsedObject(body).decision;
  if (decision !== 'APPROVE' && decision !== 'REJECT')
    throw new BadRequestException('decision must be APPROVE or REJECT');
  return decision;
}

function requireIdempotency(value: string | undefined): string {
  if (!value?.trim()) throw new BadRequestException('Idempotency-Key is required');
  if (value.length > 200) throw new BadRequestException('Idempotency-Key is too long');
  return value.trim();
}

function parseInteger(value: string, field: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new BadRequestException(
      `${field} must be a whole number between ${String(minimum)} and ${String(maximum)}`,
    );
  return parsed;
}

function wholeNumber(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum)
    throw new BadRequestException(
      `${field} must be a whole number between ${String(minimum)} and ${String(maximum)}`,
    );
  return value;
}

function requiredString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new BadRequestException(
      `${field} must contain between 1 and ${String(maximum)} characters`,
    );
  return value.trim();
}

function optionalString(value: unknown, field: string, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, field, maximum);
}

function assertUuid(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
  )
    throw new BadRequestException(`${field} must be a UUID`);
}
