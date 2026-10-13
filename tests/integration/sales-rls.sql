-- Sales tenant isolation, relationship guards, conversion invariants,
-- terminal-state and append-only evidence.

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'sales-rls-a'
);

INSERT INTO crm.customers (id, tenant_id, display_name)
VALUES ('aaaaaaaa-0000-0000-0000-000000000801', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Sales RLS A')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sales.pipelines (id, tenant_id, name, is_default, created_by_user_id)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000802',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Sales RLS Pipeline A', true,
  '11111111-1111-1111-1111-111111111111'
);
INSERT INTO sales.pipeline_stages (
  id, tenant_id, pipeline_id, name, position, default_probability_bps, terminal_kind
) VALUES
(
  'aaaaaaaa-0000-0000-0000-000000000803',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000802',
  'Open', 1, 2500, 'OPEN'
),
(
  'aaaaaaaa-0000-0000-0000-000000000804',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000802',
  'Won', 2, 10000, 'WON'
),
(
  'aaaaaaaa-0000-0000-0000-000000000805',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000802',
  'Lost', 3, 0, 'LOST'
);
INSERT INTO sales.leads (
  id, tenant_id, customer_id, source, status, score, grade,
  qualified_at, qualification_notes, created_by_user_id
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000806',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000801',
  'rls-test', 'QUALIFIED', 80, 'HOT',
  now(), 'Qualified fixture for opportunity conversion guard',
  '11111111-1111-1111-1111-111111111111'
);
INSERT INTO sales.opportunities (
  id, tenant_id, customer_id, lead_id, pipeline_id, stage_id, name,
  currency_code, expected_value_minor, probability_bps, created_by_user_id
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000807',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000801',
  'aaaaaaaa-0000-0000-0000-000000000806',
  'aaaaaaaa-0000-0000-0000-000000000802',
  'aaaaaaaa-0000-0000-0000-000000000803',
  'RLS opportunity A', 'EGP', 100000, 2500,
  '11111111-1111-1111-1111-111111111111'
);
INSERT INTO sales.opportunity_stage_history (
  tenant_id, opportunity_id, to_stage_id, changed_by_user_id, reason
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000807',
  'aaaaaaaa-0000-0000-0000-000000000803',
  '11111111-1111-1111-1111-111111111111',
  'Fixture creation'
);

DO $$
DECLARE
  new_lead_id uuid := 'aaaaaaaa-0000-0000-0000-000000000808';
BEGIN
  BEGIN
    INSERT INTO sales.opportunities (
      tenant_id, customer_id, pipeline_id, stage_id, name,
      currency_code, expected_value_minor, probability_bps
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-0000-0000-000000000801',
      'aaaaaaaa-0000-0000-0000-000000000802',
      'aaaaaaaa-0000-0000-0000-000000000804',
      'Invalid terminal opportunity', 'EGP', 1, 10000
    );
    RAISE EXCEPTION 'Open opportunity was allowed in WON terminal stage';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Open opportunity was allowed in WON terminal stage' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE sales.opportunity_stage_history SET reason = 'mutated'
    WHERE opportunity_id = 'aaaaaaaa-0000-0000-0000-000000000807';
    RAISE EXCEPTION 'Append-only sales stage history was mutable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Append-only sales stage history was mutable' THEN RAISE; END IF;
  END;

  INSERT INTO sales.leads (
    id, tenant_id, customer_id, source, created_by_user_id
  ) VALUES (
    new_lead_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-0000-0000-000000000801',
    'rls-new-lead-test',
    '11111111-1111-1111-1111-111111111111'
  );

  BEGIN
    INSERT INTO sales.opportunities (
      tenant_id, customer_id, lead_id, pipeline_id, stage_id, name,
      currency_code, expected_value_minor, probability_bps
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-0000-0000-000000000801',
      new_lead_id,
      'aaaaaaaa-0000-0000-0000-000000000802',
      'aaaaaaaa-0000-0000-0000-000000000803',
      'Unqualified lead conversion', 'EGP', 1, 2500
    );
    RAISE EXCEPTION 'NEW sales lead was converted to an opportunity';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'NEW sales lead was converted to an opportunity' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%requires a QUALIFIED lead%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO sales.opportunities (
      tenant_id, customer_id, lead_id, pipeline_id, stage_id, name,
      currency_code, expected_value_minor, probability_bps
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-0000-0000-000000000801',
      'aaaaaaaa-0000-0000-0000-000000000806',
      'aaaaaaaa-0000-0000-0000-000000000802',
      'aaaaaaaa-0000-0000-0000-000000000803',
      'Duplicate qualified lead conversion', 'EGP', 1, 2500
    );
    RAISE EXCEPTION 'Qualified sales lead was converted more than once';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$$;
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'test-subject-b',
  'sales-rls-b'
);

INSERT INTO crm.customers (id, tenant_id, display_name)
VALUES ('bbbbbbbb-0000-0000-0000-000000000801', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Sales RLS B')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM sales.pipelines
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000802';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Tenant B can read Tenant A sales pipeline'; END IF;

  SELECT count(*) INTO visible_count FROM sales.leads
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000806';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Tenant B can read Tenant A sales lead'; END IF;

  SELECT count(*) INTO visible_count FROM sales.opportunities
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000807';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Tenant B can read Tenant A sales opportunity'; END IF;

  BEGIN
    INSERT INTO sales.leads (tenant_id, customer_id, source)
    VALUES (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'aaaaaaaa-0000-0000-0000-000000000801',
      'cross-tenant'
    );
    RAISE EXCEPTION 'Cross-tenant CRM customer was linked to a sales lead';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Cross-tenant CRM customer was linked to a sales lead' THEN RAISE; END IF;
  END;
END;
$$;
COMMIT;
