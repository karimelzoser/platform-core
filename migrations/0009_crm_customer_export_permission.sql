BEGIN;

INSERT INTO identity.permissions (code, category, description, default_risk)
VALUES
  ('crm.customers.export', 'CRM', 'Export Customer 360 records', 'MEDIUM')
ON CONFLICT (code) DO NOTHING;

INSERT INTO identity.role_template_permissions (template_code, permission_code)
VALUES
  ('owner', 'crm.customers.export'),
  ('admin', 'crm.customers.export')
ON CONFLICT (template_code, permission_code) DO NOTHING;

SELECT identity.bootstrap_default_roles(id)
FROM identity.organizations;

COMMIT;
