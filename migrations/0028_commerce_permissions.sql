-- Commerce foundation adds operation permissions that were not present in the
-- immutable authorization baseline. Provider execution remains outside these
-- canonical-recording permissions and keeps its separate approval boundary.

BEGIN;

INSERT INTO identity.permissions (code, category, description, default_risk)
VALUES
  ('commerce.stores.manage', 'commerce', 'Create or modify canonical commerce stores', 'MEDIUM'),
  ('commerce.payments.manage', 'commerce', 'Record canonical payment state without executing a payment', 'MEDIUM'),
  ('commerce.fulfillments.record', 'commerce', 'Record canonical fulfillment state without executing a provider action', 'MEDIUM')
ON CONFLICT (code) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  default_risk = EXCLUDED.default_risk;

INSERT INTO identity.role_template_permissions (template_code, permission_code)
VALUES
  ('owner', 'commerce.stores.manage'),
  ('owner', 'commerce.payments.manage'),
  ('owner', 'commerce.fulfillments.record'),
  ('admin', 'commerce.stores.manage'),
  ('admin', 'commerce.payments.manage'),
  ('admin', 'commerce.fulfillments.record'),
  ('manager', 'commerce.stores.manage'),
  ('manager', 'commerce.payments.manage'),
  ('manager', 'commerce.fulfillments.record'),
  ('agent', 'commerce.fulfillments.record')
ON CONFLICT (template_code, permission_code) DO NOTHING;

SELECT identity.bootstrap_default_roles(id)
FROM identity.organizations;

COMMIT;
