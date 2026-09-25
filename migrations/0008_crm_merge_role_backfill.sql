-- Grant CRM identity reconciliation only to the tenant owner and administrator
-- templates, then rebuild existing system roles through the canonical function.

BEGIN;

INSERT INTO identity.role_template_permissions (template_code, permission_code)
VALUES
  ('owner', 'crm.customers.merge'),
  ('admin', 'crm.customers.merge')
ON CONFLICT (template_code, permission_code) DO NOTHING;

SELECT identity.bootstrap_default_roles(id)
FROM identity.organizations;

COMMIT;
