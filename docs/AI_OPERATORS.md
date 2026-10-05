# AI Gateway and AI Operators

## Architecture rule

The AI Gateway centralizes model/provider interaction. Do not scatter model SDKs
through business modules and do not let AI become a parallel backend.

AI may reason, classify, retrieve, recommend and propose typed tools. Business
mutations still execute through the same tenant/RBAC/OPA/approval/idempotency/
audit/outbox/domain-command path used by humans, APIs and Automation Studio.

## Required implementation order

AI work is intentionally sequenced:

1. typed AI tool platform;
2. production AI Gateway/provider routing foundation;
3. evaluation harness and Knowledge/RAG foundation;
4. operators and autonomy rollout.

Do not implement high-autonomy agents first and retrofit safety/evaluation later.

## AI Gateway

FastAPI owns AI provider/model interaction and AI orchestration boundaries.

It supports:

- provider/model adapters;
- capability catalog;
- routing;
- embeddings;
- optional reranker;
- RAG orchestration;
- tool proposal protocol;
- telemetry/usage/cost;
- fallback/escalation;
- eval hooks.

## Provider abstraction

Support:

- approved external provider adapters;
- OpenAI-compatible adapters where appropriate;
- local/small model adapters where hardware permits;
- embeddings;
- optional reranker.

A local-model adapter does not imply that the current 2-vCPU/8GB production VPS
must host a frontier-class model. Local/private inference may live on suitable
separate infrastructure behind the adapter.

## Routing tiers

0. deterministic/rules;
1. small/local/cheap;
2. economical general model;
3. strong model;
4. human escalation.

Routing may consider:

- task/capability;
- risk;
- operator mode;
- language/dialect;
- latency target;
- tenant policy/plan;
- availability;
- cost;
- context size;
- required tool/reasoning capability;
- evaluation/rollout constraints.

Routing decisions and fallback should be observable and costed without exposing
secrets or unbounded sensitive prompts in logs.

## Typed tool registry

Tools are implemented before autonomous operators.

Each tool declares:

- stable ID and version;
- description/purpose;
- input schema;
- output schema;
- required permission;
- resource/tenant context requirements;
- risk class;
- approval policy;
- idempotency behavior;
- timeout/retry;
- data sensitivity;
- allowed actor/operator modes;
- audit fields;
- usage/cost fields where relevant.

Execution:

```text
model proposes tool
 -> schema validation
 -> tenant/actor/resource context
 -> RBAC
 -> OPA
 -> approval when required
 -> canonical domain command
 -> committed intent/audit/outbox
 -> post-commit connector when needed
 -> sanitized normalized result
 -> model/operator
```

No unrestricted HTTP tool, SQL tool, shell tool, provider credential access, or
arbitrary code execution.

AI tools do not duplicate domain logic. `order.cancel`, `message.send`,
`shipment.reschedule`, `refund.request`, `opportunity.move`, etc. must map to the
same canonical application command used by non-AI actors.

## Required operators

- Customer Support;
- Sales Assistant;
- Lead Qualification;
- Order;
- Confirmation;
- Recovery;
- Shipping;
- Returns;
- Campaign Assistant;
- Moderator.

## Operator configuration

Each operator combines versioned configuration for:

- instructions/prompt version;
- model/routing policy;
- allowed tools;
- knowledge scope;
- operator mode;
- escalation/handover policy;
- confidence/decision thresholds where meaningful;
- required eval suite/threshold;
- cost/usage policy;
- rollout state.

Operator configuration may be produced by the approved configuration compiler but
is still versioned/auditable platform configuration.

## Modes

- OFF;
- COPILOT;
- APPROVAL;
- AUTONOMOUS.

Mode never bypasses risk, permission, tenant, approval or tool constraints.

Examples:

- `COPILOT`: proposes response/action for a human;
- `APPROVAL`: may prepare a tool action but waits for required human approval;
- `AUTONOMOUS`: may execute only actions that policy/tool/risk configuration
  permits without a separate human decision; HIGH/CRITICAL policy can still
  require approval.

## Prompt management

Prompts/instructions are versioned and auditable.

Track:

- operator;
- prompt/instruction version;
- compatible model constraints;
- tool set/version;
- knowledge scope;
- eval suite/result;
- rollout state;
- tenant override policy where permitted.

Prompt changes that materially alter tool behavior or autonomy require evaluation
before rollout.

## Knowledge / RAG

Use pgvector initially:

`source -> document version -> extraction -> chunk -> embedding -> access metadata -> retrieval -> optional reranking -> cited context`

Every chunk retains source/version metadata and tenant/access scope.

Retrieval must enforce tenant/access filtering before the context reaches the
model. Cross-tenant RAG is a release-blocking security failure.

Cited answers should preserve source identifiers sufficient for the UI/operator to
show evidence without exposing inaccessible content.

## Evals

Create repeatable evaluation before autonomous rollout.

Required families include:

- support accuracy;
- English and Arabic quality;
- Egyptian/Gulf dialect handling where product scope requires;
- intent/classification;
- escalation/handover;
- tool selection;
- policy/permission compliance;
- hallucination;
- order/refund safety;
- prompt injection;
- PII/sensitive-data handling;
- wrong tenant/resource attempts;
- malformed/unauthorized tools;
- retrieval/citation quality;
- campaign constraints;
- latency;
- model/provider fallback;
- cost regression.

Evaluation records bind the relevant operator/prompt/model/tool/knowledge versions
so a passing result cannot be ambiguously reused after a material change.

Required threshold failures block the affected rollout.

## AI usage and cost

Record canonical usage for:

- tenant;
- operator;
- model/provider;
- routing tier;
- request type;
- input/output units/tokens where available;
- embeddings/reranker usage where applicable;
- tool calls;
- latency;
- estimated provider cost/currency;
- correlation/workflow/automation references;
- outcome/escalation state where useful.

Retries/fallback must not double-count business outcomes; provider consumption may
still be recorded when it actually incurred cost.

## Conversation orchestration

Use `ConversationOperatorWorkflow` only where durable multi-step behavior, waits,
approvals, human handover or external state justify Temporal durability. Simple
single-request inference does not need a Temporal workflow by default.

Conversation/operator workflows call canonical message/domain commands and do not
write messaging/business tables directly as an alternate path.

## Safety and failure behavior

- invalid/malformed tool arguments: reject before execution;
- OPA unavailable for protected writes: fail closed;
- changed high-risk action payload after approval: invalidate prior approval;
- low confidence/unsupported capability: fallback or escalate;
- provider/model outage: route/fallback according to policy, never fabricate a
  successful business action;
- prompt injection attempting tool/tenant/policy bypass: ignore/reject and record
  safety evidence as appropriate;
- sensitive tool results: return only the minimum sanitized data needed by the
  operator.
