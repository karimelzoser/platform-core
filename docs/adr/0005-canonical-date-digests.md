# ADR 0005 — Bind coerced dates in approval and idempotency digests

Status: Accepted

Date: 2026-10-11

## Context

Validated domain schemas can coerce JSON timestamps into JavaScript Date objects.
The existing canonical JSON walkers treated those objects as empty records.
Consequently different offer expiry instants could have the same approval digest
and idempotency fingerprint. JSON request snapshots, in contrast, serialize dates
as ISO strings.

## Decision

Canonicalize valid Date values as their UTC ISO strings in both digest paths,
including nested records and arrays. Reject invalid Date values before command
execution. Plain JSON inputs retain their existing digest behavior.

## Consequences

Changing a coerced expiry invalidates the original approval and conflicts with
an existing idempotency key. A Date and its serialized ISO representation bind
to the same instant across request and domain boundaries.

Previously created Date-object digests intentionally fail closed when recalculated.
Reissue affected pending approvals; do not rewrite their historical evidence or
grandfather the ambiguous digest. The unmerged Recovery offer flow is a concrete
consumer; no historical migration is changed.
