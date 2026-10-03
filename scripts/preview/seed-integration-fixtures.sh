#!/usr/bin/env sh
set -eu
compose='docker compose -f docker/integration/compose.yml -f docker/preview/compose.yml'

$compose exec -T postgres psql -U platform_migrator -d platform -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT platform.set_request_context(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '33333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333',
  'preview-integration-fixtures'
);

INSERT INTO integrations.connector_definitions (key, version, category, display_name, manifest)
VALUES
(
  'development-email', '1.0.0', 'EMAIL', 'Development Email',
  '{"key":"development-email","version":"1.0.0","category":"EMAIL","capabilities":["messaging.inbound","messaging.outbound","webhooks","sync"],"credentialSchema":{"type":"development-fixture"},"settingsSchema":{"type":"object","required":["allowDevelopmentFixture"]}}'::jsonb
),
(
  'development-meta-embedded-signup', '1.0.0', 'MESSAGING', 'Development Meta Embedded Signup',
  '{"key":"development-meta-embedded-signup","version":"1.0.0","category":"MESSAGING","capabilities":["connection.onboarding","provider.assets"],"credentialSchema":{"type":"development-fixture"},"settingsSchema":{"type":"object","required":["allowDevelopmentFixture"]}}'::jsonb
),
(
  'development-shopify-public-app', '1.0.0', 'COMMERCE', 'Development Shopify Public App',
  '{"key":"development-shopify-public-app","version":"1.0.0","category":"COMMERCE","capabilities":["connection.onboarding","webhooks","sync","provider.assets","provider.actions"],"credentialSchema":{"type":"development-fixture"},"settingsSchema":{"type":"object","required":["allowDevelopmentFixture","shopDomain"]}}'::jsonb
),
(
  'development-woocommerce', '1.0.0', 'COMMERCE', 'Development WooCommerce',
  '{"key":"development-woocommerce","version":"1.0.0","category":"COMMERCE","capabilities":["webhooks","sync","provider.assets","provider.actions"],"credentialSchema":{"type":"development-fixture"},"settingsSchema":{"type":"object","required":["allowDevelopmentFixture","storeUrl"]}}'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET version = EXCLUDED.version,
    category = EXCLUDED.category,
    display_name = EXCLUDED.display_name,
    manifest = EXCLUDED.manifest,
    enabled = true,
    updated_at = now();

INSERT INTO integrations.secret_references (id, tenant_id, provider, reference, key_version, metadata)
VALUES
(
  'bbbbbbbb-1111-1111-1111-111111111111',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-email',
  'development://email/preview',
  'development-only',
  '{"developmentOnly":true}'::jsonb
),
(
  'bbbbbbbb-3333-3333-3333-333333333333',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-meta-embedded-signup',
  'development://meta-embedded-signup/preview',
  'development-only',
  '{"developmentOnly":true}'::jsonb
),
(
  'bbbbbbbb-5555-5555-5555-555555555555',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-shopify-public-app',
  'development://shopify-public-app/preview',
  'development-only',
  '{"developmentOnly":true}'::jsonb
),
(
  'bbbbbbbb-7777-7777-7777-777777777777',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-woocommerce',
  'development://woocommerce/preview',
  'development-only',
  '{"developmentOnly":true}'::jsonb
)
ON CONFLICT (tenant_id, provider, reference) DO NOTHING;

INSERT INTO integrations.connections (
  id, tenant_id, connector_key, secret_reference_id, display_name, status,
  settings, capabilities, last_validated_at
)
VALUES
(
  'bbbbbbbb-2222-2222-2222-222222222222',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-email',
  'bbbbbbbb-1111-1111-1111-111111111111',
  'Development Email', 'CONNECTED',
  '{"allowDevelopmentFixture":true}'::jsonb,
  '["messaging.inbound","messaging.outbound","webhooks","sync"]'::jsonb,
  now()
),
(
  'bbbbbbbb-4444-4444-4444-444444444444',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-meta-embedded-signup',
  'bbbbbbbb-3333-3333-3333-333333333333',
  'Development Meta Embedded Signup', 'CONNECTED',
  '{"allowDevelopmentFixture":true}'::jsonb,
  '["connection.onboarding","provider.assets"]'::jsonb,
  now()
),
(
  'bbbbbbbb-6666-6666-6666-666666666666',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-shopify-public-app',
  'bbbbbbbb-5555-5555-5555-555555555555',
  'Development Shopify Public App', 'CONNECTED',
  '{"allowDevelopmentFixture":true,"shopDomain":"preview-store.myshopify.com","apiVersion":"2026-10"}'::jsonb,
  '["connection.onboarding","webhooks","sync","provider.assets","provider.actions"]'::jsonb,
  now()
),
(
  'bbbbbbbb-8888-8888-8888-888888888888',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-woocommerce',
  'bbbbbbbb-7777-7777-7777-777777777777',
  'Development WooCommerce', 'CONNECTED',
  '{"allowDevelopmentFixture":true,"storeUrl":"https://shop.example.test"}'::jsonb,
  '["webhooks","sync","provider.assets","provider.actions"]'::jsonb,
  now()
)
ON CONFLICT (id) DO UPDATE
SET connector_key = EXCLUDED.connector_key,
    secret_reference_id = EXCLUDED.secret_reference_id,
    display_name = EXCLUDED.display_name,
    status = EXCLUDED.status,
    settings = EXCLUDED.settings,
    capabilities = EXCLUDED.capabilities,
    last_validated_at = EXCLUDED.last_validated_at,
    updated_at = now();

-- Deterministic canonical order used by the Orders workspace browser acceptance.
INSERT INTO commerce.stores (
  id, tenant_id, name, status, default_currency, timezone, metadata
) VALUES (
  'dddddddd-0000-0000-0000-000000000001',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Preview Commerce Store', 'ACTIVE', 'EGP', 'Africa/Cairo',
  '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  default_currency = EXCLUDED.default_currency,
  timezone = EXCLUDED.timezone,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.orders (
  id, tenant_id, store_id, order_number, status, financial_status,
  fulfillment_status, currency, subtotal_minor, discount_minor, tax_minor,
  shipping_minor, total_minor, source, placed_at, metadata, customer_email,
  customer_phone, note
) VALUES (
  'dddddddd-0000-0000-0000-000000000002',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'PREVIEW-1001', 'PENDING', 'PENDING', 'UNFULFILLED', 'EGP',
  245000, 0, 0, 5000, 250000, 'development-shopify-public-app',
  now() - interval '30 minutes', '{"previewFixture":true}'::jsonb,
  'preview-buyer@example.test', '+201001234567', 'Preview order workflow fixture'
)
ON CONFLICT (id) DO UPDATE SET
  customer_email = EXCLUDED.customer_email,
  customer_phone = EXCLUDED.customer_phone,
  note = EXCLUDED.note,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.order_lines (
  id, tenant_id, store_id, order_id, sku, title, quantity,
  unit_price_minor, discount_minor, tax_minor, total_minor, metadata
) VALUES (
  'dddddddd-0000-0000-0000-000000000003',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000002',
  'PREVIEW-SKU-001', 'Preview operational order', 1,
  245000, 0, 0, 245000, '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  quantity = EXCLUDED.quantity,
  unit_price_minor = EXCLUDED.unit_price_minor,
  total_minor = EXCLUDED.total_minor,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.provider_mappings (
  id, tenant_id, store_id, connection_id, entity_type, canonical_id,
  external_id, state, metadata
) VALUES (
  'dddddddd-0000-0000-0000-000000000004',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'bbbbbbbb-6666-6666-6666-666666666666',
  'ORDER', 'dddddddd-0000-0000-0000-000000000002',
  'preview-shopify-order-1001', 'ACTIVE', '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  connection_id = EXCLUDED.connection_id,
  external_id = EXCLUDED.external_id,
  state = EXCLUDED.state,
  metadata = EXCLUDED.metadata,
  updated_at = now();

COMMIT;
SQL
