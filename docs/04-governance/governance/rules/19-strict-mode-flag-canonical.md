# Rule 19 — Strict-mode flag canonical — `noUncheckedIndexedAccess: true` по всьому monorepo

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-13 by @Skords-01
> **Next review:** 2026-08-11
> **Status:** Active

> Per-rule canonical body for Hard Rule #19. Compact summary lives in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/04-governance/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/**/tsconfig.json`
- `packages/**/tsconfig.json`

## Enforced by

- **ci** — node tools/tsconfig-guard/check.mjs (run by pnpm lint)
- **convention** — tools/tsconfig-guard/allowlist.json — every override of a GUARDED strict-family flag MUST have an entry with path/option/value/reason/expires/owner
- **doc** — docs/90-work/initiatives/archive/\_0012-perfect-strictness-rollout.md (rollout plan, baselines, criteria DONE)

## Why / What is enforced

> Why a hard rule? Sergeant — strict-TS-first monorepo. Прапори strict-сімейства (`strict`, `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`) — `true` у `packages/config/tsconfig.base.json` за замовчуванням. Per-app `tsconfig.json` MUST NOT silently override їх до `false`. Після рoll-out-у Initiative 0012 (всі фази ✅ Done, ініціатива closed; `tools/tsconfig-guard/allowlist.json` порожній — жодного residual override) — drift = регресія в strict coverage, яка раніше коштувала кварталів roll-out-у.

**Rule.** Будь-який `apps/{app}/tsconfig.json` або `packages/{pkg}/tsconfig.json`, що задає `false` для одного з 10 strict-family прапорів вище, має бути:

1. зареєстрований у [`tools/tsconfig-guard/allowlist.json`](../../../../tools/tsconfig-guard/allowlist.json) з полями `path` / `option` / `value: false` / `reason` / `expires: YYYY-MM-DD` / `owner`, **АБО**
2. видалений (override gone — flag успадковується з `tsconfig.base.json`).

CI запускає `node tools/tsconfig-guard/check.mjs` (через `pnpm lint`). Будь-який неавторизований override ламає білд. Allowlist-entries без активної ініціативи — скоро `expires`, після чого CI знов падає.

**Coverage tracking.** [`scripts/strict-coverage.mjs`](../../../../scripts/strict-coverage.mjs) пише markdown-таблицю в `$GITHUB_STEP_SUMMARY` з per-flag-coverage статистикою (12 / 12 = 100% — мета). Status: усі 10 strict-family прапорів = 12 / 12 = 100% (residual `apps/web` для `exactOptionalPropertyTypes` / `noPropertyAccessFromIndexSignature` знятий; `allowlist.json` = `[]`).

**Що блокує:**

- Новий `tsconfig.json` з `"noUncheckedIndexedAccess": false` без allowlist entry — `pnpm lint` падає на `tsconfig-guard`.
- Allowlist entry без `expires` поля або з `expires` у минулому — `pnpm lint` падає.
- Видалення `noUncheckedIndexedAccess: true` з `tsconfig.base.json` (downgrade per-flag) — гайд блокує commit.

**What this rule does NOT block:**

- Інші TS-прапори, які не входять у `GUARDED_OPTIONS` (e.g. `noImplicitOverride`, `useDefineForClassFields`).
- Allowlist-entries з активним `expires` у майбутньому — це temporary debt, і саме для цього існує allowlist.

Tracked у [Initiative 0012 — Perfect TS strictness rollout](../../../90-work/initiatives/archive/_0012-perfect-strictness-rollout.md) і живий burndown — у [`docs/90-work/tech-debt/frontend.md` §11.1](../../../90-work/tech-debt/frontend.md).

## Related

- **doc** — docs/90-work/initiatives/archive/\_0012-perfect-strictness-rollout.md
- **doc** — docs/90-work/tech-debt/frontend.md
- **agents** — #19

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                   | Title                                                                | Merged     |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ---------- |
| [#41](https://github.com/Skords-01/Sergeant/pull/41) | docs(agents): promote hard rules #18/#19 to lint-enforced-convention | 2026-06-28 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._

<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
