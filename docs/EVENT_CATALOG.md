# Event Catalog

All events are versioned envelopes stored in `platform.outbox_events` inside the same transaction as domain changes and audit records. Publication begins only after commit.

The worker claims at most 100 pending events through a narrowly scoped database function using `FOR UPDATE SKIP LOCKED`. A claim is leased, publish acknowledgement requires the same worker ID, and bounded failures use exponential backoff before producing a tenant-attributed dead letter.

| Subject                    | Event                                   | Producer            | Consumer behavior                                              |
| -------------------------- | --------------------------------------- | ------------------- | -------------------------------------------------------------- |
| `platform.identity.v1`     | `identity.membership.changed`           | Identity module     | Recompute effective permission projections idempotently        |
| `platform.crm.v1`          | `crm.customer.created`                  | Customer 360        | Refresh search, segments, and timeline projections             |
| `platform.crm.v1`          | `crm.tag.created`                       | Customer 360        | Refresh tenant tag catalog                                     |
| `platform.crm.v1`          | `crm.customer.tag.assigned`             | Customer 360        | Refresh customer profile and segment projections               |
| `platform.crm.v1`          | `crm.customer.communication.suppressed` | Customer 360        | Stop outbound channel activity and refresh consent projections |
| `platform.crm.v1`          | `crm.customer.merged`                   | Customer 360        | Repoint projections and re-evaluate customer segments          |
| `platform.crm.v1`          | `crm.customer.changed`                  | Customer 360        | Refresh search, segments, and timeline projections             |
| `platform.integrations.v1` | `integration.webhook.received`          | Webhook ingress     | Normalize asynchronously from persisted delivery               |
| `platform.integrations.v1` | `integration.sync.requested`            | Integration command | Start deterministic Temporal sync workflow                     |
| `platform.policy.v1`       | `policy.approval.decided`               | Approval service    | Verify digest then execute once or record failure              |

The canonical wire format is defined by `@platform/contracts`. Consumers must use event ID/dedupe keys and retain tenant, correlation, and causation identifiers.
