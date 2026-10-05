# Connector SDK and Production Adapter Contract

`@platform/connectors` owns the canonical boundary between provider payloads and
platform contracts. Provider-specific JSON, auth behavior, rate-limit semantics,
network calls and raw provider errors must not escape this boundary.

This document distinguishes:

1. the **Connector SDK/runtime foundation** already implemented in the repository;
2. deterministic **development fixtures/emulators** used for CI;
3. **real production adapters** required before a provider is claimed for launch.

A development fixture never satisfies a production-adapter release requirement.

## Canonical connector capabilities

A connector implements the relevant subset of:

- validated manifest;
- connection configuration validation;
- connect/auth/OAuth exchange;
- credential refresh/rotation;
- disconnect/uninstall;
- health;
- provider asset discovery;
- webhook registration/unregistration;
- webhook authenticity verification;
- webhook normalization;
- initial backfill;
- incremental sync;
- reconciliation;
- typed provider actions/results;
- provider error mapping;
- rate-limit/retry-after semantics.

## Provider isolation rule

Provider-specific payloads do not become canonical domain contracts.

Correct:

```text
Commerce/Shipping/Messaging command
 -> canonical provider-action contract
 -> connector adapter
 -> provider request
 -> provider response/error
 -> normalized bounded connector result
 -> canonical domain result command
```

Incorrect:

- domain services importing provider SDKs directly;
- storing arbitrary Shopify/Meta/carrier response JSON as canonical business
  state;
- AI or Automation Studio calling provider APIs directly;
- a frontend calling provider APIs with tenant credentials.

## Credentials and secret references

Credentials are received/resolved by secret-management infrastructure and
referenced through opaque secret references such as
`integrations.secret_references`.

Ordinary tenant/business records contain no plaintext provider secret.

The production secret backend may evolve behind the reference abstraction without
changing canonical business records. Connector code may receive a resolved secret
only at the narrow provider-call boundary and must never log/audit/persist raw
secret material.

## Connection lifecycle

Connection list/connect/disconnect operations are tenant scoped.

Connect/disconnect are HIGH-risk idempotent commands requiring
`integrations.manage`, OPA authorization and digest-bound approval when policy
requires it.

Validate provider/configuration input before committing the desired canonical
connection state where appropriate. The transaction records only bounded
connection metadata, opaque secret reference, audit and outbox evidence.

Credential rotation accepts a replacement opaque reference/key version, validates
it according to connector capability, atomically updates canonical desired state
and safely revokes the old reference only when no active connection still needs
it. Rotation is CRITICAL/approval-aware.

## Webhook lifecycle

Webhook registration/unregistration follows a desired-state/post-commit model.

The protected API records the desired subscription, tenant, callback metadata,
audit and outbox/provider-action intent. A worker invokes the connector only after
commit.

Inbound provider webhook flow:

```text
provider
 -> bounded request endpoint
 -> verify signature/timestamp/replay where applicable
 -> resolve account/connection/tenant
 -> persist sanitized delivery
 -> dedupe
 -> acknowledge promptly
 -> async normalize/process
 -> canonical domain command/event
```

Provider delivery duplicates become idempotent no-ops.

## Sync / reconciliation lifecycle

Sync requests are idempotent, tenant/OPA-authorized commands. They create durable
sync state plus audit/outbox evidence in the request transaction.

The worker/Temporal activity:

- claims one leased run safely;
- resolves tenant/connection/secret after commit;
- invokes the typed connector;
- persists bounded cursor/progress/result in a new transaction;
- applies capped retry/backoff;
- honors bounded provider retry-after/rate limits;
- records terminal dead-letter evidence when exhausted/non-retryable.

An abandoned worker lease can be reclaimed safely. No connector receives a
business database transaction.

## Provider-action lifecycle

The API/domain accepts only typed actions explicitly allowed by the selected
connector capability.

A transaction records the typed desired action, idempotency/audit/outbox evidence
and returns queued/pending state. A worker/Temporal activity invokes the connector
post-commit and persists a bounded normalized result/error in a new transaction.

The provider action boundary must not accept arbitrary URLs or executable
provider payloads.

Failures are normalized to bounded error codes/classes such as retryable,
non-retryable/business-invalid, auth/configuration or rate-limited. Raw provider
exceptions/responses are not stored in dead letters/logs unless explicitly
sanitized and bounded.

