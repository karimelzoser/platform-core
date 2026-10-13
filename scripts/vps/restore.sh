#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

load_env

backup_dir="${1:-}"
confirmation="${2:-}"
if [ -z "$backup_dir" ] || [ ! -d "$backup_dir" ]; then
  printf 'Usage: %s /path/to/backup --yes-i-understand-this-replaces-data\n' "$0" >&2
  exit 2
fi
if [ "$confirmation" != '--yes-i-understand-this-replaces-data' ]; then
  printf 'Restore is destructive. Re-run with --yes-i-understand-this-replaces-data.\n' >&2
  exit 2
fi

for required in platform.dump keycloak.dump temporal.dump temporal_visibility.dump; do
  [ -f "$backup_dir/$required" ] || {
    printf 'Backup is missing %s\n' "$required" >&2
    exit 2
  }
done

printf '%s\n' 'Stopping application and orchestration services...'
compose stop caddy web api worker ai-gateway keycloak temporal || true

for database in platform keycloak temporal temporal_visibility; do
  printf 'Restoring %s...\n' "$database"
  compose exec -T -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" postgres \
    psql -U platform_admin -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${database}' AND pid <> pg_backend_pid();" >/dev/null
  if [ "$database" = platform ]; then
    compose exec -T -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" postgres \
      psql -U platform_admin -d postgres -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE IF EXISTS platform WITH (FORCE);" \
      -c "CREATE DATABASE platform OWNER platform_admin;"
  else
    owner="$database"
    if [ "$database" = temporal_visibility ]; then owner=temporal; fi
    compose exec -T -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" postgres \
      psql -U platform_admin -d postgres -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE IF EXISTS ${database} WITH (FORCE);" \
      -c "CREATE DATABASE ${database} OWNER ${owner};"
  fi
  cat "$backup_dir/${database}.dump" | compose exec -T -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" postgres \
    pg_restore -U platform_admin -d "$database" --clean --if-exists
 done

if [ -f "$backup_dir/platform-media.tar.gz" ]; then
  media_volume="preneura-vps_platform_media"
  docker run --rm \
    -v "${media_volume}:/data" \
    -v "${backup_dir}:/backup:ro" \
    alpine:3.22 sh -ec 'rm -rf /data/* /data/.[!.]* /data/..?* 2>/dev/null || true; tar -xzf /backup/platform-media.tar.gz -C /data'
fi

printf '%s\n' 'Restarting stack...'
compose up -d temporal keycloak api worker ai-gateway web caddy
"$SCRIPT_DIR/smoke.sh"
printf '%s\n' 'Restore completed and smoke checks passed.'
