-- Commerce foundation adds management permissions that were not present in the
-- immutable authorization baseline. Order/product/inventory/fulfillment read and
-- write permissions already exist in migration 0002.

BEGIN;

INSERT INTO identity.permissions (code, category, description, default_risk)
VALUES
  ('commerce.stores.manage', 'commerce', 'Create or modify canonical commerce stores', 'HIGH'),
  ('commerce.payments.manage', 'commerce', 'Record or update canonical payment state', 'HIGH')
ON CONFLICT (code) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  default_risk = EXCLUDED.default_risk;

INSERT INTO identity.role_template_permissions (template_code, permission_code)
VALUES
  ('owner', 'commerce.stores.manage'),
  ('owner', 'commerce.payments.manage'),
  ('admin', 'commerce.stores.manage'),
  ('admin', 'commerce.payments.manage'),
  ('manager', 'commerce.stores.manage'),
  ('manager', 'commerce.payments.manage')
ON CONFLICT (template_code, permission_code) DO NOTHING;

SELECT identity.bootstrap_default_roles(id)
FROM identity.organizations;

COMMIT;
