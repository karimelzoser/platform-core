BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'rls-a-create'
);

DO $$
BEGIN
  IF NOT has_schema_privilege(current_user, 'messaging', 'USAGE')
     OR NOT has_schema_privilege(current_user, 'tickets', 'USAGE') THEN
    RAISE EXCEPTION 'Runtime role cannot use messaging or tickets schemas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM messaging.conversations WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101') THEN
    RAISE EXCEPTION 'Tenant A cannot read own conversation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM messaging.messages WHERE id = 'aaaaaaaa-0000-0000-0000-000000000102') THEN
    RAISE EXCEPTION 'Tenant A cannot read own message';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM messaging.message_attachments WHERE storage_key = 'tenant-a/test.png') THEN
    RAISE EXCEPTION 'Tenant A cannot read own message attachment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM messaging.media_uploads WHERE storage_key = 'uploads/a-test.png') THEN
    RAISE EXCEPTION 'Tenant A cannot read own media upload';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets.records WHERE id = 'aaaaaaaa-0000-0000-0000-000000000103') THEN
    RAISE EXCEPTION 'Tenant A cannot read own ticket';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets.comments WHERE ticket_id = 'aaaaaaaa-0000-0000-0000-000000000103') THEN
    RAISE EXCEPTION 'Tenant A cannot read own ticket comment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets.sla_policies WHERE id = 'aaaaaaaa-0000-0000-0000-000000000301') THEN
    RAISE EXCEPTION 'Tenant A cannot read own SLA policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets.sla_events WHERE ticket_id = 'aaaaaaaa-0000-0000-0000-000000000103') THEN
    RAISE EXCEPTION 'Tenant A cannot read own SLA event';
  END IF;
END;
$$;

DO $$
DECLARE affected integer;
BEGIN
  UPDATE messaging.media_uploads
  SET message_id = 'aaaaaaaa-0000-0000-0000-000000000102'
  WHERE storage_key = 'uploads/a-test.png' AND message_id IS NULL AND expires_at > now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Tenant A could not claim own media upload'; END IF;

  UPDATE messaging.media_uploads
  SET message_id = 'aaaaaaaa-0000-0000-0000-000000000102'
  WHERE storage_key = 'uploads/a-test.png' AND message_id IS NULL AND expires_at > now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Media upload was claimed twice'; END IF;
END;
$$;

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

INSERT INTO integrations.webhook_deliveries (
  id, tenant_id, connection_id, provider_delivery_id, event_type, signature_valid, payload, dedupe_key
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000104',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'provider-delivery-a',
  'message.created',
  true,
  '{"event":"message.created"}'::jsonb,
  'webhook-delivery-a'
);

INSERT INTO integrations.sync_runs (
  id, tenant_id, connection_id, kind, idempotency_key
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000105',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'INITIAL',
  'integration-sync-a'
);

