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
  ): Promise<{ userId: string; tenantId: string; permissions: readonly string[] }> {
    try {
      const context = await this.authentication.resolve({ authorization, tenantId, correlationId });
      return {
        userId: context.actorId ?? '',
        tenantId: context.tenantId,
        permissions: context.permissions,
      };
    } catch {
      throw new UnauthorizedException('Invalid authentication or tenant membership');
    }
  }
}
