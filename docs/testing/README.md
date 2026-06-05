# Testing

> **Last validated:** 2026-06-06 by @claude (bulk-bump artifact corrected — file was content-modified 2026-06-02 adding Property-based testing row; date was still showing the 2026-05-13 batch-bump). **Next review:** 2026-09-06.
> **Status:** Active

Meta-документація на тестову стратегію Sergeant — правила, threshold-и, як додавати
нові скоупи покриття. Тести самі живуть у `apps/web/src/**/*.test.ts(x)`,
`apps/server/src/**/*.test.ts`, `apps/mobile/__tests__/`, `apps/web/e2e/`.

## Документи

> Stryker mutation testing meta-doc (`mutation.md`) було видалено разом з cloudSync v1 engine у PR #052b (commit `a97b8cc8` — `chore(web): retire cloudSync Stryker mutation infra`). CloudSync-v1 mutation scope більше не релевантний, але tier-1 mutation testing повернуто для shared utils: `packages/shared/stryker.utils.conf.json` мутує `src/utils/{macros,date}.ts`, weekly workflow `.github/workflows/mutation-testing.yml` публікує HTML + JSON artifact.

## Тестові шари — як вони лежать

| Шар               | Локація                                              | Тулінг                                       |
| ----------------- | ---------------------------------------------------- | -------------------------------------------- |
| Unit              | `apps/{web,server,mobile}/src/**/*.test.ts(x)?`      | Vitest                                       |
| Integration       | `apps/server/src/**/*.integration.test.ts`           | Vitest + testcontainers                      |
| E2E (web)         | `apps/web/e2e/`                                      | Playwright                                   |
| E2E (mobile)      | `apps/mobile/e2e/`                                   | Detox                                        |
| Critical-flow CI  | `apps/web/e2e/` + `playwright.smoke.config.ts`       | Playwright (canary on every PR)              |
| Visual regression | `apps/web/e2e/visual/`                               | Argos + Playwright                           |
| Property-based    | `packages/shared/src/utils/*.property.test.ts`       | Vitest (seeded PRNG; fast-check pending dep) |
| Mutation          | `packages/shared/stryker.utils.conf.json`            | Stryker + vitest-runner                      |
| Performance       | `tests/perf/` (Lighthouse CI у `.github/workflows/`) | Lighthouse, web-vitals                       |

## Cross-links

- Initiative 0009 (Agent OS hardening, M3 — testing posture): [`docs/initiatives/archive/_0009-agent-os-hardening.md`](../initiatives/archive/_0009-agent-os-hardening.md).
- Testing & DevX PR-план 2026-05: [`docs/planning/pr-plan-testing-devx-2026-05.md`](../planning/pr-plan-testing-devx-2026-05.md) — активні картки T-1…T-8 + D-1…D-4, dependency-граф, acceptance gates.
- Web deep-dive §7 (testing diagnostic): [`docs/audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md`](../audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md).
- Critical-flow E2E config: [`apps/web/playwright.smoke.config.ts`](../../apps/web/playwright.smoke.config.ts) (job `critical-flow` у `.github/workflows/ci.yml` запускає `--grep @critical`).
