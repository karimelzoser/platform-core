# Durable Workflows

Temporal workflow code must be deterministic. Activities own database I/O, provider calls, retries, and timeout classification. Workflow IDs are deterministic where an external side effect is duplicate-sensitive.

| Workflow                                        | Trigger                         | Human control                  |
| ----------------------------------------------- | ------------------------------- | ------------------------------ |
| Organization onboarding                         | Organization creation           | Setup completion signal        |
| Integration backfill / reconciliation           | Connection/sync command         | Cancel and progress query      |
| Order confirmation / shipping / delivery rescue | Commerce event                  | Approval and exception signals |
| Recovery / campaign                             | Eligibility and audience freeze | Pause/cancel signal            |
| Return / refund                                 | Customer request                | Approval signal                |
| Conversation operator / automation              | Message or typed trigger        | Handover/cancel signal         |

Every workflow requires replay, retry, timeout, duplicate-start, worker-restart, and relevant human-decision tests before release.
