#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD is required}"
: "${PLATFORM_MIGRATOR_PASSWORD:?PLATFORM_MIGRATOR_PASSWORD is required}"
: "${PLATFORM_APP_PASSWORD:?PLATFORM_APP_PASSWORD is required}"
: "${PLATFORM_KEYCLOAK_PASSWORD:?PLATFORM_KEYCLOAK_PASSWORD is required}"
: "${PLATFORM_TEMPORAL_PASSWORD:?PLATFORM_TEMPORAL_PASSWORD is required}"
: "${NATS_HOST:?NATS_HOST is required}"
: "${KEYCLOAK_HOST:?KEYCLOAK_HOST is required}"

export APP_ENV="${APP_ENV:-development}"
export ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES="${ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES:-true}"
export PLATFORM_ADMIN_DATABASE_URL="postgresql://postgres:${POSTGRES_ADMIN_PASSWORD}@${POSTGRES_HOST}:5432/platform"
export PLATFORM_MIGRATOR_DATABASE_URL="postgresql://platform_migrator:${PLATFORM_MIGRATOR_PASSWORD}@${POSTGRES_HOST}:5432/platform"
export DATABASE_URL="postgresql://platform_app:${PLATFORM_APP_PASSWORD}@${POSTGRES_HOST}:5432/platform"
export NATS_URL="nats://${NATS_HOST}:4222"
export OPA_URL="http://127.0.0.1:8181"
export API_INTERNAL_URL="http://127.0.0.1:3001"
export API_PORT="3001"
export WORKER_HEALTH_PORT="3002"
export KEYCLOAK_ISSUER="http://${KEYCLOAK_HOST}:8080/realms/platform"
export KEYCLOAK_JWKS_URL="${KEYCLOAK_ISSUER}/protocol/openid-connect/certs"
export KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-platform-web}"
export MEDIA_LOCAL_ROOT="${MEDIA_LOCAL_ROOT:-/tmp/preneura-media}"

mkdir -p "$MEDIA_LOCAL_ROOT"

wait_for_postgres() {
  local attempt=0
  until pg_isready -h "$POSTGRES_HOST" -p 5432 -U postgres >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if (( attempt >= 120 )); then
      echo 'PostgreSQL did not become ready.' >&2
      return 1
    fi
    sleep 1
  done
}

wait_for_keycloak() {
  local attempt=0
  until curl --fail --silent --show-error "http://${KEYCLOAK_HOST}:8080/health/ready" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if (( attempt >= 180 )); then
      echo 'Keycloak did not become ready.' >&2
      return 1
    fi
    sleep 1
  done
}

wait_for_postgres
scripts/hosted/bootstrap-postgres.sh
scripts/hosted/migrate.sh
wait_for_keycloak

pids=()
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if ((${#pids[@]})); then
    kill "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM

/usr/local/bin/opa run --server --addr=127.0.0.1:8181 docs/production-reference/authorization.rego &
pids+=("$!")

node apps/api/dist/main.js &
pids+=("$!")

node apps/worker/dist/main.js &
pids+=("$!")

corepack pnpm --filter @platform/web start --hostname 0.0.0.0 --port "${PORT:-3000}" &
pids+=("$!")

wait -n "${pids[@]}"
