# Threat Model

## Assets and boundaries

Tenant-owned PostgreSQL data, provider credentials, API keys, incoming webhooks, AI prompts/tool arguments, and operational audit logs are protected assets. Browser clients, providers, Keycloak, OPA, workers, Temporal, and the AI gateway are separate trust boundaries.

## Primary threats and controls

| Threat                           | Control                                                        | Required verification                                                             |
| -------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Cross-tenant BOLA/IDOR           | Membership authorization plus transaction-local PostgreSQL RLS | Two-tenant read, mutation, relationship, export, worker, event, and AI-tool tests |
| Privilege escalation             | DB-owned permissions; protected system roles; OPA              | Role mutation and inactive-membership tests                                       |
| Approval substitution            | SHA-256 digest of canonical action/resource/input              | Changed-payload approval rejection test                                           |
| Unsafe customer reconciliation   | HIGH-risk approval, stable row locks, RLS transaction, history | Cross-tenant, conflict, rollback, and concurrent merge tests                      |
| OPA outage bypass                | Typed OPA client fails closed for protected writes             | Outage contract test                                                              |
| Forged/replayed webhook          | Connector verification, replay check, persisted dedupe key     | Signature, replay, and duplicate tests                                            |
| Credential disclosure            | Secret references only; env/secrets ignored; logs sanitized    | Secret scan and repository review                                                 |
| SSRF / arbitrary provider calls  | Typed connector actions and allowlisted provider endpoints     | URL validation tests                                                              |
| AI prompt injection/action abuse | Typed schemas, tenant context, RBAC, OPA, approvals, audit     | Prompt-injection and cross-tenant tool tests                                      |

## Residual risks

Provider compromise, tenant-admin misuse, and unavailable external identity infrastructure require operational monitoring, scoped credentials, break-glass procedure, and reviewable audit trails.
