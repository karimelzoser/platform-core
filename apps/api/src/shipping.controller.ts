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
import { AuthenticatedContextService } from './authenticated-context.service.js';
import { ShippingService } from './shipping.service.js';

@Controller('v1/shipping')
export class ShippingController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly shipping: ShippingService,
  ) {}

  @Get('shipments')
  public async shipments(
    @Query('storeId') storeId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.read');
    if (storeId) assertUuid(storeId, 'storeId');
    return this.shipping.listShipments(context, {
      ...(storeId ? { storeId } : {}),
      ...(status ? { status } : {}),
      ...(limit ? { limit: parseInteger(limit, 'limit', 1, 100) } : {}),
      ...(offset
        ? { offset: parseInteger(offset, 'offset', 0, 1_000_000) }
        : {}),
    });
  }

  @Get('shipments/:shipmentId')
  public async shipment(
    @Param('shipmentId') shipmentId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    assertUuid(shipmentId, 'shipmentId');
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.read');
    const shipment = await this.shipping.getShipment(context, shipmentId);
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  @Post('carrier-accounts')
  public async createCarrierAccount(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const object = parsedObject(body);
    if (object.connectionId !== undefined) {
      assertUuid(object.connectionId, 'connectionId');
    }
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.manage');
    return this.shipping.createCarrierAccount(
      context,
      requireIdempotency(idempotencyKey),
      {
        ...(typeof object.connectionId === 'string'
          ? { connectionId: object.connectionId }
          : {}),
        carrierKey: requiredString(object.carrierKey, 'carrierKey', 100),
        accountLabel: requiredString(
          object.accountLabel,
          'accountLabel',
          300,
        ),
        displayName: requiredString(object.displayName, 'displayName', 300),
        metadata: optionalObject(object.metadata, 'metadata'),
      },
      approvalId,
    );
  }

  @Post('carrier-services')
  public async createCarrierService(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const object = parsedObject(body);
    assertUuid(object.carrierAccountId, 'carrierAccountId');
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.manage');
    return this.shipping.createCarrierService(
      context,
      requireIdempotency(idempotencyKey),
      {
        carrierAccountId: object.carrierAccountId,
        serviceCode: requiredString(object.serviceCode, 'serviceCode', 200),
        name: requiredString(object.name, 'name', 300),
        domestic: optionalBoolean(object.domestic, 'domestic') ?? true,
        international:
          optionalBoolean(object.international, 'international') ?? false,
        metadata: optionalObject(object.metadata, 'metadata'),
      },
      approvalId,
    );
  }

  @Post('shipments')
  public async createShipment(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const object = parsedObject(body);
    assertUuid(object.storeId, 'storeId');
    assertUuid(object.orderId, 'orderId');
    assertUuid(object.fulfillmentId, 'fulfillmentId');
    if (object.carrierAccountId !== undefined) {
      assertUuid(object.carrierAccountId, 'carrierAccountId');
    }
    if (object.carrierServiceId !== undefined) {
      assertUuid(object.carrierServiceId, 'carrierServiceId');
    }
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.manage');
    return this.shipping.createShipment(
      context,
      requireIdempotency(idempotencyKey),
      {
        storeId: object.storeId,
        orderId: object.orderId,
        fulfillmentId: object.fulfillmentId,
        ...(typeof object.carrierAccountId === 'string'
          ? { carrierAccountId: object.carrierAccountId }
          : {}),
        ...(typeof object.carrierServiceId === 'string'
          ? { carrierServiceId: object.carrierServiceId }
          : {}),
        destination: requiredObject(object.destination, 'destination') as never,
        ...(object.declaredValueMinor === undefined
          ? {}
          : {
              declaredValueMinor: requiredInteger(
                object.declaredValueMinor,
                'declaredValueMinor',
                0,
                Number.MAX_SAFE_INTEGER,
              ),
            }),
        ...(typeof object.declaredValueCurrency === 'string'
          ? { declaredValueCurrency: object.declaredValueCurrency }
          : {}),
        ...(typeof object.estimatedDeliveryAt === 'string'
          ? { estimatedDeliveryAt: object.estimatedDeliveryAt }
          : {}),
        metadata: optionalObject(object.metadata, 'metadata'),
        lines: requiredArray(object.lines, 'lines') as never,
        ...(object.packages === undefined
          ? {}
          : {
              packages: requiredArray(object.packages, 'packages') as never,
            }),
      },
      approvalId,
    );
  }

  @Post('shipments/:shipmentId/tracking-events')
  public async recordTrackingEvent(
    @Param('shipmentId') shipmentId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    assertUuid(shipmentId, 'shipmentId');
    const object = parsedObject(body);
    assertUuid(object.storeId, 'storeId');
    if (object.packageId !== undefined) {
      assertUuid(object.packageId, 'packageId');
    }
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.tracking.record');
    return this.shipping.recordTrackingEvent(
      context,
      requireIdempotency(idempotencyKey),
      {
        storeId: object.storeId,
        shipmentId,
        ...(typeof object.packageId === 'string'
          ? { packageId: object.packageId }
          : {}),
        eventType: requiredString(object.eventType, 'eventType', 100) as never,
        normalizedStatus: requiredString(
          object.normalizedStatus,
          'normalizedStatus',
          100,
        ) as never,
        ...(typeof object.rawCode === 'string'
          ? { rawCode: object.rawCode }
          : {}),
        ...(typeof object.description === 'string'
          ? { description: object.description }
          : {}),
        ...(typeof object.locationName === 'string'
          ? { locationName: object.locationName }
          : {}),
        ...(typeof object.countryCode === 'string'
          ? { countryCode: object.countryCode }
          : {}),
        occurredAt: requiredString(object.occurredAt, 'occurredAt', 100),
        sourceType: (typeof object.sourceType === 'string'
          ? object.sourceType
          : 'INTEGRATION') as never,
        ...(typeof object.externalEventId === 'string'
          ? { externalEventId: object.externalEventId }
          : {}),
        dedupeKey: requiredString(object.dedupeKey, 'dedupeKey', 300),
        data: optionalObject(object.data, 'data'),
      },
    );
  }

  @Post('shipments/:shipmentId/rescue-cases')
  public async openRescueCase(
    @Param('shipmentId') shipmentId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    assertUuid(shipmentId, 'shipmentId');
    const object = parsedObject(body);
    assertUuid(object.storeId, 'storeId');
    if (object.assignedActorId !== undefined) {
      assertUuid(object.assignedActorId, 'assignedActorId');
    }
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.rescue.manage');
    return this.shipping.openRescueCase(
      context,
      requireIdempotency(idempotencyKey),
      {
        storeId: object.storeId,
        shipmentId,
        state: (typeof object.state === 'string' ? object.state : 'OPEN') as never,
        triggerReason: requiredString(
          object.triggerReason,
          'triggerReason',
          100,
        ) as never,
        priority: (typeof object.priority === 'string'
          ? object.priority
          : 'MEDIUM') as never,
        ...(typeof object.assignedActorId === 'string'
          ? { assignedActorId: object.assignedActorId }
          : {}),
        summary: requiredString(object.summary, 'summary', 1_000),
        ...(typeof object.dueAt === 'string' ? { dueAt: object.dueAt } : {}),
        metadata: optionalObject(object.metadata, 'metadata'),
      },
    );
  }

  @Post('rescue-cases/:rescueCaseId/state')
  public async updateRescueCase(
    @Param('rescueCaseId') rescueCaseId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    assertUuid(rescueCaseId, 'rescueCaseId');
    const object = parsedObject(body);
    assertUuid(object.storeId, 'storeId');
    if (
      object.assignedActorId !== undefined &&
      object.assignedActorId !== null
    ) {
      assertUuid(object.assignedActorId, 'assignedActorId');
    }
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.rescue.manage');
    return this.shipping.updateRescueCase(
      context,
      requireIdempotency(idempotencyKey),
      {
        storeId: object.storeId,
        rescueCaseId,
        state: requiredString(object.state, 'state', 100) as never,
        ...(typeof object.priority === 'string'
          ? { priority: object.priority as never }
          : {}),
        ...(object.assignedActorId === undefined
          ? {}
          : { assignedActorId: object.assignedActorId as string | null }),
        ...(typeof object.summary === 'string'
          ? { summary: object.summary }
          : {}),
        ...(object.dueAt === undefined
          ? {}
          : { dueAt: object.dueAt as string | null }),
      },
    );
  }

  @Post('shipments/:shipmentId/provider-actions')
  public async queueProviderAction(
    @Param('shipmentId') shipmentId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    assertUuid(shipmentId, 'shipmentId');
    const object = parsedObject(body);
    assertUuid(object.storeId, 'storeId');
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.provider.execute');
    return this.shipping.queueProviderAction(
      context,
      requireIdempotency(idempotencyKey),
      {
        storeId: object.storeId,
        shipmentId,
        operation: requiredString(
          object.operation,
          'operation',
          100,
        ) as never,
        ...(typeof object.reason === 'string'
          ? { reason: object.reason }
          : {}),
        ...(typeof object.scheduledAt === 'string'
          ? { scheduledAt: object.scheduledAt }
          : {}),
        ...(object.destination === undefined
          ? {}
          : {
              destination: requiredObject(
                object.destination,
                'destination',
              ) as never,
            }),
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
      return await this.authentication.resolve({
        authorization,
        tenantId,
        correlationId,
      });
    } catch {
      throw new UnauthorizedException(
        'Invalid authentication or tenant membership',
      );
    }
  }

  private assertPermission(
    permissions: readonly string[],
    permission: string,
  ): void {
    if (!permissions.includes(permission)) {
      throw new ForbiddenException(`${permission} permission is required`);
    }
  }
}

function parsedObject(body: unknown): Record<string, unknown> {
  if (!Buffer.isBuffer(body)) {
    throw new BadRequestException('Shipping body must be JSON');
  }
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    return requiredObject(parsed, 'body');
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Shipping body must be a JSON object');
  }
}

function requiredObject(value: unknown, field: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new BadRequestException(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalObject(value: unknown, field: string): Record<string, unknown> {
  return value === undefined ? {} : requiredObject(value, field);
}

function requiredArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${field} must be an array`);
  }
  return value;
}

function requiredString(
  value: unknown,
  field: string,
  maximum: number,
): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum
  ) {
    throw new BadRequestException(
      `${field} must contain between 1 and ${String(maximum)} characters`,
    );
  }
  return value.trim();
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${field} must be a boolean`);
  }
  return value;
}

function requiredInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new BadRequestException(
      `${field} must be a whole number between ${String(minimum)} and ${String(maximum)}`,
    );
  }
  return value;
}

function parseInteger(
  value: string,
  field: string,
  minimum: number,
  maximum: number,
): number {
  return requiredInteger(Number(value), field, minimum, maximum);
}

function requireIdempotency(value: string | undefined): string {
  if (!value?.trim()) {
    throw new BadRequestException('Idempotency-Key is required');
  }
  if (value.length > 200) {
    throw new BadRequestException('Idempotency-Key is too long');
  }
  return value.trim();
}

function assertUuid(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      value,
    )
  ) {
    throw new BadRequestException(`${field} must be a UUID`);
  }
}
