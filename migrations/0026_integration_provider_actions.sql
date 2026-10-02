-- Typed provider actions are persisted before a worker invokes a connector.
-- This gives integrations the same post-commit, lease, retry, audit, and
-- tenant-isolation guarantees as outbound messaging and synchronization.

BEGIN;

CREATE TABLE integrations.provider_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  connection_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'QUEUED'
    CHECK (state IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELED')),
  provider_action_id text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claimed_by text,
  claimed_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, connection_id, idempotency_key),
  FOREIGN KEY (tenant_id, connection_id)
    REFERENCES integrations.connections(tenant_id, id)
);

CREATE INDEX integrations_provider_actions_claim_idx
  ON integrations.provider_actions (next_attempt_at, created_at, id)
  WHERE state IN ('QUEUED', 'FAILED', 'RUNNING');

ALTER TABLE integrations.provider_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integrations.provider_actions
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON integrations.provider_actions TO platform_app;

CREATE OR REPLACE FUNCTION integrations.claim_provider_actions(
  p_worker_id text,
  p_batch_size integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF integrations.provider_actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, integrations
AS $$
BEGIN
  IF length(trim(p_worker_id)) = 0
    OR p_batch_size NOT BETWEEN 1 AND 100
    OR p_lease_seconds NOT BETWEEN 10 AND 900
  THEN
    RAISE EXCEPTION 'invalid provider action claim parameters';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT action.id
    FROM integrations.provider_actions AS action
    WHERE action.attempts < 8
      AND (
        (action.state IN ('QUEUED', 'FAILED') AND action.next_attempt_at <= now())
        OR (
          action.state = 'RUNNING'
          AND action.claimed_at < now() - make_interval(secs => p_lease_seconds)
        )
      )
    ORDER BY action.next_attempt_at, action.created_at, action.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  UPDATE integrations.provider_actions AS action
  SET state = 'RUNNING',
      claimed_by = p_worker_id,
      claimed_at = now(),
      started_at = coalesce(action.started_at, now()),
      updated_at = now()
  FROM candidates
  WHERE action.id = candidates.id
  RETURNING action.*;
END;
$$;

REVOKE ALL ON FUNCTION integrations.claim_provider_actions(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION integrations.claim_provider_actions(text, integer, integer) TO platform_app;

COMMIT;
