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
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import { ShippingRoutingService } from './shipping-routing.service.js';

@Controller('v1/shipping/routing')
export class ShippingRoutingController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly routing: ShippingRoutingService,
  ) {}

  @Get('catalog')
  public async catalog(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.read');
    return this.routing.getCatalog(context);
  }

  @Get('shipments/:shipmentId')
  public async shipmentRouting(
    @Param('shipmentId') shipmentId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    assertUuid(shipmentId, 'shipmentId');
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.read');
    const routing = await this.routing.getShipmentRouting(context, shipmentId);
    if (!routing) throw new NotFoundException('Shipment routing was not found');
    return routing;
  }

  @Post('locations')
  public async createLocation(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const object = parsedObject(body);
    if (object.parentId !== undefined) assertUuid(object.parentId, 'parentId');
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.manage');
    return this.routing.createLocation(
      context,
      requireIdempotency(idempotencyKey),
      {
        ...(typeof object.parentId === 'string' ? { parentId: object.parentId } : {}),
        level: requiredString(object.level, 'level', 20) as never,
        countryCode: requiredString(object.countryCode, 'countryCode', 2),
        code: requiredString(object.code, 'code', 100),
        name: requiredString(object.name, 'name', 300),
        aliases: optionalStringArray(object.aliases, 'aliases', 300),
        metadata: optionalObject(object.metadata, 'metadata'),
      },
      approvalId,
    );
  }

  @Post('zones')
  public async createZone(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const object = parsedObject(body);
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.manage');
    return this.routing.createZone(
      context,
      requireIdempotency(idempotencyKey),
      {
        code: requiredString(object.code, 'code', 100),
        name: requiredString(object.name, 'name', 300),
        priority: optionalInteger(object.priority, 'priority', 0, 1_000_000) ?? 100,
        metadata: optionalObject(object.metadata, 'metadata'),
      },
      approvalId,
    );
  }

  @Post('zone-locations')
  public async assignZoneLocation(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const object = parsedObject(body);
    assertUuid(object.zoneId, 'zoneId');
    assertUuid(object.locationId, 'locationId');
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.manage');
    return this.routing.assignZoneLocation(context, requireIdempotency(idempotencyKey), {
      zoneId: object.zoneId,
      locationId: object.locationId,
      includeDescendants: optionalBoolean(object.includeDescendants, 'includeDescendants') ?? true,
    });
  }

  @Post('carrier-location-mappings')
  public async upsertCarrierLocationMapping(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const object = parsedObject(body);
    assertUuid(object.carrierAccountId, 'carrierAccountId');
    assertUuid(object.locationId, 'locationId');
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.manage');
    return this.routing.upsertCarrierLocationMapping(
      context,
      requireIdempotency(idempotencyKey),
      {
        carrierAccountId: object.carrierAccountId,
        locationId: object.locationId,
        externalCode: requiredString(object.externalCode, 'externalCode', 300),
        ...(typeof object.externalName === 'string'
          ? { externalName: requiredString(object.externalName, 'externalName', 500) }
          : {}),
        metadata: optionalObject(object.metadata, 'metadata'),
      },
    );
  }

  @Post('service-zone-rules')
  public async setServiceZoneRule(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const object = parsedObject(body);
    assertUuid(object.carrierAccountId, 'carrierAccountId');
    assertUuid(object.carrierServiceId, 'carrierServiceId');
    assertUuid(object.zoneId, 'zoneId');
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.manage');
    return this.routing.setServiceZoneRule(context, requireIdempotency(idempotencyKey), {
      carrierAccountId: object.carrierAccountId,
      carrierServiceId: object.carrierServiceId,
      zoneId: object.zoneId,
      eligibility: requiredString(object.eligibility, 'eligibility', 20) as never,
      metadata: optionalObject(object.metadata, 'metadata'),
    });
  }

  @Post('shipments/:shipmentId/recalculate')
  public async recalculateShipment(
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
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.manage');
    return this.routing.recalculateShipmentRouting(
      context,
      requireIdempotency(idempotencyKey),
      { storeId: object.storeId, shipmentId },
    );
  }

  @Post('shipments/:shipmentId/review')
  public async reviewShipmentAddress(
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
    assertUuid(object.countryLocationId, 'countryLocationId');
    for (const field of ['regionLocationId', 'cityLocationId', 'districtLocationId', 'zoneId']) {
      if (object[field] !== undefined) assertUuid(object[field], field);
    }
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'shipping.shipments.manage');
    return this.routing.reviewShipmentAddress(
      context,
      requireIdempotency(idempotencyKey),
      {
        storeId: object.storeId,
        shipmentId,
        normalizedDestination: requiredObject(
          object.normalizedDestination,
          'normalizedDestination',
        ) as never,
        validationState: (typeof object.validationState === 'string'
          ? object.validationState
          : 'MATCHED') as never,
        confidence: optionalNumber(object.confidence, 'confidence', 0, 1) ?? 1,
        countryLocationId: object.countryLocationId,
        ...(typeof object.regionLocationId === 'string'
          ? { regionLocationId: object.regionLocationId }
          : {}),
        ...(typeof object.cityLocationId === 'string'
          ? { cityLocationId: object.cityLocationId }
          : {}),
        ...(typeof object.districtLocationId === 'string'
          ? { districtLocationId: object.districtLocationId }
          : {}),
        ...(typeof object.zoneId === 'string' ? { zoneId: object.zoneId } : {}),
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
    if (!permissions.includes(permission)) {
      throw new ForbiddenException(`${permission} permission is required`);
    }
  }
}

function parsedObject(body: unknown): Record<string, unknown> {
  if (!Buffer.isBuffer(body)) {
    throw new BadRequestException('Shipping routing body must be JSON');
  }
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    return requiredObject(parsed, 'body');
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Shipping routing body must be a JSON object');
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

function requiredString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new BadRequestException(
      `${field} must contain between 1 and ${String(maximum)} characters`,
    );
  }
  return value;
}

function optionalStringArray(value: unknown, field: string, maximum: number): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new BadRequestException(`${field} must be an array`);
  if (value.length > 100) throw new BadRequestException(`${field} must contain at most 100 items`);
  return value.map((item, index) => requiredString(item, `${field}[${String(index)}]`, maximum));
}

function optionalInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new BadRequestException(
      `${field} must be an integer between ${String(minimum)} and ${String(maximum)}`,
    );
  }
  return value;
}

function optionalNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new BadRequestException(
      `${field} must be a number between ${String(minimum)} and ${String(maximum)}`,
    );
  }
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new BadRequestException(`${field} must be a boolean`);
  return value;
}

function requireIdempotency(value: string | undefined): string {
  if (!value?.trim()) throw new BadRequestException('Idempotency-Key is required');
  return value.trim();
}

function assertUuid(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  ) {
    throw new BadRequestException(`${field} must be a UUID`);
  }
}
