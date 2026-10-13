#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_command docker
require_command openssl
require_command envsubst
require_command curl

docker compose version >/dev/null

if [ ! -f "$ENV_FILE" ]; then
  cp "$VPS_DIR/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

replace_env() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    $0 ~ "^" key "=" { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$ENV_FILE" >"$tmp"
  mv "$tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

seed_if_placeholder() {
  local key="$1"
  local current
  current="$(grep -E "^${key}=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
  if [ -z "$current" ] || [ "$current" = 'CHANGE_ME' ]; then
    replace_env "$key" "$(openssl rand -hex 32)"
  fi
}

for key in \
  POSTGRES_ADMIN_PASSWORD \
  PLATFORM_MIGRATOR_DB_PASSWORD \
  PLATFORM_APP_DB_PASSWORD \
  KEYCLOAK_DB_PASSWORD \
  TEMPORAL_DB_PASSWORD \
  VALKEY_PASSWORD \
  NATS_PASSWORD \
  KEYCLOAK_ADMIN_PASSWORD; do
  seed_if_placeholder "$key"
done

load_env

for required in PLATFORM_DOMAIN API_DOMAIN AUTH_DOMAIN ACME_EMAIL; do
  value="${!required:-}"
  if [ -z "$value" ] || [[ "$value" == *example.com* ]]; then
    printf 'Set %s in %s to the real deployment value, then rerun this installer.\n' "$required" "$ENV_FILE" >&2
    exit 2
  fi
done

mkdir -p "$VPS_DIR/rendered" "${BACKUP_DIR:-$VPS_DIR/backups}"
chmod 700 "$VPS_DIR/rendered" "${BACKUP_DIR:-$VPS_DIR/backups}"

export PLATFORM_ORIGIN="https://${PLATFORM_DOMAIN}"
envsubst '$PLATFORM_ORIGIN' <"$VPS_DIR/keycloak-realm.template.json" >"$VPS_DIR/rendered/keycloak-realm.json"
chmod 600 "$VPS_DIR/rendered/keycloak-realm.json"

printf '%s\n' 'Validating Compose configuration...'
compose config --quiet

printf '%s\n' 'Building PRENEURA application images locally from this Git revision...'
compose build migrate api worker ai-gateway web

printf '%s\n' 'Starting private infrastructure...'
compose up -d postgres valkey nats opa

printf '%s\n' 'Preparing Temporal schemas...'
compose up --abort-on-container-exit temporal-schema
compose up -d temporal

printf '%s\n' 'Starting Keycloak...'
compose up -d keycloak

printf '%s\n' 'Applying platform migrations...'
compose up --abort-on-container-exit migrate

printf '%s\n' 'Starting application services and TLS edge...'
compose up -d api worker ai-gateway web caddy

"$SCRIPT_DIR/smoke.sh"

cat <<EOF

PRENEURA VPS stack is running.
Application: https://${PLATFORM_DOMAIN}
API:         https://${API_DOMAIN}/health
Identity:    https://${AUTH_DOMAIN}/realms/platform/.well-known/openid-configuration

Initial Keycloak admin username: ${KEYCLOAK_ADMIN_USERNAME:-platform-admin}
The admin password is stored only in docker/vps/.env on this VPS.
Create the first real Keycloak user, then use the application organization bootstrap flow.
EOF
