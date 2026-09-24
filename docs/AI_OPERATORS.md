# AI Gateway and AI Operators

## AI Gateway

FastAPI owns AI provider/model interaction.

Do not scatter vendor SDK calls through business modules.

## Provider abstraction

Support:

- approved external provider adapters
- OpenAI-compatible adapters where appropriate
- local model adapter where hardware permits
- embeddings
- optional reranker

## Routing tiers

0. deterministic/rules
1. small/local/cheap
2. economical general model
3. strong model
4. human escalation

Routing may consider task, risk, latency, tenant policy, language, capability, availability, cost, and context size.

## Required operators

- Customer Support
- Sales Assistant
- Lead Qualification
- Order
- Confirmation
- Recovery
- Shipping
- Returns
- Campaign Assistant
- Moderator

## Modes

- OFF
- COPILOT
- APPROVAL
- AUTONOMOUS

Mode never bypasses risk policy.

## Tool registry

Each tool has:

- stable ID/version
- description
- input/output schema
- required permission
- risk
- approval policy
- idempotency
- timeout/retry
- audit fields
- data sensitivity
- allowed actor/operator modes

Execution:

```text
model proposes tool
 -> schema validation
 -> tenant/actor context
 -> RBAC
 -> OPA
 -> approval when required
 -> domain command
 -> connector when needed
 -> audit/outbox
 -> sanitized result
 -> model
```

No unrestricted HTTP tool and no SQL tool.

## Prompt management

Prompts/instructions are versioned and auditable.

Track operator, version, model constraints, tool set, eval score, and rollout state.

## RAG

Use pgvector initially:

source -> document -> extraction -> chunk -> embedding -> access metadata -> retrieval -> optional reranking -> cited answer.

Every chunk retains source metadata.

## Evals

Create repeatable evals for:

- support accuracy
- Arabic quality
- intent classification
- escalation
- tool selection
- policy compliance
- hallucination
- order/refund safety
- prompt injection
- PII handling
- campaign constraints

## Cost

Record provider/model, units/tokens, tool usage, latency, estimated cost, tenant, operator, and correlation IDs.
