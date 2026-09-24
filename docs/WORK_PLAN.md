# Codex Work Plan

This is an execution order, not a partial-launch plan. Public launch requires the complete release gate.

Codex may parallelize independent workstreams in separate branches/worktrees.

## 0 — Repository foundation

- pnpm workspace
- TypeScript configs
- lint/format
- test frameworks
- shared config
- local Docker integration environment
- CI skeleton
- ADR structure
- health conventions
- structured logging
- errors/correlation IDs

## 1 — Preserve production baseline

- import exact `0001-0003`
- verify checksums
- migration runner/checksum validator
- DB test harness
- typed DB access
- request-context transaction helper

## 2 — Identity/auth runtime

- Keycloak JWT
- user projection
- org selection
- membership
- effective permissions
- OPA client
- guards
- request context
- audit
- approvals foundation

## 3 — Integrations foundation (`0004+`)

- connector registry
- connections
- secret refs
- provider assets
- webhook inbox
- dedupe
- sync/cursors
- reconciliation
- connector SDK

## 4 — CRM application layer

- Customer 360 API/UI
- identity resolution
- duplicate candidates
- merge workflow
- tags/segments
- import/export
- timeline

## 5 — Messaging + tickets

- unified inbox
- channel adapters
- messages/status/media
- assignment/handover
- tickets/SLA

## 6 — Commerce

- catalog
- inventory
- orders
- payments
- fulfillment
- confirmation
- duplicate detection
- modification/cancel

## 7 — Shipping / returns / recovery

- shipping normalization
- carrier abstraction
- tracking
- delivery rescue
- returns/exchanges/refunds
- recovery/attribution

## 8 — Sales + campaigns

- leads/pipeline/opportunities
- campaign audience/suppression/batching/cost/conversion

## 9 — Temporal workflows

Implement/integrate all required workflows and activity boundaries.

## 10 — Automation Studio

- typed triggers/actions
- versioning/publish
- durable runs
- visibility

## 11 — AI Gateway / operators / knowledge

- provider abstraction
- model routing
- operators
- tools
- policy/approval
- RAG
- evals
- cost

## 12 — Custom data

- tables/fields/records
- permissions
- import/export
- API/actions

## 13 — Analytics + billing + developer

- aggregates/dashboards
- usage/metering
- provider cost
- subscription model
- API keys
- outbound webhooks

## 14 — Admin control center

- tenant/integration/workflow health
- dead letters
- failed webhooks
- stuck outbox
- usage/spend
- safe operational actions

## 15 — Full UI completion

Every required surface complete in English LTR and Arabic RTL.

## 16 — Hardening

- threat model
- security
- performance/indexes
- concurrency
- retries
- accessibility
- dependency cleanup

## 17 — Release engineering

- production Dockerfiles
- immutable images
- deployment manifest
- production compose overlays
- migrate/backup/rollback/smoke
- runbook
- release notes
- full acceptance gate

## Stop rule

If validation fails, repair it before marking a workstream complete.
