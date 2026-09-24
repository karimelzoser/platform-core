# API Contract

All non-public endpoints require a valid Keycloak access token, an active application membership, an organization context, required permission, OPA decision, and PostgreSQL RLS transaction context. Protected writes fail closed when OPA is unavailable.

| Endpoint                                               | Status      | Purpose                                                                     |
| ------------------------------------------------------ | ----------- | --------------------------------------------------------------------------- |
| `GET /health`                                          | Implemented | Liveness response; excludes dependencies and tenant data                    |
| `GET /v1/session`                                      | In progress | JWT-verified active membership and effective-permission context             |
| `POST /v1/integrations/:connection/webhooks/:provider` | Planned     | Signature-verified, deduplicated webhook ingress with quick acknowledgement |
| `POST /v1/approvals/:id/decision`                      | Planned     | Digest-bound approval decision                                              |

Responses for operational failures include a correlation ID. Secret values never appear in API responses or logs.
