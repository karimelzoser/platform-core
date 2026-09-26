-- Runtime table grants require schema USAGE before PostgreSQL can evaluate
-- tenant RLS policies. Historical messaging/ticket migrations remain intact.

BEGIN;

GRANT USAGE ON SCHEMA messaging, tickets TO platform_app;

COMMIT;
