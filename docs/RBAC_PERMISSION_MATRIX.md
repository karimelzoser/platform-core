# RBAC Permission Matrix

Permissions are tenant-scoped through active memberships. PostgreSQL RLS is the
final data boundary; OPA is the policy decision point for protected commands.

| Permission             | Purpose                                                           | Risk   | Approval behavior                     |
| ---------------------- | ----------------------------------------------------------------- | ------ | ------------------------------------- |
| `crm.customers.read`   | Read Customer 360 lists, profiles, tags, and duplicate candidates | LOW    | Not required                          |
| `crm.customers.write`  | Create and update Customer 360 records                            | LOW    | Policy controlled                     |
| `crm.tags.manage`      | Create and assign CRM tags                                        | MEDIUM | Policy controlled                     |
| `crm.customers.merge`  | Merge a source customer into a canonical target                   | HIGH   | Exact approved action digest required |
| `crm.customers.export` | Download an audited Customer 360 CSV export                       | MEDIUM | Owner/admin only; no approval         |

`crm.customers.merge` was added in append-only migration `0007` and backfilled
only to owner/admin system roles in `0008`; it is not granted to manager,
agent, or viewer. The command executor and OPA still require approval even when
the permission is present.

`crm.customers.export` is added in append-only migration `0009` and backfilled
only to owner/admin system roles. The exported fields are CSV-escaped and values
that spreadsheet tools might interpret as formulas are neutralized.
