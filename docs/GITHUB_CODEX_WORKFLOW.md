# GitHub + Codex Workflow

## Repository

Use a private repository.

Recommended protections for `main`:

- pull request required
- status checks required
- no force push
- no direct production secrets in Actions
- review before production release

## Codex

Connect Codex to the repository and give it `docs/CODEX_MASTER_PROMPT.md`.

Codex should:

- read `AGENTS.md`
- maintain `docs/IMPLEMENTATION_STATUS.md`
- work in branches/worktrees
- run tests before PR completion
- open PRs with summary, migrations, tests, risks, and screenshots for UI work
- never deploy production unless explicitly instructed

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
