#!/usr/bin/env sh
set -eu
compose='docker compose -f docker/integration/compose.yml -f docker/preview/compose.yml'

$compose exec -T postgres psql -U platform_migrator -d platform -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT platform.set_request_context(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '33333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333',
  'preview-shipping-fixtures'
);

INSERT INTO commerce.fulfillments (
  id, tenant_id, store_id, order_id, status, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000001',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000002',
  'IN_PROGRESS', '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO commerce.fulfillment_lines (
  tenant_id, store_id, order_id, fulfillment_id, order_line_id, quantity
) VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000002',
  'eeeeeeee-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000003', 1
)
ON CONFLICT (tenant_id, fulfillment_id, order_line_id) DO UPDATE SET
  order_id = EXCLUDED.order_id,
  quantity = EXCLUDED.quantity;

INSERT INTO shipping.carrier_accounts (
  id, tenant_id, connection_id, carrier_key, account_label, display_name, status, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000002',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '99999999-9999-9999-9999-999999999999',
  'development-api', 'preview-carrier', 'Preview Delivery Carrier', 'ACTIVE',
  '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  connection_id = EXCLUDED.connection_id,
  carrier_key = EXCLUDED.carrier_key,
  account_label = EXCLUDED.account_label,
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO shipping.carrier_services (
  id, tenant_id, carrier_account_id, service_code, name, status,
  domestic, international, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000003',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'eeeeeeee-0000-0000-0000-000000000002',
  'STANDARD', 'Standard Cairo Delivery', 'ACTIVE', true, false,
  '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  service_code = EXCLUDED.service_code,
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  domestic = EXCLUDED.domestic,
  international = EXCLUDED.international,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO shipping.shipments (
  id, tenant_id, store_id, order_id, fulfillment_id, carrier_account_id,
  carrier_service_id, status, tracking_number, tracking_url, destination,
  declared_value_minor, declared_value_currency, estimated_delivery_at,
  shipped_at, last_tracking_at, provider_sync_state, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000004',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000002',
  'eeeeeeee-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000002',
  'eeeeeeee-0000-0000-0000-000000000003',
  'EXCEPTION', 'DEV-PREVIEW-1001', 'https://example.invalid/tracking/DEV-PREVIEW-1001',
  '{"name":"Preview Buyer","line1":"1 Preview Street","city":"Cairo","region":"Cairo","countryCode":"EG","phone":"+201001234567"}'::jsonb,
  250000, 'EGP', now() + interval '1 day', now() - interval '5 hours',
  now() - interval '5 minutes', 'IN_SYNC', '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  tracking_number = EXCLUDED.tracking_number,
  tracking_url = EXCLUDED.tracking_url,
  destination = EXCLUDED.destination,
  declared_value_minor = EXCLUDED.declared_value_minor,
  declared_value_currency = EXCLUDED.declared_value_currency,
  estimated_delivery_at = EXCLUDED.estimated_delivery_at,
  shipped_at = EXCLUDED.shipped_at,
  last_tracking_at = EXCLUDED.last_tracking_at,
  provider_sync_state = EXCLUDED.provider_sync_state,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO shipping.shipment_lines (
  tenant_id, store_id, shipment_id, fulfillment_id, order_line_id, quantity
) VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000004',
  'eeeeeeee-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000003', 1
)
ON CONFLICT (tenant_id, shipment_id, order_line_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO shipping.packages (
  id, tenant_id, store_id, shipment_id, sequence, status, weight_grams,
  tracking_number, tracking_url, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000005',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000004', 1, 'EXCEPTION', 1200,
  'DEV-PREVIEW-1001', 'https://example.invalid/tracking/DEV-PREVIEW-1001',
  '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  weight_grams = EXCLUDED.weight_grams,
  tracking_number = EXCLUDED.tracking_number,
  tracking_url = EXCLUDED.tracking_url,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO shipping.tracking_events (
  id, tenant_id, store_id, shipment_id, package_id, event_type,
  normalized_status, description, location_name, country_code, occurred_at,
  source_type, external_event_id, dedupe_key, data
) VALUES
(
  'eeeeeeee-0000-0000-0000-000000000006',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000004',
  'eeeeeeee-0000-0000-0000-000000000005',
  'IN_TRANSIT', 'IN_TRANSIT', 'Shipment entered the Cairo delivery network',
  'Cairo', 'EG', now() - interval '2 hours', 'INTEGRATION',
  'preview-shipping-in-transit', 'preview-shipping-in-transit',
  '{"previewFixture":true}'::jsonb
),
(
  'eeeeeeee-0000-0000-0000-000000000007',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000004',
  'eeeeeeee-0000-0000-0000-000000000005',
  'DELIVERY_FAILED', 'EXCEPTION', 'Customer could not be reached at the delivery address',
  'Cairo', 'EG', now() - interval '5 minutes', 'INTEGRATION',
  'preview-shipping-failed', 'preview-shipping-failed',
  '{"previewFixture":true,"rawCode":"CUSTOMER_UNREACHABLE"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  event_type = EXCLUDED.event_type,
  normalized_status = EXCLUDED.normalized_status,
  description = EXCLUDED.description,
  location_name = EXCLUDED.location_name,
  country_code = EXCLUDED.country_code,
  occurred_at = EXCLUDED.occurred_at,
  source_type = EXCLUDED.source_type,
  data = EXCLUDED.data;

INSERT INTO shipping.delivery_attempts (
  id, tenant_id, store_id, shipment_id, attempt_number, state,
  attempted_at, next_attempt_at, failure_code, failure_reason, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000008',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000004', 1, 'FAILED',
  now() - interval '5 minutes', now() + interval '4 hours',
  'CUSTOMER_UNREACHABLE', 'Customer could not be reached at the delivery address',
  '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  state = EXCLUDED.state,
  attempted_at = EXCLUDED.attempted_at,
  next_attempt_at = EXCLUDED.next_attempt_at,
  failure_code = EXCLUDED.failure_code,
  failure_reason = EXCLUDED.failure_reason,
  metadata = EXCLUDED.metadata,
  updated_at = now();

DELETE FROM shipping.rescue_cases
WHERE tenant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
  AND shipment_id = 'eeeeeeee-0000-0000-0000-000000000004'::uuid
  AND id <> 'eeeeeeee-0000-0000-0000-000000000009'::uuid;

INSERT INTO shipping.rescue_cases (
  id, tenant_id, store_id, order_id, shipment_id, state, trigger_reason,
  priority, summary, due_at, resolved_at, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000009',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000002',
  'eeeeeeee-0000-0000-0000-000000000004',
  'CONTACT_REQUIRED', 'CUSTOMER_UNREACHABLE', 'HIGH',
  'Contact buyer to verify delivery details and arrange a safe retry.',
  now() + interval '2 hours', null, '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  state = 'CONTACT_REQUIRED',
  trigger_reason = EXCLUDED.trigger_reason,
  priority = EXCLUDED.priority,
  summary = EXCLUDED.summary,
  due_at = EXCLUDED.due_at,
  resolved_at = null,
  metadata = EXCLUDED.metadata,
  updated_at = now();

COMMIT;
SQL
