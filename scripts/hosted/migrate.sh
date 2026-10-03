#!/usr/bin/env sh
set -eu

: "${PLATFORM_MIGRATOR_DATABASE_URL:?PLATFORM_MIGRATOR_DATABASE_URL is required}"

verify_immutable_checksums() {
  while read -r expected path; do
    [ -n "$expected" ] || continue
    name=$(basename "$path")
    file="migrations/$name"
    [ -f "$file" ] || {
      echo "Missing immutable migration: $name" >&2
      exit 1
    }
    actual=$(sha256sum "$file" | awk '{print $1}')
    [ "$actual" = "$expected" ] || {
      echo "Immutable migration checksum mismatch: $name" >&2
      exit 1
    }
  done < migrations/SHA256SUMS
}

verify_immutable_checksums

psql "$PLATFORM_MIGRATOR_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_advisory_lock(hashtext('preneura-platform-migrations'));
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION platform_migrator;
CREATE TABLE IF NOT EXISTS platform.schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL
);
SQL

cleanup() {
  psql "$PLATFORM_MIGRATOR_DATABASE_URL" -v ON_ERROR_STOP=1 \
    -c "SELECT pg_advisory_unlock(hashtext('preneura-platform-migrations'));" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

for migration in migrations/[0-9][0-9][0-9][0-9]_*.sql; do
  name=$(basename "$migration")
  version=${name%%_*}
  checksum=$(sha256sum "$migration" | awk '{print $1}')
  recorded=$(psql "$PLATFORM_MIGRATOR_DATABASE_URL" -At -v ON_ERROR_STOP=1 \
    -v version="$version" \
    -c "SELECT checksum FROM platform.schema_migrations WHERE version = :'version';")

  if [ -n "$recorded" ]; then
    [ "$recorded" = "$checksum" ] || {
      echo "Applied migration checksum changed: $name" >&2
      exit 1
    }
    echo "SKIP $name"
    continue
  fi

  body=$(mktemp)
  awk 'NR == 1 && $0 == "BEGIN;" { next } { lines[NR] = $0 } END { last = NR; if (lines[last] == "COMMIT;") last--; for (i = 1; i <= last; i++) if (i in lines) print lines[i] }' \
    "$migration" > "$body"

  {
    echo 'BEGIN;'
    cat "$body"
    cat <<'SQL'
INSERT INTO platform.schema_migrations (version, checksum, description)
VALUES (:'migration_version', :'migration_checksum', :'migration_description');
COMMIT;
SQL
  } | psql "$PLATFORM_MIGRATOR_DATABASE_URL" \
      -v ON_ERROR_STOP=1 \
      -v migration_version="$version" \
      -v migration_checksum="$checksum" \
      -v migration_description="$name"

  rm -f "$body"
  echo "APPLIED $name"
done

cleanup
trap - EXIT INT TERM
printf '%s\n' 'PRENEURA hosted migrations verified.'
