# Governance

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Active

Governance in Sergeant is intentionally split between human-readable policy and machine-readable enforcement.

## Sources of truth

- [AGENTS.md](../../AGENTS.md) - human-readable repo contract, hard rules, invariants, budgets, anti-patterns.
- [hard-rules.json](./hard-rules.json) - machine-readable registry for CI and tooling.
- [hard-rules-matrix.md](./hard-rules-matrix.md) - generated enforcement matrix; do not edit manually.
- [review-checklist.md](./review-checklist.md) - reviewer operating checklist.
- [release-policy.md](./release-policy.md) - release classes, blockers, ordering, note-taking expectations.
- [incident-severity-policy.md](./incident-severity-policy.md) - severity model and postmortem threshold.
- [security-incident-policy.md](./security-incident-policy.md) - access compromise classification and first-response policy.
- [policy-review.md](./policy-review.md) and [doc-freshness.md](./doc-freshness.md) - cadence and review process.
- [audit-freeze-2026-05-05.md](./audit-freeze-2026-05-05.md) - active 4-week freeze on new audit/initiative/playbook/ADR files (until 2026-06-02).
- [feature-flags.md](./feature-flags.md) - operational registry of release toggles, experiments, kill switches (human-readable; code in `apps/{web,mobile}/src/core/lib/featureFlags.ts` is executable source of truth).
- [external-link-allowlist.json](./external-link-allowlist.json) - machine-readable allowlist for `pnpm docs:check-links` (immutable ADRs, anti-bot hosts, localhost-only references). Each entry needs a non-trivial `reason`; loader rejects empty/short reasons.

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
