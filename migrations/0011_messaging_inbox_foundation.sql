BEGIN;

CREATE SCHEMA IF NOT EXISTS messaging;

CREATE TABLE messaging.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  customer_id uuid,
  channel text NOT NULL CHECK (channel IN ('EMAIL', 'WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'WEB_CHAT', 'API')),
  provider_conversation_id text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PENDING', 'CLOSED')),
  mode text NOT NULL DEFAULT 'HUMAN' CHECK (mode IN ('AI', 'COPILOT', 'HUMAN', 'PAUSED')),
  assigned_to uuid REFERENCES identity.users(id),
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES crm.customers(tenant_id, id),
  UNIQUE NULLS NOT DISTINCT (tenant_id, channel, provider_conversation_id)
);
CREATE INDEX messaging_conversations_inbox_idx ON messaging.conversations (tenant_id, status, last_message_at DESC);
CREATE TRIGGER conversations_touch_updated_at BEFORE UPDATE ON messaging.conversations FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE messaging.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  sender_type text NOT NULL CHECK (sender_type IN ('CUSTOMER', 'USER', 'AI', 'SYSTEM', 'INTEGRATION')),
  body text NOT NULL CHECK (length(body) <= 20000),
  provider_message_id text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES messaging.conversations(tenant_id, id) ON DELETE CASCADE,
  UNIQUE NULLS NOT DISTINCT (tenant_id, provider_message_id)
);
CREATE INDEX messaging_messages_timeline_idx ON messaging.messages (tenant_id, conversation_id, sent_at);

ALTER TABLE messaging.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messaging.conversations USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE messaging.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messaging.messages USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON messaging.conversations, messaging.messages TO platform_app;
COMMIT;
