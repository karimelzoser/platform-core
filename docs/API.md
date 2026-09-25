# API Contract

All non-public endpoints require a valid Keycloak access token, an active application membership, an organization context, required permission, OPA decision, and PostgreSQL RLS transaction context. Protected writes fail closed when OPA is unavailable.

| Endpoint                                        | Status      | Purpose                                                                                                    |
| ----------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /health`                                   | Implemented | Liveness response; excludes dependencies and tenant data                                                   |
| `GET /v1/session`                               | Implemented | JWT-verified active membership and effective-permission context                                            |
| `GET /v1/customers`                             | Implemented | Authenticated, RLS-scoped Customer 360 search and offset pagination                                        |
| `GET /v1/customers/:customerId`                 | Implemented | Authenticated profile detail with RLS-scoped contact-based duplicate candidates                            |
| `POST /v1/customers`                            | Implemented | Idempotent, audited and event-emitting Customer 360 creation                                               |
| `GET /v1/customers/tags`                        | Implemented | Authenticated, RLS-scoped CRM tag catalog                                                                  |
| `POST /v1/customers/tags`                       | Implemented | Idempotent, OPA-authorized tag creation                                                                    |
| `POST /v1/customers/:customerId/tags/:tagId`    | Implemented | Idempotent, OPA-authorized assignment of a tenant tag to a customer                                        |
| `POST /v1/webhooks/:connectorKey/:connectionId` | Implemented | Bounded raw JSON, connector signature verification, tenant delivery dedupe, and asynchronous event handoff |
| `POST /v1/approvals/:id/decision`               | Planned     | Digest-bound approval decision                                                                             |

Responses for operational failures include a correlation ID. Secret values never appear in API responses or logs.

## Protected command contract

New protected write endpoints must require `Idempotency-Key` and use the shared
`@platform/command-execution` executor. It verifies the authenticated tenant,
permission, OPA decision, and any digest-bound approval before the transaction.
Within one transaction it performs the domain mutation, consumes the approval,
writes a sanitized append-only audit record, persists the response for safe
idempotent replay, and writes the transactional outbox event. Controllers must
not reimplement that sequence.
