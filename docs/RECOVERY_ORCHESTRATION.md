# Recovery expiry coordination

Recovery is IN PROGRESS. This slice registers an actual Temporal workflow;
it does not implement autonomous outreach or close the Recovery module gate.

## Canonical boundaries

`RecoveryService.detect` records the opportunity and creation event atomically.
It serializes first detection on the source order, preserves an existing
opportunity's status and deduplicates creation events by canonical opportunity.
The outbox publisher publishes after commit. The durable
`platform-recovery-v1` NATS consumer verifies the event against its committed DB
record and canonical opportunity before starting/signalling Temporal.

The workflow ID is `recovery:<tenant UUID>:<source order UUID>`; duplicate
creation events never create a second history. Arguments contain tenant,
opportunity, creation-event and workflow identities only. Customer names,
message bodies, tokens and provider credentials are excluded from history.

`recoveryExpiryWorkflow` rereads canonical state through tenant-scoped activities,
waits on a durable timer, refreshes on conversion signals and invokes
`RecoveryLifecycleCommands.expireOpportunity`. The API's per-opportunity expiry
route invokes the same command. Expiry remains permission/OPA/idempotency/audit/
outbox protected and uses the DB clock under row lock. It expires offers and
cancels unqueued reservations. Existing queued messages are not silently
represented as cancelled; dispatch-time suppression remains an open gate.

Cancellation of orchestration does not claim a business cancellation or undo
provider actions. Temporal activities have bounded timeouts/retries. Native
worker/consumer failure makes configured worker health fail rather than report
false readiness. Production worker startup requires `TEMPORAL_ADDRESS`.

## Configuration and validation

- `TEMPORAL_ADDRESS`: private Temporal endpoint; disposable preview uses
  `127.0.0.1:7233`.
- `TEMPORAL_NAMESPACE`: `platform` by default.
- `OPA_URL`: private policy endpoint.
- `platform-recovery-v1`: both task queue and durable NATS consumer name.
- Hosted preview may derive the endpoint from `TEMPORAL_HOST`; no production
  endpoint or credential is inferred.

After building worker/API dependencies, the CI integration stack runs:

```sh
corepack pnpm --filter @platform/integration-tests exec tsx integration/recovery-workflow.ts
corepack pnpm --filter @platform/integration-tests test:integration
```

The workflow test permits only loopback Temporal. It runs real workflow tasks,
activities, timers and histories with explicitly synthetic activity state to
test retry, duplicate start, conversion signals, cancellation, replay and worker
restart. It does not count as canonical DB/provider evidence. The separate
Recovery lifecycle test verifies real tenant/RLS commands, committed-origin
checks, forged/cross-tenant origin rejection, premature expiry, idempotent expiry,
approval-expiry substitution and an ambiguous post-commit Messaging response.
Protected preview E2E exercises the real API/auth/tenant flows.

## Remaining gate

Exact-head CI evidence for this slice is required before promotion. Recovery
still needs atomic consent-safe message linkage, dispatch-time rechecks, delivery
reconciliation, conversion deduplication/confidence/cost rules, complete incentive
approval UX and language/visual acceptance. Exhausted workflow/consumer retries
need audited operational remediation and complete DLQ visibility. Production
Temporal transport/auth, remaining business workflows and schema evolution/replay
compatibility are release-wide gates, not waived by a successful fixture test.

No SQL migration is changed by this orchestration slice. Rollback requires
draining/versioning active `platform-recovery-v1` histories; do not remove or
rename workflow/activity definitions while existing histories can replay.
