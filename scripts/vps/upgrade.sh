#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_command git
require_command openssl
require_command envsubst
require_command curl
load_env

new_ref="${1:-main}"
old_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
printf 'Current revision: %s\n' "$old_sha"
printf 'Target revision:  %s\n' "$new_ref"

"$SCRIPT_DIR/backup.sh"

git -C "$REPO_ROOT" fetch --tags origin
git -C "$REPO_ROOT" checkout --detach "$new_ref"
new_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"

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
replace_env PLATFORM_IMAGE_TAG "$(printf '%s' "$new_sha" | cut -c1-12)"
load_env

export PLATFORM_ORIGIN="https://${PLATFORM_DOMAIN}"
mkdir -p "$VPS_DIR/rendered"
envsubst '$PLATFORM_ORIGIN' <"$VPS_DIR/keycloak-realm.template.json" >"$VPS_DIR/rendered/keycloak-realm.json"
chmod 600 "$VPS_DIR/rendered/keycloak-realm.json"

compose config --quiet
compose build migrate api worker ai-gateway web
compose up --abort-on-container-exit migrate
compose up -d --remove-orphans api worker ai-gateway web keycloak temporal caddy

if ! "$SCRIPT_DIR/smoke.sh"; then
  printf 'Upgrade smoke failed on %s. Application images can be rolled back to %s, but schema restore may be required.\n' "$new_sha" "$old_sha" >&2
  exit 1
fi

printf 'Upgrade completed: %s -> %s\n' "$old_sha" "$new_sha"
