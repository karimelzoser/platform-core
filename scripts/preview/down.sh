#!/usr/bin/env sh
set -eu
pkill -f '(@platform/api|@platform/worker|@platform/web|@platform/admin|uvicorn apps.ai-gateway)' || true
docker compose -f docker/integration/compose.yml -f docker/preview/compose.yml down
