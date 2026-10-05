# Usage, Metering, Analytics, and ROI Contracts

## Purpose

Analytics dashboards and commercial billing are later product workstreams, but the
data required by them must be produced when each operational feature is built.

This document defines the early measurement contracts so the platform does not
need to reconstruct historical usage, provider cost, conversions, or automation
outcomes from raw provider payloads at the end of the project.

## Principles

1. Operational domain tables remain source of truth for business state.
2. Versioned domain events describe meaningful state transitions.
3. Canonical usage records describe measured consumption/cost units.
4. Analytics projections/aggregates are derived and rebuildable where practical.
5. Billing consumes canonical usage records and entitlements; it does not invent
   usage by querying arbitrary operational history.
6. Retry/replay must not double count business outcomes or billable units unless a
   genuinely new provider unit/cost was consumed.
7. Tenant, source, resource and correlation identity are preserved throughout.
8. Raw secrets, provider credentials and unbounded PII are never measurement
   metadata.

## Usage ledger

Use an append-only/idempotent tenant-scoped model equivalent to:

```text
usage_record
- id
- tenant_id
- meter_key
- quantity
- unit
- occurred_at
- source_type
- source_id
- resource_type
- resource_id
- provider_key nullable
- connection_id nullable
- estimated_cost nullable
- cost_currency nullable
- correlation_id
- causation_id nullable
- idempotency_key
- bounded_metadata
- created_at
```

The exact SQL design may normalize meter definitions/cost details, but it must
preserve these semantics.

## Meter definition registry

A meter definition should state:

- stable key/version policy;
- description;
- unit;
- aggregation behavior;
- source of truth for quantity;
- whether retries create a new unit;
- whether it may be billable;
- whether provider cost applies;
- dimensions allowed in bounded metadata;
- retention/rollup rules.

Do not change a meter's business meaning silently. Introduce a new key/version if
an incompatible semantic change is required.

## Candidate meter families

Only create meters that support a real operational/commercial purpose.

### Messaging

Possible units:

- outbound provider message accepted/sent;
- provider conversation/category unit if the launch provider bills that way;
- media transfer/storage when commercially relevant.

Provider pricing models change over time; keep provider-specific cost calculation
behind a pricing/cost adapter rather than hard-coding assumptions into canonical
message tables.

### Campaigns

Possible units:

- eligible recipient snapshot;
- attempted recipient send;
- accepted provider send;
- provider-priced conversation/message unit where applicable.

Do not charge/count a successful recipient twice because a worker retried the
same deterministic send.

### AI

Possible units:

- model request;
- input units/tokens;
- output units/tokens;
- embeddings units/tokens;
- reranker request/units;
- tool invocation where commercially meaningful.

Track provider/model and estimated cost from actual consumption when available.
Fallback may consume multiple model requests and therefore multiple provider-cost
records while still producing one business outcome.

### Automation

Possible units:

- automation run;
- node execution for selected commercially relevant nodes;
- durable timer/workflow execution where useful.

Avoid highly granular meters that add cost/complexity without commercial value.

### Integrations

Possible units:

- sync/backfill items/pages if plans depend on them;
- provider actions;
- webhook volume if commercially relevant.

Operational metrics may exist without becoming billable meters.

### Storage

Possible units:

- media/object bytes-month or equivalent rollup;
- knowledge/custom-data storage if future plans require it.

## Idempotency rules

Every usage producer defines an idempotency key tied to the underlying consumed
unit.

Examples:

- outbound message: canonical message/provider-attempt identity;
- campaign recipient: campaign-run + recipient + action category;
- AI request: AI request ID;
- provider action: provider-action ID and relevant attempt semantics;
- automation run: automation-run ID.

A processing retry that replays persistence without new external consumption does
not create new usage.

If a provider call was genuinely executed twice and both incur provider cost,
provider-cost records may reflect both attempts while business-level success
metrics remain deduplicated.

## Cost records

Provider cost may be stored in the usage ledger or a related normalized cost
record.

Requirements:

- tenant;
- provider;
- consumed usage reference;
- cost amount/currency;
- estimated vs finalized state;
- pricing-version/effective-date reference where useful;
- source evidence/reference;
- idempotency.

Never represent a simulation/planned provider action as actual provider cost.
Simulation may show a clearly labeled estimate.

## Provider pricing abstraction

Do not scatter provider pricing formulas across business modules.

Use a provider-cost/pricing abstraction capable of versioning effective pricing
rules because Meta/model/shipping/payment pricing can change.

A pricing adapter may calculate estimated cost from normalized provider usage.
Later reconciliation may replace/adjust it with finalized provider invoice data if
available.

## Analytics projections

Build reporting models from canonical events and usage records through idempotent
consumers.

Possible layers:

```text
canonical domain events + usage
            |
            v
analytics consumers
            |
            v
fact/aggregate/materialized tables
            |
            v
Dashboard API
```

Keep PostgreSQL initially. Add ClickHouse/warehouse/etc. only after measured need
and an ADR.

## Required attribution references

Where the domain supports them, retain enough stable references for:

- customer;
- order/conversion;
- recovery opportunity;
- campaign/run/recipient;
- sales opportunity;
- automation/run;
- AI operator/request/tool;
- provider action;
- message/conversation;
- workflow;
- correlation/causation.

