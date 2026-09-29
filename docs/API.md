# API Contract

All non-public endpoints require a valid Keycloak access token, an active application membership, an organization context, required permission, OPA decision, and PostgreSQL RLS transaction context. Protected writes fail closed when OPA is unavailable.

| Endpoint                                                       | Status      | Purpose                                                                                                    |
| -------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /health`                                                  | Implemented | Liveness response; excludes dependencies and tenant data                                                   |
| `GET /v1/session`                                              | Implemented | JWT-verified active membership and effective-permission context                                            |
| `GET /v1/customers`                                            | Implemented | Authenticated, RLS-scoped Customer 360 search and offset pagination                                        |
| `GET /v1/customers/:customerId`                                | Implemented | Authenticated profile detail with RLS-scoped contact-based duplicate candidates                            |
| `GET /v1/customers/:customerId/timeline`                       | Implemented | RLS-scoped audit and customer-merge history timeline                                                       |
| `GET /v1/customers/export.csv`                                 | Implemented | Audited tenant-scoped CSV export, limited to 10,000 active customers and spreadsheet-safe cells            |
| `POST /v1/customers`                                           | Implemented | Idempotent, audited and event-emitting Customer 360 creation                                               |
| `POST /v1/customers/import`                                    | Implemented | Atomic, bounded (100) tenant-scoped customer import after CSV parsing and validation                       |
| `GET /v1/customers/tags`                                       | Implemented | Authenticated, RLS-scoped CRM tag catalog                                                                  |
| `POST /v1/customers/tags`                                      | Implemented | Idempotent, OPA-authorized tag creation                                                                    |
| `POST /v1/customers/:customerId/tags/:tagId`                   | Implemented | Idempotent, OPA-authorized assignment of a tenant tag to a customer                                        |
| `POST /v1/customers/tags/:tagId/assignments`                   | Implemented | Idempotent, bounded (100) OPA-authorized bulk tag assignment                                               |
| `POST /v1/customers/:customerId/suppressions`                  | Implemented | Idempotent, audited channel opt-out; no unverified opt-in endpoint                                         |
| `GET /v1/customers/segments`                                   | Implemented | Authenticated, RLS-scoped static and dynamic segment catalog                                               |
| `POST /v1/customers/segments`                                  | Implemented | Idempotent, OPA-authorized creation of a static customer segment                                           |
| `POST /v1/customers/segments/:segmentId/customers/:customerId` | Implemented | Idempotent, OPA-authorized membership assignment to an active static segment                               |
| `POST /v1/customers/:customerId/merge`                         | Implemented | HIGH-risk, approval-bound, idempotent merge of source into an active canonical target                      |
| `GET /v1/approvals`                                            | Implemented | Tenant-scoped approval inbox                                                                               |
| `GET /v1/conversations`                                        | Implemented | Tenant-scoped messaging inbox read model                                                                   |
| `GET /v1/conversations/:conversationId/messages`               | Implemented | Tenant-scoped conversation message timeline                                                                |
| `POST /v1/approvals/:id/decision`                              | Implemented | Independent approve/reject decision                                                                        |
| `POST /v1/approvals/:id/execute`                               | Implemented | Executes the exact approved CRM merge snapshot with an idempotency key                                     |
| `POST /v1/webhooks/:connectorKey/:connectionId`                | Implemented | Bounded raw JSON, connector signature verification, tenant delivery dedupe, and asynchronous event handoff |
| `GET /v1/integrations/connections`                             | Implemented | Tenant-scoped connection and last recorded health read model                                               |
| `POST /v1/integrations/connections`                            | Implemented | HIGH-risk, approval-aware connection creation using opaque secret references only                          |
| `POST /v1/integrations/connections/:id/disconnect`             | Implemented | HIGH-risk, approval-aware logical disconnect with audit and outbox evidence                                |
| `POST /v1/integrations/connections/:id/health-check`           | Implemented | Idempotent, tenant-scoped health check that records bounded health status and latency                      |
| `POST /v1/integrations/connections/:id/secret-rotations`       | Implemented | CRITICAL, approval-aware opaque-reference rotation; plaintext credentials are never accepted               |
| `GET /v1/integrations/connections/:id/assets`                  | Implemented | Tenant-scoped persisted provider-asset catalog                                                             |
| `POST /v1/integrations/connections/:id/assets/refresh`         | Implemented | Idempotent, OPA-authorized provider-asset discovery and persistence                                        |
| `GET /v1/integrations/connections/:id/sync-runs`               | Implemented | Tenant-scoped durable integration sync-run history                                                         |
| `POST /v1/integrations/connections/:id/sync-runs`              | Implemented | Idempotent, OPA-authorized request persisted for post-commit sync processing                               |

Responses for operational failures include a correlation ID. Secret values never appear in API responses or logs.

## Protected command contract

New protected write endpoints must require `Idempotency-Key` and use the shared
`@platform/command-execution` executor. It verifies the authenticated tenant,
permission, OPA decision, and any digest-bound approval before the transaction.
Within one transaction it performs the domain mutation, consumes the approval,
writes a sanitized append-only audit record, persists the response for safe
idempotent replay, and writes the transactional outbox event. Controllers must
not reimplement that sequence.

Customer merge takes `targetCustomerId` and a non-empty `reason` in the JSON
body; the path customer is always the source. It requires
`crm.customers.merge`, an exact approved action digest, and `Idempotency-Key`.
The source becomes historical (`MERGED`) and points at the still-active target.
