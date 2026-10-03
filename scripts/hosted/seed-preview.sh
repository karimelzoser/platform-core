#!/usr/bin/env bash
set -Eeuo pipefail

: "${PLATFORM_MIGRATOR_DATABASE_URL:?PLATFORM_MIGRATOR_DATABASE_URL is required}"

run_embedded_sql() {
  local script="$1"
  local sql
  sql=$(mktemp)
  awk '
    /<<'"'"'SQL'"'"'/ { capture = 1; next }
    capture && /^SQL$/ { exit }
    capture { print }
  ' "$script" > "$sql"
  psql "$PLATFORM_MIGRATOR_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$sql"
  rm -f "$sql"
}

run_embedded_sql scripts/preview/seed.sh
run_embedded_sql scripts/preview/seed-integration-fixtures.sh

printf '%s\n' 'PRENEURA hosted preview fixtures verified.'
