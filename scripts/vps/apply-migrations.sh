#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

sql_file="$(mktemp)"
trap 'rm -f "$sql_file"' EXIT

cat >"$sql_file" <<'SQL'
\set ON_ERROR_STOP on
SELECT pg_advisory_lock(7072656, 1);
SQL

for migration in /workspace/migrations/[0-9][0-9][0-9][0-9]_*.sql; do
  [ -f "$migration" ] || continue
  printf '\\echo Applying %s\n' "$(basename "$migration")" >>"$sql_file"
  printf '\\i %s\n' "$migration" >>"$sql_file"
done

cat >>"$sql_file" <<'SQL'
SELECT pg_advisory_unlock(7072656, 1);
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$sql_file"
