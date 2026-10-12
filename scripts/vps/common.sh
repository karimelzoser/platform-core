#!/usr/bin/env bash
set -Eeuo pipefail

VPS_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$VPS_SCRIPT_DIR/../.." && pwd)"
VPS_DIR="$REPO_ROOT/docker/vps"
ENV_FILE="$VPS_DIR/.env"
COMPOSE_FILE="$VPS_DIR/compose.yml"

compose() {
  docker compose --project-directory "$REPO_ROOT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Required command not found: %s\n' "$1" >&2
    exit 1
  }
}

load_env() {
  [ -f "$ENV_FILE" ] || {
    printf 'Missing %s. Run scripts/vps/install.sh first.\n' "$ENV_FILE" >&2
    exit 1
  }
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

wait_url() {
  local url="$1"
  local attempts="${2:-60}"
  local delay="${3:-3}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl --fail --silent --show-error --max-time 5 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done
  printf 'Timed out waiting for %s\n' "$url" >&2
  return 1
}
