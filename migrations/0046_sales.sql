BEGIN;

CREATE SCHEMA IF NOT EXISTS sales;

CREATE TABLE sales.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  description text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  is_default boolean NOT NULL DEFAULT false,
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name)
);

CREATE UNIQUE INDEX sales_one_default_pipeline_idx
  ON sales.pipelines (tenant_id) WHERE is_default AND status = 'ACTIVE';

CREATE TABLE sales.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  pipeline_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 1000),
  default_probability_bps integer NOT NULL DEFAULT 0
    CHECK (default_probability_bps BETWEEN 0 AND 10000),
  terminal_kind text NOT NULL DEFAULT 'OPEN'
    CHECK (terminal_kind IN ('OPEN', 'WON', 'LOST')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, pipeline_id, position),
  UNIQUE (tenant_id, pipeline_id, name),
  FOREIGN KEY (tenant_id, pipeline_id)
    REFERENCES sales.pipelines(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE sales.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  owner_membership_id uuid,
  source text NOT NULL DEFAULT 'platform' CHECK (length(trim(source)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'QUALIFYING', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED')),
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  qualification_grade text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (qualification_grade IN ('UNKNOWN', 'COLD', 'WARM', 'HOT')),
  qualification_notes text CHECK (qualification_notes IS NULL OR length(qualification_notes) <= 4000),
  disqualification_reason text CHECK (disqualification_reason IS NULL OR length(disqualification_reason) <= 1000),
  qualified_at timestamptz,
  converted_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id)
    REFERENCES crm.customers(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, owner_membership_id)
    REFERENCES identity.memberships(tenant_id, id) ON DELETE SET NULL,
  CHECK ((status = 'QUALIFIED') = (qualified_at IS NOT NULL) OR status IN ('CONVERTED')),
  CHECK ((status = 'DISQUALIFIED') = (disqualification_reason IS NOT NULL))
);

CREATE TABLE sales.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  lead_id uuid,
  pipeline_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  owner_membership_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 240),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'WON', 'LOST')),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  expected_value_minor bigint NOT NULL DEFAULT 0 CHECK (expected_value_minor >= 0),
  probability_bps integer NOT NULL DEFAULT 0 CHECK (probability_bps BETWEEN 0 AND 10000),
  expected_close_date date,
  won_order_id uuid,
  loss_reason text CHECK (loss_reason IS NULL OR length(loss_reason) <= 1000),
  closed_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id)
    REFERENCES crm.customers(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, lead_id)
    REFERENCES sales.leads(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, pipeline_id)
    REFERENCES sales.pipelines(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, stage_id)
    REFERENCES sales.pipeline_stages(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, owner_membership_id)
    REFERENCES identity.memberships(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, won_order_id)
    REFERENCES commerce.orders(tenant_id, id) ON DELETE SET NULL,
  CHECK (
    (status = 'OPEN' AND closed_at IS NULL AND won_order_id IS NULL AND loss_reason IS NULL)
    OR (status = 'WON' AND closed_at IS NOT NULL AND loss_reason IS NULL)
    OR (status = 'LOST' AND closed_at IS NOT NULL AND won_order_id IS NULL AND loss_reason IS NOT NULL)
  )
);

CREATE TABLE sales.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid,
  opportunity_id uuid,
  customer_id uuid NOT NULL,
  assigned_membership_id uuid,
  type text NOT NULL CHECK (type IN ('CALL', 'EMAIL', 'MEETING', 'NOTE', 'TASK')),
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'DONE', 'CANCELLED')),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 240),
  body text CHECK (body IS NULL OR length(body) <= 8000),
  due_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, lead_id)
    REFERENCES sales.leads(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, opportunity_id)
    REFERENCES sales.opportunities(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, customer_id)
    REFERENCES crm.customers(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assigned_membership_id)
    REFERENCES identity.memberships(tenant_id, id) ON DELETE SET NULL,
  CHECK (lead_id IS NOT NULL OR opportunity_id IS NOT NULL),
  CHECK ((status = 'DONE') = (completed_at IS NOT NULL))
);

