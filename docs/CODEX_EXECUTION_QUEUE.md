# Platform Core Execution Queue

This is the authoritative execution ledger. `COMPLETE` is reserved for a
release-gate result, not a feature-level result.

## CURRENT

- **Messaging outbound delivery pipeline:** validate the committed-message
  claim, typed post-commit dispatch path, and canonical monotonic delivery
  receipts in the disposable Docker gate; then add templates, bounded media,
  tenant tests, and a real compose/send UI. Provider-specific adapters remain
  in the Integration SDK workstream and must not be faked.

## VERIFICATION PENDING

- **Messaging/ticket delivery and RLS acceptance:** two-tenant RLS read
  and cross-tenant write assertions, protected-handover authorization/idempotency
  command-contract tests, audit/outbox coverage, and schema probes were pushed
  in `af31eab`, with the schema-usage repair in `53a7a3d`. Run #72 passed all
  CI jobs, including the disposable Docker integration gate. Broader feature
  acceptance remains outstanding, so this is not a completion claim.
- **Messaging inbound worker:** the reusable canonical payload contract,
  delivery-claim lease, tenant-bound persistence, provider-message deduplication,
  retry/dead-letter state handling, and post-commit inbox event path were pushed
  in `3d71e02` and `732bd86`. Provider-specific adapters intentionally remain
  part of the integration SDK workstream; the generic worker is pending the
  Docker-backed integration result before any completion decision; Run #72
  verifies the schema/RLS path but not provider-specific delivery adapters.

## NEXT

1. Messaging outbound command: typed connector dispatch after commit, delivery
   status persistence, retry/dead-letter behavior, templates, media bounds, and
   a real compose/UI flow.
2. Ticket service/API/UI: create/update/assign/resolve tickets, comments,
   customer/conversation links, audit/outbox/idempotency, and tenant tests.
3. SLA worker/workflow: response/resolution clocks, pause/resume, breach events,
   escalation, deterministic Temporal coverage, and admin visibility.
4. CRM completion: verified opt-in evidence flow; tag-rule segment UI evaluation
   action; CSV import quoted-field integration tests; full two-tenant CRM/RLS,
   approval, merge, import/export, and accessibility/E2E suites.
5. Integration SDK completion: connection lifecycle, encrypted secret-reference
   boundary, provider assets, sync cursor/reconciliation commands, health, and
   connector contract fixtures.
6. Commerce schema and service: catalog, inventory, orders, payments,
   fulfillment, canonical provider mapping, commands, audit/outbox, RLS tests.
7. Order workflows: confirmation, duplicate detection, modification,
   cancellation, payment/fulfillment guards, provider activity boundaries, UI,
   Temporal tests.
8. Shipping: carrier abstraction, shipment normalization, tracking updates,
   delivery rescue, tenant tests, operational UI.
9. Returns/recovery: returns, exchanges, refunds, recovery attribution and
   commands/workflows, UI, provider contracts, tenant tests.
10. Sales: lead/pipeline/opportunity schema, services, UI, permissions,
    audit/outbox, tests.
11. Campaigns: audience/suppression, batching, provider cost/conversion,
    approval controls, worker/workflow and UI tests.
12. Temporal baseline: all release-critical workflow/activity contracts,
    retries, timeouts, signals, deterministic replay, restart tests.
13. Automation Studio: typed triggers/actions, version/publish, durable runs,
    approval-aware actions, UI and Temporal verification.
14. AI Gateway: provider abstraction, safe routing, typed tool registry,
    approval-bound actions, cost records, fallback/escalation, API/UI tests.
15. Knowledge/RAG and AI evaluation: ingestion, tenant retrieval boundaries,
    citations, prompt-injection/sensitive-data fixtures, evaluation thresholds.
16. Custom Data: tables/fields/records, import/export, permissions, APIs/UI,
    RLS and contract tests.
17. Analytics/Billing: aggregates, dashboards, usage/metering, provider cost,
    subscription state, tenant/UI/performance tests.
18. Developer Platform: tenant API keys, scoped outbound webhooks, signing,
    retries/dead letters, developer UI/docs/tests.
19. Admin Control Center: tenant/integration/workflow health, failed webhooks,
    stuck outbox, usage/spend, audited remediation commands, UI.
20. Identity/RBAC/approval closure: onboarding, invitations, organization
    selection, role editor/lifecycle, approval observability, auth/security E2E.
21. Full UX closure: every surface English LTR and Arabic RTL, responsive,
    accessible, loading/error/empty/forbidden states, visual/E2E scans.
22. Observability/performance/security hardening: structured logs/traces/metrics,
    threat-model refresh, dependency/security scan, benchmarks and thresholds.
23. Release engineering: immutable images, production Compose overlays, migration
    upgrade fixture, backup/restore/rollback validation, smoke tooling, runbook,
    release notes and release checklist.
24. Complete release acceptance: execute every mandatory gate in
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
- Messaging/ticket schemas through migration `0016`, schema/RLS integration
  harness, conversation/message read API, inbound worker, protected handover,
  assignment, close/reopen API/UI controls, durable outbound command/claim and
  post-commit dispatch/retry/dead-letter foundation, and initial protected
  ticket list/create/comment API/UI foundations.

## Release evidence

- No workstream above is marked complete until its Definition of Done and the
  relevant acceptance tests are objectively verified. The overall release
  remains **IN PROGRESS** until every NEXT item drains and the final acceptance
  gate passes.
