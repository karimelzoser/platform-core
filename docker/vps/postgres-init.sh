#!/usr/bin/env bash
set -Eeuo pipefail

: "${PLATFORM_APP_DB_PASSWORD:?PLATFORM_APP_DB_PASSWORD is required}"
: "${PLATFORM_MIGRATOR_DB_PASSWORD:?PLATFORM_MIGRATOR_DB_PASSWORD is required}"
: "${KEYCLOAK_DB_PASSWORD:?KEYCLOAK_DB_PASSWORD is required}"
: "${TEMPORAL_DB_PASSWORD:?TEMPORAL_DB_PASSWORD is required}"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$PLATFORM_APP_DB_PASSWORD" \
  --set=migrator_password="$PLATFORM_MIGRATOR_DB_PASSWORD" \
  --set=keycloak_password="$KEYCLOAK_DB_PASSWORD" \
  --set=temporal_password="$TEMPORAL_DB_PASSWORD" <<'SQL'
\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

SELECT format(
  'CREATE ROLE platform_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'migrator_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_migrator') \gexec
ALTER ROLE platform_migrator PASSWORD :'migrator_password';

SELECT format(
  'CREATE ROLE platform_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 60 PASSWORD %L',
  :'app_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_app') \gexec
ALTER ROLE platform_app PASSWORD :'app_password';

SELECT format(
  'CREATE ROLE keycloak LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'keycloak_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keycloak') \gexec
ALTER ROLE keycloak PASSWORD :'keycloak_password';

SELECT format(
  'CREATE ROLE temporal LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'temporal_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'temporal') \gexec
ALTER ROLE temporal PASSWORD :'temporal_password';

SELECT 'CREATE DATABASE keycloak OWNER keycloak'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'keycloak') \gexec
SELECT 'CREATE DATABASE temporal OWNER temporal'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'temporal') \gexec
SELECT 'CREATE DATABASE temporal_visibility OWNER temporal'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'temporal_visibility') \gexec

GRANT CREATE ON DATABASE platform TO platform_migrator;

-- Match the proven clean-install bootstrap used by integration tests. Later domain
-- schemas are owned by their migrations; pre-creating them here would alter the
-- migration contract and can make a clean VPS differ from CI.
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION platform_migrator;
CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION platform_migrator;
CREATE SCHEMA IF NOT EXISTS crm AUTHORIZATION platform_migrator;
GRANT USAGE ON SCHEMA platform, identity, crm TO platform_app;
SQL
