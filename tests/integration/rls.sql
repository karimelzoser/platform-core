BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'rls-a-create'
);

INSERT INTO integrations.secret_references (id, tenant_id, provider, reference, key_version)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test', 'secret-a', 'v1');

INSERT INTO integrations.connections (id, tenant_id, connector_key, secret_reference_id, display_name)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'test-connector',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Connection A'
);
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'test-subject-b',
  'rls-b-isolation'
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM integrations.connections WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A connection';
  END IF;
  IF EXISTS (SELECT 1 FROM integrations.secret_references WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A secret reference';
  END IF;
END;
$$;

DO $$
DECLARE affected integer;
BEGIN
  UPDATE integrations.connections
  SET display_name = 'Cross-tenant update'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Tenant B updated Tenant A connection'; END IF;
END;
$$;

DO $$
DECLARE claimed uuid;
BEGIN
  SELECT id INTO claimed
  FROM platform.claim_outbox_events('integration-test-worker', 1, 60)
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';
  IF claimed IS NULL THEN RAISE EXCEPTION 'Worker did not claim committed outbox event'; END IF;
  IF NOT platform.mark_outbox_published(claimed, 'integration-test-worker') THEN
    RAISE EXCEPTION 'Worker could not acknowledge its own outbox claim';
  END IF;
END;
$$;
COMMIT;
