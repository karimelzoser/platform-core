# ADR 0004: Canonical command path and dependency-aware platform execution

**Status:** Accepted  
**Date:** 2026-10-05

## Context

The platform has reached the point where several core domains are implemented and the remaining scope spans shipping, returns, recovery, sales, campaigns, durable orchestration, automation, self-service configuration, production provider adapters, AI, analytics, billing, developer tooling, administration, and release hardening.

If those capabilities are implemented as isolated feature slices, the repository will accumulate duplicated business rules, inconsistent provider execution, late telemetry and metering retrofits, parallel AI/automation backends, and an onboarding layer that mutates tenant state without a versioned configuration model.

The platform already has the correct foundational ingredients: a NestJS modular monolith, separate worker and AI Gateway, PostgreSQL/RLS, Keycloak, OPA, approvals, idempotent commands, immutable audit, transactional outbox, NATS, Temporal, and the connector SDK.

## Decision

Adopt one canonical execution architecture for all human, API, automation, Temporal, configuration, and AI actions.

1. Business state is owned by canonical domain modules in PostgreSQL. PostgreSQL remains the source of truth.
2. Every state-changing operation enters through a typed domain command or equivalently controlled application service and passes authentication, tenant membership, RBAC, OPA, approval when required, idempotency, audit, and transactional outbox guarantees.
3. External provider calls never execute inside the domain transaction. The transaction records durable intent; workers/Temporal perform provider activity only after commit through typed connectors; normalized results are persisted in a new authorized tenant transaction.
4. Temporal coordinates long-running business processes. It does not become a second source of truth for order, shipping, return, campaign, customer, or other domain state.
5. NATS carries versioned events produced from the transactional outbox. Consumers are idempotent and tenant preserving.
6. AI tools and Automation Studio actions reuse the same typed platform command registry. They do not gain direct SQL, unrestricted HTTP, provider credentials, or alternate business-rule implementations.
7. Self-service setup compiles business answers and templates into a versioned declarative tenant configuration bundle. Configuration changes support validation, diff, simulation, approval where required, publish, and rollback. The compiler does not generate executable source code or arbitrary workflow code.
8. Cross-cutting contracts for observability, analytics events, usage/cost metering, security, and shared UI components are established before the remaining modules expand so future domains instrument them at implementation time rather than through a late retrofit.
9. Production provider adapters are implemented incrementally behind the connector SDK as the dependent domains mature. A later connector-closure gate verifies real adapter completeness and provider readiness; deterministic fixtures remain CI tools and are never presented as production adapters.
10. Full AI operators are implemented only after the typed tool platform and evaluation harness exist. Autonomous mode never bypasses risk policy or approvals.

## Canonical execution path

```text
Human / API / Automation / Temporal / Config Compiler / AI
                         |
                         v
                 Typed domain command
                         |
       auth -> membership -> RBAC -> OPA
                         |
                 approval if required
                         |
                   idempotency
                         |
                PostgreSQL transaction
              /          |           \
       domain state   audit       outbox intent
                         |
                       COMMIT
                         |
                worker / NATS / Temporal
                         |
                  typed connector
                         |
                 external provider
                         |
                normalized result
                         |
                new domain transaction
```

## Domain ownership consequences

- CRM owns canonical customer/contact identity. Sales, campaigns, recovery, tickets, and AI reference it rather than copying customer identity into separate authoritative records.
- Commerce owns canonical stores, catalog, orders, payments, and fulfillments. Shipping, returns, refunds, confirmation, and recovery reference those aggregates rather than provider-native commerce records.
- Messaging owns conversations and outbound message execution. Campaigns, recovery, automation, and AI request messaging actions through the messaging domain rather than implementing parallel provider-send paths.
- Integrations/connectors own provider-specific payloads, credentials, error mapping, rate-limit semantics, and network calls. Provider-specific JSON must not escape that boundary.

## Execution-order consequences

The remaining program is organized around dependency gates rather than a simple feature list:

- shared event/telemetry/metering/design-system contracts precede further domain expansion;
- identity/team/onboarding closure moves earlier because every configuration, approval, ownership, and commercial function depends on it;
- Temporal conventions are established continuously with each domain, followed by a central durability/replay closure gate;
- self-service onboarding is separated from the later configuration compiler/simulation layer;
- typed AI tools and AI evaluations precede autonomous operators;
- analytics dashboards and commercial billing remain later, but event and usage production begins early;
- final UX, security, performance, deployment, backup/restore, rollback, and release acceptance remain release-wide gates.

## Consequences

This decision reduces duplicated business logic, limits provider coupling, makes tenant configuration reproducible, enables accurate ROI/cost accounting, gives AI and automation the same security boundary as human actions, and allows the platform to grow without converting the modular monolith into a microservice mesh.

The cost is stricter implementation discipline: each module must publish the correct events, usage records, telemetry, audit evidence, and typed command contracts at the time it is built. Workstreams may not defer those cross-cutting requirements to a final cleanup phase.
