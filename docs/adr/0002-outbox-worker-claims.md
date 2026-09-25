# ADR 0002: Controlled cross-tenant outbox claims

**Status:** Accepted  
**Date:** 2026-09-25

## Context

RLS deliberately prevents ordinary application transactions from scanning every tenant's rows. The outbox worker nevertheless needs a bounded, concurrent-safe way to claim committed events across tenants.

## Decision

Migration `0005` supplies narrowly scoped `SECURITY DEFINER` functions that only claim, publish, or record a failure for outbox rows. Functions use a fixed search path, validate bounded input, require the caller's worker claim token for state changes, and are executable only by `platform_app`. They are used only by the trusted worker process; no HTTP endpoint exposes them.

## Consequences

The worker does not disable RLS or use a superuser. Its cross-tenant visibility is constrained to serialized outbox rows after the originating tenant transaction committed. Poison events become tenant-attributed dead letters after bounded retries.
