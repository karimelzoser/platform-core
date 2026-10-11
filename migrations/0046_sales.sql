-- Canonical Sales domain.
-- CRM remains the only customer identity source. Sales owns qualification,
-- pipeline/stage state, opportunities, activities/tasks and commercial outcomes.

BEGIN;

CREATE SCHEMA IF NOT EXISTS sales;
GRANT USAGE ON SCHEMA sales TO platform_app;

CREATE TABLE sales.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX sales_default_pipeline_idx
  ON sales.pipelines (tenant_id) WHERE status = 'ACTIVE' AND is_default;
CREATE UNIQUE INDEX sales_pipeline_name_idx
  ON sales.pipelines (tenant_id, lower(name)) WHERE status = 'ACTIVE';
CREATE TRIGGER sales_pipelines_touch_updated_at
  BEFORE UPDATE ON sales.pipelines FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE sales.stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  pipeline_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  category text NOT NULL DEFAULT 'OPEN' CHECK (category IN ('OPEN','WON','LOST')),
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 0 AND 10000),
  default_probability_basis_points integer NOT NULL DEFAULT 0
    CHECK (default_probability_basis_points BETWEEN 0 AND 10000),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, pipeline_id, id),
  UNIQUE (tenant_id, pipeline_id, code),
  UNIQUE (tenant_id, pipeline_id, sort_order),
  FOREIGN KEY (tenant_id, pipeline_id) REFERENCES sales.pipelines(tenant_id, id)
);
CREATE TRIGGER sales_stages_touch_updated_at
  BEFORE UPDATE ON sales.stages FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE sales.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  owner_membership_id uuid,
  status text NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW','QUALIFIED','DISQUALIFIED','CONVERTED','ARCHIVED')),
  source text NOT NULL DEFAULT 'platform' CHECK (length(trim(source)) BETWEEN 1 AND 100),
  qualification_score integer CHECK (qualification_score IS NULL OR qualification_score BETWEEN 0 AND 100),
  qualification_grade text CHECK (qualification_grade IS NULL OR qualification_grade IN ('LOW','MEDIUM','HIGH')),
  qualification_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(qualification_data) = 'object'),
  disqualification_reason text CHECK (disqualification_reason IS NULL OR length(disqualification_reason) <= 2000),
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, customer_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES crm.customers(tenant_id, id),
  FOREIGN KEY (tenant_id, owner_membership_id) REFERENCES identity.memberships(tenant_id, id),
  CHECK (status <> 'DISQUALIFIED' OR disqualification_reason IS NOT NULL),
  CHECK (status <> 'CONVERTED' OR converted_at IS NOT NULL)
);
CREATE INDEX sales_leads_worklist_idx
  ON sales.leads (tenant_id, status, owner_membership_id, updated_at DESC);
CREATE INDEX sales_leads_customer_idx
  ON sales.leads (tenant_id, customer_id, created_at DESC);
CREATE TRIGGER sales_leads_touch_updated_at
  BEFORE UPDATE ON sales.leads FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE sales.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  lead_id uuid,
  pipeline_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  owner_membership_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 240),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','WON','LOST','CANCELLED')),
  expected_value_minor bigint NOT NULL DEFAULT 0 CHECK (expected_value_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  probability_basis_points integer NOT NULL DEFAULT 0 CHECK (probability_basis_points BETWEEN 0 AND 10000),
  expected_close_date date,
  won_store_id uuid,
  won_order_id uuid,
  closed_at timestamptz,
  loss_reason text CHECK (loss_reason IS NULL OR length(loss_reason) <= 2000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, customer_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES crm.customers(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id, lead_id) REFERENCES sales.leads(tenant_id, customer_id, id),
  FOREIGN KEY (tenant_id, pipeline_id) REFERENCES sales.pipelines(tenant_id, id),
  FOREIGN KEY (tenant_id, pipeline_id, stage_id) REFERENCES sales.stages(tenant_id, pipeline_id, id),
  FOREIGN KEY (tenant_id, owner_membership_id) REFERENCES identity.memberships(tenant_id, id),
  FOREIGN KEY (tenant_id, won_store_id, won_order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id),
  CHECK ((won_store_id IS NULL) = (won_order_id IS NULL)),
  CHECK (status = 'OPEN' OR closed_at IS NOT NULL),
  CHECK (status <> 'WON' OR won_order_id IS NOT NULL),
  CHECK (status <> 'LOST' OR loss_reason IS NOT NULL)
);
CREATE INDEX sales_opportunities_worklist_idx
  ON sales.opportunities (tenant_id, status, pipeline_id, stage_id, owner_membership_id, updated_at DESC);
CREATE INDEX sales_opportunities_customer_idx
  ON sales.opportunities (tenant_id, customer_id, created_at DESC);
CREATE UNIQUE INDEX sales_opportunity_one_per_lead_idx
  ON sales.opportunities (tenant_id, lead_id) WHERE lead_id IS NOT NULL;
CREATE TRIGGER sales_opportunities_touch_updated_at
  BEFORE UPDATE ON sales.opportunities FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE sales.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  lead_id uuid,
  opportunity_id uuid,
  assigned_membership_id uuid,
  activity_type text NOT NULL CHECK (activity_type IN ('CALL','EMAIL','MEETING','NOTE','TASK','FOLLOW_UP')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','CANCELLED')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  body text CHECK (body IS NULL OR length(body) <= 20000),
  due_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES crm.customers(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id, lead_id) REFERENCES sales.leads(tenant_id, customer_id, id),
  FOREIGN KEY (tenant_id, customer_id, opportunity_id) REFERENCES sales.opportunities(tenant_id, customer_id, id),
  FOREIGN KEY (tenant_id, assigned_membership_id) REFERENCES identity.memberships(tenant_id, id),
  CHECK (lead_id IS NOT NULL OR opportunity_id IS NOT NULL),
  CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL)
);
CREATE INDEX sales_activities_due_idx
  ON sales.activities (tenant_id, status, assigned_membership_id, due_at, created_at DESC);
