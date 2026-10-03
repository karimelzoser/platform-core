#!/usr/bin/env sh
set -eu

compose='docker compose -f docker/integration/compose.yml'
workflow_id="preneura-durability-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$"

run_probe() {
  phase="$1"
  TEMPORAL_ADDRESS=127.0.0.1:7233 \
    TEMPORAL_NAMESPACE=platform \
    TEMPORAL_DURABILITY_WORKFLOW_ID="$workflow_id" \
    TEMPORAL_DURABILITY_PHASE="$phase" \
    pnpm --filter @platform/integration-tests exec tsx integration/temporal-durability.ts
}

wait_for_temporal() {
  attempt=0
  while [ "$attempt" -lt 90 ]; do
    if $compose exec -T temporal temporal operator cluster health 2>/dev/null | grep -q SERVING; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  echo 'Temporal did not become healthy after restart.' >&2
  return 1
}

run_probe start
$compose restart temporal >/dev/null
wait_for_temporal
run_probe verify

printf '%s\n' 'PRENEURA Temporal restart durability verified.'
