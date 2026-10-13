-- Campaigns tenant isolation, relationship guards, immutable audience evidence and append-only timeline.

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'campaigns-rls-a'
);

UPDATE integrations.connections
SET status = 'CONNECTED', capabilities = '["messaging.outbound"]'::jsonb, updated_at = now()
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';

INSERT INTO messaging.templates (
  id, tenant_id, name, locale, channel, body, status, created_by
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000701',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Campaign RLS Template', 'en', 'WHATSAPP', 'Campaign RLS body', 'ACTIVE',
  '11111111-1111-1111-1111-111111111111'
);

INSERT INTO crm.customers (id, tenant_id, display_name, preferred_language, timezone)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000702',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Campaign RLS Customer', 'en', 'UTC'
);

INSERT INTO crm.contact_points (
  id, tenant_id, customer_id, channel, value_original, normalized_value, is_primary, status
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000703',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000702',
  'WHATSAPP', '+201000000001', '+201000000001', true, 'ACTIVE'
);

INSERT INTO campaigns.campaigns (
  id, tenant_id, name, channel, connection_id, template_id, timezone,
  send_window_start_minute, send_window_end_minute, created_by_user_id
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000704',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Campaign RLS A', 'WHATSAPP',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000701',
  'UTC', 0, 1439,
  '11111111-1111-1111-1111-111111111111'
);

INSERT INTO campaigns.recipients (
  id, tenant_id, campaign_id, customer_id, contact_point_id, destination,
  channel, locale, timezone, consent_status, eligibility, send_identity, delivery_status
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000705',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000704',
  'aaaaaaaa-0000-0000-0000-000000000702',
  'aaaaaaaa-0000-0000-0000-000000000703',
  '+201000000001', 'WHATSAPP', 'en', 'UTC', 'OPTED_IN', 'ELIGIBLE',
  'campaign:rls:a:recipient:1', 'PENDING'
);

INSERT INTO campaigns.timeline (tenant_id, campaign_id, event_type, actor_type, actor_id)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000704',
  'campaign.rls_created', 'USER',
  '11111111-1111-1111-1111-111111111111'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM campaigns.campaigns
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000704'
  ) THEN
    RAISE EXCEPTION 'Tenant A cannot read own campaign';
  END IF;

  BEGIN
    UPDATE campaigns.recipients
    SET destination = '+201099999999'
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000705';
    RAISE EXCEPTION 'Campaign audience snapshot identity was mutable';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Campaign audience snapshot identity was mutable' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE campaigns.timeline SET event_type = 'campaign.changed'
    WHERE campaign_id = 'aaaaaaaa-0000-0000-0000-000000000704';
    RAISE EXCEPTION 'Campaign timeline was mutable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'test-subject-b',
  'campaigns-rls-b'
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM campaigns.campaigns
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000704'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A campaign';
  END IF;
  IF EXISTS (
    SELECT 1 FROM campaigns.recipients
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000705'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A campaign recipient';
  END IF;

  BEGIN
    INSERT INTO campaigns.campaigns (
      tenant_id, name, channel, connection_id, template_id,
      timezone, send_window_start_minute, send_window_end_minute
    ) VALUES (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'Cross tenant campaign', 'WHATSAPP',
      'aaaaaaaa-0000-0000-0000-000000000002',
      'aaaaaaaa-0000-0000-0000-000000000701',
      'UTC', 0, 1439
    );
    RAISE EXCEPTION 'Tenant B linked a campaign to Tenant A resources';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END;
$$;
ROLLBACK;
