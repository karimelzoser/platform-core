#!/usr/bin/env sh
set -eu
wait_for() {
  name=$1
  url=$2
  attempts=30
  while [ "$attempts" -gt 0 ]; do
    if curl --fail --silent "$url" >/dev/null; then return 0; fi
    attempts=$((attempts - 1))
    sleep 1
  done
  echo "Preview $name did not become healthy: $url" >&2
  return 1
}
wait_for API http://localhost:4000/health
wait_for AI-gateway http://localhost:8000/health
wait_for Web http://localhost:3000
wait_for Admin http://localhost:3001
echo 'Preview application health checks passed.'
