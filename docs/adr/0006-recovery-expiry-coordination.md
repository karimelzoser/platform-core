# ADR 0006: Committed-event Recovery expiry coordination

**Status:** Accepted architecture; implementation acceptance pending exact-head CI
**Date:** 2026-10-11

## Context

Recovery persisted deterministic workflow IDs but had no registered business
workflow. Infrastructure restart persistence alone cannot prove that commercial
expiry survives worker restarts or obeys tenant/security boundaries.

## Decision

Register `recoveryExpiryWorkflow` on `platform-recovery-v1`. A durable NATS
consumer starts or refreshes it only after matching a committed canonical outbox
event to its tenant/opportunity. PostgreSQL owns state; activities reread it.
Only identity references enter workflow history, not contact bodies or secrets.

API and activity actors call the same `@platform/recovery` expiry command. The
activity has only `recovery.execute`, installs transaction-local tenant context,
passes OPA and uses deterministic idempotency, audit and outbox. It has no
provider-send capability. The database clock and a locked opportunity decide
whether expiry is due. Premature expiry fails rather than caching a false no-op.

Conversion signals refresh canonical state. Duplicate creation delivery never
creates another history. Cancelling a workflow cancels orchestration, not a
business record or a previously queued provider operation. Configured native
worker/consumer failure must fail worker readiness.

## Consequences

- Production worker startup requires a private Temporal address. Development
  may leave it unconfigured but must report that explicitly.
- Workflow/task-queue definitions require replay-aware evolution and draining;
  removing a live definition is not an ordinary rollback.
- Activity retries remain bounded and canonical writes remain idempotent.
- Exhausted workflow/consumer retries require audited operational remediation
  and DLQ visibility; this slice does not waive those remaining gates.
- Orchestration fixture histories prove Temporal behavior only. Separate real
  PostgreSQL/RLS/command tests and protected browser evidence remain mandatory.
- Atomic consent-safe dispatch, receipts, attribution/cost and complete Recovery
  operator UX are still CURRENT work, not completed by expiry registration.
