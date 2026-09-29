# GitHub + Codex Workflow

## Repository

Use a private repository.

Recommended protections for `main`:

- status checks required
- no force push
- no direct production secrets in Actions
- review before production release

## Codex

Connect Codex to the repository and give it `docs/CODEX_MASTER_PROMPT.md`.

Codex should:

- read `AGENTS.md`
- maintain `docs/IMPLEMENTATION_STATUS.md`
- maintain `docs/CODEX_EXECUTION_QUEUE.md`
- make small reviewable commits directly to `main` when permissions allow
- batch multiple coherent local commits before one push; a local commit is not
  a reason to push or stop
- push at substantial workstream checkpoints, when remote integration evidence
  is needed, when a local batch becomes risky, or for release validation
- run and inspect one CI workflow per pushed batch; repair red CI promptly in a
  local repair batch before the next workstream
- never force push
- never deploy production unless explicitly instructed

PR-based review may be introduced or enforced before production release. Production release and deployment remain separately gated and reviewed.

## Parallel work

Parallelize only where merge boundaries are clear, for example:

- UI design system
- integration SDK
- AI Gateway scaffolding
- test harness
- documentation

Avoid parallel migrations that depend on the same schema unless ordered explicitly.

## Production

GitHub/CI builds and tests.

Production VPS only pulls approved release images and runs controlled migrations/deploy scripts.
