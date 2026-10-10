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
  IF has_table_privilege(current_user, 'returns.timeline', 'UPDATE')
     OR has_table_privilege(current_user, 'returns.timeline', 'DELETE')
     OR has_table_privilege(current_user, 'returns.restock_movements', 'UPDATE')
     OR has_table_privilege(current_user, 'returns.restock_movements', 'DELETE') THEN
    RAISE EXCEPTION 'Runtime role can destructively mutate append-only returns evidence';
  END IF;
END;
$$;

INSERT INTO returns.policies (
  id, tenant_id, store_id, name, return_window_days, require_fulfilled,
  allow_exchanges, require_inspection, allow_restock
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000601',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'RLS default return policy', 30, true, true, true, true
);

INSERT INTO returns.return_requests (
  id, tenant_id, store_id, order_id, policy_id, reason_code,
  eligibility_snapshot, requested_by_user_id
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000602',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000505',
  'aaaaaaaa-0000-0000-0000-000000000601',
  'DEFECTIVE',
  '{"fixture":true}'::jsonb,
  '11111111-1111-1111-1111-111111111111'
);

INSERT INTO returns.return_lines (
  id, tenant_id, store_id, return_id, order_id, order_line_id, quantity,
  reason_code, requested_resolution, proposed_refund_minor, currency
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000603',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000602',
  'aaaaaaaa-0000-0000-0000-000000000505',
  'aaaaaaaa-0000-0000-0000-000000000506',
  1, 'DEFECTIVE', 'REFUND', 1000, 'EGP'
);

INSERT INTO returns.timeline (tenant_id, return_id, event_type, actor_type, actor_id, data)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000602',
  'returns.request.created', 'USER',
  '11111111-1111-1111-1111-111111111111',
  '{"fixture":true}'::jsonb
);

DO $$
BEGIN
  BEGIN
    INSERT INTO returns.return_lines (
      tenant_id, store_id, return_id, order_id, order_line_id, quantity,
      reason_code, requested_resolution, proposed_refund_minor, currency
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-0000-0000-000000000501',
      'aaaaaaaa-0000-0000-0000-000000000602',
      'aaaaaaaa-0000-0000-0000-000000000505',
      'aaaaaaaa-0000-0000-0000-000000000506',
      1, 'DUPLICATE', 'REFUND', 1000, 'EGP'
    );
    RAISE EXCEPTION 'Cumulative return quantity exceeded purchased quantity';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;
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
    SELECT 1 FROM returns.return_requests
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000602'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A return request';
  END IF;
  IF EXISTS (
    SELECT 1 FROM returns.return_lines
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000603'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A return line';
  END IF;
  IF EXISTS (
    SELECT 1 FROM returns.timeline
    WHERE return_id = 'aaaaaaaa-0000-0000-0000-000000000602'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A return timeline';
  END IF;

  UPDATE returns.return_requests
  SET reason_code = 'TAMPERED'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000602';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'Tenant B updated Tenant A return request';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO returns.return_requests (
      tenant_id, store_id, order_id, reason_code, eligibility_snapshot
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-0000-0000-000000000501',
      'aaaaaaaa-0000-0000-0000-000000000505',
      'CROSS_TENANT', '{}'::jsonb
    );
    RAISE EXCEPTION 'Tenant B inserted Tenant A return request';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'returns-rls-a-refund',
  'returns-rls-a-refund'
);

UPDATE returns.return_requests
SET status = 'RECEIVED', approved_at = now(), received_at = now()
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000602';

INSERT INTO returns.inspections (
  id, tenant_id, return_id, status, inspected_by_user_id, inspected_at
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000604',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000602',
  'COMPLETED',
  '11111111-1111-1111-1111-111111111111', now()
);
INSERT INTO returns.inspection_lines (
  tenant_id, return_id, inspection_id, return_line_id,
  accepted_quantity, rejected_quantity, condition
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000602',
  'aaaaaaaa-0000-0000-0000-000000000604',
  'aaaaaaaa-0000-0000-0000-000000000603',
  1, 0, 'DEFECTIVE'
);
UPDATE returns.return_requests
SET status = 'INSPECTED'
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000602';

DO $$
BEGIN
  BEGIN
    INSERT INTO returns.refunds (
      tenant_id, return_id, order_id, status, amount_minor, currency, reason, approved_at
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-0000-0000-000000000602',
      'aaaaaaaa-0000-0000-0000-000000000505',
      'APPROVED', 1001, 'EGP', 'Over-refund must fail', now()
    );
    RAISE EXCEPTION 'Refund exceeded canonical order total';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    UPDATE returns.timeline SET data = '{"tampered":true}'::jsonb
    WHERE return_id = 'aaaaaaaa-0000-0000-0000-000000000602';
    RAISE EXCEPTION 'Runtime role updated immutable return timeline';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
COMMIT;