CREATE TABLE sales.opportunity_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  from_stage_id uuid,
  to_stage_id uuid NOT NULL,
  changed_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  reason text CHECK (reason IS NULL OR length(reason) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, opportunity_id)
    REFERENCES sales.opportunities(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, from_stage_id)
    REFERENCES sales.pipeline_stages(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, to_stage_id)
    REFERENCES sales.pipeline_stages(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX sales_leads_tenant_status_idx
  ON sales.leads (tenant_id, status, updated_at DESC);
CREATE INDEX sales_leads_customer_idx
  ON sales.leads (tenant_id, customer_id, updated_at DESC);
CREATE INDEX sales_opportunities_pipeline_stage_idx
  ON sales.opportunities (tenant_id, pipeline_id, stage_id, status, updated_at DESC);
CREATE INDEX sales_opportunities_customer_idx
  ON sales.opportunities (tenant_id, customer_id, updated_at DESC);
CREATE INDEX sales_activities_due_idx
  ON sales.activities (tenant_id, status, due_at) WHERE status = 'PLANNED';
CREATE INDEX sales_stage_history_opportunity_idx
  ON sales.opportunity_stage_history (tenant_id, opportunity_id, created_at DESC);

CREATE TRIGGER sales_pipelines_touch_updated_at
BEFORE UPDATE ON sales.pipelines FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
CREATE TRIGGER sales_pipeline_stages_touch_updated_at
BEFORE UPDATE ON sales.pipeline_stages FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
CREATE TRIGGER sales_leads_touch_updated_at
BEFORE UPDATE ON sales.leads FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
CREATE TRIGGER sales_opportunities_touch_updated_at
BEFORE UPDATE ON sales.opportunities FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
CREATE TRIGGER sales_activities_touch_updated_at
BEFORE UPDATE ON sales.activities FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE OR REPLACE FUNCTION sales.assert_opportunity_stage_pipeline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sales.pipeline_stages stage
    WHERE stage.tenant_id = NEW.tenant_id
      AND stage.id = NEW.stage_id
      AND stage.pipeline_id = NEW.pipeline_id
      AND stage.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Sales opportunity stage does not belong to its active pipeline';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_opportunity_stage_pipeline_guard
BEFORE INSERT OR UPDATE OF tenant_id, pipeline_id, stage_id ON sales.opportunities
FOR EACH ROW EXECUTE FUNCTION sales.assert_opportunity_stage_pipeline();

CREATE OR REPLACE FUNCTION sales.assert_terminal_stage_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE expected_terminal text;
BEGIN
  SELECT terminal_kind INTO expected_terminal
  FROM sales.pipeline_stages
  WHERE tenant_id = NEW.tenant_id AND id = NEW.stage_id;
  IF expected_terminal = 'WON' AND NEW.status <> 'WON' THEN
    RAISE EXCEPTION 'Won sales stage requires WON opportunity status';
  ELSIF expected_terminal = 'LOST' AND NEW.status <> 'LOST' THEN
    RAISE EXCEPTION 'Lost sales stage requires LOST opportunity status';
  ELSIF expected_terminal = 'OPEN' AND NEW.status <> 'OPEN' THEN
    RAISE EXCEPTION 'Open sales stage requires OPEN opportunity status';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_opportunity_terminal_status_guard
BEFORE INSERT OR UPDATE OF tenant_id, stage_id, status ON sales.opportunities
FOR EACH ROW EXECUTE FUNCTION sales.assert_terminal_stage_status();

CREATE OR REPLACE FUNCTION sales.prevent_stage_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Sales opportunity stage history is append-only';
END;
$$;

CREATE TRIGGER sales_stage_history_append_only
BEFORE UPDATE OR DELETE ON sales.opportunity_stage_history
FOR EACH ROW EXECUTE FUNCTION sales.prevent_stage_history_mutation();

ALTER TABLE sales.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.opportunity_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.pipelines FORCE ROW LEVEL SECURITY;
ALTER TABLE sales.pipeline_stages FORCE ROW LEVEL SECURITY;
ALTER TABLE sales.leads FORCE ROW LEVEL SECURITY;
ALTER TABLE sales.opportunities FORCE ROW LEVEL SECURITY;
ALTER TABLE sales.activities FORCE ROW LEVEL SECURITY;
ALTER TABLE sales.opportunity_stage_history FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON sales.pipelines
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON sales.pipeline_stages
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON sales.leads
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON sales.opportunities
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON sales.activities
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON sales.opportunity_stage_history
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT USAGE ON SCHEMA sales TO platform_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  sales.pipelines,
  sales.pipeline_stages,
  sales.leads,
  sales.opportunities,
  sales.activities
TO platform_app;
GRANT SELECT, INSERT ON sales.opportunity_stage_history TO platform_app;

-- Existing tenants already have instantiated system roles. Backfill the sales
-- permissions from the canonical templates without modifying custom roles.
INSERT INTO identity.role_permissions (tenant_id, role_id, permission_code)
SELECT role.tenant_id, role.id, template_permission.permission_code
FROM identity.roles role
JOIN identity.role_template_permissions template_permission
  ON template_permission.template_code = role.code
WHERE role.is_system = true
  AND template_permission.permission_code LIKE 'sales.%'
ON CONFLICT DO NOTHING;

COMMIT;
