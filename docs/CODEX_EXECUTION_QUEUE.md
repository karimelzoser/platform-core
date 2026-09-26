# Platform Core Execution Queue

This is the authoritative execution ledger. `COMPLETE` is reserved for a
release-gate result, not a feature-level result.

## CURRENT

- **Messaging and ticket integration acceptance harness:** add disposable-stack
  two-tenant RLS, authorization, idempotency, audit, and outbox tests covering
  conversations, messages, tickets, and comments; repair any schema or command
  defects these tests reveal. Local migration verification, API typecheck/tests,
  formatting, and diff checks pass; the Docker-backed disposable-stack result is
  pending the normal GitHub Actions integration job because Docker is unavailable
  on this workstation.

## NEXT

1. Messaging inbound worker: normalize persisted webhook deliveries into
   tenant-bound conversations/messages, dedupe provider messages, and publish
   post-commit inbox events.
2. Messaging outbound command: typed connector dispatch after commit, delivery
   status persistence, retry/dead-letter behavior, templates, media bounds, and
   a real compose/UI flow.
3. Messaging operations: conversation assignment UI, close/reopen, customer
   linkage, permission states, Arabic RTL/LTR visual checks, and inbox E2E.
4. Ticket service/API/UI: create/update/assign/resolve tickets, comments,
   customer/conversation links, audit/outbox/idempotency, and tenant tests.
5. SLA worker/workflow: response/resolution clocks, pause/resume, breach events,
   escalation, deterministic Temporal coverage, and admin visibility.
6. CRM completion: verified opt-in evidence flow; tag-rule segment UI evaluation
   action; CSV import quoted-field integration tests; full two-tenant CRM/RLS,
   approval, merge, import/export, and accessibility/E2E suites.
7. Integration SDK completion: connection lifecycle, encrypted secret-reference
   boundary, provider assets, sync cursor/reconciliation commands, health, and
   connector contract fixtures.
8. Commerce schema and service: catalog, inventory, orders, payments,
   fulfillment, canonical provider mapping, commands, audit/outbox, RLS tests.
9. Order workflows: confirmation, duplicate detection, modification,
   cancellation, payment/fulfillment guards, provider activity boundaries, UI,
   Temporal tests.
10. Shipping: carrier abstraction, shipment normalization, tracking updates,
    delivery rescue, tenant tests, operational UI.
11. Returns/recovery: returns, exchanges, refunds, recovery attribution and
    commands/workflows, UI, provider contracts, tenant tests.
12. Sales: lead/pipeline/opportunity schema, services, UI, permissions,
    audit/outbox, tests.
13. Campaigns: audience/suppression, batching, provider cost/conversion,
    approval controls, worker/workflow and UI tests.
14. Temporal baseline: all release-critical workflow/activity contracts,
    retries, timeouts, signals, deterministic replay, restart tests.
15. Automation Studio: typed triggers/actions, version/publish, durable runs,
    approval-aware actions, UI and Temporal verification.
16. AI Gateway: provider abstraction, safe routing, typed tool registry,
    approval-bound actions, cost records, fallback/escalation, API/UI tests.
17. Knowledge/RAG and AI evaluation: ingestion, tenant retrieval boundaries,
    citations, prompt-injection/sensitive-data fixtures, evaluation thresholds.
18. Custom Data: tables/fields/records, import/export, permissions, APIs/UI,
    RLS and contract tests.
19. Analytics/Billing: aggregates, dashboards, usage/metering, provider cost,
    subscription state, tenant/UI/performance tests.
20. Developer Platform: tenant API keys, scoped outbound webhooks, signing,
    retries/dead letters, developer UI/docs/tests.
21. Admin Control Center: tenant/integration/workflow health, failed webhooks,
    stuck outbox, usage/spend, audited remediation commands, UI.
22. Identity/RBAC/approval closure: onboarding, invitations, organization
    selection, role editor/lifecycle, approval observability, auth/security E2E.
23. Full UX closure: every surface English LTR and Arabic RTL, responsive,
    accessible, loading/error/empty/forbidden states, visual/E2E scans.
24. Observability/performance/security hardening: structured logs/traces/metrics,
    threat-model refresh, dependency/security scan, benchmarks and thresholds.
25. Release engineering: immutable images, production Compose overlays, migration
    upgrade fixture, backup/restore/rollback validation, smoke tooling, runbook,
    release notes and release checklist.
26. Complete release acceptance: execute every mandatory gate in
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
- Messaging/ticket schemas; conversation/message read API and initial inbox UI;
  protected conversation handover API/UI.

## Release evidence

- No workstream above is marked complete until its Definition of Done and the
  relevant acceptance tests are objectively verified. The overall release
  remains **IN PROGRESS** until every NEXT item drains and the final acceptance
  gate passes.
