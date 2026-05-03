# L14 — `pnpm install --frozen-lockfile` in dev workflow

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Low                                           |
| **Sprint**     | [Sprint 4](./sprint-4.md)                     |
| **Owner**      | platform                                      |
| **Effort**     | 0.1 person-day                                |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

## Summary

CI uses `pnpm install --frozen-lockfile` (correct). Dev `pnpm install` can
silently update the lockfile, allowing supply-chain regressions to slip
into a feature branch without review.

## Recommendation

- Document `pnpm install --frozen-lockfile` as the default for every
  contributor.
- Lock `corepack` to a known-good `pnpm` major in `package.json`
  `engines.pnpm`.
- Optional: pre-commit hook that warns when `pnpm-lock.yaml` is modified
  in the same commit as application code.

## Correction points

- `package.json` — `"engines": { "pnpm": "9.x" }`, `"packageManager":
  "pnpm@<exact-version>"`.
- `CONTRIBUTING.md` — add a paragraph about `--frozen-lockfile` and how to
  update dependencies intentionally.
- `.husky/pre-commit` (or equivalent) — optional warn for lockfile drift.

## Verification

- **CI:** the lint job fails if `pnpm-lock.yaml` was modified by `pnpm
  install` instead of an explicit `pnpm update`.
- **Manual:** local `pnpm install` on a fresh checkout produces a clean
  `git status`.

## Cross-references

- [`./H2-dependabot.md`](./H2-dependabot.md)
- [`./L1-uuid-override.md`](./L1-uuid-override.md)
