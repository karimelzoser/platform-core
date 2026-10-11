#!/usr/bin/env sh
set -eu
compose='docker compose -f docker/integration/compose.yml -f docker/preview/compose.yml'

$compose exec -T postgres psql -U platform_migrator -d platform -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT platform.set_request_context(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '33333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333',
  'preview-sales-fixtures'
);

INSERT INTO crm.customers (
  id, tenant_id, display_name, preferred_language, timezone, source, metadata
) VALUES (
  'dddddddd-0000-0000-0000-000000000851',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Sales Preview Customer', 'en', 'Africa/Cairo', 'preview',
  '{"previewFixture":true,"salesFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  status = 'ACTIVE', metadata = EXCLUDED.metadata, updated_at = now();

INSERT INTO sales.pipelines (id, tenant_id, name, status, is_default)
VALUES (
  'dddddddd-0000-0000-0000-000000000852',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Preview sales pipeline', 'ACTIVE', true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, status = 'ACTIVE', is_default = true, updated_at = now();

INSERT INTO sales.stages (
  id, tenant_id, pipeline_id, code, name, category, sort_order,
  default_probability_basis_points, status
) VALUES
  ('dddddddd-0000-0000-0000-000000000853', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'dddddddd-0000-0000-0000-000000000852', 'QUALIFIED', 'Qualified', 'OPEN', 10, 2500, 'ACTIVE'),
  ('dddddddd-0000-0000-0000-000000000854', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'dddddddd-0000-0000-0000-000000000852', 'PROPOSAL', 'Proposal', 'OPEN', 20, 6000, 'ACTIVE'),
  ('dddddddd-0000-0000-0000-000000000855', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'dddddddd-0000-0000-0000-000000000852', 'WON', 'Won', 'WON', 90, 10000, 'ACTIVE'),
  ('dddddddd-0000-0000-0000-000000000856', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'dddddddd-0000-0000-0000-000000000852', 'LOST', 'Lost', 'LOST', 100, 0, 'ACTIVE')
ON CONFLICT (tenant_id, pipeline_id, code) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, sort_order = EXCLUDED.sort_order,
  default_probability_basis_points = EXCLUDED.default_probability_basis_points,
  status = 'ACTIVE', updated_at = now();

INSERT INTO sales.leads (
  id, tenant_id, customer_id, owner_membership_id, status, source,
  qualification_score, qualification_grade, qualification_data
)
SELECT
  'dddddddd-0000-0000-0000-000000000857',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000851',
  membership.id,
  'QUALIFIED', 'preview', 82, 'HIGH',
  '{"previewFixture":true,"budgetConfirmed":true,"intent":"high"}'::jsonb
FROM identity.memberships membership
WHERE membership.tenant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  AND membership.user_id = '33333333-3333-3333-3333-333333333333'
  AND membership.status = 'ACTIVE'
ON CONFLICT (id) DO UPDATE SET
  status = 'QUALIFIED', qualification_score = 82, qualification_grade = 'HIGH',
  qualification_data = EXCLUDED.qualification_data, converted_at = null, updated_at = now();

DELETE FROM sales.opportunities
WHERE tenant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  AND lead_id = 'dddddddd-0000-0000-0000-000000000857'
  AND id <> 'dddddddd-0000-0000-0000-000000000858';

INSERT INTO sales.opportunities (
  id, tenant_id, customer_id, lead_id, pipeline_id, stage_id, owner_membership_id,
  name, status, expected_value_minor, currency, probability_basis_points,
  expected_close_date, metadata
)
SELECT
  'dddddddd-0000-0000-0000-000000000858',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000851',
  'dddddddd-0000-0000-0000-000000000857',
  'dddddddd-0000-0000-0000-000000000852',
  'dddddddd-0000-0000-0000-000000000853',
  membership.id,
  'Preview enterprise opportunity', 'OPEN', 275000, 'EGP', 2500,
  current_date + 14,
  '{"previewFixture":true,"salesFixture":true}'::jsonb
FROM identity.memberships membership
WHERE membership.tenant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  AND membership.user_id = '33333333-3333-3333-3333-333333333333'
  AND membership.status = 'ACTIVE'
ON CONFLICT (id) DO UPDATE SET
  stage_id = 'dddddddd-0000-0000-0000-000000000853',
  status = 'OPEN', probability_basis_points = 2500,
  won_store_id = null, won_order_id = null, closed_at = null, loss_reason = null,
  updated_at = now();

UPDATE sales.leads
SET status = 'CONVERTED', converted_at = coalesce(converted_at, now()), updated_at = now()
WHERE id = 'dddddddd-0000-0000-0000-000000000857';

INSERT INTO sales.activities (
  id, tenant_id, customer_id, lead_id, opportunity_id, assigned_membership_id,
  activity_type, status, title, body, due_at, created_by_user_id
)
SELECT
  'dddddddd-0000-0000-0000-000000000859',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000851',
  'dddddddd-0000-0000-0000-000000000857',
  'dddddddd-0000-0000-0000-000000000858',
  membership.id,
  'FOLLOW_UP', 'OPEN', 'Preview follow-up', 'Review the commercial proposal.',
  now() + interval '1 day', '33333333-3333-3333-3333-333333333333'
FROM identity.memberships membership
WHERE membership.tenant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  AND membership.user_id = '33333333-3333-3333-3333-333333333333'
  AND membership.status = 'ACTIVE'
ON CONFLICT (id) DO UPDATE SET
  status = 'OPEN', completed_at = null, due_at = now() + interval '1 day', updated_at = now();

INSERT INTO commerce.orders (
  id, tenant_id, store_id, customer_id, order_number, status, financial_status,
  fulfillment_status, currency, subtotal_minor, discount_minor, tax_minor,
  shipping_minor, total_minor, source, placed_at, metadata
) VALUES (
  'dddddddd-0000-0000-0000-000000000860',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000851',
  'SALES-PREVIEW-WON-1001', 'CONFIRMED', 'PAID', 'UNFULFILLED', 'EGP',
  275000, 0, 0, 0, 275000, 'preview', now(),
  '{"previewFixture":true,"salesFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id, status = 'CONFIRMED', financial_status = 'PAID',
  currency = 'EGP', total_minor = 275000, metadata = EXCLUDED.metadata, updated_at = now();

COMMIT;
SQL
