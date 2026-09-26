BEGIN;

CREATE SCHEMA IF NOT EXISTS tickets;

CREATE TABLE tickets.records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  customer_id uuid,
  conversation_id uuid,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED')),
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  assigned_to uuid REFERENCES identity.users(id),
  first_response_due_at timestamptz,
  resolution_due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES crm.customers(tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES messaging.conversations(tenant_id, id)
);
CREATE INDEX tickets_inbox_idx ON tickets.records (tenant_id, status, priority, created_at DESC);
CREATE TRIGGER tickets_touch_updated_at BEFORE UPDATE ON tickets.records FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE tickets.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  author_id uuid,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 20000),
  visibility text NOT NULL DEFAULT 'INTERNAL' CHECK (visibility IN ('INTERNAL', 'CUSTOMER_VISIBLE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets.records(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX ticket_comments_timeline_idx ON tickets.comments (tenant_id, ticket_id, created_at);

ALTER TABLE tickets.records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tickets.records USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE tickets.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tickets.comments USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
GRANT SELECT, INSERT, UPDATE ON tickets.records, tickets.comments TO platform_app;

COMMIT;
