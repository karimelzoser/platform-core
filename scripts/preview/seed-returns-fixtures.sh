#!/usr/bin/env sh
set -eu
compose='docker compose -f docker/integration/compose.yml -f docker/preview/compose.yml'

$compose exec -T postgres psql -U platform_migrator -d platform -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT platform.set_request_context(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '33333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333',
  'preview-returns-fixtures'
);

INSERT INTO commerce.products (
  id, tenant_id, store_id, title, description, status, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000001',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'Preview return product', 'Disposable preview fixture for return acceptance.',
  'ACTIVE', '{"previewFixture":true,"returnsFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.variants (
  id, tenant_id, store_id, product_id, title, sku, status,
  track_inventory, price_minor, currency, metadata
) VALUES
(
  'eeeeeeee-0000-0000-0000-000000000002',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000001',
  'Original', 'PREVIEW-RETURN-ORIGINAL', 'ACTIVE', true, 125000, 'EGP',
  '{"previewFixture":true,"returnsFixture":true}'::jsonb
),
(
  'eeeeeeee-0000-0000-0000-000000000003',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000001',
  'Replacement', 'PREVIEW-RETURN-REPLACEMENT', 'ACTIVE', true, 125000, 'EGP',
  '{"previewFixture":true,"returnsFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  sku = EXCLUDED.sku,
  status = EXCLUDED.status,
  price_minor = EXCLUDED.price_minor,
  currency = EXCLUDED.currency,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.inventory_locations (
  id, tenant_id, store_id, name, status, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000004',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'Preview returns warehouse', 'ACTIVE',
  '{"previewFixture":true,"returnsFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.inventory_levels (
  tenant_id, store_id, location_id, variant_id, on_hand, committed, incoming, metadata
) VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000004',
  'eeeeeeee-0000-0000-0000-000000000002',
  10, 0, 0, '{"previewFixture":true,"returnsFixture":true}'::jsonb
)
ON CONFLICT (tenant_id, location_id, variant_id) DO UPDATE SET
  on_hand = 10,
  committed = 0,
  incoming = 0,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.orders (
  id, tenant_id, store_id, order_number, status, financial_status, fulfillment_status,
  currency, subtotal_minor, discount_minor, tax_minor, shipping_minor, total_minor,
  source, placed_at, metadata, customer_email, customer_phone, note
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000005',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'PREVIEW-RETURN-1001', 'CONFIRMED', 'PAID', 'FULFILLED', 'EGP',
  250000, 0, 0, 0, 250000, 'development-shopify-public-app',
  now() - interval '2 days',
  '{"previewFixture":true,"returnsFixture":true}'::jsonb,
  'returns-buyer@example.test', '+201009876543', 'Preview fulfilled return fixture'
)
ON CONFLICT (id) DO UPDATE SET
  status = 'CONFIRMED',
  financial_status = 'PAID',
  fulfillment_status = 'FULFILLED',
  placed_at = now() - interval '2 days',
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.order_lines (
  id, tenant_id, store_id, order_id, product_id, variant_id, sku, title,
  quantity, unit_price_minor, discount_minor, tax_minor, total_minor, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000006',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000005',
  'eeeeeeee-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000002',
  'PREVIEW-RETURN-ORIGINAL', 'Preview return product', 2,
  125000, 0, 0, 250000, '{"previewFixture":true,"returnsFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  quantity = 2,
  unit_price_minor = 125000,
  total_minor = 250000,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.payments (
  id, tenant_id, store_id, order_id, kind, status, amount_minor, currency,
  payment_method_type, processed_at, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000007',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000005',
  'SALE', 'CAPTURED', 250000, 'EGP', 'card', now() - interval '2 days',
  '{"previewFixture":true,"returnsFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  status = 'CAPTURED',
  amount_minor = 250000,
  processed_at = now() - interval '2 days',
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.fulfillments (
  id, tenant_id, store_id, order_id, status, fulfilled_at, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000008',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000005',
  'FULFILLED', now() - interval '1 day',
  '{"previewFixture":true,"returnsFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  status = 'FULFILLED',
  fulfilled_at = now() - interval '1 day',
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.fulfillment_lines (
  tenant_id, store_id, fulfillment_id, order_line_id, quantity
) VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000008',
  'eeeeeeee-0000-0000-0000-000000000006',
  2
)
ON CONFLICT (tenant_id, fulfillment_id, order_line_id) DO UPDATE SET quantity = 2;

INSERT INTO commerce.provider_mappings (
  id, tenant_id, store_id, connection_id, entity_type, canonical_id,
  external_id, state, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000009',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'bbbbbbbb-6666-6666-6666-666666666666',
  'ORDER', 'eeeeeeee-0000-0000-0000-000000000005',
  'preview-shopify-return-order-1001', 'ACTIVE',
  '{"previewFixture":true,"returnsFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  connection_id = EXCLUDED.connection_id,
  external_id = EXCLUDED.external_id,
  state = 'ACTIVE',
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO returns.policies (
  id, tenant_id, store_id, name, status, return_window_days,
  require_fulfilled, allow_exchanges, require_inspection, allow_restock, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000010',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'Preview return policy', 'ACTIVE', 30, true, true, true, true,
  '{"previewFixture":true,"returnsFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  status = 'ACTIVE',
  return_window_days = 30,
  require_fulfilled = true,
  allow_exchanges = true,
  require_inspection = true,
  allow_restock = true,
  metadata = EXCLUDED.metadata,
  updated_at = now();

COMMIT;
SQL
