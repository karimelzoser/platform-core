# AGENTS.md — Platform Engineering Rules

These instructions apply to the entire repository.

## Mission

Build a production-grade, multi-tenant AI operations platform for commerce, customer support, sales, automation, and back-office operations.

The product must support Arabic RTL and English LTR, high-volume messaging/commerce workflows, self-service onboarding, human control, audited AI actions, and safe multi-tenant operation.

## Continuous Execution Protocol

`docs/CODEX_EXECUTION_QUEUE.md` is the authoritative execution ledger.

At the beginning of every implementation turn: read `docs/CODEX_EXECUTION_QUEUE.md` and `docs/IMPLEMENTATION_STATUS.md`, inspect CURRENT, and perform a concrete repository action immediately.

When CURRENT is objectively complete: run required validation; update `docs/IMPLEMENTATION_STATUS.md`; move CURRENT to DONE; promote the next dependency-ready NEXT item; and perform a concrete implementation/tool action on it before ending the turn.

A normal implementation turn must not end only with a progress summary, plan, handoff, “next I will,” or a completed-commit announcement. Reviewable commits are checkpoints, not stopping points.

## Local commit and remote CI batching

Create small, reviewable **local** commits after coherent implementation slices
and continue work locally. A local commit is neither a reason to push nor a
reason to stop.

Use this cadence: implementation → relevant local validation → local commit →
continue implementation → local validation → another local commit → run the
full locally available validation suite at a substantial coherent batch
boundary → push all accumulated commits once → inspect one GitHub Actions run
→ repair any CI failures in a local repair batch → push that repair batch.

Push only when a substantial workstream/major-module checkpoint is complete,
when remote Docker/PostgreSQL/RLS/Temporal/browser evidence is needed to safely
continue, when accumulated local change materially increases integration risk,
or when validating a final acceptance/release checkpoint. Do not push because a
single file, endpoint, migration, component, small feature, or local commit is
complete. Do not defer CI until the whole product is complete.

Only stop before release completion for a genuine external decision/input, an irreversible external action requiring authorization, Codex/system limits, or after the complete release gate in `docs/TESTING_AND_ACCEPTANCE.md` passes. If an item is blocked and another dependency-ready item exists, move the blocked item to BLOCKED and continue it. Do not ask the user to say “continue” between ordinary workstreams.

## Non-negotiable rules

1. Never commit secrets, production tokens, passwords, private keys, `.env` files, Keycloak admin credentials, provider access tokens, or production database dumps.
2. Never connect automated tests to the production VPS.
3. Never change, rewrite, reformat, rename, or squash migrations `0001`, `0002`, or `0003`.
4. New database changes start at migration `0004`.
5. Raw SQL migrations are canonical. Application query/ORM tooling must adapt to the database, not own the database schema.
6. Every tenant-owned table must contain `tenant_id`, appropriate tenant-qualified constraints/indexes, and PostgreSQL RLS.
7. Runtime PostgreSQL role must remain `NOBYPASSRLS`.
8. Never let AI execute provider actions directly. AI uses typed tools through application services, OPA, approval controls, idempotency, audit, outbox, and connectors.
9. Never call an external provider from inside a database transaction.
10. Never publish a domain event before the domain transaction commits. Use the transactional outbox.
11. Webhooks verify authenticity, resolve tenant/account, persist raw delivery, deduplicate, acknowledge quickly, and process asynchronously.
12. Do not expose PostgreSQL, Valkey, NATS, Temporal, OPA, or internal Keycloak management ports publicly.
13. Do not add Kubernetes or split the modular monolith into microservices without a measured reason and an ADR.
14. Avoid adding infrastructure daemons unless the requirement cannot be met with the existing stack.
15. A feature is incomplete without authorization, tenant isolation, auditability, tests, errors/loading/empty states, and observability.
16. HIGH/CRITICAL operations must pass OPA and an approval gate where policy requires it.
17. Make changes in reviewable commits and keep the repository green.
18. If validation fails, repair before proceeding.
19. Prefer boring, maintainable solutions over novelty.
20. Preserve published API/event compatibility or explicitly version it.

## Required architecture

- Web: Next.js + React + TypeScript
- API: NestJS + TypeScript modular monolith
- Worker: NestJS/TypeScript worker process
- AI Gateway: Python + FastAPI
- PostgreSQL 16 + pgvector
- Valkey
- NATS JetStream
- Temporal
- Keycloak
- OPA
- local media filesystem abstraction initially, S3-compatible interface
- Docker Compose deployment
- GitHub Actions CI/CD
- JSON structured logs
- OpenTelemetry-compatible instrumentation without requiring a heavy observability stack initially

Use a pnpm workspace. A Turborepo-style task graph is acceptable.

Use SQL-first migrations and a typed PostgreSQL data layer such as Kysely or an equally capable alternative. Do not introduce Prisma-managed schema migrations.

## Mandatory transaction model

For tenant-scoped runtime DB work:

1. Begin transaction.
2. Set transaction-local request context via `platform.set_request_context(...)`.
3. Perform tenant-scoped domain reads/writes.
4. Write audit record where required.
5. Write transactional outbox event where required.
6. Commit.
7. Outbox publisher publishes to NATS.
8. Consumers/Temporal continue asynchronous work.

## Authentication / authorization

- Keycloak authenticates users.
- Application DB owns organizations, memberships, roles, permissions, and tenant context.
- Keycloak `master` realm is administrative only.
- Keycloak `platform` realm is the application identity realm.
- NestJS validates Keycloak JWT/JWKS.
- Application resolves tenant membership and effective permissions.
- OPA makes policy decisions.
- PostgreSQL RLS remains the final tenant data isolation boundary.

## Definition of Done for every module

Where applicable, every module must include:

- DB migration
- typed domain model
- repository/data access
- domain service
- API/controller
- input/output validation
- authentication and RBAC
- OPA integration
- PostgreSQL RLS
- audit records
- domain/outbox events
- Temporal hooks
- connector hooks
- frontend UI
- RTL/LTR
- responsive behavior
- accessibility
- loading/error/empty states
- analytics instrumentation
- unit tests
- integration tests
- authorization/RLS tests
- contract tests
- observability
- documentation
- migration/rollback notes

## Decisions

Record consequential architectural decisions in `/docs/adr/`. Do not silently replace foundational decisions.
