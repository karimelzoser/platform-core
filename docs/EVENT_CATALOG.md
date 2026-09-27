# Event Catalog

All events are versioned envelopes stored in `platform.outbox_events` inside the same transaction as domain changes and audit records. Publication begins only after commit.

The worker claims at most 100 pending events through a narrowly scoped database function using `FOR UPDATE SKIP LOCKED`. A claim is leased, publish acknowledgement requires the same worker ID, and bounded failures use exponential backoff before producing a tenant-attributed dead letter.

| Subject                    | Event                                   | Producer            | Consumer behavior                                              |
| -------------------------- | --------------------------------------- | ------------------- | -------------------------------------------------------------- |
| `platform.identity.v1`     | `identity.membership.changed`           | Identity module     | Recompute effective permission projections idempotently        |
| `platform.crm.v1`          | `crm.customer.created`                  | Customer 360        | Refresh search, segments, and timeline projections             |
| `platform.crm.v1`          | `crm.tag.created`                       | Customer 360        | Refresh tenant tag catalog                                     |
| `platform.crm.v1`          | `crm.customer.tag.assigned`             | Customer 360        | Refresh customer profile and segment projections               |
| `platform.crm.v1`          | `crm.customer.tag.bulk_assigned`        | Customer 360        | Refresh tagged customer profiles and segment projections       |
| `platform.crm.v1`          | `crm.customer.communication.suppressed` | Customer 360        | Stop outbound channel activity and refresh consent projections |
| `platform.crm.v1`          | `crm.customer.merged`                   | Customer 360        | Repoint projections and re-evaluate customer segments          |
| `platform.crm.v1`          | `crm.customer.changed`                  | Customer 360        | Refresh search, segments, and timeline projections             |
| `platform.integrations.v1` | `integration.webhook.received`          | Webhook ingress     | Normalize asynchronously from persisted delivery               |
| `platform.integrations.v1` | `integration.sync.requested`            | Integration command | Start deterministic Temporal sync workflow                     |
| `platform.messaging.v1`    | `messaging.message.received`            | Inbound worker      | Refresh tenant inbox after normalized delivery commit          |
| `platform.messaging.v1`    | `messaging.message.dispatch_requested`  | Messaging command   | Claim a committed send with bounded attachment references      |
| `platform.messaging.v1`    | `messaging.message.sent`                | Outbound worker     | Refresh inbox after provider accepts an idempotent send        |
| `platform.messaging.v1`    | `messaging.message.delivery_updated`    | Webhook worker      | Apply a monotonic provider delivery/read receipt               |
| `platform.messaging.v1`    | `messaging.message.dead_lettered`       | Outbound worker     | Surface a bounded, exhausted provider delivery failure         |
| `platform.messaging.v1`    | `messaging.conversation.assigned`       | Messaging command   | Refresh assignee work queues idempotently                      |
| `platform.messaging.v1`    | `messaging.conversation.handed_over`    | Messaging command   | Refresh AI/human ownership projections                         |
| `platform.messaging.v1`    | `messaging.conversation.closed`         | Messaging command   | Stop active handling and refresh the inbox                     |
| `platform.messaging.v1`    | `messaging.conversation.reopened`       | Messaging command   | Resume active handling and refresh the inbox                   |
| `platform.tickets.v1`      | `tickets.record.created`                | Ticket command      | Create tenant ticket projections                               |
| `platform.tickets.v1`      | `tickets.comment.created`               | Ticket command      | Refresh the ticket timeline idempotently                       |
| `platform.policy.v1`       | `policy.approval.decided`               | Approval service    | Verify digest then execute once or record failure              |

The canonical wire format is defined by `@platform/contracts`. Consumers must use event ID/dedupe keys and retain tenant, correlation, and causation identifiers.
