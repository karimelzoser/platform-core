-- Platform integration and policy-control foundation.
-- Historical migrations 0001-0003 are immutable; this migration is append-only.

BEGIN;

CREATE SCHEMA IF NOT EXISTS integrations;
CREATE SCHEMA IF NOT EXISTS policy;

CREATE TABLE integrations.connector_definitions (
    key                 text PRIMARY KEY,
    version             text NOT NULL,
    category            text NOT NULL CHECK (category IN ('COMMERCE', 'MESSAGING', 'SHIPPING', 'PAYMENT', 'EMAIL', 'GENERIC')),
    display_name        text NOT NULL,
    manifest            jsonb NOT NULL,
    enabled             boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE integrations.secret_references (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES identity.organizations(id),
    provider            text NOT NULL,
    reference           text NOT NULL,
    key_version         text NOT NULL,
    state               text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'ROTATING', 'REVOKED')),
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    rotated_at          timestamptz,
    revoked_at          timestamptz,
    UNIQUE (tenant_id, provider, reference),
    UNIQUE (tenant_id, id)
);

CREATE TABLE integrations.connections (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES identity.organizations(id),
    connector_key       text NOT NULL REFERENCES integrations.connector_definitions(key),
    secret_reference_id uuid,
    display_name        text NOT NULL,
    status              text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONNECTED', 'DEGRADED', 'DISCONNECTED', 'REVOKED', 'FAILED')),
    settings            jsonb NOT NULL DEFAULT '{}'::jsonb,
    capabilities        jsonb NOT NULL DEFAULT '[]'::jsonb,
    last_validated_at   timestamptz,
    last_error_code     text,
    last_error_detail   text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, connector_key, display_name),
    FOREIGN KEY (tenant_id, secret_reference_id)
        REFERENCES integrations.secret_references(tenant_id, id)
        DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE integrations.provider_assets (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES identity.organizations(id),
    connection_id       uuid NOT NULL,
    asset_type          text NOT NULL,
    provider_id         text NOT NULL,
    name                text,
    state               text NOT NULL DEFAULT 'ACTIVE',
    attributes          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, connection_id, asset_type, provider_id),
    FOREIGN KEY (tenant_id, connection_id) REFERENCES integrations.connections(tenant_id, id)
);

CREATE TABLE integrations.webhook_deliveries (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES identity.organizations(id),
    connection_id       uuid NOT NULL,
    provider_delivery_id text NOT NULL,
    event_type          text NOT NULL,
    signature_valid     boolean NOT NULL,
    replay_valid        boolean NOT NULL DEFAULT true,
    headers             jsonb NOT NULL DEFAULT '{}'::jsonb,
    payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
    dedupe_key          text NOT NULL,
    state               text NOT NULL DEFAULT 'RECEIVED' CHECK (state IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'REJECTED', 'FAILED', 'DEAD_LETTER')),
    attempts            integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    received_at         timestamptz NOT NULL DEFAULT now(),
    processed_at        timestamptz,
    normalized_event    jsonb,
    last_error          text,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, connection_id, dedupe_key),
    FOREIGN KEY (tenant_id, connection_id) REFERENCES integrations.connections(tenant_id, id)
);

CREATE INDEX webhook_deliveries_pending_idx
    ON integrations.webhook_deliveries (state, received_at)
    WHERE state IN ('RECEIVED', 'FAILED');

CREATE TABLE integrations.sync_runs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES identity.organizations(id),
    connection_id       uuid NOT NULL,
    kind                text NOT NULL CHECK (kind IN ('INITIAL', 'INCREMENTAL', 'BACKFILL', 'RECONCILIATION', 'MANUAL')),
    state               text NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED')),
    cursor              jsonb NOT NULL DEFAULT '{}'::jsonb,
    progress            jsonb NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key     text NOT NULL,
    temporal_workflow_id text,
    started_at          timestamptz,
    finished_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    last_error          text,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, connection_id, idempotency_key),
    FOREIGN KEY (tenant_id, connection_id) REFERENCES integrations.connections(tenant_id, id)
);

CREATE TABLE integrations.connection_health (
    tenant_id           uuid NOT NULL,
    connection_id       uuid NOT NULL,
    status              text NOT NULL CHECK (status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN')),
    checked_at          timestamptz NOT NULL DEFAULT now(),
    latency_ms          integer CHECK (latency_ms >= 0),
    detail              jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (tenant_id, connection_id),
    FOREIGN KEY (tenant_id, connection_id) REFERENCES integrations.connections(tenant_id, id)
);

CREATE TABLE policy.approval_requests (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES identity.organizations(id),
    requested_by        uuid REFERENCES identity.users(id),
    action              text NOT NULL,
    permission          text NOT NULL,
    risk                text NOT NULL CHECK (risk IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    resource_type       text NOT NULL,
    resource_id         text NOT NULL,
    action_digest       text NOT NULL CHECK (action_digest ~ '^[0-9a-f]{64}$'),
    request_snapshot    jsonb NOT NULL,
    policy_reason       text NOT NULL,
    status              text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELED', 'EXECUTED', 'FAILED')),
    decided_by          uuid REFERENCES identity.users(id),
    decided_at          timestamptz,
    expires_at          timestamptz NOT NULL,
    execution_id        text,
    execution_error     text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, action_digest, status)
);

CREATE INDEX approval_requests_inbox_idx
    ON policy.approval_requests (tenant_id, status, expires_at)
    WHERE status = 'REQUESTED';

DO $$
DECLARE
    target text;
BEGIN
    FOREACH target IN ARRAY ARRAY[
        'integrations.secret_references',
        'integrations.connections',
        'integrations.provider_assets',
        'integrations.webhook_deliveries',
        'integrations.sync_runs',
        'integrations.connection_health',
        'policy.approval_requests'
    ] LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
        EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id())', target);
    END LOOP;
END;
$$;

GRANT USAGE ON SCHEMA integrations, policy TO platform_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA integrations, policy TO platform_app;
REVOKE DELETE ON policy.approval_requests FROM platform_app;

COMMIT;
