# API Contract

All non-public endpoints require a valid Keycloak access token, an active application membership, an organization context, required permission, OPA decision, and PostgreSQL RLS transaction context. Protected writes fail closed when OPA is unavailable.

| Endpoint                                               | Status      | Purpose                                                                     |
| ------------------------------------------------------ | ----------- | --------------------------------------------------------------------------- |
| `GET /health`                                          | Implemented | Liveness response; excludes dependencies and tenant data                    |
| `GET /v1/session`                                      | Implemented | JWT-verified active membership and effective-permission context             |
| `POST /v1/integrations/:connection/webhooks/:provider` | Planned     | Signature-verified, deduplicated webhook ingress with quick acknowledgement |
| `POST /v1/approvals/:id/decision`                      | Planned     | Digest-bound approval decision                                              |

Responses for operational failures include a correlation ID. Secret values never appear in API responses or logs.

## Protected command contract

New protected write endpoints must require `Idempotency-Key` and use the shared
`@platform/command-execution` executor. It verifies the authenticated tenant,
permission, OPA decision, and any digest-bound approval before the transaction.
Within one transaction it performs the domain mutation, consumes the approval,
writes a sanitized append-only audit record, persists the response for safe
idempotent replay, and writes the transactional outbox event. Controllers must
not reimplement that sequence.
