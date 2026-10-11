-- Sales tenant isolation, relationship and append-only evidence.

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'sales-rls-a'
);

INSERT INTO crm.customers (id, tenant_id, display_name, status)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000801',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Sales RLS Customer A',
  'ACTIVE'
);

INSERT INTO sales.pipelines (id, tenant_id, name, is_default)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000802',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Sales RLS Pipeline',
  true
);
INSERT INTO sales.stages (
  id, tenant_id, pipeline_id, code, name, category, sort_order, default_probability_basis_points
) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000803', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-0000-0000-000000000802', 'NEW', 'New', 'OPEN', 10, 1000),
  ('aaaaaaaa-0000-0000-0000-000000000804', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-0000-0000-000000000802', 'WON', 'Won', 'WON', 90, 10000),
  ('aaaaaaaa-0000-0000-0000-000000000805', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-0000-0000-000000000802', 'LOST', 'Lost', 'LOST', 100, 0);

INSERT INTO sales.leads (
  id, tenant_id, customer_id, owner_membership_id, status, source,
  qualification_score, qualification_grade
)
SELECT
  'aaaaaaaa-0000-0000-0000-000000000806',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000801',
  membership.id,
  'QUALIFIED',
  'rls-test',
  80,
  'HIGH'
FROM identity.memberships membership
WHERE membership.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND membership.user_id = '11111111-1111-1111-1111-111111111111'
  AND membership.status = 'ACTIVE';

INSERT INTO sales.opportunities (
  id, tenant_id, customer_id, lead_id, pipeline_id, stage_id, name,
  expected_value_minor, currency, probability_basis_points
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000807',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000801',
  'aaaaaaaa-0000-0000-0000-000000000806',
  'aaaaaaaa-0000-0000-0000-000000000802',
  'aaaaaaaa-0000-0000-0000-000000000803',
  'RLS opportunity',
  125000,
  'EGP',
  1000
);

INSERT INTO sales.activities (
  id, tenant_id, customer_id, lead_id, opportunity_id, activity_type, status, title
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000808',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000801',
  'aaaaaaaa-0000-0000-0000-000000000806',
  'aaaaaaaa-0000-0000-0000-000000000807',
  'FOLLOW_UP',
  'OPEN',
  'Sales RLS follow-up'
);
INSERT INTO sales.timeline (
  tenant_id, customer_id, lead_id, opportunity_id, event_type, actor_type, actor_id, data
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000801',
  'aaaaaaaa-0000-0000-0000-000000000806',
  'aaaaaaaa-0000-0000-0000-000000000807',
  'sales.rls_fixture_created',
  'USER',
  '11111111-1111-1111-1111-111111111111',
  '{}'::jsonb
);
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'test-subject-b',
  'sales-rls-b'
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sales.pipelines WHERE id = 'aaaaaaaa-0000-0000-0000-000000000802') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A sales pipeline';
  END IF;
  IF EXISTS (SELECT 1 FROM sales.leads WHERE id = 'aaaaaaaa-0000-0000-0000-000000000806') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A sales lead';
  END IF;
  IF EXISTS (SELECT 1 FROM sales.opportunities WHERE id = 'aaaaaaaa-0000-0000-0000-000000000807') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A sales opportunity';
  END IF;
  IF EXISTS (SELECT 1 FROM sales.activities WHERE id = 'aaaaaaaa-0000-0000-0000-000000000808') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A sales activity';
  END IF;
END;
$$;
ROLLBACK;

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'sales-relationship-guards'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO sales.leads (tenant_id, customer_id, status, source)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-0000-0000-0000-000000000801',
      'NEW',
      'cross-tenant-test'
    );
    RAISE EXCEPTION 'Cross-tenant customer reference was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END;
$$;

DO $$
DECLARE tenant_b_membership uuid;
BEGIN
  SELECT id INTO tenant_b_membership
  FROM identity.memberships
  WHERE tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    AND user_id = '22222222-2222-2222-2222-222222222222';
  BEGIN
    UPDATE sales.leads
    SET owner_membership_id = tenant_b_membership
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000806';
    RAISE EXCEPTION 'Cross-tenant sales assignee was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO sales.opportunities (
      tenant_id, customer_id, lead_id, pipeline_id, stage_id, name,
      expected_value_minor, currency, probability_basis_points
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-0000-0000-000000000801',
      'aaaaaaaa-0000-0000-0000-000000000806',
      'aaaaaaaa-0000-0000-0000-000000000802',
      'aaaaaaaa-0000-0000-0000-000000000803',
      'Duplicate lead conversion',
      100,
      'EGP',
      1000
    );
    RAISE EXCEPTION 'Lead was converted into more than one opportunity';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    UPDATE sales.timeline SET event_type = 'sales.tampered'
    WHERE opportunity_id = 'aaaaaaaa-0000-0000-0000-000000000807';
    RAISE EXCEPTION 'Sales timeline allowed mutation';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
ROLLBACK;
