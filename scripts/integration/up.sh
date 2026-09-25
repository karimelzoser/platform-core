#!/usr/bin/env sh
set -eu
docker compose -f docker/integration/compose.yml up --detach --wait
