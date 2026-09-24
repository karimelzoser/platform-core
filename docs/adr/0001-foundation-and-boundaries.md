# ADR 0001: Modular monolith with isolated asynchronous and AI deployables

**Status:** Accepted  
**Date:** 2026-09-24

## Context

The platform must share a constrained production VPS with a critical n8n installation, while preserving tenant isolation, auditable external actions, and durable background processing.

## Decision

Implement the synchronous business API as a NestJS modular monolith. Keep the worker and FastAPI AI gateway as separate deployables. PostgreSQL is authoritative; asynchronous publication starts only from the transactional outbox after commit. Existing PostgreSQL, Valkey, NATS JetStream, Temporal, Keycloak, OPA, and the external `platform_internal` network are consumed, never recreated by application deployment.

## Consequences

Domain modules remain independently testable without a microservice-per-module operational burden. External side effects remain outside database transactions and must pass authorization, approval, idempotency, audit, and connector boundaries.
