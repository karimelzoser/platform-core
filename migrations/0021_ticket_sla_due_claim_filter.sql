-- Avoid repeatedly evaluating a ticket after each durable SLA outcome has
-- already been recorded. A future escalation stays eligible until it occurs.

BEGIN;

CREATE OR REPLACE FUNCTION tickets.claim_due_sla_tickets(p_batch_size integer DEFAULT 100)
RETURNS TABLE (id uuid, tenant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tickets
AS $$
BEGIN
  IF p_batch_size NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid SLA ticket batch size';
  END IF;
  RETURN QUERY
  SELECT record.id, record.tenant_id
  FROM tickets.records AS record
  LEFT JOIN tickets.sla_policies AS policy
    ON policy.tenant_id = record.tenant_id AND policy.id = record.sla_policy_id
  WHERE record.status IN ('OPEN', 'PENDING')
    AND record.sla_paused_at IS NULL
    AND (
      (
        record.first_response_at IS NULL
        AND record.first_response_due_at <= now()
        AND NOT EXISTS (
          SELECT 1 FROM tickets.sla_events AS event
          WHERE event.tenant_id = record.tenant_id
            AND event.ticket_id = record.id
            AND event.dedupe_key = 'first-response-breached'
        )
      )
      OR (
        record.resolution_due_at <= now()
        AND NOT EXISTS (
          SELECT 1 FROM tickets.sla_events AS event
          WHERE event.tenant_id = record.tenant_id
            AND event.ticket_id = record.id
            AND event.dedupe_key = 'resolution-breached'
        )
      )
      OR (
        policy.escalation_minutes IS NOT NULL
        AND record.resolution_due_at + make_interval(mins => policy.escalation_minutes) <= now()
        AND NOT EXISTS (
          SELECT 1 FROM tickets.sla_events AS event
          WHERE event.tenant_id = record.tenant_id
            AND event.ticket_id = record.id
            AND event.dedupe_key = 'resolution-escalated'
        )
      )
    )
  ORDER BY least(
    coalesce(record.first_response_due_at, 'infinity'::timestamptz),
    coalesce(record.resolution_due_at, 'infinity'::timestamptz)
  ), record.id
  LIMIT p_batch_size;
END;
$$;

REVOKE ALL ON FUNCTION tickets.claim_due_sla_tickets(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tickets.claim_due_sla_tickets(integer) TO platform_app;

COMMIT;