## Development fixtures currently provided

The repository provides opt-in disposable-preview/test fixtures for:

- Web Chat;
- generic API;
- Email;
- Meta Embedded Signup/account discovery;
- WhatsApp Cloud API;
- Instagram Messaging;
- Messenger Platform;
- Shopify Public App;
- WooCommerce.

They are contract emulators only. They make no real provider network calls and
must never register when `APP_ENV=production`. Registration additionally requires
explicit development fixture enablement.

The messaging fixtures model deterministic signatures, normalized inbound and
delivery events, and provider-message IDs for idempotent retries.

The Meta fixture models deterministic Business/WABA/phone/Page/Instagram assets
without pretending to implement the real OAuth/Embedded Signup browser exchange.

The Shopify fixture models the public-app contract boundary, configurable API
version setting, Shopify-shaped HMAC, provider identity, assets,
reconciliation/webhook subscription and development-only typed actions. It does
not implement the real Shopify OAuth/GraphQL network adapter.

The WooCommerce fixture similarly models signatures, store discovery, sync,
subscription, reconciliation and typed action boundaries without being a real
WooCommerce production adapter.

## Production adapter requirements

Real adapters are required for every provider claimed in the production launch.
They should be implemented incrementally once the canonical dependent domain is
stable, then verified together in the Production Connector Closure gate.

Priority launch families:

1. Shopify;
2. WooCommerce;
3. WhatsApp Cloud API;
4. Instagram Messaging;
5. Messenger Platform;
6. Email;
7. Web Chat/generic API ingress;
8. launch shipping carrier adapters;
9. payment provider adapters;
10. generic REST/webhook adapter.

### Shopify production adapter

Applicable requirements:

- public-app-compatible OAuth/auth flow;
- minimal scopes;
- configurable/versioned GraphQL Admin API version;
- token/secret lifecycle;
- webhook verification/subscriptions;
- products/variants/inventory/customer/order/fulfillment normalization;
- pagination and bulk/backfill strategy;
- incremental sync/reconciliation;
- uninstall handling;
- protected customer data awareness;
- typed outbound commerce actions required by platform scope;
- error/rate-limit/retry mapping;
- health/diagnostics.

### Meta production adapters

Applicable requirements across Embedded Signup, WhatsApp, Instagram and Messenger:

- real auth/Embedded Signup exchange and token lifecycle;
- asset discovery/selection;
- webhook subscription/verification;
- inbound message normalization;
- outbound typed message actions;
- template lifecycle for WhatsApp where required;
- media;
- interactive reply normalization;
- status receipts;
- conversation-window/platform-rule state where applicable;
- handover/human-control behavior;
- consent/suppression integration;
- provider error/rate-limit/health mapping.

### Shipping production adapters

Carrier adapters own:

- provider-native auth;
- city/district/location IDs/mappings;
- create shipment/label;
- pickup/reschedule/address-update/cancel actions as supported;
- tracking/event normalization;
- provider reference IDs/URLs;
- errors/rate limits/retry-after;
- health/reconciliation where supported.

Canonical Shipping owns the normalized location/address/zone/shipment/tracking
model. Provider-native location IDs stay in carrier mapping data rather than
customer/order addresses.

### Payment production adapters

Payment connectors own provider-native authorization/capture/refund/status
operations required by commercial decisions. Canonical Commerce/Refund/Billing
owns business state and approval decisions.

Financial provider calls are always post-commit and approval-aware where policy
requires.

## Production closure gate

A provider may be marked production ready only when:

- the real network adapter exists;
- production configuration cannot route to a development fixture;
- applicable auth/token lifecycle works;
- provider assets/webhooks/sync/reconcile/actions are implemented as required;
- recorded/synthetic provider contract tests pass;
- retry/rate-limit/error mapping is bounded/tested;
- secrets never enter ordinary domain/audit/log payloads;
- provider calls occur post-commit;
- idempotency/duplicate behavior is proven;
- credential/certification/provider-review prerequisites are documented;
- operational health/diagnostics exist;
- no release-critical route uses fake success.

Live credentials are not required in ordinary CI and must never be committed.
Provider certification/external approval may remain an external release blocker,
but missing adapter code is not allowed to be hidden behind the word "fixture."
