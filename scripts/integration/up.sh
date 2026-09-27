#!/usr/bin/env sh
set -eu
if [ "${INTEGRATION_HOST_PORTS:-0}" = '1' ]; then
  docker compose -f docker/integration/compose.yml -f docker/integration/host-test-ports.yml up --detach --wait
else
  docker compose -f docker/integration/compose.yml up --detach --wait
fi
