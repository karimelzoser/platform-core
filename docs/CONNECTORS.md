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

Provider actions follow the same durable model. The API accepts only a typed
action which the selected connector explicitly allowlists, writes the action
with audit/outbox evidence, and returns `QUEUED`. A leased worker resolves the
tenant-scoped route, invokes the connector only after commit, then records a
bounded provider action identifier/result. Retryable failures use capped
backoff; non-retryable or eighth failures are dead-lettered. This boundary does
not accept arbitrary URLs or executable provider payloads.

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

The repository provides opt-in disposable-preview/test fixtures for Web Chat,
generic API, Email, Meta Embedded Signup/account discovery, WhatsApp Cloud API,
Instagram Messaging, Messenger Platform, Shopify Public App, and WooCommerce.
They are contract emulators only: they make no provider network calls and are
never registered when `APP_ENV=production`. Registration additionally requires
`ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES=true`.

The messaging fixtures sign development webhooks, normalize bounded inbound and
delivery events, and preserve deterministic provider-message IDs for idempotent
retries. The WhatsApp, Instagram, and Messenger fixtures model Meta's
`x-hub-signature-256` convention. The Email fixture uses an isolated development
HMAC header, validates recipient addresses, and rejects attachment transport
until the production-capable media contract is implemented.

The Meta Embedded Signup fixture models deterministic Meta Business, WABA, phone,
Facebook Page, and Instagram Business assets without pretending to implement the
real OAuth/Embedded Signup browser exchange. The Shopify fixture models the
public-app boundary with configurable API-version settings, Shopify-shaped HMAC
verification, topic/delivery identity, asset discovery, reconciliation, webhook
subscription, and an explicitly development-only typed action. The WooCommerce
fixture similarly models WooCommerce webhook signatures, store discovery, sync,
subscription, reconciliation, and typed action boundaries. Real provider OAuth,
GraphQL/REST network adapters, production credentials, rate-limit behavior, and
provider certification remain production-deployment concerns and are not faked
by these fixtures.

Their contract tests cover signature verification where applicable, bounded
normalization, connection validation, asset discovery, cursor-bearing sync and
reconciliation, deterministic webhook subscriptions, outbound messaging, and
explicitly allowlisted development-only actions. Fixture actions are not
commerce, payment, or production messaging implementations.

`providerBoundaries` is the explicit, test-covered allowlist for Meta Embedded
Signup, WhatsApp, Instagram, Messenger, Email, Web Chat, API, Shopify Public App,
and WooCommerce. Every listed boundary is now represented by a deterministic
`DEVELOPMENT_FIXTURE`; that state still does **not** claim a production provider
adapter or permit provider calls.
