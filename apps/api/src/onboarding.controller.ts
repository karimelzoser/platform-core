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
import { ZodError } from 'zod';
import {
  AuthenticatedContextService,
  type AuthenticatedTenantContext,
} from './authenticated-context.service.js';
import {
  OnboardingInputError,
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
    this.require(context, 'organization.read');
    return this.guard(() => this.onboarding.getState(context));
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
    this.require(context, 'organization.update');
    return this.guard(() =>
      this.onboarding.updateProfile(
        context,
        requireIdempotency(idempotencyKey),
        parsedObject(body) as OnboardingProfileInput,
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
    this.require(context, 'organization.update');
    const object = parsedObject(body);
    return this.guard(() =>
      this.onboarding.setStepDisposition(
        context,
        requireIdempotency(idempotencyKey),
        parseStep(step),
        parseDisposition(object.status),
      ),
    );
  }

  private async context(
    authorization: string | undefined,
    tenantId: string | undefined,
    correlationId: string | undefined,
  ): Promise<AuthenticatedTenantContext> {
    try {
      return await this.authentication.resolve({ authorization, tenantId, correlationId });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('MFA')) throw new ForbiddenException('MFA is required for this tenant');
      throw new UnauthorizedException('Invalid authentication or tenant membership');
    }
  }

  private require(context: AuthenticatedTenantContext, permission: string): void {
    if (!context.permissions.includes(permission))
      throw new ForbiddenException('Permission denied');
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ZodError) {
        const issue = error.issues[0];
        const field = issue?.path.length ? `${issue.path.join('.')}: ` : '';
        throw new BadRequestException(`${field}${issue?.message ?? 'Invalid onboarding input'}`);
      }
      if (error instanceof OnboardingInputError) throw new BadRequestException(error.message);
      if (error instanceof CommandExecutionError) {
        if (error.code === 'authorization_denied') throw new ForbiddenException(error.message);
        if (error.code === 'approval_required' || error.code === 'approval_unavailable') {
          throw new ConflictException(error.message);
        }
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}

function parsedObject(body: unknown): Record<string, unknown> {
  if (Buffer.isBuffer(body)) {
    try {
      const parsed: unknown = JSON.parse(body.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('JSON object required');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new BadRequestException('JSON object body is required');
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('JSON object body is required');
  }
  return body as Record<string, unknown>;
}

function parseStep(step: string): OnboardingStep {
  const normalized = step.toUpperCase();
  if (normalized !== 'TEAM' && normalized !== 'INTEGRATION') {
    throw new BadRequestException('Onboarding step must be TEAM or INTEGRATION');
  }
  return normalized;
}

function parseDisposition(value: unknown): OnboardingStepDisposition {
  if (value !== 'PENDING' && value !== 'SKIPPED') {
    throw new BadRequestException('Onboarding step status must be PENDING or SKIPPED');
  }
  return value;
}

function requireIdempotency(value: string | undefined): string {
  if (!value?.trim()) throw new BadRequestException('Idempotency-Key is required');
  return value.trim();
}
