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

INSERT INTO returns.policies (
  id, tenant_id, store_id, name, status, return_window_days,
  require_inspection, allow_exchange, allow_store_credit, metadata
) VALUES (
  'dddddddd-0000-0000-0000-000000000020',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'Preview standard returns', 'ACTIVE', 30, true, true, true,
  '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  status = 'ACTIVE',
  return_window_days = EXCLUDED.return_window_days,
  require_inspection = EXCLUDED.require_inspection,
  allow_exchange = EXCLUDED.allow_exchange,
  allow_store_credit = EXCLUDED.allow_store_credit,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.orders (
  id, tenant_id, store_id, order_number, status, financial_status,
  fulfillment_status, currency, subtotal_minor, discount_minor, tax_minor,
  shipping_minor, total_minor, source, placed_at, metadata, customer_email,
  customer_phone, note
) VALUES (
  'dddddddd-0000-0000-0000-000000000021',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'RETURN-PREVIEW-1001', 'CONFIRMED', 'PAID', 'FULFILLED', 'EGP',
  180000, 0, 0, 0, 180000, 'development-shopify-public-app',
  now() - interval '1 day', '{"previewFixture":true,"returnsFixture":true}'::jsonb,
  'return-preview@example.test', '+201009999999', 'Returns browser acceptance fixture'
)
ON CONFLICT (id) DO UPDATE SET
  status = 'CONFIRMED',
  financial_status = 'PAID',
  fulfillment_status = 'FULFILLED',
  placed_at = now() - interval '1 day',
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.order_lines (
  id, tenant_id, store_id, order_id, sku, title, quantity,
  unit_price_minor, discount_minor, tax_minor, total_minor, metadata
) VALUES (
  'dddddddd-0000-0000-0000-000000000022',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000021',
  'RETURN-PREVIEW-SKU', 'Return preview item', 2,
  90000, 0, 0, 180000, '{"previewFixture":true,"returnsFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  quantity = EXCLUDED.quantity,
  unit_price_minor = EXCLUDED.unit_price_minor,
  total_minor = EXCLUDED.total_minor,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.payments (
  id, tenant_id, store_id, order_id, kind, status, amount_minor,
  currency, payment_method_type, processed_at, metadata
) VALUES (
  'dddddddd-0000-0000-0000-000000000023',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000021',
  'SALE', 'CAPTURED', 180000, 'EGP', 'preview-card',
  now() - interval '1 day', '{"previewFixture":true,"returnsFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  status = 'CAPTURED',
  amount_minor = 180000,
  processed_at = now() - interval '1 day',
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.provider_mappings (
  id, tenant_id, store_id, connection_id, entity_type, canonical_id,
  external_id, state, metadata
) VALUES
(
  'dddddddd-0000-0000-0000-000000000024',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'bbbbbbbb-6666-6666-6666-666666666666',
  'ORDER', 'dddddddd-0000-0000-0000-000000000021',
  'preview-return-order-1001', 'ACTIVE', '{"previewFixture":true,"returnsFixture":true}'::jsonb
),
(
  'dddddddd-0000-0000-0000-000000000025',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'bbbbbbbb-6666-6666-6666-666666666666',
  'PAYMENT', 'dddddddd-0000-0000-0000-000000000023',
  'preview-return-payment-1001', 'ACTIVE', '{"previewFixture":true,"returnsFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  connection_id = EXCLUDED.connection_id,
  external_id = EXCLUDED.external_id,
  state = 'ACTIVE',
  metadata = EXCLUDED.metadata,
  updated_at = now();

COMMIT;
SQL
