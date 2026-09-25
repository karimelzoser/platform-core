#!/usr/bin/env sh
set -eu
curl --fail --silent http://localhost:4000/health >/dev/null
curl --fail --silent http://localhost:8000/health >/dev/null
curl --fail --silent http://localhost:3000 >/dev/null
curl --fail --silent http://localhost:3001 >/dev/null
echo 'Preview application health checks passed.'
