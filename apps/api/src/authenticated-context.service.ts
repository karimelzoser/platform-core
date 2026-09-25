import { Injectable } from '@nestjs/common';
import { KeycloakJwtVerifier, bearerToken } from '@platform/auth';
import { resolveTenantAccess } from '@platform/database';
import type { TenantRequestContext } from '@platform/command-execution';
import { randomUUID } from 'node:crypto';
import { ApiDatabaseService } from './api-database.service.js';
import { loadApiConfig } from './config.js';

@Injectable()
export class AuthenticatedContextService {
  private readonly config = loadApiConfig();
  private readonly verifier = new KeycloakJwtVerifier({
    issuer: this.config.KEYCLOAK_ISSUER,
    audience: this.config.KEYCLOAK_CLIENT_ID,
    jwksUrl: new URL(this.config.KEYCLOAK_JWKS_URL),
  });

  public constructor(private readonly database: ApiDatabaseService) {}

  public async resolve(input: {
    authorization: string | undefined;
    tenantId: string | undefined;
    correlationId: string | undefined;
  }): Promise<TenantRequestContext> {
    if (!input.tenantId) throw new Error('x-tenant-id is required');
    const claims = await this.verifier.verify(bearerToken(input.authorization));
    const requestId = input.correlationId ?? randomUUID();
    const access = await resolveTenantAccess(this.database.database, {
      tenantId: input.tenantId,
      subject: claims.sub,
      requestId,
    });
    return {
      tenantId: access.tenantId,
      actorId: access.userId,
      subject: access.subject,
      requestId,
      correlationId: requestId,
      permissions: access.permissions,
      actorType: 'USER',
    };
  }
}
