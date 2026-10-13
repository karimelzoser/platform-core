-- Canonical campaign orchestration domain.
-- Campaigns freeze CRM-derived audiences before launch, respect normalized consent/suppression,
-- and queue outbound Messaging records post-command without calling providers inline.
-- Long waits/batching use durable campaign batch state that Temporal platform closure can drive.

BEGIN;

CREATE SCHEMA IF NOT EXISTS campaigns;
GRANT USAGE ON SCHEMA campaigns TO platform_app;

-- Campaign relationships are tenant-qualified. CRM contact points and Messaging templates
-- predate the platform-wide composite-key convention, so add non-partial unique indexes
-- before using them as tenant-qualified FK targets.
CREATE UNIQUE INDEX IF NOT EXISTS crm_contact_points_tenant_id_id_unique
  ON crm.contact_points (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS messaging_templates_tenant_id_id_unique
  ON messaging.templates (tenant_id, id);

CREATE TABLE campaigns.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  description text CHECK (description IS NULL OR length(description) <= 4000),
  channel text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP','MESSENGER','INSTAGRAM')),
  connection_id uuid NOT NULL,
  segment_id uuid,
  template_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT','SCHEDULED','RUNNING','PAUSED','COMPLETED','CANCELLED'
  )),
  timezone text NOT NULL DEFAULT 'UTC',
  send_window_start_minute integer NOT NULL DEFAULT 480
    CHECK (send_window_start_minute BETWEEN 0 AND 1439),
  send_window_end_minute integer NOT NULL DEFAULT 1260
    CHECK (send_window_end_minute BETWEEN 0 AND 1439),
  batch_size integer NOT NULL DEFAULT 500 CHECK (batch_size BETWEEN 1 AND 5000),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  temporal_workflow_id text CHECK (
    temporal_workflow_id IS NULL OR length(temporal_workflow_id) BETWEEN 1 AND 500
  ),
  attribution_window_hours integer NOT NULL DEFAULT 168
    CHECK (attribution_window_hours BETWEEN 1 AND 2160),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, connection_id)
    REFERENCES integrations.connections(tenant_id, id),
  FOREIGN KEY (tenant_id, segment_id) REFERENCES crm.segments(tenant_id, id),
  FOREIGN KEY (tenant_id, template_id) REFERENCES messaging.templates(tenant_id, id),
  CHECK (send_window_start_minute <> send_window_end_minute),
  CHECK (status <> 'SCHEDULED' OR scheduled_at IS NOT NULL),
  CHECK (status <> 'RUNNING' OR started_at IS NOT NULL),
  CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL),
  CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL)
);
CREATE INDEX campaigns_state_idx
  ON campaigns.campaigns (tenant_id, status, scheduled_at, created_at DESC);
CREATE INDEX campaigns_connection_idx
  ON campaigns.campaigns (tenant_id, connection_id, status, created_at DESC);
CREATE TRIGGER campaigns_touch_updated_at
  BEFORE UPDATE ON campaigns.campaigns FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE campaigns.recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  contact_point_id uuid,
  destination text NOT NULL CHECK (length(trim(destination)) BETWEEN 1 AND 500),
  channel text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP','MESSENGER','INSTAGRAM')),
  locale text NOT NULL DEFAULT 'en' CHECK (length(locale) BETWEEN 2 AND 16),
  timezone text NOT NULL DEFAULT 'UTC' CHECK (length(timezone) BETWEEN 1 AND 100),
  consent_status text NOT NULL CHECK (consent_status IN ('OPTED_IN','UNKNOWN','OPTED_OUT')),
  eligibility text NOT NULL CHECK (eligibility IN ('ELIGIBLE','SUPPRESSED')),
  suppression_code text CHECK (
    suppression_code IS NULL OR suppression_code ~ '^[A-Z][A-Z0-9_]{1,63}$'
  ),
  send_identity text NOT NULL CHECK (length(send_identity) BETWEEN 16 AND 500),
  delivery_status text NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN (
    'PENDING','QUEUED','SENT','DELIVERED','READ','FAILED','DEAD_LETTER','CANCELLED','SUPPRESSED'
  )),
  last_attempt integer NOT NULL DEFAULT 0 CHECK (last_attempt >= 0),
  frozen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, campaign_id, customer_id, destination),
  UNIQUE (tenant_id, send_identity),
  FOREIGN KEY (tenant_id, campaign_id)
    REFERENCES campaigns.campaigns(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, customer_id)
    REFERENCES crm.customers(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, contact_point_id)
    REFERENCES crm.contact_points(tenant_id, id) ON DELETE SET NULL (contact_point_id),
  CHECK (eligibility <> 'SUPPRESSED' OR suppression_code IS NOT NULL),
  CHECK (delivery_status <> 'SUPPRESSED' OR eligibility = 'SUPPRESSED')
);
CREATE INDEX campaign_recipients_dispatch_idx
  ON campaigns.recipients (tenant_id, campaign_id, delivery_status, frozen_at, id);
CREATE INDEX campaign_recipients_customer_idx
  ON campaigns.recipients (tenant_id, customer_id, campaign_id);
