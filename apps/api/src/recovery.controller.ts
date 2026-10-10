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
  RecoveryService,
  type MarkRecoveredInput,
  type RecoveryAttemptInput,
  type RecoveryOfferInput,
  type RecoveryPolicyInput,
} from './recovery.service.js';

@Controller('v1/recovery')
export class RecoveryController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly recovery: RecoveryService,
  ) {}

  @Get()
  public async list(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'recovery.read');
    return this.recovery.list(context);
  }

  @Get('policies')
  public async policies(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'recovery.read');
    return this.recovery.policies(context);
  }

  @Get(':opportunityId')
  public async get(
    @Param('opportunityId') opportunityId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'recovery.read');
    const result = await this.recovery.get(context, opportunityId);
    if (!result) throw new NotFoundException('Recovery opportunity was not found');
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
    this.require(context.permissions, 'recovery.manage');
    return this.execute(() =>
      this.recovery.upsertPolicy(
        context,
        requireIdempotency(idempotencyKey),
        parseJsonObject(body, 'Recovery policy body') as RecoveryPolicyInput,
        approvalId,
      ),
    );
  }

  @Post('detect/:orderId')
  public async detect(
    @Param('orderId') orderId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'recovery.execute');
    return this.execute(() =>
      this.recovery.detect(context, requireIdempotency(idempotencyKey), orderId),
    );
  }

  @Post(':opportunityId/offers')
  public async createOffer(
    @Param('opportunityId') opportunityId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'recovery.manage');
    const input = parseJsonObject(body, 'Recovery offer body');
    return this.execute(() =>
      this.recovery.createOffer(
        context,
        requireIdempotency(idempotencyKey),
        { ...input, opportunityId } as RecoveryOfferInput,
        approvalId,
      ),
    );
  }

  @Post(':opportunityId/attempts')
  public async dispatchAttempt(
    @Param('opportunityId') opportunityId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'recovery.execute');
    this.require(context.permissions, 'messaging.conversations.reply');
    const input = parseJsonObject(body, 'Recovery attempt body');
    return this.execute(() =>
      this.recovery.dispatchAttempt(
        context,
        requireIdempotency(idempotencyKey),
        { ...input, opportunityId } as RecoveryAttemptInput,
      ),
    );
  }

  @Post(':opportunityId/recovered')
  public async markRecovered(
    @Param('opportunityId') opportunityId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'recovery.execute');
    const input = parseJsonObject(body, 'Recovery attribution body');
    return this.execute(() =>
      this.recovery.markRecovered(
        context,
        requireIdempotency(idempotencyKey),
        { ...input, opportunityId } as MarkRecoveredInput,
      ),
    );
  }

  @Post('expire-due')
  public async expireDue(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'recovery.execute');
    return this.execute(() =>
      this.recovery.expireDue(context, requireIdempotency(idempotencyKey)),
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
