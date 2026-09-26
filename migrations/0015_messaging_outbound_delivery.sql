-- Durable lifecycle for outbound messages. Provider dispatch occurs only from
-- a post-commit worker after this state and its outbox event are committed.

BEGIN;

ALTER TABLE messaging.messages
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'PENDING'
    CHECK (delivery_status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'DEAD_LETTER')),
  ADD COLUMN delivery_attempts integer NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  ADD COLUMN next_delivery_attempt_at timestamptz,
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN last_delivery_error text;

CREATE INDEX messaging_outbound_delivery_pending_idx
  ON messaging.messages (next_delivery_attempt_at, sent_at, id)
  WHERE direction = 'OUTBOUND' AND delivery_status IN ('PENDING', 'FAILED');

COMMIT;
