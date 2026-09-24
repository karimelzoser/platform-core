# Module Catalog

This is the complete product scope. Individual modules may be implemented in dependency order, but the release candidate requires all release-critical modules.

## 1. Identity / Organization

Existing foundation:

- users
- organizations
- memberships
- permissions
- tenant roles and assignments

Build:

- onboarding
- invitations
- organization selector
- user profile
- custom-role editor
- system-role display
- suspension/member lifecycle
- Keycloak/MFA integration

## 2. CRM / Customer 360

Existing DB foundation:

- customers
- contact points
- canonical identity keys
- external identities
- addresses
- communication preferences
- tags
- segments
- merge history

Build:

- identity resolution service
- duplicate candidate detection
- merge workflow
- customer timeline
- consent/suppression
- import/export
- search
- bulk tagging
- segment evaluation

## 3. Integrations

New DB work begins at migration `0004`.

Entities:

- connector definitions
- tenant connections
- secret references
- provider accounts/assets
- webhook registrations
- inbound webhook deliveries
- sync jobs/cursors
- reconciliation jobs
- provider errors
- connection health

Behavior:

- connect/disconnect
- credential rotation
- health
- webhook lifecycle
- backfill
- incremental sync
- reconciliation
- rate-limit handling

## 4. Messaging / Unified Inbox

Entities:

- channel accounts
- conversations
- participants
- messages
- message parts/media
- provider mappings
- delivery statuses
- assignment
- conversation mode
- handover
- saved replies/templates

Modes:

- AI
- COPILOT
- HUMAN
- PAUSED

Channels:

- WhatsApp
- Instagram
- Messenger
- Email
- Web Chat
- API

## 5. Tickets / SLA

- tickets
- categories
- priorities/statuses
- assignment
- customer/conversation links
- comments/tasks
- SLA policy/clocks/breaches
- escalation

## 6. Commerce

- stores
- products/variants
- inventory locations/levels
- orders/order lines
- discounts/taxes
- payments
- fulfillments
- provider mappings
- order timeline

Operations:

- confirmation
- duplicate detection
- modification
- cancellation
- manual confirmation
- readiness for shipping

## 7. Shipping

- carriers
- carrier connections
- zones
- address/city/district normalization
- carrier location mappings
- shipments/labels
- tracking events
- attempts/failure reasons
- delivery rescue

## 8. Returns / Exchanges / Refunds

- return requests/lines
- exchange lines
- inspection
- approval
- refund
- restocking
- provider/payment execution
- approval/audit

## 9. Recovery

- opportunity
- abandoned cart/checkout/order context
- eligibility
- attempts
- channel/message
- coupon/code
- recovered order
- attribution/value
- suppression

## 10. Sales

- leads
- sources
- qualification
- assignment
- pipelines/stages
- opportunities
- activity/notes/tasks
- expected value
- conversion

## 11. Campaigns

- campaigns/channels
- audiences/snapshots
- suppression
- template/creative reference
- scheduling
- batches/sends
- failures
- cost
- conversion/attribution

Retries must never duplicate successful sends.

## 12. Automation Studio

- definitions/versions
- draft/published
- triggers
- conditions
- typed action graph
- runs/node executions
- retries/cancellation
- connector/secret refs
- audit
- Temporal-backed durability for long-running flows

Do not build a general untrusted code-execution platform.

## 13. AI

- providers
- model catalog
- routing
- operators
- prompt versions
- tool registry
- model requests
- tool calls
- usage/cost
- traces
- eval datasets/results
- safety outcomes
- human escalation

## 14. Policy / Approvals

- approval requests
- decisions
- risk overrides
- tenant policy settings
- OPA integration
- approval inbox

## 15. Knowledge

- knowledge bases
- sources
- documents
- chunks
- embeddings
- ingestion runs
- freshness
- access scope
- citations
- pgvector retrieval

## 16. Custom Data

Spreadsheet-like tenant data:

- tables
- fields
- records
- field types
- validation
- row/field permissions
- imports/exports
- indexes
- API actions

No arbitrary SQL from users.

## 17. Analytics

Dashboards:

- business/executive
- support
- sales
- commerce
- shipping
- recovery
- campaigns
- AI
- operations
- automation
- provider cost
- ROI

Use aggregates/materialization when raw operational queries become expensive.

## 18. Billing / Metering

- plans
- subscriptions
- entitlements
- usage meters/records
- provider cost
- billing periods
- invoices/reference
- limits/overages
- trial
- suspension hooks

Keep payment provider abstract until commercial provider decision.

## 19. Developer Platform

- API keys/scopes
- outbound webhooks
- delivery attempts
- API docs
- rate limits
- audit

## 20. Platform Admin

- tenant lookup/health
- connector health
- workflow health
- dead letters
- failed webhooks
- stuck outbox
- usage/AI spend
- safe support tooling
