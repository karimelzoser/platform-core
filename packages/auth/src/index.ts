import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { z } from 'zod';

export const keycloakClaimsSchema = z.object({
  sub: z.string().min(1),
  preferred_username: z.string().min(1).optional(),
  email: z.string().email().optional(),
  email_verified: z.boolean().optional(),
  given_name: z.string().min(1).optional(),
  family_name: z.string().min(1).optional(),
  locale: z.string().min(2).max(32).optional(),
  acr: z.string().min(1).max(200).optional(),
  amr: z.array(z.string().min(1).max(100)).max(16).optional(),
});

export type KeycloakClaims = z.infer<typeof keycloakClaimsSchema> & JWTPayload;

export interface AuthAssurance {
  mfaSatisfied: boolean;
  methods: readonly string[];
  acr?: string;
}

const mfaMethods = new Set(['otp', 'mfa', 'hwk', 'fido', 'fido2', 'webauthn']);

export function authAssuranceFromClaims(claims: KeycloakClaims): AuthAssurance {
  const methods = (claims.amr ?? []).map((method) => method.toLowerCase());
  return {
    mfaSatisfied: methods.some((method) => mfaMethods.has(method)),
    methods,
    ...(claims.acr ? { acr: claims.acr } : {}),
  };
}

export interface JwtVerifierOptions {
  issuer: string;
  audience: string;
  jwksUrl: URL;
}

export function bearerToken(header: string | undefined): string {
  if (!header) throw new Error('Missing authorization header');
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/u.exec(header);
  if (!match?.[1]) throw new Error('Malformed authorization header');
  return match[1];
}

export class KeycloakJwtVerifier {
  private readonly keySet;

  public constructor(private readonly options: JwtVerifierOptions) {
    this.keySet = createRemoteJWKSet(options.jwksUrl);
  }

  public async verify(token: string): Promise<KeycloakClaims> {
    const verified = await jwtVerify(token, this.keySet, {
      issuer: this.options.issuer,
      audience: this.options.audience,
      algorithms: ['RS256', 'PS256', 'ES256'],
    });
    return keycloakClaimsSchema.parse(verified.payload) as KeycloakClaims;
  }
}
