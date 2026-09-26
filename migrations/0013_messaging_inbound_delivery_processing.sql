-- Durable inbound messaging delivery processing. Provider adapters normalize
-- raw deliveries outside the database; this schema only persists canonical
-- tenant-bound records and coordinates safe worker claims.

BEGIN;

ALTER TABLE integrations.webhook_deliveries
  ADD COLUMN claimed_by text,
  ADD COLUMN claimed_at timestamptz,
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX webhook_deliveries_worker_claim_idx
  ON integrations.webhook_deliveries (next_attempt_at, received_at, id)
  WHERE state IN ('RECEIVED', 'FAILED', 'PROCESSING');

ALTER TABLE messaging.conversations
  ADD COLUMN connection_id uuid;

ALTER TABLE messaging.conversations
  ADD CONSTRAINT messaging_conversations_connection_fk
  FOREIGN KEY (tenant_id, connection_id)
  REFERENCES integrations.connections(tenant_id, id);

ALTER TABLE messaging.conversations
  DROP CONSTRAINT conversations_tenant_id_channel_provider_conversation_id_key,
  ADD CONSTRAINT messaging_conversations_provider_identity_unique
  UNIQUE NULLS NOT DISTINCT (tenant_id, connection_id, channel, provider_conversation_id);

CREATE INDEX messaging_conversations_connection_inbox_idx
  ON messaging.conversations (tenant_id, connection_id, last_message_at DESC);

ALTER TABLE messaging.messages
  ADD COLUMN connection_id uuid,
  ADD COLUMN webhook_delivery_id uuid;

ALTER TABLE messaging.messages
  ADD CONSTRAINT messaging_messages_connection_fk
  FOREIGN KEY (tenant_id, connection_id)
  REFERENCES integrations.connections(tenant_id, id),
  ADD CONSTRAINT messaging_messages_webhook_delivery_fk
  FOREIGN KEY (tenant_id, webhook_delivery_id)
  REFERENCES integrations.webhook_deliveries(tenant_id, id);

ALTER TABLE messaging.messages
  DROP CONSTRAINT messages_tenant_id_provider_message_id_key,
  ADD CONSTRAINT messaging_messages_provider_identity_unique
  UNIQUE NULLS NOT DISTINCT (tenant_id, connection_id, provider_message_id);

CREATE INDEX messaging_messages_delivery_idx
  ON messaging.messages (tenant_id, webhook_delivery_id)
  WHERE webhook_delivery_id IS NOT NULL;

CREATE OR REPLACE FUNCTION integrations.claim_webhook_deliveries(
  p_worker_id text,
  p_batch_size integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF integrations.webhook_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, integrations
AS $$
BEGIN
  IF length(trim(p_worker_id)) = 0 OR p_batch_size NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 10 AND 900 THEN
    RAISE EXCEPTION 'invalid webhook delivery claim parameters';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT delivery.id
    FROM integrations.webhook_deliveries AS delivery
    WHERE delivery.attempts < 8
      AND delivery.next_attempt_at <= now()
      AND (
        delivery.state IN ('RECEIVED', 'FAILED')
        OR (
          delivery.state = 'PROCESSING'
          AND delivery.claimed_at < now() - make_interval(secs => p_lease_seconds)
        )
      )
    ORDER BY delivery.received_at, delivery.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  UPDATE integrations.webhook_deliveries AS delivery
  SET state = 'PROCESSING',
      attempts = delivery.attempts + 1,
      claimed_by = p_worker_id,
      claimed_at = now()
  FROM candidates
  WHERE delivery.id = candidates.id
  RETURNING delivery.*;
END;
$$;

REVOKE ALL ON FUNCTION integrations.claim_webhook_deliveries(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION integrations.claim_webhook_deliveries(text, integer, integer) TO platform_app;

COMMIT;
