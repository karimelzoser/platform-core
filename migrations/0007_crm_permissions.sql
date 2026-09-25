BEGIN;

INSERT INTO identity.permissions (code, category, description, default_risk)
VALUES
  ('crm.customers.read', 'CRM', 'View Customer 360 profiles and lists', 'LOW'),
  ('crm.customers.write', 'CRM', 'Create and update Customer 360 profiles', 'LOW'),
  ('crm.customers.merge', 'CRM', 'Merge Customer 360 identities', 'HIGH')
ON CONFLICT (code) DO NOTHING;

COMMIT;