CREATE TRIGGER campaign_recipients_touch_updated_at
  BEFORE UPDATE ON campaigns.recipients FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE campaigns.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  state text NOT NULL DEFAULT 'QUEUED' CHECK (state IN (
    'QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED'
  )),
  first_recipient_ordinal integer NOT NULL CHECK (first_recipient_ordinal > 0),
  last_recipient_ordinal integer NOT NULL CHECK (last_recipient_ordinal >= first_recipient_ordinal),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claimed_by text,
  claimed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, campaign_id, sequence),
  FOREIGN KEY (tenant_id, campaign_id)
    REFERENCES campaigns.campaigns(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX campaign_batches_claim_idx
  ON campaigns.batches (tenant_id, state, sequence, created_at)
  WHERE state IN ('QUEUED','FAILED');
CREATE TRIGGER campaign_batches_touch_updated_at
  BEFORE UPDATE ON campaigns.batches FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE campaigns.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  status text NOT NULL DEFAULT 'RESERVED' CHECK (status IN (
    'RESERVED','QUEUED','SENT','DELIVERED','READ','FAILED','DEAD_LETTER','CANCELLED','SUPPRESSED'
  )),
  conversation_id uuid,
  message_id uuid,
  provider_message_id text,
  provider_cost_minor bigint NOT NULL DEFAULT 0 CHECK (provider_cost_minor >= 0),
  provider_cost_currency text CHECK (
    provider_cost_currency IS NULL OR provider_cost_currency ~ '^[A-Z]{3}$'
  ),
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, recipient_id, attempt),
  UNIQUE (tenant_id, message_id),
  FOREIGN KEY (tenant_id, campaign_id)
    REFERENCES campaigns.campaigns(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, recipient_id)
    REFERENCES campaigns.recipients(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES messaging.conversations(tenant_id, id),
  FOREIGN KEY (tenant_id, message_id)
    REFERENCES messaging.messages(tenant_id, id),
  CHECK (status NOT IN ('QUEUED','SENT','DELIVERED','READ') OR message_id IS NOT NULL),
  CHECK (status <> 'QUEUED' OR queued_at IS NOT NULL),
  CHECK (status <> 'SENT' OR sent_at IS NOT NULL),
  CHECK (status <> 'DELIVERED' OR delivered_at IS NOT NULL),
  CHECK (status <> 'READ' OR read_at IS NOT NULL),
  CHECK (status <> 'FAILED' OR failed_at IS NOT NULL)
);
CREATE INDEX campaign_deliveries_status_idx
  ON campaigns.deliveries (tenant_id, campaign_id, status, updated_at DESC);
CREATE TRIGGER campaign_deliveries_touch_updated_at
  BEFORE UPDATE ON campaigns.deliveries FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE campaigns.conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  order_id uuid NOT NULL,
  attributed_value_minor bigint NOT NULL CHECK (attributed_value_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, campaign_id, order_id),
  FOREIGN KEY (tenant_id, campaign_id)
    REFERENCES campaigns.campaigns(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, recipient_id)
    REFERENCES campaigns.recipients(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, order_id)
    REFERENCES commerce.orders(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX campaign_conversions_recipient_idx
  ON campaigns.conversions (tenant_id, recipient_id, occurred_at DESC);

CREATE TABLE campaigns.timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  actor_type text NOT NULL DEFAULT 'SYSTEM'
    CHECK (actor_type IN ('USER','AI','SYSTEM','SERVICE','INTEGRATION')),
  actor_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, campaign_id)
    REFERENCES campaigns.campaigns(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX campaign_timeline_idx
  ON campaigns.timeline (tenant_id, campaign_id, occurred_at, id);

CREATE OR REPLACE FUNCTION campaigns.prevent_snapshot_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.campaign_id <> NEW.campaign_id
     OR OLD.customer_id <> NEW.customer_id
     OR OLD.destination <> NEW.destination
     OR OLD.channel <> NEW.channel
     OR OLD.locale <> NEW.locale
     OR OLD.timezone <> NEW.timezone
     OR OLD.consent_status <> NEW.consent_status
     OR OLD.eligibility <> NEW.eligibility
     OR OLD.suppression_code IS DISTINCT FROM NEW.suppression_code
     OR OLD.send_identity <> NEW.send_identity
     OR OLD.frozen_at <> NEW.frozen_at THEN
    RAISE EXCEPTION 'Campaign recipient audience snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER campaign_recipient_snapshot_immutable
  BEFORE UPDATE ON campaigns.recipients
  FOR EACH ROW EXECUTE FUNCTION campaigns.prevent_snapshot_identity_mutation();

CREATE OR REPLACE FUNCTION campaigns.prevent_timeline_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Campaign timeline is append-only';
END;
$$;
CREATE TRIGGER campaign_timeline_append_only
  BEFORE UPDATE OR DELETE ON campaigns.timeline
  FOR EACH ROW EXECUTE FUNCTION campaigns.prevent_timeline_mutation();

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'campaigns.campaigns', 'campaigns.recipients', 'campaigns.batches',
    'campaigns.deliveries', 'campaigns.conversions', 'campaigns.timeline'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id())',
      target
    );
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON
  campaigns.campaigns,
  campaigns.recipients,
  campaigns.batches,
  campaigns.deliveries
TO platform_app;
GRANT SELECT, INSERT ON campaigns.conversions, campaigns.timeline TO platform_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA campaigns FROM platform_app;
REVOKE UPDATE, DELETE, TRUNCATE ON campaigns.conversions, campaigns.timeline FROM platform_app;

-- Existing instantiated system roles inherit the canonical campaign permissions.
INSERT INTO identity.role_permissions (tenant_id, role_id, permission_code)
SELECT role.tenant_id, role.id, template_permission.permission_code
FROM identity.roles role
JOIN identity.role_template_permissions template_permission
  ON template_permission.template_code = role.code
WHERE role.is_system = true
  AND template_permission.permission_code LIKE 'campaigns.%'
ON CONFLICT DO NOTHING;

COMMIT;
