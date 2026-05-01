# Governance

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

Governance у Sergeant навмисно розділено на human-readable і machine-readable sources of truth.

## Джерела істини

- [AGENTS.md](../../AGENTS.md) - human-readable repo contract, hard rules, invariants, budgets і anti-patterns.
- [hard-rules.json](./hard-rules.json) - machine-readable registry для CI та tooling.
- [hard-rules-matrix.md](./hard-rules-matrix.md) - generated enforcement matrix; не редагується вручну.
- [review-checklist.md](./review-checklist.md) - reviewer operating checklist.
- [policy-review.md](./policy-review.md) і [doc-freshness.md](./doc-freshness.md) - cadence та process policy.

## Що перевіряє CI

- `pnpm lint:governance-sync --strict`
- `pnpm lint:hard-rules-registry`
- `pnpm hard-rules:check`
- `pnpm docs:check-freshness-coverage`
- `pnpm lint:codeowners`

## Коли оновлювати governance docs

- Змінився hard rule або enforcement mechanism.
- Додано новий playbook, який став canonical recipe.
- Змінився review/merge process.
- З'явився новий sensitive path, що потребує CODEOWNERS coverage.
