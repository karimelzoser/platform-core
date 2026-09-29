import { z } from 'zod';

const environmentSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().url(),
  OPA_URL: z.string().url(),
  KEYCLOAK_ISSUER: z.string().url(),
  KEYCLOAK_JWKS_URL: z.string().url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MEDIA_DRIVER: z.literal('local').default('local'),
  MEDIA_LOCAL_ROOT: z.string().min(1).default('/srv/platform/media'),
});

export type ApiConfig = z.infer<typeof environmentSchema>;

export function loadApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return environmentSchema.parse(environment);
}
