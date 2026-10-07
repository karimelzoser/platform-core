import { Injectable } from '@nestjs/common';
import {
  KeycloakJwtVerifier,
  authAssuranceFromClaims,
  bearerToken,
  type AuthAssurance,
  type KeycloakClaims,
} from '@platform/auth';
import { resolveTenantAccess } from '@platform/database';
import type { TenantRequestContext } from '@platform/command-execution';
import { randomUUID } from 'node:crypto';
import { ApiDatabaseService } from './api-database.service.js';
import { loadApiConfig } from './config.js';

export interface IdentitySubjectContext {
  subject: string;
  requestId: string;
  correlationId: string;
  claims: KeycloakClaims;
  assurance: AuthAssurance;
}

export interface AuthenticatedTenantContext extends TenantRequestContext {
  membershipId: string;
  tenantName: string;
  roleCodes: readonly string[];
  mfaPolicy: 'OPTIONAL' | 'REQUIRED_FOR_PRIVILEGED' | 'REQUIRED_FOR_ALL';
  mfaSatisfied: boolean;
  authenticationMethods: readonly string[];
  tokenEmail?: string;
  tokenEmailVerified: boolean;
}

@Injectable()
export class AuthenticatedContextService {
  private readonly config = loadApiConfig();
  private readonly verifier = new KeycloakJwtVerifier({
    issuer: this.config.KEYCLOAK_ISSUER,
    audience: this.config.KEYCLOAK_CLIENT_ID,
    jwksUrl: new URL(this.config.KEYCLOAK_JWKS_URL),
  });

  public constructor(private readonly database: ApiDatabaseService) {}

  public async resolveIdentity(input: {
    authorization: string | undefined;
    correlationId: string | undefined;
  }): Promise<IdentitySubjectContext> {
    const claims = await this.verifier.verify(bearerToken(input.authorization));
    const requestId = input.correlationId ?? randomUUID();
    return {
      subject: claims.sub,
      requestId,
      correlationId: requestId,
      claims,
      assurance: authAssuranceFromClaims(claims),
    };
  }

  public async resolve(input: {
    authorization: string | undefined;
    tenantId: string | undefined;
    correlationId: string | undefined;
  }): Promise<AuthenticatedTenantContext> {
    if (!input.tenantId) throw new Error('x-tenant-id is required');
    const identity = await this.resolveIdentity({
      authorization: input.authorization,
      correlationId: input.correlationId,
    });
    const access = await resolveTenantAccess(this.database.database, {
      tenantId: input.tenantId,
      subject: identity.subject,
      requestId: identity.requestId,
    });

    const privileged = access.roleCodes.some((code) => code === 'owner' || code === 'admin');
    const requiresMfa =
      access.mfaPolicy === 'REQUIRED_FOR_ALL' ||
      (access.mfaPolicy === 'REQUIRED_FOR_PRIVILEGED' && privileged);
    if (requiresMfa && !identity.assurance.mfaSatisfied) {
      throw new Error('Tenant MFA policy requires stronger authentication');
    }

    return {
      tenantId: access.tenantId,
      actorId: access.userId,
      subject: access.subject,
      requestId: identity.requestId,
      correlationId: identity.correlationId,
      permissions: access.permissions,
      actorType: 'USER',
      membershipId: access.membershipId,
      tenantName: access.tenantName,
      roleCodes: access.roleCodes,
      mfaPolicy: access.mfaPolicy,
      mfaSatisfied: identity.assurance.mfaSatisfied,
      authenticationMethods: identity.assurance.methods,
      ...(identity.claims.email ? { tokenEmail: identity.claims.email } : {}),
      tokenEmailVerified: identity.claims.email_verified === true,
    };
  }
}
