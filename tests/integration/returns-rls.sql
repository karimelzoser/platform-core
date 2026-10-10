BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'returns-rls-a',
  'returns-rls-a'
);

DO $$
BEGIN
  IF NOT has_schema_privilege(current_user, 'returns', 'USAGE') THEN
    RAISE EXCEPTION 'Runtime role cannot use returns schema';
  END IF;
  IF has_table_privilege(current_user, 'returns.requests', 'DELETE')
     OR has_table_privilege(current_user, 'returns.refunds', 'DELETE')
     OR has_table_privilege(current_user, 'returns.timeline', 'UPDATE')
     OR has_table_privilege(current_user, 'returns.timeline', 'DELETE') THEN
    RAISE EXCEPTION 'Runtime role can destructively mutate returns history';
  END IF;
END;
$$;

UPDATE commerce.orders
SET status = 'CONFIRMED', placed_at = now()
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000505';

INSERT INTO returns.policies (
  id, tenant_id, store_id, name, status, return_window_days
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000901',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'Returns RLS Policy A',
  'ACTIVE',
  30
);

INSERT INTO returns.requests (
  id, tenant_id, store_id, order_id, policy_id, kind, reason_code,
  requested_by_actor_type, requested_by_actor_id
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000902',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000505',
  'aaaaaaaa-0000-0000-0000-000000000901',
  'RETURN',
  'DAMAGED',
  'USER',
  '11111111-1111-1111-1111-111111111111'
);

INSERT INTO returns.request_lines (
  id, tenant_id, store_id, request_id, order_line_id, requested_quantity,
  received_quantity, accepted_quantity, inspection_status, restock_disposition,
  eligible_refund_minor
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000903',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000902',
  'aaaaaaaa-0000-0000-0000-000000000506',
  1, 0, 0, 'PENDING', 'PENDING', 1000
);

INSERT INTO returns.timeline (
  tenant_id, store_id, request_id, event_type, actor_type, actor_id, data
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000902',
  'returns.request.created',
  'USER',
  '11111111-1111-1111-1111-111111111111',
  '{"fixture":true}'::jsonb
);
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'returns-rls-b',
  'returns-rls-b'
);

DO $$
DECLARE affected integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM returns.policies
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000901'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A return policy';
  END IF;
  IF EXISTS (
    SELECT 1 FROM returns.requests
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000902'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A return request';
  END IF;
  IF EXISTS (
    SELECT 1 FROM returns.request_lines
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000903'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A return line';
  END IF;
  IF EXISTS (
    SELECT 1 FROM returns.timeline
    WHERE request_id = 'aaaaaaaa-0000-0000-0000-000000000902'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A return timeline';
  END IF;

  UPDATE returns.requests
  SET internal_note = 'cross tenant mutation'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000902';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'Tenant B updated Tenant A return request';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO returns.policies (tenant_id, store_id, name, return_window_days)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-0000-0000-000000000501',
      'Cross tenant policy',
      30
    );
    RAISE EXCEPTION 'Tenant B inserted a Tenant A return policy';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO returns.policies (tenant_id, store_id, name, return_window_days)
    VALUES (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'aaaaaaaa-0000-0000-0000-000000000501',
      'Cross tenant relationship policy',
      30
    );
    RAISE EXCEPTION 'Tenant B linked a policy to Tenant A store';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END;
$$;
COMMIT;
