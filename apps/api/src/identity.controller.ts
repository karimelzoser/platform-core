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
  type IdentitySubjectContext,
} from './authenticated-context.service.js';
import { IdentityInvariantError, IdentityService } from './identity.service.js';

@Controller('v1/identity')
export class IdentityController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly identity: IdentityService,
  ) {}

  @Get('organizations')
  public async organizations(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.subjectContext(authorization, correlationId);
    return this.identity.listOrganizations(context);
  }

  @Post('organizations')
  public async createOrganization(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const object = parsedObject(body);
    const context = await this.subjectContext(authorization, correlationId);
    return this.guard(() =>
      this.identity.createOrganization(context, {
        name: requiredString(object.name, 'name'),
        slug: requiredString(object.slug, 'slug'),
        locale: optionalString(object.locale, 'locale') ?? 'en',
        timezone: optionalString(object.timezone, 'timezone') ?? 'UTC',
      }),
    );
  }

  @Post('invitations/:invitationId/accept')
  public async acceptInvitation(
    @Param('invitationId') invitationId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const object = parsedObject(body);
    const context = await this.subjectContext(authorization, correlationId);
    return this.guard(() =>
      this.identity.acceptInvitation(context, invitationId, {
        ...(typeof object.locale === 'string' ? { locale: object.locale } : {}),
        ...(typeof object.timezone === 'string' ? { timezone: object.timezone } : {}),
      }),
    );
  }

  @Get('profile')
  public async profile(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.read');
    return this.guard(() => this.identity.getProfile(context));
  }

  @Post('profile')
  public async updateProfile(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const object = parsedObject(body);
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'identity.profile.update');
    return this.guard(() =>
      this.identity.updateProfile(context, requireIdempotency(idempotencyKey), {
        ...(typeof object.firstName === 'string' ? { firstName: object.firstName } : {}),
        ...(typeof object.lastName === 'string' ? { lastName: object.lastName } : {}),
        locale: requiredString(object.locale, 'locale'),
        timezone: requiredString(object.timezone, 'timezone'),
      }),
    );
  }

  @Get('organization')
  public async organization(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.read');
    return this.guard(() => this.identity.getOrganization(context));
  }

  @Post('organization')
  public async updateOrganization(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const object = parsedObject(body);
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.update');
    return this.guard(() =>
      this.identity.updateOrganization(context, requireIdempotency(idempotencyKey), {
        name: requiredString(object.name, 'name'),
        locale: requiredString(object.locale, 'locale'),
        timezone: requiredString(object.timezone, 'timezone'),
        ...(typeof object.profileOwnerMembershipId === 'string'
          ? { profileOwnerMembershipId: object.profileOwnerMembershipId }
          : {}),
      }),
    );
  }

  @Post('organization/mfa-policy')
  public async updateMfaPolicy(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const object = parsedObject(body);
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.security.manage');
    return this.guard(() =>
      this.identity.updateMfaPolicy(
        context,
        requireIdempotency(idempotencyKey),
        requiredString(object.mfaPolicy, 'mfaPolicy') as never,
        approvalId,
      ),
    );
  }

  @Get('members')
  public async members(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.members.read');
    return this.guard(() => this.identity.listMembers(context));
  }

  @Post('members/:membershipId/status')
  public async updateMemberStatus(
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const object = parsedObject(body);
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.members.manage');
    return this.guard(() =>
      this.identity.setMemberStatus(
        context,
        requireIdempotency(idempotencyKey),
        {
          membershipId,
          status: requiredString(object.status, 'status') as never,
          ...(typeof object.reason === 'string' ? { reason: object.reason } : {}),
        },
        approvalId,
      ),
    );
  }

  @Post('members/:membershipId/roles')
  public async updateMemberRoles(
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const object = parsedObject(body);
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.members.manage');
    return this.guard(() =>
      this.identity.setMemberRoles(
        context,
        requireIdempotency(idempotencyKey),
        { membershipId, roleIds: stringArray(object.roleIds, 'roleIds') },
        approvalId,
      ),
    );
  }

  @Get('invitations')
  public async invitations(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.members.read');
    return this.guard(() => this.identity.listInvitations(context));
  }

  @Post('invitations')
  public async createInvitation(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const object = parsedObject(body);
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.members.invite');
    return this.guard(() =>
      this.identity.createInvitation(
        context,
        requireIdempotency(idempotencyKey),
        {
          email: requiredString(object.email, 'email'),
          roleIds: stringArray(object.roleIds, 'roleIds'),
          expiresInHours:
            typeof object.expiresInHours === 'number' ? object.expiresInHours : undefined,
        },
        approvalId,
      ),
    );
  }

  @Post('invitations/:invitationId/revoke')
  public async revokeInvitation(
    @Param('invitationId') invitationId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.members.invite');
    return this.guard(() =>
      this.identity.revokeInvitation(context, requireIdempotency(idempotencyKey), invitationId),
    );
  }

  @Get('roles')
  public async roles(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.roles.read');
    return this.guard(() => this.identity.listRoles(context));
  }

  @Post('roles')
  public async createRole(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.roles.manage');
    return this.guard(() =>
      this.identity.createRole(
        context,
        requireIdempotency(idempotencyKey),
        roleInput(parsedObject(body)),
        approvalId,
      ),
    );
  }

  @Post('roles/:roleId')
  public async updateRole(
    @Param('roleId') roleId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.roles.manage');
    return this.guard(() =>
      this.identity.updateRole(
        context,
        requireIdempotency(idempotencyKey),
        roleId,
        roleInput(parsedObject(body)),
        approvalId,
      ),
    );
  }

  @Post('roles/:roleId/delete')
  public async deleteRole(
    @Param('roleId') roleId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-approval-id') approvalId: string | undefined,
  ) {
    const context = await this.tenantContext(authorization, tenantId, correlationId);
    this.assertPermission(context, 'organization.roles.manage');
    return this.guard(() =>
      this.identity.deleteRole(context, requireIdempotency(idempotencyKey), roleId, approvalId),
    );
  }

  private async subjectContext(
    authorization: string | undefined,
    correlationId: string | undefined,
  ): Promise<IdentitySubjectContext> {
    try {
      return await this.authentication.resolveIdentity({ authorization, correlationId });
    } catch {
      throw new UnauthorizedException('Invalid authentication');
    }
  }

  private async tenantContext(
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

  private assertPermission(context: AuthenticatedTenantContext, permission: string): void {
    if (!context.permissions.includes(permission))
      throw new ForbiddenException('Permission denied');
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ZodError)
        throw new BadRequestException(error.issues[0]?.message ?? 'Invalid input');
      if (error instanceof IdentityInvariantError) throw new ConflictException(error.message);
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
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('JSON object body is required');
  }
  return body as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new BadRequestException(`${field} is required`);
  return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string`);
  return value.trim();
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new BadRequestException(`${field} must be a string array`);
  }
  return value as string[];
}

function roleInput(object: Record<string, unknown>) {
  return {
    code: requiredString(object.code, 'code'),
    name: requiredString(object.name, 'name'),
    ...(typeof object.description === 'string' ? { description: object.description } : {}),
    permissionCodes: Array.isArray(object.permissionCodes)
      ? stringArray(object.permissionCodes, 'permissionCodes')
      : [],
  };
}

function requireIdempotency(value: string | undefined): string {
  if (!value?.trim()) throw new BadRequestException('Idempotency-Key is required');
  return value.trim();
}
