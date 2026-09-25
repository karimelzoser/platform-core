# RBAC Permission Matrix

Permissions are tenant-scoped through active memberships. PostgreSQL RLS is the
final data boundary; OPA is the policy decision point for protected commands.

| Permission            | Purpose                                                           | Risk   | Approval behavior                     |
| --------------------- | ----------------------------------------------------------------- | ------ | ------------------------------------- |
| `crm.customers.read`  | Read Customer 360 lists, profiles, tags, and duplicate candidates | LOW    | Not required                          |
| `crm.customers.write` | Create and update Customer 360 records                            | LOW    | Policy controlled                     |
| `crm.tags.manage`     | Create and assign CRM tags                                        | MEDIUM | Policy controlled                     |
| `crm.customers.merge` | Merge a source customer into a canonical target                   | HIGH   | Exact approved action digest required |

`crm.customers.merge` was added in append-only migration `0007`. It must only
be granted to deliberately authorized tenant roles; the command executor and
OPA still require approval even when the permission is present.
