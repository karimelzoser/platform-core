# Repository Context for Codex

Use `CODEX_MASTER_PROMPT.md` as the project task and `/AGENTS.md` as persistent repository rules.

Do not collapse all work into one enormous unreviewable commit.

Maintain at minimum:

- `/docs/IMPLEMENTATION_STATUS.md`
- `/docs/adr/`
- `/docs/API.md`
- `/docs/EVENT_CATALOG.md`
- `/docs/WORKFLOWS.md`
- `/docs/CONNECTORS.md`
- `/docs/RBAC_PERMISSION_MATRIX.md`
- `/docs/THREAT_MODEL.md`
- `/docs/OPERATIONS_RUNBOOK.md`
- `/docs/RELEASE_CHECKLIST.md`

When uncertainty is architectural, record the decision in an ADR.

When uncertainty is a current external provider API detail, verify against official provider documentation rather than guessing.

Do not deploy to production as part of normal implementation tasks.
