-- Durable, lease-based integration sync execution. Provider calls remain in
-- the worker, outside of the database transaction that claims or records work.

BEGIN;

ALTER TABLE integrations.sync_runs
  ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN claimed_by text,
  ADD COLUMN claimed_at timestamptz,
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX integrations_sync_runs_worker_claim_idx
  ON integrations.sync_runs (next_attempt_at, created_at, id)
  WHERE state IN ('QUEUED', 'FAILED', 'RUNNING');

CREATE OR REPLACE FUNCTION integrations.claim_sync_runs(
  p_worker_id text,
  p_batch_size integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF integrations.sync_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, integrations
AS $$
BEGIN
  IF length(trim(p_worker_id)) = 0
    OR p_batch_size NOT BETWEEN 1 AND 100
    OR p_lease_seconds NOT BETWEEN 10 AND 900
  THEN
    RAISE EXCEPTION 'invalid integration sync claim parameters';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT run.id
    FROM integrations.sync_runs AS run
    WHERE run.attempts < 8
      AND (
        (run.state IN ('QUEUED', 'FAILED') AND run.next_attempt_at <= now())
        OR (
          run.state = 'RUNNING'
          AND run.claimed_at < now() - make_interval(secs => p_lease_seconds)
        )
      )
    ORDER BY run.next_attempt_at, run.created_at, run.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  UPDATE integrations.sync_runs AS run
  SET state = 'RUNNING',
      claimed_by = p_worker_id,
      claimed_at = now(),
      started_at = coalesce(run.started_at, now())
  FROM candidates
  WHERE run.id = candidates.id
  RETURNING run.*;
END;
$$;

REVOKE ALL ON FUNCTION integrations.claim_sync_runs(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION integrations.claim_sync_runs(text, integer, integer) TO platform_app;

COMMIT;