CREATE INDEX sales_activities_customer_idx
  ON sales.activities (tenant_id, customer_id, created_at DESC);
CREATE TRIGGER sales_activities_touch_updated_at
  BEFORE UPDATE ON sales.activities FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE sales.timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  lead_id uuid,
  opportunity_id uuid,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  actor_type text NOT NULL DEFAULT 'SYSTEM' CHECK (actor_type IN ('USER','AI','SYSTEM','SERVICE','INTEGRATION')),
  actor_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES crm.customers(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id, lead_id) REFERENCES sales.leads(tenant_id, customer_id, id),
  FOREIGN KEY (tenant_id, customer_id, opportunity_id) REFERENCES sales.opportunities(tenant_id, customer_id, id),
  CHECK (lead_id IS NOT NULL OR opportunity_id IS NOT NULL)
);
CREATE INDEX sales_timeline_customer_idx
  ON sales.timeline (tenant_id, customer_id, occurred_at, id);

-- Assignment is meaningful only for active tenant memberships. The composite FK
-- prevents cross-tenant IDs; this trigger also prevents assignment to suspended
-- or removed members if SQL is reached outside the application service.
CREATE OR REPLACE FUNCTION sales.assert_active_assignee()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, sales, identity, platform
AS $$
DECLARE assignment_text text;
DECLARE assignment_id uuid;
BEGIN
  assignment_text := coalesce(to_jsonb(NEW)->>'owner_membership_id', to_jsonb(NEW)->>'assigned_membership_id');
  IF assignment_text IS NULL THEN RETURN NEW; END IF;
  assignment_id := assignment_text::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM identity.memberships membership
    WHERE membership.tenant_id = NEW.tenant_id
      AND membership.id = assignment_id
      AND membership.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Sales assignee must be an active tenant membership';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_leads_active_assignee
  BEFORE INSERT OR UPDATE OF owner_membership_id ON sales.leads
  FOR EACH ROW EXECUTE FUNCTION sales.assert_active_assignee();
CREATE TRIGGER sales_opportunities_active_assignee
  BEFORE INSERT OR UPDATE OF owner_membership_id ON sales.opportunities
  FOR EACH ROW EXECUTE FUNCTION sales.assert_active_assignee();
CREATE TRIGGER sales_activities_active_assignee
  BEFORE INSERT OR UPDATE OF assigned_membership_id ON sales.activities
  FOR EACH ROW EXECUTE FUNCTION sales.assert_active_assignee();

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'sales.pipelines','sales.stages','sales.leads','sales.opportunities','sales.activities','sales.timeline'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id())',
      target
    );
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON
  sales.pipelines, sales.stages, sales.leads, sales.opportunities, sales.activities
TO platform_app;
GRANT SELECT, INSERT ON sales.timeline TO platform_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA sales FROM platform_app;
REVOKE UPDATE, DELETE, TRUNCATE ON sales.timeline FROM platform_app;

INSERT INTO identity.permissions (code, category, description, default_risk)
VALUES
  ('sales.activities.read', 'sales', 'View sales activities and tasks', 'LOW'),
  ('sales.activities.manage', 'sales', 'Create and update sales activities and tasks', 'MEDIUM')
ON CONFLICT (code) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  default_risk = EXCLUDED.default_risk;

INSERT INTO identity.role_template_permissions (template_code, permission_code)
SELECT template_code, permission_code
FROM (VALUES
  ('owner','sales.activities.read'), ('owner','sales.activities.manage'),
  ('admin','sales.activities.read'), ('admin','sales.activities.manage'),
  ('manager','sales.activities.read'), ('manager','sales.activities.manage'),
  ('agent','sales.activities.read'), ('agent','sales.activities.manage'),
  ('viewer','sales.activities.read')
) AS mapping(template_code, permission_code)
ON CONFLICT DO NOTHING;

-- Existing system roles are snapshots of templates; backfill only the new Sales
-- activity permissions and leave tenant custom roles unchanged.
INSERT INTO identity.role_permissions (tenant_id, role_id, permission_code)
SELECT role.tenant_id, role.id, template_permission.permission_code
FROM identity.roles role
JOIN identity.role_template_permissions template_permission
  ON template_permission.template_code = role.code
WHERE role.is_system = true
  AND template_permission.permission_code IN ('sales.activities.read','sales.activities.manage')
ON CONFLICT DO NOTHING;

COMMIT;
