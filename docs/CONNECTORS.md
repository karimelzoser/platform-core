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

Webhook registration and unregistration follow the same desired-state model.
The protected API accepts only a public HTTPS callback URL, records a
tenant-scoped subscription request with audit/outbox evidence, and a leased
worker invokes the typed connector after commit. Connector results store only a
bounded provider subscription identifier. Retry failures do not expose provider
responses or credential references; terminal failures create a dead letter.

Connectors classify provider failures into a bounded error code and a retryable
flag. Worker persistence and dead letters contain that code rather than a raw
provider exception; non-retryable errors terminate safely on their first claim.
A retryable rate-limit error may provide a bounded retry-after interval; workers
use the longer of that interval and exponential backoff.

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

`development-web-chat` and `development-api` are opt-in disposable-preview/test
emulators. They sign fixture webhooks, produce deterministic provider-message
IDs for idempotent retries, accept the typed sync contract with an empty
completed result, and make no provider network calls. They are never registered in a
production runtime and are enabled only with
`ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES=true` outside production.

Planned adapter keys: Shopify, WooCommerce, WhatsApp Cloud API, Instagram, Messenger, email, generic shipping, generic payment, and generic REST/webhook.
