# ADR 0003: Customer merge retains the safest consent state

## Status

Accepted, 2026-09-25.

## Context

Customer reconciliation can find conflicting normalized communication
preferences for the source and canonical target. A merge must not make a
previously suppressed customer newly eligible for outbound communication.

## Decision

For a matching communication channel, merge precedence is:

`OPTED_OUT` > `OPTED_IN` > `UNKNOWN`.

The newest available capture and suppression timestamps are retained. Target
defaults take precedence for contact and address primary/default flags; source
records are moved only after their conflicting flag has been cleared.

## Consequences

The result can be more restrictive than either operator expects, which is
intentional. A later explicit consent capture may change the canonical record
through its own audited, policy-controlled command; the merge command itself
never upgrades consent.
