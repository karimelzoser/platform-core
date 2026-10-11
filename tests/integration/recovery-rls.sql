BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'recovery-rls-a',
  'recovery-rls-a'
);

DO $$
BEGIN
  IF NOT has_schema_privilege(current_user, 'recovery', 'USAGE') THEN
    RAISE EXCEPTION 'Runtime role cannot use recovery schema';
  END IF;
  IF has_table_privilege(current_user, 'recovery.opportunities', 'DELETE')
     OR has_table_privilege(current_user, 'recovery.timeline', 'UPDATE')
     OR has_table_privilege(current_user, 'recovery.timeline', 'DELETE') THEN
    RAISE EXCEPTION 'Runtime role can destructively mutate recovery history';
  END IF;
END;
$$;

INSERT INTO crm.customers (id, tenant_id, display_name)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000651',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Recovery RLS Customer A'
);

UPDATE commerce.orders
SET customer_id = 'aaaaaaaa-0000-0000-0000-000000000651',
    status = 'PENDING',
    financial_status = 'PENDING',
    fulfillment_status = 'UNFULFILLED',
    updated_at = now() - interval '2 hours'
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000505';

INSERT INTO recovery.policies (
  id, tenant_id, store_id, name, status, abandonment_delay_minutes,
  opportunity_ttl_hours, max_attempts, cooldown_minutes, attribution_window_hours,
  channels, max_offer_percent_basis_points, max_offer_amount_minor
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000652',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'Recovery RLS Policy A', 'ACTIVE', 60, 72, 3, 240, 168,
  ARRAY['EMAIL']::text[], 1000, 1000
);

INSERT INTO recovery.opportunities (
  id, tenant_id, store_id, source_order_id, customer_id, policy_id, status,
  potential_value_minor, currency, detected_at, eligible_at, expires_at,
  temporal_workflow_id
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000653',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000505',
  'aaaaaaaa-0000-0000-0000-000000000651',
  'aaaaaaaa-0000-0000-0000-000000000652',
  'ELIGIBLE', 1000, 'EGP', now(), now() - interval '1 hour', now() + interval '71 hours',
  'recovery:rls:tenant-a'
);

INSERT INTO recovery.timeline (
  tenant_id, store_id, opportunity_id, event_type, actor_type, actor_id, data
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000653',
  'recovery.detected', 'USER', '11111111-1111-1111-1111-111111111111',
  '{"fixture":true}'::jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM recovery.opportunities
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000653'
  ) THEN
    RAISE EXCEPTION 'Tenant A cannot read own recovery opportunity';
  END IF;
END;
$$;
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'recovery-rls-b',
  'recovery-rls-b'
);

DO $$
DECLARE affected integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM recovery.policies
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000652'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A recovery policy';
  END IF;
  IF EXISTS (
    SELECT 1 FROM recovery.opportunities
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000653'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A recovery opportunity';
  END IF;
  IF EXISTS (
    SELECT 1 FROM recovery.timeline
    WHERE opportunity_id = 'aaaaaaaa-0000-0000-0000-000000000653'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A recovery timeline';
  END IF;

  UPDATE recovery.opportunities
  SET status = 'CANCELLED', cancelled_at = now()
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000653';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'Tenant B updated Tenant A recovery opportunity';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO recovery.policies (
      tenant_id, store_id, name, status, abandonment_delay_minutes,
      opportunity_ttl_hours, max_attempts, cooldown_minutes, attribution_window_hours,
      channels
    ) VALUES (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'aaaaaaaa-0000-0000-0000-000000000501',
      'Cross-tenant Recovery Policy', 'ACTIVE', 60, 72, 3, 240, 168,
      ARRAY['EMAIL']::text[]
    );
    RAISE EXCEPTION 'Tenant B linked recovery policy to Tenant A store';
  EXCEPTION
    WHEN foreign_key_violation OR insufficient_privilege THEN NULL;
  END;
END;
$$;
COMMIT;
