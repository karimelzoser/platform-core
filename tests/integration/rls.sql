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
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'outbox-rollback'
);
INSERT INTO platform.outbox_events (
  tenant_id, event_type, resource_type, resource_id, actor_type, actor_id, dedupe_key
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test.rolled_back', 'test',
  'aaaaaaaa-0000-0000-0000-000000000002', 'USER',
  '11111111-1111-1111-1111-111111111111', 'rolled-back-event'
);
ROLLBACK;

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'audit-append-only'
);
INSERT INTO platform.audit_log (
  tenant_id, actor_type, actor_id, action, resource_type, resource_id, request_id, correlation_id
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'USER',
  '11111111-1111-1111-1111-111111111111', 'test.audit.created', 'test',
  'aaaaaaaa-0000-0000-0000-000000000002', 'audit-test', 'audit-test'
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM platform.outbox_events WHERE dedupe_key = 'rolled-back-event') THEN
    RAISE EXCEPTION 'Rolled-back transaction left a publishable outbox event';
  END IF;
  IF has_table_privilege(current_user, 'platform.audit_log', 'UPDATE')
     OR has_table_privilege(current_user, 'platform.audit_log', 'DELETE') THEN
    RAISE EXCEPTION 'Runtime role can mutate immutable audit records';
  END IF;
END;
$$;
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
  IF EXISTS (SELECT 1 FROM policy.approval_requests WHERE id = 'aaaaaaaa-0000-0000-0000-000000000005') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A approval';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM policy.approval_requests WHERE id = 'bbbbbbbb-0000-0000-0000-000000000005' AND status = 'REQUESTED') THEN
    RAISE EXCEPTION 'Tenant B cannot read own approval';
  END IF;
END;
$$;

DO $$
DECLARE affected integer;
BEGIN
  UPDATE policy.approval_requests
  SET status = 'EXECUTED'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000005';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Tenant B updated Tenant A approval'; END IF;
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

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'outbox-failure'
);

DO $$
DECLARE claimed uuid;
BEGIN
  SELECT id INTO claimed
  FROM platform.claim_outbox_events('integration-test-worker', 1, 60)
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000004';
  IF claimed IS NULL THEN RAISE EXCEPTION 'Worker did not claim poison event'; END IF;
  IF NOT platform.record_outbox_failure(claimed, 'integration-test-worker', 'test poison event', 1) THEN
    RAISE EXCEPTION 'Worker failure was not recorded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM platform.outbox_events WHERE id = claimed AND status = 'FAILED' AND attempts = 1) THEN
    RAISE EXCEPTION 'Poison event was not marked failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM platform.dead_letters WHERE source_event_id = claimed::text AND error_code = 'OUTBOX_MAX_ATTEMPTS') THEN
    RAISE EXCEPTION 'Poison event did not produce a dead letter';
  END IF;
END;
$$;
COMMIT;
