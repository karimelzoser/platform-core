INSERT INTO identity.users (id, keycloak_subject, email)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'test-subject-a', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'test-subject-b', 'b@example.test');

INSERT INTO identity.organizations (id, name, slug, created_by_user_id)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A', 'tenant-a', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B', 'tenant-b', '22222222-2222-2222-2222-222222222222');

INSERT INTO integrations.connector_definitions (key, version, category, display_name, manifest)
VALUES ('test-connector', '1.0.0', 'GENERIC', 'Test connector', '{}'::jsonb);

INSERT INTO platform.outbox_events (
  id, tenant_id, event_type, event_version, resource_type, resource_id, data, dedupe_key
)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'integration.connection.created', 1, 'integration_connection',
  'aaaaaaaa-0000-0000-0000-000000000002', '{}'::jsonb, 'test-outbox-a'
);
