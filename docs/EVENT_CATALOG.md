# Event Catalog

All domain events use versioned envelopes stored in `platform.outbox_events` in
the same transaction as the canonical domain change and required audit evidence.
Publication begins only after commit.

The worker uses leased `FOR UPDATE SKIP LOCKED` claiming with bounded retries,
acknowledgement ownership and tenant-attributed dead letters. Consumers must be
idempotent, tenant preserving and version aware.

This catalog distinguishes **implemented/current contracts** from **required
future families**. Listing a future event here does not claim that its producer is
already implemented.

## Canonical envelope

The wire contract is owned by `@platform/contracts` and follows
`DATABASE_AND_EVENTS.md`:

```json
{
  "id": "evt_uuid",
  "type": "commerce.order.created",
  "version": 1,
  "tenant_id": "org_uuid",
  "occurred_at": "RFC3339",
  "source": "platform|integration|...",
  "correlation_id": "cor_...",
  "causation_id": "evt_...",
  "actor": { "type": "USER|AI|SYSTEM|SERVICE|INTEGRATION", "id": "..." },
  "resource": { "type": "order", "id": "..." },
  "data": {}
}
```

Rules:

- do not publish provider-native payloads as business contracts;
- do not put secrets/unbounded sensitive payloads in events;
- version incompatible schema changes;
- retain tenant, actor, resource, correlation and causation;
- update this catalog when a shared/public event is added or materially changed.

## Implemented / current contract families

| Subject | Event | Producer | Consumer behavior |
| --- | --- | --- | --- |
| `platform.identity.v1` | `identity.membership.changed` | Identity module | Recompute effective permission projections idempotently |
| `platform.crm.v1` | `crm.customer.created` | Customer 360 | Refresh search, segments and timeline projections |
| `platform.crm.v1` | `crm.tag.created` | Customer 360 | Refresh tenant tag catalog |
| `platform.crm.v1` | `crm.customer.tag.assigned` | Customer 360 | Refresh customer and segment projections |
| `platform.crm.v1` | `crm.customer.tag.bulk_assigned` | Customer 360 | Refresh tagged customer/segment projections |
| `platform.crm.v1` | `crm.customer.communication.suppressed` | Customer 360 | Stop disallowed outbound activity and refresh consent projections |
| `platform.crm.v1` | `crm.customer.communication.opted_in` | Verified consent ingress | Refresh consent from verified provider evidence |
| `platform.crm.v1` | `crm.customer.merged` | Customer 360 | Repoint projections and reevaluate segments |
| `platform.crm.v1` | `crm.customer.changed` | Customer 360 | Refresh search/segment/timeline projections |
| `platform.integrations.v1` | `integration.webhook.received` | Webhook ingress | Normalize/process persisted delivery asynchronously |
| `platform.integrations.v1` | `integration.sync.requested` | Integration command | Start/continue durable provider sync coordination |
| `platform.messaging.v1` | `messaging.message.received` | Inbound worker | Refresh tenant inbox/linked operational context |
| `platform.messaging.v1` | `messaging.message.dispatch_requested` | Messaging command | Claim committed typed outbound send |
| `platform.messaging.v1` | `messaging.message.sent` | Outbound worker | Refresh inbox/provider acceptance state |
| `platform.messaging.v1` | `messaging.message.delivery_updated` | Webhook worker | Apply monotonic provider delivery/read state |
| `platform.messaging.v1` | `messaging.message.dead_lettered` | Outbound worker | Surface exhausted bounded provider failure |
| `platform.messaging.v1` | `messaging.conversation.assigned` | Messaging command | Refresh assignee work queue |
| `platform.messaging.v1` | `messaging.conversation.handed_over` | Messaging command | Refresh AI/human ownership projections |
| `platform.messaging.v1` | `messaging.conversation.closed` | Messaging command | Stop active handling and refresh inbox |
| `platform.messaging.v1` | `messaging.conversation.reopened` | Messaging command | Resume active handling |
| `platform.tickets.v1` | `tickets.record.created` | Ticket command | Create/refresh tenant ticket projections |
| `platform.tickets.v1` | `tickets.record.updated` | Ticket command | Refresh linked ticket views |
| `platform.tickets.v1` | `tickets.record.assigned` | Ticket command | Refresh assignee work queue |
| `platform.tickets.v1` | `tickets.record.resolved` | Ticket command | Close resolution-side SLA/reporting state |
| `platform.tickets.v1` | `tickets.record.reopened` | Ticket command | Resume operational handling |
| `platform.tickets.v1` | `tickets.comment.created` | Ticket command | Refresh ticket timeline |
| `platform.tickets.v1` | `tickets.sla.*` | Ticket/SLA worker | Record clock/breach/escalation/resolution projections |
| `platform.tickets.v1` | `tickets.sla_policy.archived` | Ticket command | Reflect approved policy archive |
| `platform.tickets.v1` | `tickets.record.paused` | Ticket command | Freeze applicable SLA clock |
| `platform.tickets.v1` | `tickets.record.resumed` | Ticket command | Resume applicable SLA clock |
| `platform.policy.v1` | `policy.approval.decided` | Approval service | Continue exact digest-bound operation once |

