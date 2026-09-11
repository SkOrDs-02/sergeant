# ADR-0090: n8n repository layer decommission

- **Status:** Accepted
- **Date:** 2026-09-02
- **Last validated:** 2026-09-04 by @codex
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** [ADR-0026](./0026-n8n-workflow-source-of-truth.md)
- **Related:** [ADR-0074](./0074-hosting-hetzner-coolify.md), [ADR-0075](./0075-openclaw-gateway-decommissioned.md), [ADR-0081](./0081-repository-simplification.md), [ADR-0089](./0089-job-substrates-outbox-broker-timer.md)

## Decision

The repository-owned n8n automation layer is decommissioned. Workflow JSON,
its manifest/reporting matrix, generator/validator, compose services, and
repository CI ownership are not part of the current runtime. Periodic work
that remains required belongs to the server-side substrates in ADR-0089.

This is a repository/runtime decommission, not a claim that every historical
string or compatibility artifact has already disappeared. Remaining references
must be classified explicitly as one of:

- historical permalink/documentation that must not be executed;
- transitional compatibility surface that still has a live consumer; or
- stale residue to remove in a normal cleanup change.

In particular, an environment variable, legacy table, internal replay route,
dashboard, or runbook mention must not be called “removed” until its live
consumer and operational owner have been checked.

## Consequences

Do not restore n8n workflows to solve a new scheduling need. Update stale docs
and compatibility residues in place as they are found, preserving historical
links only where they provide audit value. The decommission does not weaken
Hard Rule #20: legacy OpenClaw/PAT material remains forbidden in production.
