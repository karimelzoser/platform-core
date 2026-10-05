-- Cross-cutting usage, provider-cost and analytics-dimension contracts.
-- Commercial billing remains a later workstream; this migration only establishes
-- the canonical append-only source that operational modules can write atomically.

BEGIN;

CREATE TABLE platform.meter_definitions (
  meter_key text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 1000),
  unit text NOT NULL CHECK (unit ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  aggregation_behavior text NOT NULL DEFAULT 'SUM'
    CHECK (aggregation_behavior IN ('SUM', 'COUNT', 'MAX', 'LAST')),
  source_of_truth text NOT NULL CHECK (length(trim(source_of_truth)) BETWEEN 1 AND 300),
  retry_creates_unit boolean NOT NULL DEFAULT false,
  may_be_billable boolean NOT NULL DEFAULT false,
  provider_cost_applies boolean NOT NULL DEFAULT false,
  allowed_dimensions text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEPRECATED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object')
    CHECK (octet_length(metadata::text) <= 4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meter_key, version),
  CHECK (meter_key ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  CHECK (cardinality(allowed_dimensions) <= 32)
);

CREATE TABLE platform.usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  meter_key text NOT NULL,
  meter_version integer NOT NULL DEFAULT 1,
  quantity numeric(24,8) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (unit ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  occurred_at timestamptz NOT NULL,
  source_type text NOT NULL CHECK (source_type ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  source_id text NOT NULL CHECK (length(trim(source_id)) BETWEEN 1 AND 300),
  resource_type text NOT NULL CHECK (resource_type ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  resource_id text NOT NULL CHECK (length(trim(resource_id)) BETWEEN 1 AND 300),
  provider_key text CHECK (
    provider_key IS NULL OR provider_key ~ '^[a-z][a-z0-9_.-]{0,127}$'
  ),
  connection_id uuid,
  estimated_cost numeric(24,8) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  cost_currency text CHECK (
    cost_currency IS NULL OR cost_currency ~ '^[A-Z]{3}$'
  ),
  cost_state text NOT NULL DEFAULT 'NONE'
    CHECK (cost_state IN ('NONE', 'ESTIMATED', 'FINALIZED')),
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) BETWEEN 1 AND 300),
  causation_id text CHECK (
    causation_id IS NULL OR length(trim(causation_id)) BETWEEN 1 AND 300
  ),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) BETWEEN 1 AND 500),
  bounded_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(bounded_metadata) = 'object')
    CHECK (octet_length(bounded_metadata::text) <= 4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, meter_key, meter_version, idempotency_key),
  FOREIGN KEY (meter_key, meter_version)
    REFERENCES platform.meter_definitions(meter_key, version),
  FOREIGN KEY (tenant_id, connection_id)
    REFERENCES integrations.connections(tenant_id, id),
  CHECK (
    (estimated_cost IS NULL AND cost_currency IS NULL AND cost_state = 'NONE')
    OR
    (estimated_cost IS NOT NULL AND cost_currency IS NOT NULL AND cost_state IN ('ESTIMATED', 'FINALIZED'))
  )
);

CREATE INDEX usage_records_time_idx
  ON platform.usage_records (tenant_id, occurred_at DESC, id);
CREATE INDEX usage_records_meter_idx
  ON platform.usage_records (tenant_id, meter_key, meter_version, occurred_at DESC);
CREATE INDEX usage_records_source_idx
  ON platform.usage_records (tenant_id, source_type, source_id, occurred_at DESC);
CREATE INDEX usage_records_resource_idx
  ON platform.usage_records (tenant_id, resource_type, resource_id, occurred_at DESC);
CREATE INDEX usage_records_provider_idx
  ON platform.usage_records (tenant_id, provider_key, occurred_at DESC)
  WHERE provider_key IS NOT NULL;

CREATE OR REPLACE FUNCTION platform.validate_usage_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  definition record;
  dimension_key text;
  dimension_value jsonb;
BEGIN
  SELECT unit, allowed_dimensions
  INTO definition
  FROM platform.meter_definitions
  WHERE meter_key = NEW.meter_key
    AND version = NEW.meter_version
    AND status = 'ACTIVE';

  IF definition IS NULL THEN
    RAISE EXCEPTION 'Active meter definition was not found for %.v%', NEW.meter_key, NEW.meter_version
      USING ERRCODE = '23514';
  END IF;

  IF NEW.unit <> definition.unit THEN
    RAISE EXCEPTION 'Usage unit % does not match meter unit %', NEW.unit, definition.unit
      USING ERRCODE = '23514';
  END IF;

  FOR dimension_key, dimension_value IN
    SELECT key, value FROM jsonb_each(NEW.bounded_metadata)
  LOOP
    IF NOT (dimension_key = ANY(definition.allowed_dimensions)) THEN
      RAISE EXCEPTION 'Usage dimension % is not allowed for meter %', dimension_key, NEW.meter_key
        USING ERRCODE = '23514';
    END IF;

    IF jsonb_typeof(dimension_value) NOT IN ('string', 'number', 'boolean', 'null') THEN
      RAISE EXCEPTION 'Usage dimension % must be a bounded scalar', dimension_key
        USING ERRCODE = '23514';
    END IF;

    IF jsonb_typeof(dimension_value) = 'string'
       AND length(dimension_value #>> '{}') > 256 THEN
      RAISE EXCEPTION 'Usage dimension % exceeds the scalar length limit', dimension_key
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER usage_records_validate
  BEFORE INSERT ON platform.usage_records
  FOR EACH ROW EXECUTE FUNCTION platform.validate_usage_record();

ALTER TABLE platform.usage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.usage_records
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT ON platform.meter_definitions TO platform_app;
GRANT SELECT, INSERT ON platform.usage_records TO platform_app;
GRANT EXECUTE ON FUNCTION platform.validate_usage_record() TO platform_app;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON platform.meter_definitions FROM platform_app;
REVOKE UPDATE, DELETE, TRUNCATE ON platform.usage_records FROM platform_app;

INSERT INTO platform.meter_definitions (
  meter_key, version, description, unit, aggregation_behavior, source_of_truth,
  retry_creates_unit, may_be_billable, provider_cost_applies, allowed_dimensions
) VALUES
(
  'integrations.provider_action.attempt', 1,
  'A provider action network attempt that was actually executed after commit.',
  'attempt', 'SUM', 'integrations.provider_actions', true, false, true,
  ARRAY['action_type', 'outcome', 'connector_key']
),
(
  'messaging.provider_message.accepted', 1,
  'An outbound canonical message accepted by a messaging provider.',
  'message', 'SUM', 'messaging.messages', false, true, true,
  ARRAY['channel', 'provider_category', 'outcome']
),
(
  'ai.model.request', 1,
  'One model-provider request; retries/fallbacks that execute a model are distinct provider consumption.',
  'request', 'SUM', 'ai_gateway_request', true, true, true,
  ARRAY['provider', 'model', 'route_tier', 'language', 'outcome']
),
(
  'automation.run', 1,
  'One durable Automation Studio run identity.',
  'run', 'COUNT', 'automation_run', false, true, false,
  ARRAY['trigger_type', 'outcome', 'version']
);

COMMIT;
