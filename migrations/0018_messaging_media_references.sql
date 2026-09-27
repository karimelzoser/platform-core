-- Tenant-owned media references only; bytes remain behind the local-media
-- abstraction and are never copied into messaging records or provider calls.
BEGIN;

ALTER TABLE messaging.messages
  ADD CONSTRAINT messaging_messages_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TABLE messaging.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  message_id uuid NOT NULL,
  storage_key text NOT NULL CHECK (length(storage_key) BETWEEN 1 AND 1000),
  media_type text NOT NULL CHECK (media_type IN ('IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO')),
  content_type text NOT NULL CHECK (length(content_type) BETWEEN 1 AND 255),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, message_id, storage_key),
  FOREIGN KEY (tenant_id, message_id) REFERENCES messaging.messages(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX messaging_message_attachments_message_idx
  ON messaging.message_attachments (tenant_id, message_id);
ALTER TABLE messaging.message_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messaging.message_attachments
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
GRANT SELECT, INSERT ON messaging.message_attachments TO platform_app;

COMMIT;
