#!/usr/bin/env sh
set -eu
compose='docker compose -f docker/integration/compose.yml -f docker/preview/compose.yml'

$compose exec -T postgres psql -U platform_migrator -d platform -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT platform.set_request_context(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '33333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333',
  'preview-shipping-routing-fixtures'
);

INSERT INTO shipping.locations (
  id, tenant_id, parent_id, level, country_code, code, name, aliases, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000020',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  NULL,
  'COUNTRY', 'EG', 'EG', 'Egypt', '["مصر"]'::jsonb,
  '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  aliases = EXCLUDED.aliases,
  status = 'ACTIVE',
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO shipping.locations (
  id, tenant_id, parent_id, level, country_code, code, name, aliases, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000021',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'eeeeeeee-0000-0000-0000-000000000020',
  'REGION', 'EG', 'CAIRO-GOV', 'Cairo Governorate', '["Cairo","القاهرة"]'::jsonb,
  '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  parent_id = EXCLUDED.parent_id,
  name = EXCLUDED.name,
  aliases = EXCLUDED.aliases,
  status = 'ACTIVE',
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO shipping.locations (
  id, tenant_id, parent_id, level, country_code, code, name, aliases, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000022',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'eeeeeeee-0000-0000-0000-000000000021',
  'CITY', 'EG', 'CAIRO', 'Cairo', '["القاهرة"]'::jsonb,
  '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  parent_id = EXCLUDED.parent_id,
  name = EXCLUDED.name,
  aliases = EXCLUDED.aliases,
  status = 'ACTIVE',
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO shipping.locations (
  id, tenant_id, parent_id, level, country_code, code, name, aliases, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000023',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'eeeeeeee-0000-0000-0000-000000000022',
  'DISTRICT', 'EG', 'NASR-CITY', 'Nasr City', '["مدينة نصر"]'::jsonb,
  '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  parent_id = EXCLUDED.parent_id,
  name = EXCLUDED.name,
  aliases = EXCLUDED.aliases,
  status = 'ACTIVE',
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO shipping.zones (
  id, tenant_id, code, name, priority, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000024',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'CAIRO-METRO', 'Cairo Metro', 500,
  '{"previewFixture":true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  priority = EXCLUDED.priority,
  status = 'ACTIVE',
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO shipping.zone_locations (
  tenant_id, zone_id, location_id, include_descendants
) VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'eeeeeeee-0000-0000-0000-000000000024',
  'eeeeeeee-0000-0000-0000-000000000021',
  true
)
ON CONFLICT (tenant_id, zone_id, location_id) DO UPDATE SET
  include_descendants = EXCLUDED.include_descendants;

INSERT INTO shipping.carrier_location_mappings (
  id, tenant_id, carrier_account_id, location_id,
  external_code, external_name, metadata
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000025',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'eeeeeeee-0000-0000-0000-000000000002',
  'eeeeeeee-0000-0000-0000-000000000022',
  'preview-cairo-001', 'Cairo',
  '{"previewFixture":true}'::jsonb
)
ON CONFLICT (tenant_id, carrier_account_id, location_id) DO UPDATE SET
  external_code = EXCLUDED.external_code,
  external_name = EXCLUDED.external_name,
  state = 'ACTIVE',
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO shipping.carrier_service_zone_rules (
  tenant_id, carrier_account_id, carrier_service_id, zone_id,
  eligibility, metadata
) VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'eeeeeeee-0000-0000-0000-000000000002',
  'eeeeeeee-0000-0000-0000-000000000003',
  'eeeeeeee-0000-0000-0000-000000000024',
  'ALLOWED', '{"previewFixture":true}'::jsonb
)
ON CONFLICT (tenant_id, carrier_service_id, zone_id) DO UPDATE SET
  carrier_account_id = EXCLUDED.carrier_account_id,
  eligibility = EXCLUDED.eligibility,
  metadata = EXCLUDED.metadata,
  updated_at = now();

SELECT shipping.refresh_shipment_routing(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'eeeeeeee-0000-0000-0000-000000000004'
);

COMMIT;
SQL
