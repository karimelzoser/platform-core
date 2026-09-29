# Connector SDK

`@platform/connectors` owns the canonical boundary between provider payloads and platform contracts. A connector supplies a validated manifest, connection validation/health methods, webhook verification, and webhook normalization. Provider-specific JSON must not escape this boundary.

Credentials are received by secret-management infrastructure and referenced through `integrations.secret_references`; ordinary tenant records contain no plaintext provider secret. Initial sync, backfill, incremental sync, and reconciliation run asynchronously and preserve tenant context.

Sync requests are idempotent, OPA-authorized tenant commands. They create a
durable `integrations.sync_runs` record and outbox event in the request
transaction. The worker claims one leased run at a time, resolves its
tenant-scoped route, calls the typed connector only after that transaction has
committed, then records a bounded cursor/progress result in a new transaction.
Failures use capped exponential retry; the eighth failure remains terminal and
creates a tenant-scoped dead-letter record. An abandoned worker lease can be
reclaimed safely. No connector receives a database transaction or plaintext
credential.

Connection list, connect, and disconnect APIs are tenant-scoped. Connect and
disconnect are HIGH-risk, idempotent commands that require `integrations.manage`,
OPA authorization, and—when policy requires it—digest-bound approval evidence.
Connection validation runs before the database transaction. The transaction then
records only the opaque secret reference, audit entry, and outbox event.

Secret rotation accepts a replacement opaque reference and key version, validates
it before the transaction, atomically repoints the requested connection, and
revokes the prior reference only when no tenant connection still uses it. Rotation
is CRITICAL, approval-aware, and records a reference fingerprint rather than the
reference itself in the idempotency input.

`development-web-chat` is an opt-in disposable-preview/test emulator. It signs
fixture webhooks, produces deterministic provider-message IDs for idempotent
retries, accepts the typed sync contract with an empty completed result, and
makes no provider network calls. It is never registered in a
production runtime and is enabled only with
`ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES=true` outside production.

Planned adapter keys: Shopify, WooCommerce, WhatsApp Cloud API, Instagram, Messenger, email, generic shipping, generic payment, and generic REST/webhook.
