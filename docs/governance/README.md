# Governance

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

Governance in Sergeant is intentionally split between human-readable policy and machine-readable enforcement.

## Sources of truth

- [AGENTS.md](../../AGENTS.md) - human-readable repo contract, hard rules, invariants, budgets, anti-patterns.
- [hard-rules.json](./hard-rules.json) - machine-readable registry for CI and tooling.
- [hard-rules-matrix.md](./hard-rules-matrix.md) - generated enforcement matrix; do not edit manually.
- [review-checklist.md](./review-checklist.md) - reviewer operating checklist.
- [release-policy.md](./release-policy.md) - release classes, blockers, ordering, note-taking expectations.
- [incident-severity-policy.md](./incident-severity-policy.md) - severity model and postmortem threshold.
- [policy-review.md](./policy-review.md) and [doc-freshness.md](./doc-freshness.md) - cadence and review process.

## CI gates

- `pnpm lint:governance-sync --strict`
- `pnpm lint:hard-rules-registry`
- `pnpm hard-rules:check`
- `pnpm docs:check-freshness-coverage`
- `pnpm lint:codeowners`

## Update governance docs when

- a hard rule or enforcement mechanism changes
- a new playbook becomes canonical for a risky workflow
- release or incident response process changes
- a sensitive path needs CODEOWNERS coverage
