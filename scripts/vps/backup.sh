#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_command gzip
require_command docker
load_env

backup_root="${BACKUP_DIR:-$VPS_DIR/backups}"
mkdir -p "$backup_root"
chmod 700 "$backup_root"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$backup_root/$stamp"
mkdir -p "$target"
chmod 700 "$target"

for database in platform keycloak temporal temporal_visibility; do
  printf 'Backing up %s...\n' "$database"
  compose exec -T -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" postgres \
    pg_dump -U platform_admin -d "$database" --format=custom --no-owner --no-privileges \
    >"$target/${database}.dump"
done

compose exec -T -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" postgres \
  pg_dumpall -U platform_admin --globals-only >"$target/globals.sql"

media_volume="preneura-vps_platform_media"
if docker volume inspect "$media_volume" >/dev/null 2>&1; then
  docker run --rm \
    -v "${media_volume}:/data:ro" \
    -v "${target}:/backup" \
    alpine:3.22 sh -ec 'cd /data && tar -czf /backup/platform-media.tar.gz .'
fi

cat >"$target/manifest.txt" <<EOF
created_at=$stamp
git_sha=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || printf unknown)
platform_domain=${PLATFORM_DOMAIN}
EOF

chmod 600 "$target"/*

retention="${BACKUP_RETENTION_DAYS:-14}"
find "$backup_root" -mindepth 1 -maxdepth 1 -type d -mtime "+${retention}" -exec rm -rf -- {} +

printf 'Backup completed: %s\n' "$target"
