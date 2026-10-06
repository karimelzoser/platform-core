import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedContextService } from './authenticated-context.service.js';

@Controller('v1/session')
export class SessionController {
  public constructor(private readonly authentication: AuthenticatedContextService) {}

  @Get()
  public async getSession(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ): Promise<{
    userId: string;
    membershipId: string;
    tenantId: string;
    tenantName: string;
    permissions: readonly string[];
    roleCodes: readonly string[];
    mfaPolicy: string;
    mfaSatisfied: boolean;
  }> {
    try {
      const context = await this.authentication.resolve({ authorization, tenantId, correlationId });
      return {
        userId: context.actorId ?? '',
        membershipId: context.membershipId,
        tenantId: context.tenantId,
        tenantName: context.tenantName,
        permissions: context.permissions,
        roleCodes: context.roleCodes,
        mfaPolicy: context.mfaPolicy,
        mfaSatisfied: context.mfaSatisfied,
      };
    } catch {
      throw new UnauthorizedException('Invalid authentication or tenant membership');
    }
  }
}
