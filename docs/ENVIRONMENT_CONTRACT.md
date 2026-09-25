# Environment Contract

Ship `.env.example` with names only.

Suggested variables:

## Core

- APP_ENV
- APP_NAME
- APP_PUBLIC_URL
- ADMIN_PUBLIC_URL
- API_PUBLIC_URL
- LOG_LEVEL
- API*INTERNAL_URL (server-only URL used by the Next.js workspace to call the API; never expose it as `NEXT_PUBLIC*\*`)

## PostgreSQL

- DATABASE_HOST
- DATABASE_PORT
- DATABASE_NAME
- DATABASE_USER
- DATABASE_PASSWORD
- MIGRATOR_DATABASE_USER
- MIGRATOR_DATABASE_PASSWORD

## Valkey

- VALKEY_HOST
- VALKEY_PORT
- VALKEY_PASSWORD

## NATS

- NATS_URL
- NATS_USER
- NATS_PASSWORD

## Temporal

- TEMPORAL_ADDRESS
- TEMPORAL_NAMESPACE

## Keycloak

- KEYCLOAK_ISSUER
- KEYCLOAK_JWKS_URL
- KEYCLOAK_CLIENT_ID
- KEYCLOAK_CLIENT_SECRET where needed

## OPA

- OPA_URL

## AI Gateway

- AI_GATEWAY_URL

## Media

- MEDIA_DRIVER
- MEDIA_LOCAL_ROOT
- S3-compatible variables for future object storage

Do not expose server-only values through Next.js public environment variables.
