-- Provider-neutral, tenant-owned message templates. Rendering remains in the
-- application boundary; connectors receive only the final bounded message.

BEGIN;

CREATE TABLE messaging.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ar')),
  channel text CHECK (channel IN ('EMAIL', 'WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'WEB_CHAT', 'API')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, locale)
);

CREATE INDEX messaging_templates_active_idx
  ON messaging.templates (tenant_id, locale, name)
  WHERE status = 'ACTIVE';

CREATE TRIGGER templates_touch_updated_at
  BEFORE UPDATE ON messaging.templates
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

ALTER TABLE messaging.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messaging.templates
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON messaging.templates TO platform_app;

COMMIT;
