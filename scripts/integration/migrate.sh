#!/usr/bin/env sh
set -eu
compose='docker compose -f docker/integration/compose.yml'
for migration in migrations/[0-9][0-9][0-9][0-9]_*.sql; do
  $compose exec -T postgres psql -U platform_migrator -d platform -v ON_ERROR_STOP=1 -f - < "$migration"
done
