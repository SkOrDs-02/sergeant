# Testing

> **Last validated:** 2026-05-05 by Devin. **Next review:** 2026-08-04.
> **Status:** Active

Meta-документація на тестову стратегію Sergeant — правила, threshold-и, як додавати
нові скоупи покриття. Тести самі живуть у `apps/web/src/**/*.test.ts(x)`,
`apps/server/src/**/*.test.ts`, `apps/mobile/__tests__/`, `apps/web/e2e/`.

## Документи

| Документ                       | Призначення                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [`mutation.md`](./mutation.md) | Stryker mutation testing — конфіги, threshold-и, які модулі покрито, як додати новий критичний модуль. |

## Тестові шари — як вони лежать

| Шар               | Локація                                              | Тулінг                          |
| ----------------- | ---------------------------------------------------- | ------------------------------- |
| Unit              | `apps/{web,server,mobile}/src/**/*.test.ts(x)?`      | Vitest                          |
| Integration       | `apps/server/src/**/*.integration.test.ts`           | Vitest + testcontainers         |
| E2E (web)         | `apps/web/e2e/`                                      | Playwright                      |
| E2E (mobile)      | `apps/mobile/e2e/`                                   | Detox                           |
| Critical-flow CI  | `apps/web/e2e/` + `playwright.smoke.config.ts`       | Playwright (canary on every PR) |
| Visual regression | `apps/web/e2e/visual/`                               | Argos + Playwright              |
| Mutation          | `apps/web/stryker.<module>.conf.json`                | Stryker + vitest-runner         |
| Performance       | `tests/perf/` (Lighthouse CI у `.github/workflows/`) | Lighthouse, web-vitals          |

## Cross-links

- Initiative 0009 (Agent OS hardening, M3 — testing posture): [`docs/initiatives/0009-agent-os-hardening.md`](../initiatives/0009-agent-os-hardening.md).
- Web deep-dive §7 (testing diagnostic): [`docs/audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md`](../audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md).
- Critical-flow E2E config: [`apps/web/playwright.smoke.config.ts`](../../apps/web/playwright.smoke.config.ts) (job `critical-flow` у `.github/workflows/ci.yml` запускає `--grep @critical`).