INSERT INTO integrations.webhook_subscriptions (
  id, tenant_id, connection_id, callback_url
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000106',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'https://preview.example.test/v1/webhooks/test-connector/connection-a'
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
  IF EXISTS (SELECT 1 FROM integrations.webhook_subscriptions WHERE id = 'aaaaaaaa-0000-0000-0000-000000000106') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A webhook subscription';
  END IF;
  IF EXISTS (SELECT 1 FROM policy.approval_requests WHERE id = 'aaaaaaaa-0000-0000-0000-000000000005') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A approval';
  END IF;
  IF EXISTS (SELECT 1 FROM messaging.conversations WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A conversation';
  END IF;
  IF EXISTS (SELECT 1 FROM messaging.messages WHERE id = 'aaaaaaaa-0000-0000-0000-000000000102') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A message';
  END IF;
  IF EXISTS (SELECT 1 FROM messaging.message_attachments WHERE storage_key = 'tenant-a/test.png') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A message attachment';
  END IF;
  IF EXISTS (SELECT 1 FROM messaging.media_uploads WHERE storage_key = 'uploads/a-test.png') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A media upload';
  END IF;
  BEGIN
    INSERT INTO messaging.media_uploads (
      tenant_id, storage_key, media_type, content_type, file_name, byte_size
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'uploads/cross-tenant.png',
      'IMAGE', 'image/png', 'cross-tenant.png', 1
    );
    RAISE EXCEPTION 'Tenant B registered a Tenant A media upload';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    UPDATE messaging.media_uploads
    SET message_id = 'aaaaaaaa-0000-0000-0000-000000000102'
    WHERE storage_key = 'uploads/b-test.pdf';
    RAISE EXCEPTION 'Tenant B linked own upload to Tenant A message';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
  BEGIN
    INSERT INTO messaging.message_attachments (
      tenant_id, message_id, storage_key, media_type, content_type, file_name, byte_size
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-0000-0000-000000000102',
      'tenant-a/cross-tenant.png', 'IMAGE', 'image/png', 'cross-tenant.png', 1
    );
    RAISE EXCEPTION 'Tenant B inserted a Tenant A message attachment';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM tickets.records WHERE id = 'aaaaaaaa-0000-0000-0000-000000000103') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A ticket';
  END IF;
  IF EXISTS (SELECT 1 FROM tickets.comments WHERE ticket_id = 'aaaaaaaa-0000-0000-0000-000000000103') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A ticket comment';
  END IF;
  IF EXISTS (SELECT 1 FROM tickets.sla_policies WHERE id = 'aaaaaaaa-0000-0000-0000-000000000301') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A SLA policy';
  END IF;
  IF EXISTS (SELECT 1 FROM tickets.sla_events WHERE ticket_id = 'aaaaaaaa-0000-0000-0000-000000000103') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A SLA event';
  END IF;
  IF EXISTS (SELECT 1 FROM integrations.webhook_deliveries WHERE id = 'aaaaaaaa-0000-0000-0000-000000000104') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A webhook delivery';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM policy.approval_requests WHERE id = 'bbbbbbbb-0000-0000-0000-000000000005' AND status = 'REQUESTED') THEN
    RAISE EXCEPTION 'Tenant B cannot read own approval';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM messaging.conversations WHERE id = 'bbbbbbbb-0000-0000-0000-000000000101') THEN
    RAISE EXCEPTION 'Tenant B cannot read own conversation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM messaging.messages WHERE id = 'bbbbbbbb-0000-0000-0000-000000000102') THEN
    RAISE EXCEPTION 'Tenant B cannot read own message';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets.records WHERE id = 'bbbbbbbb-0000-0000-0000-000000000103') THEN
    RAISE EXCEPTION 'Tenant B cannot read own ticket';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets.comments WHERE ticket_id = 'bbbbbbbb-0000-0000-0000-000000000103') THEN
    RAISE EXCEPTION 'Tenant B cannot read own ticket comment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets.sla_policies WHERE id = 'bbbbbbbb-0000-0000-0000-000000000301') THEN
    RAISE EXCEPTION 'Tenant B cannot read own SLA policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets.sla_events WHERE ticket_id = 'bbbbbbbb-0000-0000-0000-000000000103') THEN
    RAISE EXCEPTION 'Tenant B cannot read own SLA event';
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
  UPDATE messaging.conversations
  SET mode = 'PAUSED'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Tenant B updated Tenant A conversation'; END IF;

  UPDATE messaging.messages
  SET body = 'Cross-tenant update'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000102';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Tenant B updated Tenant A message'; END IF;

  UPDATE messaging.media_uploads
  SET message_id = 'bbbbbbbb-0000-0000-0000-000000000102'
  WHERE storage_key = 'uploads/a-test.png';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Tenant B claimed Tenant A media upload'; END IF;

  UPDATE tickets.records
  SET status = 'CLOSED'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000103';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Tenant B updated Tenant A ticket'; END IF;

  UPDATE tickets.comments
  SET body = 'Cross-tenant update'
  WHERE ticket_id = 'aaaaaaaa-0000-0000-0000-000000000103';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Tenant B updated Tenant A ticket comment'; END IF;

  UPDATE tickets.sla_policies
  SET name = 'Cross-tenant update'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000301';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Tenant B updated Tenant A SLA policy'; END IF;
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
  'webhook-subscription-worker-claim'
);

DO $$
DECLARE claimed uuid;
BEGIN
  SELECT id INTO claimed
  FROM integrations.claim_webhook_subscriptions('integration-test-worker', 1, 60)
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000106';
  IF claimed IS NULL THEN RAISE EXCEPTION 'Worker did not claim webhook subscription'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM integrations.webhook_subscriptions
    WHERE id = claimed AND claimed_by = 'integration-test-worker' AND state = 'PENDING_REGISTER'
  ) THEN
    RAISE EXCEPTION 'Webhook subscription claim did not record a lease';
  END IF;
END;
$$;
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'sync-worker-claim'
);

DO $$
DECLARE claimed uuid;
BEGIN
  SELECT id INTO claimed
  FROM integrations.claim_sync_runs('integration-test-worker', 1, 60)
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000105';
  IF claimed IS NULL THEN RAISE EXCEPTION 'Worker did not claim integration sync run'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM integrations.sync_runs
    WHERE id = claimed AND state = 'RUNNING' AND attempts = 0
      AND claimed_by = 'integration-test-worker' AND started_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Integration sync claim did not record a processing lease';
  END IF;
END;
$$;
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'webhook-worker-claim'
);

DO $$
DECLARE claimed uuid;
BEGIN
  SELECT id INTO claimed
  FROM integrations.claim_webhook_deliveries('integration-test-worker', 1, 60)
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000104';
  IF claimed IS NULL THEN RAISE EXCEPTION 'Worker did not claim inbound webhook delivery'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM integrations.webhook_deliveries
    WHERE id = claimed AND state = 'PROCESSING' AND attempts = 1 AND claimed_by = 'integration-test-worker'
  ) THEN
    RAISE EXCEPTION 'Webhook delivery claim did not record a processing lease';
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
