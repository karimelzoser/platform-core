-- Provider webhook lifecycle requests are persisted before a worker performs
-- a provider call. This preserves audit/outbox ordering and tenant isolation.

BEGIN;

CREATE TABLE integrations.webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  connection_id uuid NOT NULL,
  callback_url text NOT NULL,
  provider_subscription_id text,
  operation text NOT NULL DEFAULT 'REGISTER' CHECK (operation IN ('REGISTER', 'UNREGISTER')),
  state text NOT NULL DEFAULT 'PENDING_REGISTER'
    CHECK (state IN ('PENDING_REGISTER', 'ACTIVE', 'PENDING_UNREGISTER', 'FAILED', 'REMOVED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claimed_by text,
  claimed_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, connection_id, callback_url),
  FOREIGN KEY (tenant_id, connection_id)
    REFERENCES integrations.connections(tenant_id, id)
);

CREATE INDEX integrations_webhook_subscriptions_claim_idx
  ON integrations.webhook_subscriptions (next_attempt_at, created_at, id)
  WHERE state IN ('PENDING_REGISTER', 'PENDING_UNREGISTER', 'FAILED');

ALTER TABLE integrations.webhook_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integrations.webhook_subscriptions
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON integrations.webhook_subscriptions TO platform_app;

CREATE OR REPLACE FUNCTION integrations.claim_webhook_subscriptions(
  p_worker_id text,
  p_batch_size integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF integrations.webhook_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, integrations
AS $$
BEGIN
  IF length(trim(p_worker_id)) = 0
    OR p_batch_size NOT BETWEEN 1 AND 100
    OR p_lease_seconds NOT BETWEEN 10 AND 900
  THEN
    RAISE EXCEPTION 'invalid webhook subscription claim parameters';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT subscription.id
    FROM integrations.webhook_subscriptions AS subscription
    WHERE subscription.attempts < 8
      AND (
        (subscription.state IN ('PENDING_REGISTER', 'PENDING_UNREGISTER', 'FAILED')
          AND subscription.next_attempt_at <= now())
        OR (
          subscription.claimed_at < now() - make_interval(secs => p_lease_seconds)
          AND subscription.claimed_by IS NOT NULL
        )
      )
    ORDER BY subscription.next_attempt_at, subscription.created_at, subscription.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  UPDATE integrations.webhook_subscriptions AS subscription
  SET claimed_by = p_worker_id, claimed_at = now()
  FROM candidates
  WHERE subscription.id = candidates.id
  RETURNING subscription.*;
END;
$$;

REVOKE ALL ON FUNCTION integrations.claim_webhook_subscriptions(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION integrations.claim_webhook_subscriptions(text, integer, integer) TO platform_app;

COMMIT;
