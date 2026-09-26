BEGIN;

ALTER TABLE messaging.messages
  ADD COLUMN delivery_claimed_by text,
  ADD COLUMN delivery_claimed_at timestamptz;

CREATE OR REPLACE FUNCTION messaging.claim_outbound_messages(
  p_worker_id text,
  p_batch_size integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF messaging.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, messaging
AS $$
BEGIN
  IF length(trim(p_worker_id)) = 0
    OR p_batch_size NOT BETWEEN 1 AND 100
    OR p_lease_seconds NOT BETWEEN 10 AND 900
  THEN
    RAISE EXCEPTION 'invalid outbound message claim parameters';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT message.id FROM messaging.messages AS message
    WHERE message.direction = 'OUTBOUND' AND message.delivery_status IN ('PENDING', 'FAILED')
      AND (message.next_delivery_attempt_at IS NULL OR message.next_delivery_attempt_at <= now())
      AND (
        message.delivery_claimed_at IS NULL
        OR message.delivery_claimed_at < now() - make_interval(secs => p_lease_seconds)
      )
    ORDER BY message.sent_at, message.id FOR UPDATE SKIP LOCKED LIMIT p_batch_size
  )
  UPDATE messaging.messages AS message
  SET delivery_claimed_by = p_worker_id,
      delivery_claimed_at = now(),
      delivery_attempts = message.delivery_attempts + 1
  FROM candidates WHERE message.id = candidates.id RETURNING message.*;
END;
$$;

REVOKE ALL ON FUNCTION messaging.claim_outbound_messages(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION messaging.claim_outbound_messages(text, integer, integer) TO platform_app;

COMMIT;
