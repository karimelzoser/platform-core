# Cross-cutting contracts

This document records the shared contracts introduced before later platform
modules expand. These contracts are infrastructure-facing source semantics, not
product Analytics, Billing, or a vendor-specific observability backend.

## Correlation and observability

Operational logs use the shared structured-log contract. Every entry has a
request ID and correlation ID and may carry causation, trace, and span IDs when a
caller/runtime provides them. Resource identity and attributes are bounded. Error
objects expose only safe operational details.

Raw provider payloads, credentials, authorization headers, message bodies, phone
numbers, email addresses, addresses, uploaded media, AI prompts, and unrestricted
metadata are not valid observability dimensions.

The later observability hardening workstream may bind this contract to concrete
log, metric, trace, dashboard, alert, and retention backends without changing the
business-domain source semantics.

## Meter definitions

`platform.meter_definitions` is the versioned registry for canonical usage units.
A meter definition records:

- the unit and aggregation behavior;
- the canonical source of truth;
- whether a retry creates a new unit;
- whether the meter may later become billable;
- whether external provider cost may apply;
- the exact bounded dimension allowlist.

Runtime application roles may read meter definitions but may not create or mutate
them. New definitions are migration-controlled contract changes.

## Usage records

`platform.usage_records` is tenant-scoped, append-only, and idempotent by tenant,
meter version, and idempotency key. It records the canonical operational unit and,
when available, explicit provider-cost evidence.

A usage record does not itself create a commercial charge. Plans, entitlements,
periods, quotas, overages, trials, subscriptions, invoice references, and
suspension behavior remain owned by the later Billing / Metering commercial
closure workstream.

## Operational processing versus provider consumption

Internal worker processing and external provider consumption are intentionally
distinct meters.

`integrations.provider_action.processing_attempt` is emitted when a claimed
provider action completes as succeeded, failed, or dead-lettered. It proves an
operational processing cycle occurred. It does **not** claim that the external
provider accepted a request or incurred a cost.

`integrations.provider_action.attempt` is reserved for the connector-adapter
boundary where the platform can prove an actual provider network attempt was
executed. Adapters will record this meter explicitly and may attach estimated or
finalized provider cost when evidence exists.

This separation prevents a database state transition from being misrepresented as
external billable consumption when a process crashes before, during, or after a
network call.

## Analytics dimensions

Analytics/telemetry dimensions are bounded scalar values only. Each usage meter
has an explicit dimension allowlist. High-cardinality or sensitive data belongs
in canonical domain state or controlled audit/event payloads, not metric labels.

Product analytics and ROI reporting consume canonical events and usage records
later; they do not reconstruct source events from dashboards or logs.

## Design-system primitives

The shared web primitives establish reusable page, stack, header, surface, metric,
status, action, and empty-state patterns. The accompanying CSS uses logical
properties so the same components can support English LTR and Arabic RTL. Focus,
responsive, and reduced-motion behavior are baseline requirements.

These primitives do not declare product-wide UX complete. Every release-critical
surface still requires the later full-product responsive, RTL/LTR, keyboard, and
practical WCAG 2.2 AA acceptance gate.

## Security and tenancy

Tenant-owned usage records use PostgreSQL RLS and tenant-qualified relationships.
Runtime roles cannot update/delete usage history or mutate the global meter
registry. Tests must continue to prove two-tenant read/write isolation,
idempotency, relationship safety, and bounded metadata behavior as new producers
are added.
