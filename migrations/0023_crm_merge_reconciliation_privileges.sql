-- An approval-bound customer merge reconciles duplicate dependent records
-- before moving the remaining relationships. These narrow DELETE grants are
-- required only for duplicate relationship collapse; crm.customers itself
-- remains non-deletable by the runtime role and RLS remains enforced.

BEGIN;

GRANT DELETE ON crm.contact_points,
  crm.identity_keys,
  crm.external_identities,
  crm.communication_preferences
TO platform_app;

COMMIT;
