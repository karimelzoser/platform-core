#!/usr/bin/env sh
set -eu
compose='docker compose -f docker/integration/compose.yml -f docker/preview/compose.yml'
$compose exec -T postgres psql -U platform_migrator -d platform -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

INSERT INTO messaging.templates (
  id, tenant_id, name, locale, channel, body, status, created_by
) VALUES (
  'cccccccc-0000-0000-0000-000000000801',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Preview campaign WhatsApp', 'en', 'WHATSAPP',
  'Preview campaign message from the canonical Messaging template.',
  'ACTIVE', '33333333-3333-3333-3333-333333333333'
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, body = EXCLUDED.body, status = 'ACTIVE', updated_at = now();

INSERT INTO crm.customers (
  id, tenant_id, display_name, preferred_language, timezone, source
) VALUES
  (
    'cccccccc-0000-0000-0000-000000000802',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Preview Campaign Eligible', 'en', 'UTC', 'preview-campaign'
  ),
  (
    'cccccccc-0000-0000-0000-000000000803',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Preview Campaign Suppressed', 'en', 'UTC', 'preview-campaign'
  )
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name, status = 'ACTIVE', updated_at = now();

INSERT INTO crm.contact_points (
  id, tenant_id, customer_id, channel, value_original, normalized_value,
  is_primary, is_verified, status, source, verified_at
) VALUES
  (
    'cccccccc-0000-0000-0000-000000000804',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'cccccccc-0000-0000-0000-000000000802',
    'WHATSAPP', '+201000000021', '+201000000021', true, true, 'ACTIVE',
    'preview-campaign', now()
  ),
  (
    'cccccccc-0000-0000-0000-000000000805',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'cccccccc-0000-0000-0000-000000000803',
    'WHATSAPP', '+201000000022', '+201000000022', true, true, 'ACTIVE',
    'preview-campaign', now()
  )
ON CONFLICT (id) DO UPDATE
SET status = 'ACTIVE', is_verified = true, verified_at = now(), updated_at = now();

-- Verified consent evidence is trusted ingress state. Seed it exactly as the
-- webhook worker would: claimed + PROCESSING, signed/replay-valid, and a
-- worker:webhook:* request subject. Do not bypass the production trigger.
SELECT platform.set_request_context(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '33333333-3333-3333-3333-333333333333',
  'worker:webhook:preview-campaign',
  'preview-campaign-consent'
);

INSERT INTO integrations.webhook_deliveries (
  id, tenant_id, connection_id, provider_delivery_id, event_type,
  signature_valid, replay_valid, headers, payload, dedupe_key, state,
  claimed_by, claimed_at
) VALUES (
  'cccccccc-0000-0000-0000-000000000806',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'aaaaaaaa-2222-2222-2222-222222222222',
  'preview-campaign-consent-001', 'consent.opted_in', true, true,
  '{}'::jsonb, '{"customer":"preview-campaign-eligible"}'::jsonb,
  'preview-campaign-consent-001', 'PROCESSING',
  'preview-campaign-webhook-worker', now()
)
ON CONFLICT (tenant_id, connection_id, dedupe_key) DO UPDATE
SET signature_valid = true,
    replay_valid = true,
    state = 'PROCESSING',
    claimed_by = 'preview-campaign-webhook-worker',
    claimed_at = now(),
    processed_at = null,
    last_error = null;

INSERT INTO crm.communication_consent_evidence (
  id, tenant_id, customer_id, channel, webhook_delivery_id,
  provider_consent_id, occurred_at, metadata
) VALUES (
  'cccccccc-0000-0000-0000-000000000807',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'cccccccc-0000-0000-0000-000000000802',
  'WHATSAPP', 'cccccccc-0000-0000-0000-000000000806',
  'preview-campaign-consent-001', now(), '{"previewOnly":true}'::jsonb
)
ON CONFLICT (webhook_delivery_id) DO NOTHING;

INSERT INTO crm.communication_preferences (
  tenant_id, customer_id, channel, status, source, captured_at, reason, metadata
) VALUES
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'cccccccc-0000-0000-0000-000000000802',
    'WHATSAPP', 'OPTED_IN', 'provider_webhook', now(), 'Preview verified consent',
    '{"evidenceType":"VERIFIED_PROVIDER_WEBHOOK","webhookDeliveryId":"cccccccc-0000-0000-0000-000000000806"}'::jsonb
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'cccccccc-0000-0000-0000-000000000803',
    'WHATSAPP', 'OPTED_OUT', 'preview-customer-request', now(), 'Preview suppression',
    '{}'::jsonb
  )
ON CONFLICT (tenant_id, customer_id, channel) DO UPDATE
SET status = EXCLUDED.status,
    source = EXCLUDED.source,
    captured_at = EXCLUDED.captured_at,
    reason = EXCLUDED.reason,
    metadata = EXCLUDED.metadata,
    suppressed_until = null,
    updated_at = now();

UPDATE integrations.webhook_deliveries
SET state = 'PROCESSED', processed_at = now(), updated_at = now()
WHERE id = 'cccccccc-0000-0000-0000-000000000806';

COMMIT;
SQL
