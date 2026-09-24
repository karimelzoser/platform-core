import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { KeycloakJwtVerifier, bearerToken } from '@platform/auth';
import {
  createDatabase,
  destroyDatabase,
  resolveTenantAccess,
  type PlatformDatabase,
} from '@platform/database';
import { randomUUID } from 'node:crypto';
import { loadApiConfig } from './config.js';

@Controller('v1/session')
export class SessionController {
  private readonly config = loadApiConfig();
  private readonly database: PlatformDatabase = createDatabase(this.config.DATABASE_URL);
  private readonly verifier = new KeycloakJwtVerifier({
    issuer: this.config.KEYCLOAK_ISSUER,
    audience: this.config.KEYCLOAK_CLIENT_ID,
    jwksUrl: new URL(this.config.KEYCLOAK_JWKS_URL),
  });

  @Get()
  public async getSession(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ): Promise<{ userId: string; tenantId: string; permissions: readonly string[] }> {
    if (!tenantId) throw new BadRequestException('x-tenant-id is required');
    try {
      const claims = await this.verifier.verify(bearerToken(authorization));
      const access = await resolveTenantAccess(this.database, {
        tenantId,
        subject: claims.sub,
        requestId: correlationId ?? randomUUID(),
      });
      return { userId: access.userId, tenantId: access.tenantId, permissions: access.permissions };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new UnauthorizedException('Invalid authentication or tenant membership');
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await destroyDatabase(this.database);
  }
}
