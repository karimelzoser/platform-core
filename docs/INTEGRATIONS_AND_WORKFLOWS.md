# Integrations, Connectors, Events, and Temporal

## Connector SDK

Every connector exposes a relevant subset of:

- manifest
- connect
- credential refresh/rotation
- disconnect
- validate configuration
- health
- register/unregister webhooks
- normalize webhook
- initial backfill
- incremental sync
- reconcile
- provider-error mapping
- typed provider actions

## Manifest

Include:

- connector key
- display metadata
- category
- auth type
- scopes
- capabilities
- webhook/polling support
- rate-limit model
- credential schema
- connection settings schema
- provider assets discovery

## Credentials

Domain records store secret references, not plaintext credentials.

## Webhook inbox

Persist before processing.

Suggested data:

- tenant
- connection
- provider/account
- delivery ID
- event type
- signature state
- sanitized headers/body
- received time
- dedupe key
- state/attempts
- normalized event
- error

Provider duplicates become idempotent no-ops.

## Sync

Track:

- job type initial/incremental/reconcile/manual
- cursor/high-water mark
- pages/items
- timestamps
- retries
- provider throttling
- failures

## Required Temporal workflows

### OrganizationOnboardingWorkflow

Default organization config, role bootstrap, settings, optional connection onboarding.

### IntegrationBackfillWorkflow

Resumable initial provider sync with throttling/retries/progress.

### IntegrationReconciliationWorkflow

Detect and resolve/raise provider-vs-canonical drift.

### OrderConfirmationWorkflow

Confirmation attempts, messaging, timeout, modification/cancel, final state.

### ShippingWorkflow

Idempotent shipment creation after eligibility.

### DeliveryRescueWorkflow

Carrier failure, customer contact, address correction, retry/escalation.

### RecoveryWorkflow

Eligibility, suppression, messaging, expiry, attribution.

### ReturnWorkflow

Request, eligibility, approval, carrier/warehouse/customer actions.

### RefundWorkflow

Approval-sensitive financial execution.

### CampaignWorkflow

Freeze audience, suppress, batch send, rate-limit, retry, cost/conversion.

### ConversationOperatorWorkflow

Durable AI/human orchestration where useful.

### AutomationWorkflow

Published typed automation graph with durable timers.

## Temporal rules

- deterministic workflow code
- side effects only in activities
- versioned activity contracts
- deterministic workflow IDs where duplicate execution is dangerous
- signals/updates for human decisions/external state
- deliberate timeouts
- classify provider/business failures
- no infinite retry of invalid business actions

## NATS

Use documented versioned subjects and durable consumers.

Transactional outbox is authoritative.

Consumers must be idempotent and have DLQ handling.
