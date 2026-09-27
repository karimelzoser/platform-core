-- Bind locally uploaded media to its tenant and permit one outbound message claim.
BEGIN;

CREATE TABLE messaging.media_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  storage_key text NOT NULL CHECK (length(storage_key) BETWEEN 1 AND 1000),
  media_type text NOT NULL CHECK (media_type IN ('IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO')),
  content_type text NOT NULL CHECK (length(content_type) BETWEEN 1 AND 255),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
  message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 day'),
  UNIQUE (tenant_id, storage_key),
  FOREIGN KEY (tenant_id, message_id) REFERENCES messaging.messages(tenant_id, id)
);

CREATE INDEX messaging_media_uploads_available_idx
  ON messaging.media_uploads (tenant_id, expires_at)
  WHERE message_id IS NULL;
ALTER TABLE messaging.media_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messaging.media_uploads
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
GRANT SELECT, INSERT, UPDATE ON messaging.media_uploads TO platform_app;

COMMIT;
