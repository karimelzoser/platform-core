# Platform Core Execution Queue

This is the authoritative execution ledger. `COMPLETE` is reserved for a
release-gate result, not a feature-level result.

Invariant: unless BLOCKED contains the only remaining mandatory work, CURRENT
must always contain exactly one executable item. Completing CURRENT is not a
reason to stop; it triggers immediate promotion and execution of the next
dependency-ready item.

## CURRENT

- **SLA worker/workflow foundation:** add tenant-scoped policies, response and
  resolution clocks, pause/resume, idempotent breach/escalation events,
  post-commit worker evaluation, API/admin visibility, and two-tenant tests.

## VERIFICATION PENDING

- **Ticket visual acceptance:** the protected ticket UI has build/type evidence;
  browser E2E, RTL/LTR, responsive, and accessibility evidence remain in the
  later full-UX release gate.
- **SLA lifecycle:** Docker-backed worker/integration evidence is pending.

## NEXT

1. CRM completion: verified opt-in evidence flow; tag-rule segment UI evaluation
   action; CSV import quoted-field integration tests; full two-tenant CRM/RLS,
   approval, merge, import/export, and accessibility/E2E suites.
2. Integration SDK completion: connection lifecycle, encrypted secret-reference
   boundary, provider assets, sync cursor/reconciliation commands, health, and
   connector contract fixtures.
3. Commerce schema and service: catalog, inventory, orders, payments,
   fulfillment, canonical provider mapping, commands, audit/outbox, RLS tests.
4. Order workflows: confirmation, duplicate detection, modification,
   cancellation, payment/fulfillment guards, provider activity boundaries, UI,
   Temporal tests.
5. Shipping: carrier abstraction, shipment normalization, tracking updates,
   delivery rescue, tenant tests, operational UI.
6. Returns/recovery: returns, exchanges, refunds, recovery attribution and
   commands/workflows, UI, provider contracts, tenant tests.
7. Sales: lead/pipeline/opportunity schema, services, UI, permissions,
   audit/outbox, tests.
8. Campaigns: audience/suppression, batching, provider cost/conversion,
   approval controls, worker/workflow and UI tests.
9. Temporal baseline: all release-critical workflow/activity contracts,
   retries, timeouts, signals, deterministic replay, restart tests.
10. Automation Studio: typed triggers/actions, version/publish, durable runs,
    approval-aware actions, UI and Temporal verification.
11. AI Gateway: provider abstraction, safe routing, typed tool registry,
    approval-bound actions, cost records, fallback/escalation, API/UI tests.
12. Knowledge/RAG and AI evaluation: ingestion, tenant retrieval boundaries,
    citations, prompt-injection/sensitive-data fixtures, evaluation thresholds.
13. Custom Data: tables/fields/records, import/export, permissions, APIs/UI,
    RLS and contract tests.
14. Analytics/Billing: aggregates, dashboards, usage/metering, provider cost,
    subscription state, tenant/UI/performance tests.
15. Developer Platform: tenant API keys, scoped outbound webhooks, signing,
    retries/dead letters, developer UI/docs/tests.
16. Admin Control Center: tenant/integration/workflow health, failed webhooks,
    stuck outbox, usage/spend, audited remediation commands, UI.
17. Identity/RBAC/approval closure: onboarding, invitations, organization
    selection, role editor/lifecycle, approval observability, auth/security E2E.
18. Full UX closure: every surface English LTR and Arabic RTL, responsive,
    accessible, loading/error/empty/forbidden states, visual/E2E scans.
19. Observability/performance/security hardening: structured logs/traces/metrics,
    threat-model refresh, dependency/security scan, benchmarks and thresholds.
20. Release engineering: immutable images, production Compose overlays, migration
    upgrade fixture, backup/restore/rollback validation, smoke tooling, runbook,
    release notes and release checklist.
21. Complete release acceptance: execute every mandatory gate in
    `TESTING_AND_ACCEPTANCE.md`, inspect green CI, and record evidence.

## BLOCKED

- None. Production provider credentials and deployment access are deliberately
  out of scope until a separate explicit deployment instruction; repository
  implementations use emulators, fixtures, and development-only configuration.

## DONE

- Immutable baseline migration checksum verifier and disposable CI stack.
- Keycloak/JWT tenant context, RLS transaction helper, OPA command authorization,
  idempotency, audit, transactional outbox, and approvals foundation.
- Connector/webhook ingress foundation with persisted/deduplicated deliveries.
- CRM customer profiles, merge approval flow, tags, static/tag-rule segments,
  timeline, bounded CSV import/export, bulk tags, and opt-out foundation.
- Codespaces development preview with isolated services and real Keycloak login.
- Messaging/ticket schemas through migration `0019`, schema/RLS integration
  harness, conversation/message read API, inbound worker, protected handover,
  assignment, close/reopen API/UI controls, durable outbound command/claim and
  post-commit dispatch/retry/dead-letter, receipts, protected compose/template
  selection/management foundations, and initial protected ticket
  list/create/comment API/UI foundations.
- Bounded tenant-owned media uploads, one-time message attachment claims,
  post-commit typed connector references, inbox compose and history metadata,
  private local storage, and two-tenant migration/RLS verification in green
  GitHub Actions run #100 for commit `273aebf` (quality, integration, API image,
  AI gateway, and secret scan all passed).
- Two-tenant messaging lifecycle integration evidence in green GitHub Actions
  run #101 for commit `2257da9`: media isolation, idempotency, post-commit typed
  connector dispatch, provider IDs, monotonic delivery receipts, retries and
  dead letters. Provider adapters remain unimplemented and are not claimed.
- Ticket application lifecycle evidence in green GitHub Actions run #104 for
  commit `634b548`: protected create/update/assignment/comment/resolve/reopen,
  tenant link isolation, idempotency, audit, and outbox behavior. This is not a
  claim that the ticket module or its visual acceptance is complete.

## Release evidence

- No workstream above is marked complete until its Definition of Done and the
  relevant acceptance tests are objectively verified. The overall release
  remains **IN PROGRESS** until every NEXT item drains and the final acceptance
  gate passes.
