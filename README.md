# Platform Core

Multi-tenant operations platform for commerce, customer support, sales, automation, and controlled AI actions.

## Development

Use Node 24 and pnpm 9.15.5. Copy `.env.example` to an untracked local `.env` and supply non-production values. Production secrets, VPS credentials, and database dumps are deliberately ignored.

```sh
corepack pnpm install
corepack pnpm migration:verify
corepack pnpm -r build
corepack pnpm -r typecheck
corepack pnpm -r test
```

Historical migrations `0001`–`0003` are immutable and checksum-verified. New schema work starts at `0004`.

See [implementation status](docs/IMPLEMENTATION_STATUS.md), [architecture](docs/ARCHITECTURE.md), and the [threat model](docs/THREAT_MODEL.md).
