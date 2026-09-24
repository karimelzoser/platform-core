#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
node_modules/.bin/tsx scripts/verify-migrations.ts
for migration in migrations/[0-9][0-9][0-9][0-9]_*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
