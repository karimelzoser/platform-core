-- Provider-verified opt-in evidence. A browser or ordinary staff command may
-- record a suppression, but may not create an OPTED_IN state: only a signed,
-- persisted connector webhook delivery can be used as evidence.

BEGIN;

CREATE TABLE crm.communication_consent_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  customer_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'WHATSAPP', 'MESSENGER', 'INSTAGRAM', 'PUSH')),
  webhook_delivery_id uuid NOT NULL UNIQUE REFERENCES integrations.webhook_deliveries(id),
  provider_consent_id text NOT NULL CHECK (length(provider_consent_id) BETWEEN 1 AND 500),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, customer_id, channel, provider_consent_id),
  FOREIGN KEY (tenant_id, customer_id)
    REFERENCES crm.customers(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX crm_communication_consent_evidence_customer_idx
  ON crm.communication_consent_evidence (tenant_id, customer_id, channel, occurred_at DESC, id);

ALTER TABLE crm.communication_consent_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm.communication_consent_evidence
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT, INSERT ON crm.communication_consent_evidence TO platform_app;

COMMIT;