Commerce/order and Shipping branches may already contain additional concrete
events. When those contracts are merged, this catalog must be updated to the exact
stable names rather than inventing aliases in downstream modules.

## Required future event families

The following names describe required semantic contracts for planning. Final exact
names must match implementation and be added/versioned in `@platform/contracts`.
Do not build consumers against a planning-only name before its contract exists.

### Identity / Organization

Required semantics include:

- organization created/profile changed;
- invitation created/accepted/revoked;
- membership added/changed/suspended/removed;
- role/permission assignment changed;
- onboarding/configuration readiness changed.

### Commerce / Orders

Required semantics include:

- order created/changed;
- confirmation requested/confirmed/rejected/timed out;
- duplicate candidate/review resolved;
- order modification applied/rejected;
- order cancelled;
- payment state changed;
- fulfillment state changed;
- readiness-for-shipping changed.

These events must refer to canonical Commerce IDs and may carry bounded provider
mapping references, never provider-native order payloads.

### Shipping

Required semantics include:

- address normalization/validation changed where externally relevant;
- shipment created/queued/provider accepted;
- label/reference available;
- tracking updated;
- delivery attempt recorded;
- delivery failed;
- delivery rescue opened/updated/resolved;
- shipment delivered;
- return-to-sender/terminal state.

### Returns / Refunds

Required semantics include:

- return requested/approved/rejected;
- return item received/inspected;
- return resolution selected/completed;
- exchange requested/fulfilled;
- refund requested/approved/provider queued/completed/failed;
- restock state changed.

Financial events must not imply provider success until canonical committed result
evidence exists.

### Recovery

Required semantics include:

- recovery opportunity created/eligible/suppressed/expired;
- recovery attempt created/sent/failed;
- offer/coupon associated;
- conversion observed;
- recovered order linked;
- recovered value attributed/adjusted.

Attribution events should retain opportunity, conversion/order and method/
confidence references sufficient for ROI without duplicating sensitive data.

### Sales

Required semantics include:

- lead created/qualified/disqualified/assigned;
- opportunity created;
- opportunity stage changed;
- opportunity owner changed;
- activity/task created/completed;
- opportunity won/lost;
- conversion linked to canonical customer/order where applicable.

### Campaigns

Required semantics include:

- campaign created/versioned/scheduled/started/paused/completed;
- audience snapshot frozen;
- recipient eligible/suppressed;
- recipient queued/sent/delivered/read/failed;
- campaign conversion attributed;
- campaign cost/usage finalized or adjusted.

Recipient IDs must be deterministic enough that retries cannot produce duplicate
successful sends.

### Automation

Required semantics include:

- automation draft/version created;
- automation published/disabled;
- run started/completed/failed/cancelled;
- node waiting/retrying/failed;
- approval requested/continued;
- canonical action requested/completed.

Do not publish arbitrary user code as event payload.

### Configuration

Required semantics include:

- business profile changed;
- configuration compiled;
- configuration validation failed/succeeded;
- simulation completed;
- configuration approval requested;
- configuration version published/applied/failed;
- configuration rolled back/superseded.

A published event should identify configuration version and bounded change
metadata, not dump the entire configuration bundle.

### AI / Knowledge

Required semantics include:

- AI route/model selected where operationally useful;
- operator invocation completed/escalated/failed;
- tool proposed/authorized/approval requested/executed/failed;
- evaluation run completed/threshold regressed;
- knowledge ingestion started/completed/failed;
- knowledge source/document version changed.

Raw model prompts/responses must not be placed in general domain events merely for
telemetry.

### Custom Data

Required semantics include:

- custom table/schema version changed;
- record created/updated/deleted;
- import completed/failed.

Event payload must respect field/data sensitivity and row/field permissions.

### Billing / Usage

Usage is primarily represented by canonical usage records. Domain events may
include:

- subscription state changed;
- entitlement changed;
- quota threshold reached;
- billing period closed;
- suspension/resume decision.

Do not use NATS events as the only ledger for billable units.

### Developer Platform

Required semantics include:

- API key created/rotated/revoked;
- outbound webhook subscription created/changed/deleted;
- delivery exhausted/dead-lettered where operationally useful.

Outbound tenant webhooks are generated from canonical versioned domain events;
they are not separate manually authored business-state sources.

## Analytics and ROI consumer rules

Analytics projections may consume stable canonical events and the usage ledger to
calculate:

- support workload/SLA;
- commerce/confirmation/cancellation;
- shipping/delivery rescue;
- returns/refunds;
- recovery/recovered revenue;
- sales pipeline/conversion;
- campaign delivery/conversion/attribution;
- automation outcomes;
- AI usage/cost/autonomy/escalation;
- provider cost and operational health.

Projection consumers must be idempotent and should retain enough source event/
correlation identity to prevent double counting.

## Compatibility

Consumers use event ID/dedupe keys and retain tenant, correlation and causation.

Do not silently rename or repurpose a published event. For incompatible changes,
introduce a new event version and provide a migration/consumer transition plan.
