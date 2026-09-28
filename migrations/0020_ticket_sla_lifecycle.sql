-- Tenant-owned SLA policies and durable ticket-clock evidence. The worker only
-- evaluates committed clocks; it emits tenant outbox events after recording an
-- idempotent breach/escalation event in the same transaction.

BEGIN;

CREATE TABLE tickets.sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  priority text NOT NULL CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  first_response_minutes integer NOT NULL CHECK (first_response_minutes BETWEEN 1 AND 10080),
  resolution_minutes integer NOT NULL CHECK (resolution_minutes BETWEEN 1 AND 43200),
  escalation_minutes integer CHECK (escalation_minutes BETWEEN 1 AND 43200),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name)
);

CREATE UNIQUE INDEX tickets_sla_policies_active_priority_unique
  ON tickets.sla_policies (tenant_id, priority)
  WHERE active;
CREATE TRIGGER sla_policies_touch_updated_at
  BEFORE UPDATE ON tickets.sla_policies
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

ALTER TABLE tickets.records
  ADD COLUMN sla_policy_id uuid,
  ADD COLUMN first_response_at timestamptz,
  ADD COLUMN sla_paused_at timestamptz,
  ADD COLUMN sla_paused_seconds integer NOT NULL DEFAULT 0 CHECK (sla_paused_seconds >= 0),
  ADD COLUMN sla_last_evaluated_at timestamptz;
ALTER TABLE tickets.records
  ADD CONSTRAINT tickets_records_sla_policy_fk
  FOREIGN KEY (tenant_id, sla_policy_id)
  REFERENCES tickets.sla_policies(tenant_id, id);
CREATE INDEX tickets_sla_due_idx
  ON tickets.records (tenant_id, first_response_due_at, resolution_due_at, id)
  WHERE status IN ('OPEN', 'PENDING');

CREATE TABLE tickets.sla_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  ticket_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'CLOCK_STARTED', 'CLOCK_PAUSED', 'CLOCK_RESUMED', 'FIRST_RESPONSE_MET',
    'FIRST_RESPONSE_BREACHED', 'RESOLUTION_MET', 'RESOLUTION_BREACHED', 'ESCALATED'
  )),
  dedupe_key text NOT NULL CHECK (length(trim(dedupe_key)) BETWEEN 1 AND 200),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, ticket_id, dedupe_key),
  FOREIGN KEY (tenant_id, ticket_id)
    REFERENCES tickets.records(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX tickets_sla_events_timeline_idx
  ON tickets.sla_events (tenant_id, ticket_id, occurred_at DESC, id);

ALTER TABLE tickets.sla_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tickets.sla_policies
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE tickets.sla_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tickets.sla_events
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

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
  WHERE record.status IN ('OPEN', 'PENDING')
    AND record.sla_paused_at IS NULL
    AND (
      (record.first_response_at IS NULL AND record.first_response_due_at <= now())
      OR record.resolution_due_at <= now()
    )
  ORDER BY least(
    coalesce(record.first_response_due_at, 'infinity'::timestamptz),
    coalesce(record.resolution_due_at, 'infinity'::timestamptz)
  ), record.id
  LIMIT p_batch_size;
END;
$$;

REVOKE ALL ON FUNCTION tickets.claim_due_sla_tickets(integer) FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON tickets.sla_policies, tickets.sla_events TO platform_app;
GRANT EXECUTE ON FUNCTION tickets.claim_due_sla_tickets(integer) TO platform_app;

COMMIT;
