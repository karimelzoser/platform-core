# Connector SDK

`@platform/connectors` owns the canonical boundary between provider payloads and platform contracts. A connector supplies a validated manifest, connection validation/health methods, webhook verification, and webhook normalization. Provider-specific JSON must not escape this boundary.

Credentials are received by secret-management infrastructure and referenced through `integrations.secret_references`; ordinary tenant records contain no plaintext provider secret. Initial sync, backfill, incremental sync, and reconciliation run asynchronously and preserve tenant context.

Connection list, connect, and disconnect APIs are tenant-scoped. Connect and
disconnect are HIGH-risk, idempotent commands that require `integrations.manage`,
OPA authorization, and—when policy requires it—digest-bound approval evidence.
Connection validation runs before the database transaction. The transaction then
records only the opaque secret reference, audit entry, and outbox event.

`development-web-chat` is an opt-in disposable-preview/test emulator. It signs
fixture webhooks, produces deterministic provider-message IDs for idempotent
retries, and makes no provider network calls. It is never registered in a
production runtime and is enabled only with
`ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES=true` outside production.

Planned adapter keys: Shopify, WooCommerce, WhatsApp Cloud API, Instagram, Messenger, email, generic shipping, generic payment, and generic REST/webhook.
