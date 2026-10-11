#!/usr/bin/env sh
set -eu
compose='docker compose -f docker/integration/compose.yml -f docker/preview/compose.yml'

$compose exec -T postgres psql -U platform_migrator -d platform -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT platform.set_request_context(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '33333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333',
  'preview-recovery-fixtures'
);

INSERT INTO crm.customers (
  id, tenant_id, display_name, preferred_language, timezone, source, metadata
) VALUES (
  'dddddddd-0000-0000-0000-000000000031',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Recovery Preview Customer', 'en', 'Africa/Cairo', 'preview',
  '{"previewFixture":true,"recoveryFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  status = 'ACTIVE',
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO crm.communication_preferences (
  tenant_id, customer_id, channel, status, source, captured_at, suppressed_until, reason, metadata
) VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000031',
  'WHATSAPP', 'UNKNOWN', 'preview-fixture', null, null,
  'Awaiting signed development consent webhook',
  '{"previewFixture":true}'::jsonb
)
ON CONFLICT (tenant_id, customer_id, channel) DO NOTHING;

INSERT INTO commerce.orders (
  id, tenant_id, store_id, customer_id, order_number, status, financial_status,
  fulfillment_status, currency, subtotal_minor, discount_minor, tax_minor,
  shipping_minor, total_minor, source, metadata, updated_at
) VALUES (
  'dddddddd-0000-0000-0000-000000000032',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000031',
  'RECOVERY-PREVIEW-1001', 'PENDING', 'PENDING', 'UNFULFILLED', 'EGP',
  125000, 0, 0, 0, 125000, 'development-shopify-public-app',
  '{"previewFixture":true,"recoveryFixture":true}'::jsonb,
  now() - interval '2 hours'
)
ON CONFLICT (id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id,
  status = 'PENDING', financial_status = 'PENDING', fulfillment_status = 'UNFULFILLED',
  total_minor = EXCLUDED.total_minor, metadata = EXCLUDED.metadata,
  updated_at = now() - interval '2 hours';

INSERT INTO messaging.conversations (
  id, tenant_id, customer_id, channel, provider_conversation_id,
  connection_id, status, mode, last_message_at
) VALUES (
  'dddddddd-0000-0000-0000-000000000033',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000031',
  'WHATSAPP', 'preview-recovery-whatsapp',
  'aaaaaaaa-2222-2222-2222-222222222222',
  'OPEN', 'HUMAN', now()
)
ON CONFLICT (id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id,
  channel = EXCLUDED.channel,
  provider_conversation_id = EXCLUDED.provider_conversation_id,
  connection_id = EXCLUDED.connection_id,
  status = 'OPEN', mode = 'HUMAN', updated_at = now();

INSERT INTO recovery.policies (
  id, tenant_id, store_id, name, status, abandonment_delay_minutes,
  opportunity_ttl_hours, max_attempts, cooldown_minutes, attribution_window_hours,
  channels, max_offer_percent_basis_points, max_offer_amount_minor, metadata
) VALUES (
  'dddddddd-0000-0000-0000-000000000034',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'Preview recovery policy', 'ACTIVE', 1, 72, 3, 60, 168,
  ARRAY['WHATSAPP']::text[], 1000, 20000,
  '{"previewFixture":true,"recoveryFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, status = 'ACTIVE', abandonment_delay_minutes = 1,
  opportunity_ttl_hours = 72, max_attempts = 3, cooldown_minutes = 60,
  attribution_window_hours = 168, channels = ARRAY['WHATSAPP']::text[],
  max_offer_percent_basis_points = 1000, max_offer_amount_minor = 20000,
  metadata = EXCLUDED.metadata, updated_at = now();

COMMIT;
SQL