Do not copy full domain records into analytics events.

## Recovery attribution

A recovered conversion may be connected by a combination of:

- explicit recovery opportunity ID;
- message/automation/campaign correlation;
- customer identity;
- resulting order/conversion;
- bounded attribution time window;
- coupon/offer reference;
- attribution method and confidence.

Prefer explicit deterministic references over heuristic matching.

Store method/confidence so dashboards do not present uncertain attribution as an
absolute fact.

## Campaign attribution

Attribution should avoid double counting the same conversion across multiple
messages/recipients/runs.

Define a deterministic attribution policy such as first/last eligible touch or an
explicit business rule. Record the method/version.

Campaigns may share a conversion with Recovery; executive reporting must define
whether those are separate dimensions of one conversion or mutually exclusive
credit to prevent inflated total revenue.

## Sales attribution

Link won opportunities/conversions to canonical customer/order where available.
Do not create a separate sales customer identity solely for reporting.

## Operational KPI families

### Executive

- revenue/order volume where canonical commerce data supports it;
- recovered revenue;
- campaign-attributed revenue;
- automated workload;
- provider cost;
- AI cost;
- automation/AI outcome rates;
- gross measurable operational ROI indicators.

### Support

- conversations;
- inbound/outbound volume;
- first response/resolution;
- ticket/SLA breach;
- AI assist/autonomous/escalation;
- human workload distribution.

### Commerce

- orders;
- confirmation rate;
- duplicate prevention;
- cancellation/modification;
- payment/fulfillment states;
- order value.

### Shipping

- created/accepted;
- delivery rate;
- first-attempt success;
- failure reasons;
- rescue opened/resolved;
- reschedule/address-correction impact;
- RTS/terminal failure.

### Returns / Refunds

- return rate;
- reason distribution;
- inspection/resolution time;
- exchange/refund rate;
- refund amount;
- provider failure/approval latency.

### Recovery

- opportunities;
- eligible/suppressed;
- attempts;
- conversion rate;
- recovered value;
- incentive/cost;
- net recoverable ROI.

### Sales

- leads;
- qualification;
- stage conversion;
- pipeline value;
- expected value;
- win/loss;
- follow-up/age.

### Campaigns

- audience size;
- suppressed;
- attempted/sent/delivered/read/failed;
- conversions;
- attributed revenue;
- provider cost;
- revenue/cost or contribution metrics.

### Automation

- runs;
- completion/failure/cancel;
- action volume;
- saved/automated work proxies where defensible;
- provider/AI cost caused by automation.

### AI

- requests;
- routing tiers/models;
- latency;
- usage/cost;
- tool proposals/executions;
- approval/escalation;
- autonomy rate;
- eval scores/regressions;
- outcome rate where a real business link exists.

## ROI principles

Do not claim fabricated "hours saved" or revenue uplift without a defined method.

Every ROI metric must document:

- numerator/denominator;
- source events/usage;
- attribution method;
- time range;
- confidence/estimate status where applicable;
- excluded cases;
- currency conversion policy if multiple currencies exist.

Examples of defensible platform ROI:

- recovered revenue directly linked to Recovery opportunities;
- saved confirmed orders after delivery rescue if causal definition is explicit;
- prevented duplicate-order value marked as prevented/potential, not realized
  revenue;
- provider/AI cost versus attributed campaign/recovery revenue;
- automated resolution rate rather than unsupported human-hours claims.

## Billing

Later Billing consumes the canonical usage ledger to implement:

- plans;
- subscriptions;
- entitlements;
- quotas;
- billing periods;
- overages;
- trials;
- suspension hooks;
- invoice/reference state.

Billing aggregation must be reproducible from usage records and plan/pricing
versions. Do not query random operational tables directly for each invoice.

## Entitlements and quotas

Entitlements control product capability independently from authentication.

Examples:

- enabled modules/features;
- maximum users/stores/connections/operators;
- monthly metered limits;
- allowed AI routing tiers;
- campaign/automation capability.

Server-side checks remain authoritative. Frontend visibility may reflect
entitlements but cannot enforce them alone.

Security/rate-limit safeguards remain even when a commercial quota is unlimited.

## Privacy and retention

Measurement should minimize PII.

Prefer stable internal IDs and bounded categorical dimensions over raw name,
phone, email, address, prompt text or message text.

Retention/rollup may keep aggregated commercial/operational data while deleting
raw detail according to governance policy, provided tenant/legal requirements and
audit integrity are preserved.

## Observability vs analytics vs billing

Keep concepts distinct:

- **observability** answers "is the system healthy and why did it fail?";
- **analytics** answers "what operational/business outcome occurred?";
- **usage/metering** answers "what measurable unit was consumed?";
- **billing** answers "what is the tenant entitled to and what is commercially
  chargeable?".

One event may contribute to multiple concerns, but do not collapse them into one
unstructured logging table.

## Tests

Required tests include:

- two-tenant usage/projection isolation;
- usage idempotency under retries/replay;
- provider-cost attempt semantics;
- campaign/recovery attribution duplicate prevention;
- projection rebuild/idempotency where supported;
- billing aggregation equals source usage;
- quota/entitlement server enforcement;
- performance on realistic aggregate volumes;
- no secret/unbounded PII in usage/analytics metadata;
- simulation estimates never become actual usage/provider cost.
