#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_command curl
load_env

printf '%s\n' 'Checking container health...'
compose ps

wait_url "https://${PLATFORM_DOMAIN}/health" 60 3
wait_url "https://${API_DOMAIN}/health" 60 3
wait_url "https://${AUTH_DOMAIN}/realms/platform/.well-known/openid-configuration" 60 3

compose exec -T postgres pg_isready -U platform_admin -d platform >/dev/null
compose exec -T nats wget --spider -q http://127.0.0.1:8222/healthz
compose exec -T temporal temporal operator cluster health --address 127.0.0.1:7233 | grep -q SERVING

api_health="$(curl --fail --silent --show-error "https://${API_DOMAIN}/health")"
printf 'API health: %s\n' "$api_health"
printf '%s\n' 'VPS smoke checks passed.'
