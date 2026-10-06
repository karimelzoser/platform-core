BEGIN;

SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'usage-metering-tenant-a'
);

DO $$
DECLARE definition_count integer;
BEGIN
  SELECT count(*) INTO definition_count
  FROM platform.meter_definitions
  WHERE meter_key IN (
    'integrations.provider_action.processing_attempt',
    'integrations.provider_action.attempt'
  )
    AND version = 1;
  IF definition_count <> 2 THEN
    RAISE EXCEPTION 'Expected seeded provider-action meter definitions';
  END IF;
END;
$$;

INSERT INTO platform.usage_records (
  id, tenant_id, meter_key, meter_version, quantity, unit, occurred_at,
  source_type, source_id, resource_type, resource_id, provider_key,
  estimated_cost, cost_currency, cost_state, correlation_id, idempotency_key,
  bounded_metadata
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000401',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'integrations.provider_action.attempt', 1, 1, 'attempt', now(),
  'PROVIDER_ACTION', 'action-a', 'provider_action', 'action-a', 'development-api',
  0.01000000, 'USD', 'ESTIMATED', 'cor-action-a', 'action-a-attempt-1',
  '{"action_type":"CREATE_LABEL","outcome":"succeeded","connector_key":"development-api"}'::jsonb
);

INSERT INTO integrations.provider_actions (
  id, tenant_id, connection_id, action_type, input, state, idempotency_key,
  claimed_by, claimed_at, started_at
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000402',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'development.usage_test',
  '{"fixture":true}'::jsonb,
  'RUNNING',
  'usage-producer-action-a',
  'usage-test-worker',
  now(),
  now()
);

UPDATE integrations.provider_actions
SET state = 'SUCCEEDED',
    provider_action_id = 'usage-provider-result-a',
    result = '{"accepted":true}'::jsonb,
    claimed_by = null,
    claimed_at = null,
    finished_at = now(),
    updated_at = now()
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000402';

DO $$
DECLARE processing_count integer;
DECLARE manual_count integer;
DECLARE processing_outcome text;
BEGIN
  SELECT count(*), max(bounded_metadata->>'outcome')
  INTO processing_count, processing_outcome
  FROM platform.usage_records
  WHERE meter_key = 'integrations.provider_action.processing_attempt'
    AND source_id = 'aaaaaaaa-0000-0000-0000-000000000402';
  IF processing_count <> 1 OR processing_outcome <> 'succeeded' THEN
    RAISE EXCEPTION 'Provider action completion did not emit exactly one canonical usage record';
  END IF;

  SELECT count(*) INTO manual_count
  FROM platform.usage_records
  WHERE meter_key = 'integrations.provider_action.attempt'
    AND id = 'aaaaaaaa-0000-0000-0000-000000000401';
  IF manual_count <> 1 THEN
    RAISE EXCEPTION 'Tenant A expected the explicit provider-network usage record';
  END IF;
END;
$$;

UPDATE integrations.provider_actions
SET state = 'SUCCEEDED', updated_at = now()
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000402';

DO $$
DECLARE processing_count integer;
BEGIN
  SELECT count(*) INTO processing_count
  FROM platform.usage_records
  WHERE meter_key = 'integrations.provider_action.processing_attempt'
    AND source_id = 'aaaaaaaa-0000-0000-0000-000000000402';
  IF processing_count <> 1 THEN
    RAISE EXCEPTION 'Terminal provider-action updates duplicated canonical usage';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO platform.usage_records (
      tenant_id, meter_key, meter_version, quantity, unit, occurred_at,
      source_type, source_id, resource_type, resource_id, correlation_id,
      idempotency_key, bounded_metadata
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'integrations.provider_action.attempt', 1, 1, 'attempt', now(),
      'PROVIDER_ACTION', 'action-a-retry', 'provider_action', 'action-a', 'cor-action-a',
      'action-a-attempt-1', '{"action_type":"CREATE_LABEL"}'::jsonb
    );
    RAISE EXCEPTION 'Duplicate usage idempotency key unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO platform.usage_records (
      tenant_id, meter_key, meter_version, quantity, unit, occurred_at,
      source_type, source_id, resource_type, resource_id, correlation_id,
      idempotency_key, bounded_metadata
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'integrations.provider_action.attempt', 1, 1, 'attempt', now(),
      'PROVIDER_ACTION', 'action-a-invalid-dimension', 'provider_action', 'action-a',
      'cor-action-a', 'action-a-invalid-dimension', '{"phone":"+201000000000"}'::jsonb
    );
    RAISE EXCEPTION 'Unregistered usage dimension unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'test-subject-b',
  'usage-metering-tenant-b'
);

DO $$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM platform.usage_records;
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'Tenant B can see Tenant A usage records';
  END IF;
END;
$$;

INSERT INTO platform.usage_records (
  id, tenant_id, meter_key, meter_version, quantity, unit, occurred_at,
  source_type, source_id, resource_type, resource_id, correlation_id,
  idempotency_key, bounded_metadata
) VALUES (
  'bbbbbbbb-0000-0000-0000-000000000401',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'integrations.provider_action.attempt', 1, 1, 'attempt', now(),
  'PROVIDER_ACTION', 'action-b', 'provider_action', 'action-b', 'cor-action-b',
  'action-a-attempt-1', '{"action_type":"CREATE_LABEL","outcome":"failed"}'::jsonb
);

DO $$
BEGIN
  BEGIN
    INSERT INTO platform.usage_records (
      tenant_id, meter_key, meter_version, quantity, unit, occurred_at,
      source_type, source_id, resource_type, resource_id, correlation_id,
      idempotency_key
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'integrations.provider_action.attempt', 1, 1, 'attempt', now(),
      'PROVIDER_ACTION', 'cross-tenant-action', 'provider_action', 'cross-tenant-action',
      'cor-cross-tenant', 'cross-tenant-attempt-1'
    );
    RAISE EXCEPTION 'Cross-tenant usage insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    UPDATE platform.usage_records
    SET quantity = 2
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000401';
    RAISE EXCEPTION 'Runtime usage mutation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM platform.usage_records
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000401';
    RAISE EXCEPTION 'Runtime usage deletion unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO platform.meter_definitions (
      meter_key, version, description, unit, aggregation_behavior, source_of_truth
    ) VALUES (
      'test.runtime_meter', 1, 'Runtime must not define meters', 'unit', 'SUM', 'test'
    );
    RAISE EXCEPTION 'Runtime meter-definition mutation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

COMMIT;
