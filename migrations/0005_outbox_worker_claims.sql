-- Controlled cross-tenant queue claiming for the trusted worker only.
-- The function is SECURITY DEFINER because ordinary application RLS context
-- intentionally cannot scan every tenant's pending outbox rows.

BEGIN;

CREATE OR REPLACE FUNCTION platform.claim_outbox_events(
    p_worker_id text,
    p_batch_size integer DEFAULT 25,
    p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF platform.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
BEGIN
    IF length(trim(p_worker_id)) = 0 OR p_batch_size NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 10 AND 900 THEN
        RAISE EXCEPTION 'invalid outbox claim parameters';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT event.id
        FROM platform.outbox_events AS event
        WHERE event.status = 'PENDING'
          AND event.available_at <= now()
          AND (event.claimed_at IS NULL OR event.claimed_at < now() - make_interval(secs => p_lease_seconds))
        ORDER BY event.occurred_at, event.id
        FOR UPDATE SKIP LOCKED
        LIMIT p_batch_size
    )
    UPDATE platform.outbox_events AS event
    SET claimed_at = now(), claimed_by = p_worker_id
    FROM candidates
    WHERE event.id = candidates.id
    RETURNING event.*;
END;
$$;

CREATE OR REPLACE FUNCTION platform.mark_outbox_published(
    p_event_id uuid,
    p_worker_id text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
    WITH updated AS (
        UPDATE platform.outbox_events
        SET status = 'PUBLISHED', published_at = now(), claimed_at = NULL, claimed_by = NULL, last_error = NULL
        WHERE id = p_event_id AND status = 'PENDING' AND claimed_by = p_worker_id
        RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM updated);
$$;

CREATE OR REPLACE FUNCTION platform.record_outbox_failure(
    p_event_id uuid,
    p_worker_id text,
    p_error text,
    p_max_attempts integer DEFAULT 8
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE event platform.outbox_events;
BEGIN
    IF p_max_attempts NOT BETWEEN 1 AND 100 OR length(trim(p_error)) = 0 THEN
        RAISE EXCEPTION 'invalid outbox failure parameters';
    END IF;

    UPDATE platform.outbox_events
    SET attempts = attempts + 1,
        claimed_at = NULL,
        claimed_by = NULL,
        last_error = left(p_error, 2000),
        available_at = now() + make_interval(secs => least(3600, 2 ^ least(attempts + 1, 10))),
        status = CASE WHEN attempts + 1 >= p_max_attempts THEN 'FAILED' ELSE 'PENDING' END
    WHERE id = p_event_id AND status = 'PENDING' AND claimed_by = p_worker_id
    RETURNING * INTO event;

    IF NOT FOUND THEN RETURN false; END IF;
    IF event.status = 'FAILED' THEN
        INSERT INTO platform.dead_letters (tenant_id, source, event_type, source_event_id, payload, error_code, error_message, attempts)
        VALUES (event.tenant_id, event.source, event.event_type, event.id::text, event.data, 'OUTBOX_MAX_ATTEMPTS', event.last_error, event.attempts);
    END IF;
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION platform.claim_outbox_events(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.mark_outbox_published(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.record_outbox_failure(uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.claim_outbox_events(text, integer, integer) TO platform_app;
GRANT EXECUTE ON FUNCTION platform.mark_outbox_published(uuid, text) TO platform_app;
GRANT EXECUTE ON FUNCTION platform.record_outbox_failure(uuid, text, text, integer) TO platform_app;

COMMIT;
