# Importing the Exact Production Baseline

The repository owner must export the already-applied migration files from production before Codex writes migration `0004`.

Required files:

```text
/opt/platform/migrations/0001_foundation.sql
/opt/platform/migrations/0002_authorization.sql
/opt/platform/migrations/0003_crm_customer360.sql
```

Repository destinations:

```text
migrations/0001_foundation.sql
migrations/0002_authorization.sql
migrations/0003_crm_customer360.sql
```

Useful non-secret references:

```text
/opt/platform/config/opa/authorization.rego
/opt/platform/config/temporal/dynamicconfig.yaml
/opt/platform/compose/core.yml
/opt/platform/compose/temporal.yml
/opt/platform/compose/keycloak.yml
/opt/platform/compose/opa.yml
```

Before committing configuration files, inspect them for accidental inline secrets. Environment-variable references are acceptable; secret values are not.

Never add:

```text
/etc/platform/platform.env
/etc/platform/keycloak-admin.env
production database dumps
Keycloak admin passwords
provider credentials
n8n encryption keys
```

After import, record SHA-256 values for the three migration files and make CI fail if those historical files change.
