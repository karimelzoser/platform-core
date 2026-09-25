#!/usr/bin/env sh
set -eu
scripts/preview/down.sh
docker compose -f docker/integration/compose.yml -f docker/preview/compose.yml down --volumes --remove-orphans
rm -rf .preview
scripts/preview/up.sh
