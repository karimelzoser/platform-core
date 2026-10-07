import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandExecutionError } from '@platform/command-execution';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import {
  OnboardingService,
  type OnboardingProfileInput,
  type OnboardingStep,
  type OnboardingStepDisposition,
} from './onboarding.service.js';

@Controller('v1/onboarding')
export class OnboardingController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly onboarding: OnboardingService,
  ) {}

  @Get()
  public async state(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'organization.read');
    return this.onboarding.getState(context);
  }

  @Post('profile')
  public async updateProfile(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'organization.update');
    return this.execute(() =>
      this.onboarding.updateProfile(
        context,
        requireIdempotency(idempotencyKey),
        parseProfileBody(body),
      ),
    );
  }

  @Post('steps/:step')
  public async updateStep(
    @Param('step') step: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.require(context.permissions, 'organization.update');
    const disposition = parseStepBody(body);
    return this.execute(() =>
      this.onboarding.setStepDisposition(
        context,
        requireIdempotency(idempotencyKey),
        parseStep(step),
        disposition,
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
      if (error instanceof Error) throw new BadRequestException(error.message);
      throw error;
    }
  }
}

function parseProfileBody(body: unknown): OnboardingProfileInput {
  const parsed = parseJsonObject(body, 'Onboarding profile body');
  return parsed as OnboardingProfileInput;
}

function parseStepBody(body: unknown): OnboardingStepDisposition {
  const parsed = parseJsonObject(body, 'Onboarding step body');
  const status = parsed.status;
  if (status !== 'PENDING' && status !== 'SKIPPED') {
    throw new BadRequestException('Onboarding step status must be PENDING or SKIPPED');
  }
  return status;
}

function parseStep(step: string): OnboardingStep {
  const normalized = step.toUpperCase();
  if (normalized !== 'TEAM' && normalized !== 'INTEGRATION') {
    throw new BadRequestException('Onboarding step must be TEAM or INTEGRATION');
  }
  return normalized;
}

function parseJsonObject(body: unknown, label: string): Record<string, unknown> {
  if (!Buffer.isBuffer(body)) throw new BadRequestException(`${label} must be JSON`);
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('JSON object required');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new BadRequestException(`${label} must be a JSON object`);
  }
}

function requireIdempotency(value: string | undefined): string {
  if (!value?.trim()) throw new BadRequestException('Idempotency-Key header is required');
  return value.trim();
}
