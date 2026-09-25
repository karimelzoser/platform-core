BEGIN;

INSERT INTO identity.permissions (code, category, description, default_risk)
VALUES
  ('crm.customers.import', 'CRM', 'Import Customer 360 records from bounded CSV batches', 'MEDIUM')
ON CONFLICT (code) DO NOTHING;

INSERT INTO identity.role_template_permissions (template_code, permission_code)
VALUES
  ('owner', 'crm.customers.import'),
  ('admin', 'crm.customers.import')
ON CONFLICT (template_code, permission_code) DO NOTHING;

SELECT identity.bootstrap_default_roles(id)
FROM identity.organizations;

COMMIT;
