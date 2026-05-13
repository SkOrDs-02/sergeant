# L14 — `pnpm install --frozen-lockfile` in dev workflow

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed

| Field          | Value                                                     |
| -------------- | --------------------------------------------------------- |
| **Severity**   | Low                                                       |
| **Sprint**     | [Sprint 4](./sprint-4.md)                                 |
| **Owner**      | platform                                                  |
| **Effort**     | 0.1 person-day                                            |
| **Status**     | Closed (2026-05-05) — batched M20 + L1 + L14 hardening PR |
| **Discovered** | 2026-05-03 deep security review                           |

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

## Resolution

- Tightened `package.json -> engines.pnpm` from `">=9"` (any pnpm 9+,
  including hypothetical 10/11) to `"9.x"` (one major). Combined with
  the existing `"packageManager": "pnpm@9.15.1"` and `volta.pnpm:
9.15.1` declarations this gives three locks at three layers (corepack,
  Volta, engine-strict warnings), all pointing at a single major.
- Added an explicit `pnpm install --frozen-lockfile` paragraph to
  [`CONTRIBUTING.md` → Setup](../../../CONTRIBUTING.md#setup) explaining
  why the flag is the dev default, what to do when `git status` shows
  unintended `pnpm-lock.yaml` drift, and which commands intentionally
  rewrite the lockfile (`pnpm add`, `pnpm update`).
- L1 ships alongside this card and adds a single-major guard for
  `pnpm.overrides` so contributors don't widen `>=X` ranges back into
  the lockfile by accident — see
  [`./L1-uuid-override.md`](./L1-uuid-override.md).
- The optional `.husky/pre-commit` warn-on-lockfile-drift hook is
  intentionally NOT shipped: lockfile changes happen routinely
  alongside `pnpm add`/`pnpm update` PRs and a noisy local hook would
  train contributors to ignore it. CI's `pnpm install --frozen-lockfile`
  is the single source of truth.

## Cross-references

- [`./H2-dependabot.md`](./H2-dependabot.md)
- [`./L1-uuid-override.md`](./L1-uuid-override.md)
