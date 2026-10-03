#!/usr/bin/env sh
set -eu

: "${PLATFORM_ADMIN_DATABASE_URL:?PLATFORM_ADMIN_DATABASE_URL is required}"
: "${PLATFORM_MIGRATOR_PASSWORD:?PLATFORM_MIGRATOR_PASSWORD is required}"
: "${PLATFORM_APP_PASSWORD:?PLATFORM_APP_PASSWORD is required}"
: "${PLATFORM_KEYCLOAK_PASSWORD:?PLATFORM_KEYCLOAK_PASSWORD is required}"
: "${PLATFORM_TEMPORAL_PASSWORD:?PLATFORM_TEMPORAL_PASSWORD is required}"

psql "$PLATFORM_ADMIN_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v platform_migrator_password="$PLATFORM_MIGRATOR_PASSWORD" \
  -v platform_app_password="$PLATFORM_APP_PASSWORD" \
  -v keycloak_password="$PLATFORM_KEYCLOAK_PASSWORD" \
  -v temporal_password="$PLATFORM_TEMPORAL_PASSWORD" <<'SQL'
SELECT format(
  'CREATE ROLE platform_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'platform_migrator_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_migrator') \gexec
SELECT format(
  'ALTER ROLE platform_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'platform_migrator_password'
) \gexec

SELECT format(
  'CREATE ROLE platform_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 30 PASSWORD %L',
  :'platform_app_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_app') \gexec
SELECT format(
  'ALTER ROLE platform_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 30 PASSWORD %L',
  :'platform_app_password'
) \gexec

SELECT format(
  'CREATE ROLE platform_keycloak LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'keycloak_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_keycloak') \gexec
SELECT format(
  'ALTER ROLE platform_keycloak LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'keycloak_password'
) \gexec

SELECT format(
  'CREATE ROLE platform_temporal LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'temporal_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_temporal') \gexec
SELECT format(
  'ALTER ROLE platform_temporal LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
  :'temporal_password'
) \gexec

SELECT 'CREATE DATABASE platform OWNER platform_migrator'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'platform') \gexec
SELECT 'CREATE DATABASE platform_keycloak OWNER platform_keycloak'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'platform_keycloak') \gexec
SELECT 'CREATE DATABASE platform_temporal OWNER platform_temporal'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'platform_temporal') \gexec
SELECT 'CREATE DATABASE platform_temporal_visibility OWNER platform_temporal'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'platform_temporal_visibility') \gexec

GRANT CONNECT ON DATABASE platform TO platform_app;

\connect platform
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION platform_migrator;
CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION platform_migrator;
CREATE SCHEMA IF NOT EXISTS crm AUTHORIZATION platform_migrator;
ALTER SCHEMA platform OWNER TO platform_migrator;
ALTER SCHEMA identity OWNER TO platform_migrator;
ALTER SCHEMA crm OWNER TO platform_migrator;

CREATE TABLE IF NOT EXISTS platform.schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL
);
ALTER TABLE platform.schema_migrations OWNER TO platform_migrator;

GRANT USAGE ON SCHEMA platform, identity, crm TO platform_app;
ALTER ROLE platform_app SET row_security = on;
ALTER ROLE platform_app SET statement_timeout = '30s';
ALTER ROLE platform_app SET idle_in_transaction_session_timeout = '30s';
SQL

printf '%s\n' 'PRENEURA hosted PostgreSQL bootstrap verified.'
