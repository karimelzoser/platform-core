-- Narrow resolver for unauthenticated webhook ingress. It exposes no secret
-- reference or connection settings and is intentionally the only pre-tenant
-- lookup available to the runtime role.

BEGIN;

CREATE OR REPLACE FUNCTION integrations.resolve_webhook_connection(
    p_connector_key text,
    p_connection_id uuid
)
RETURNS TABLE (
    tenant_id uuid,
    connection_id uuid,
    connector_key text,
    connection_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, integrations
AS $$
    SELECT c.tenant_id, c.id, c.connector_key, c.status
    FROM integrations.connections AS c
    WHERE c.connector_key = p_connector_key
      AND c.id = p_connection_id;
$$;

REVOKE ALL ON FUNCTION integrations.resolve_webhook_connection(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION integrations.resolve_webhook_connection(text, uuid) TO platform_app;

COMMIT;
