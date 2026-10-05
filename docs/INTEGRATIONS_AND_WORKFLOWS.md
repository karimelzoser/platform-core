# Integrations, Connectors, Events, and Temporal

## Connector SDK

Every connector exposes the relevant subset of:

- manifest;
- connect/auth/OAuth;
- credential refresh/rotation;
- disconnect/uninstall;
- validate configuration;
- health;
- discover provider assets;
- register/unregister webhooks;
- verify/normalize webhook;
- initial backfill;
- incremental sync;
- reconcile;
- provider-error mapping;
- typed provider actions/results;
- rate-limit/retry semantics.

Provider-specific JSON must remain inside the connector boundary.

## Manifest

Include:

- connector key;
- display metadata;
- category;
- auth type;
- scopes;
- capabilities;
- webhook/polling support;
- rate-limit model;
- credential schema;
- connection settings schema;
- provider assets discovery;
- implementation maturity/capability flags that cannot cause a development
  fixture to be treated as a production adapter.

## Credentials

Domain records store opaque secret references, not plaintext credentials.

A production secret backend may change behind the abstraction without changing
canonical domain records. Connector code receives resolved credentials only at
the narrow provider-call boundary and must not persist/log them.

## Provider action path

External calls are post-commit.

```text
domain command
 -> authorized/idempotent transaction records provider intent + audit + outbox
 -> COMMIT
 -> worker/Temporal activity claims intent
 -> connector resolves provider route/secret reference
 -> provider call
 -> bounded normalized result/error
 -> new tenant-scoped transaction records canonical result + audit/outbox
```

Never call an external provider inside a domain transaction.

## Webhook inbox

Persist before processing.

Suggested data:

- tenant;
- connection;
- provider/account;
- delivery ID;
- event type;
- signature state;
- sanitized headers/body;
- received time;
- dedupe key;
- state/attempts;
- normalized event;
- bounded error.

Provider duplicates become idempotent no-ops.

## Sync

Track:

- job type initial/incremental/reconcile/manual;
- cursor/high-water mark;
- pages/items;
- timestamps;
- retries;
- provider throttling;
- failures;
- correlation/tenant;
- usage/operational metrics where relevant.

## Production adapter policy

Development fixtures/emulators exist to make CI deterministic. They never satisfy
a production provider requirement.

Real adapters should be implemented incrementally once their canonical domain
contracts stabilize, then formally verified in Production Connector Closure.
Priority launch families are:

1. Shopify;
2. WooCommerce;
3. WhatsApp Cloud API;
4. Instagram Messaging;
5. Messenger Platform;
6. Email;
7. Web Chat/generic API ingress;
8. launch shipping carriers;
9. payment providers;
10. generic REST/webhook.

A launch provider is not complete until its applicable auth/token lifecycle,
assets, webhooks, sync/reconciliation, typed actions, error/rate-limit handling,
health and disconnect/uninstall behavior are implemented and contract-tested.

## Temporal role

Temporal coordinates long-running business processes. Canonical business state
remains in PostgreSQL.

Do not defer all Temporal work to a late rewrite. Each long-running domain adds
its workflow/activity contract when the domain is implemented. The later
Temporal platform closure standardizes IDs, queues, retry taxonomy, replay,
restart and operational conventions across those workflows.

## Required Temporal workflows

### OrganizationOnboardingWorkflow

Durable onboarding steps that require asynchronous integration discovery or
configuration application. Canonical organization/profile state stays in the DB.

### IntegrationBackfillWorkflow

Resumable initial provider sync with throttling, retries and progress.

### IntegrationReconciliationWorkflow

Detect provider-vs-canonical drift and resolve or surface it according to domain
policy.

### OrderConfirmationWorkflow

Confirmation attempts, messaging, wait/timeout, modification/cancel and terminal
state.

### ShippingWorkflow

Idempotent shipment/provider-action coordination after shipping eligibility.

### DeliveryRescueWorkflow

Carrier failure, customer contact, address correction, retry/reschedule and
escalation.

### RecoveryWorkflow

Commercial eligibility, suppression, messaging/offer attempts, expiry and
conversion attribution.

### ReturnWorkflow

Request, eligibility, approval, collection/drop-off, inspection and resolution.

### RefundWorkflow

Approval-sensitive financial execution and provider result handling.

### CampaignWorkflow

Freeze audience, suppress, create deterministic recipients, batch send, rate
limit, retry, collect cost/delivery/conversion evidence.

### ConversationOperatorWorkflow

Durable AI/human orchestration where waits, approvals, handover or multi-step tool
execution justify workflow durability.

### AutomationWorkflow

Execute a published typed automation graph with durable timers/waits and
idempotent canonical actions.

## Temporal rules

- deterministic workflow code;
- side effects only in activities or canonical command calls from activities;
- versioned activity contracts;
- deterministic workflow IDs where duplicate execution is dangerous;
- signals/updates for human decisions and external state;
- deliberate timeouts/heartbeats;
- classify provider, infrastructure and business-terminal failures separately;
- no infinite retry of invalid business actions;
- workflow history is not canonical domain state;
- workflow search attributes contain bounded operational metadata, not secrets or
  unnecessary PII;
- workflow/activity code changes preserve replay compatibility or use explicit
  versioning/migration strategy;
- cancellation is intentional and must not leave canonical domain state falsely
  reporting completion.

## Error taxonomy

Examples:

- provider rate limit / temporary network outage: retryable;
- provider unavailable: retry according to bounded policy;
- invalid address/business input: generally non-retryable until corrected;
- customer rejected/cancelled process: business terminal;
- authorization/approval mismatch: fail closed, not retry forever;
- duplicate start: return/attach to deterministic existing workflow where
  contract requires.

## NATS

Use documented versioned subjects and durable consumers.

Transactional outbox is authoritative. Do not publish a business event directly
from a domain transaction.

Consumers must be:

- idempotent;
- tenant preserving;
- version aware;
- bounded in retries;
- observable for lag/failure;
- DLQ capable where failure cannot be safely dropped.

## Configuration compiler interaction

The configuration compiler may create/publish approved declarative automation,
policy and operator configuration. It must not bypass canonical commands or call
providers directly.

Simulation mode must use non-side-effecting evaluators/planners and must never
invoke real provider actions or mutate canonical production state.
