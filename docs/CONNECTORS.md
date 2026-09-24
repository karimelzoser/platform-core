# Connector SDK

`@platform/connectors` owns the canonical boundary between provider payloads and platform contracts. A connector supplies a validated manifest, connection validation/health methods, webhook verification, and webhook normalization. Provider-specific JSON must not escape this boundary.

Credentials are received by secret-management infrastructure and referenced through `integrations.secret_references`; ordinary tenant records contain no plaintext provider secret. Initial sync, backfill, incremental sync, and reconciliation run asynchronously and preserve tenant context.

Planned adapter keys: Shopify, WooCommerce, WhatsApp Cloud API, Instagram, Messenger, email, generic shipping, generic payment, and generic REST/webhook.
