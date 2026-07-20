# Зведена матриця hardening-карток

> **Last touched:** 2026-07-20 by @cursor (matrix rows synced to card Status headers). **Next review:** 2026-10-18.
> **Status:** Active

> **Попередження:** Ручний знімок; source of truth — самі картки. Оновлено 2026-07-20 під Status карток (M1/M3/M6/M7/M12 → Reference/Deprecated; M9 CORS PR-2 shipped).

Цей документ зводить в одному місці всі hardening-картки з трьох джерел: серія `stack-pulse-2026-05` (39 карток C/H/M/L), архівна ініціатива `_0008-platform-hardening` (5 фаз), та архівна ініціатива `_0009-agent-os-hardening` (18 PR-трекерів). Призначення — швидкий огляд «що зроблено / що висить» без необхідності відкривати кожну картку окремо.

---

## Зведена статистика

| Джерело                                             | Всього | Closed / Merged / Done | Open / Planned | Partial / Unknown |
| --------------------------------------------------- | ------ | ---------------------- | -------------- | ----------------- |
| stack-pulse-2026-05 (C1–C6, H1–H10, M1–M12, L1–L12) | 39     | 32                     | 0              | 7                 |
| \_0008-platform-hardening (фази 1–5)                | 5      | 5                      | 0              | 0                 |
| \_0009-agent-os-hardening (PR 1.1–5.3)              | 18     | 17                     | 1              | 0                 |
| **Разом**                                           | **62** | **54**                 | **1**          | **7**             |

---

## Джерело 1 — stack-pulse-2026-05

Зріз стеку від 2026-05-03. Джерело: [`stack-pulse-2026-05/00-overview.md`](./stack-pulse-2026-05/00-overview.md). Кожна картка має окремий `pr-NN-*.md` файл.

### Critical (C1–C6)

| ID  | Назва                                                               | Source-файл                                                                                                  | Статус | GitHub PR                                                          |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------ |
| C1  | Подвійна env-система (`env.ts` + `env/env.ts` + `betterAuthEnv.ts`) | [`pr-01-unify-env-modules.md`](./stack-pulse-2026-05/pr-01-unify-env-modules.md)                             | Closed | [#2122](https://github.com/Skords-01/Sergeant/pull/2122)           |
| C2  | Rate-limit in-memory fallback при відмові Redis                     | [`pr-02-rate-limit-fail-closed.md`](./stack-pulse-2026-05/pr-02-rate-limit-fail-closed.md)                   | Merged | [#1552](https://github.com/Skords-01/Sergeant/pull/1552)           |
| C3  | bcrypt + `MAX_PASSWORD_LENGTH=128` (silent 72-byte cap)             | [`pr-03-bcrypt-password-limit.md`](./stack-pulse-2026-05/pr-03-bcrypt-password-limit.md)                     | Merged | [#1550](https://github.com/Skords-01/Sergeant/pull/1550)           |
| C4  | Bus factor = 1 (єдиний `@Skords-01` owner усього)                   | [`pr-04-bus-factor-secondary-owners.md`](./stack-pulse-2026-05/pr-04-bus-factor-secondary-owners.md)         | Closed | —                                                                  |
| C5  | TypeScript 6.0.3 + `@types/node@25.6` на Node 20                    | [`pr-05-typescript-types-node-downgrade.md`](./stack-pulse-2026-05/pr-05-typescript-types-node-downgrade.md) | Closed | —                                                                  |
| C6  | OpenClaw plain `Git_PAT` з `contents:write`                         | [`pr-06-openclaw-github-app.md`](./stack-pulse-2026-05/pr-06-openclaw-github-app.md)                         | Closed | [#1816](https://github.com/Skords-01/Sergeant/pull/1816) (Phase 1) |

### High (H1–H10)

| ID  | Назва                                            | Source-файл                                                                                            | Статус | GitHub PR                                                |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------- |
| H1  | Body-size policy order-dependent                 | [`pr-07-body-size-declarative-policy.md`](./stack-pulse-2026-05/pr-07-body-size-declarative-policy.md) | Closed | [#2081](https://github.com/Skords-01/Sergeant/pull/2081) |
| H2  | API-version rewrite committed to v1 forever      | [`pr-08-api-versioning-consolidation.md`](./stack-pulse-2026-05/pr-08-api-versioning-consolidation.md) | Closed | —                                                        |
| H3  | `@parse/node-apn` non-canonical maintainer       | [`pr-09-apns-library-adr.md`](./stack-pulse-2026-05/pr-09-apns-library-adr.md)                         | Closed | —                                                        |
| H4  | Better Auth security review (own-crypto adapter) | [`pr-10-better-auth-security-review.md`](./stack-pulse-2026-05/pr-10-better-auth-security-review.md)   | Closed | —                                                        |
| H5  | Drizzle schema ↔ SQL drift untracked             | [`pr-11-drizzle-schema-drift-ci.md`](./stack-pulse-2026-05/pr-11-drizzle-schema-drift-ci.md)           | Closed | [#2089](https://github.com/Skords-01/Sergeant/pull/2089) |
| H6  | Sentry tracesSampleRate static 0.1               | [`pr-12-sentry-traces-sampler.md`](./stack-pulse-2026-05/pr-12-sentry-traces-sampler.md)               | Closed | [#2086](https://github.com/Skords-01/Sergeant/pull/2086) |
| H7  | PG pool size 10 — undersized для AI ingestion    | [`pr-13-postgres-pool-sizing.md`](./stack-pulse-2026-05/pr-13-postgres-pool-sizing.md)                 | Closed | —                                                        |
| H8  | Vercel COEP `require-corp` — broad blast radius  | [`pr-14-vercel-coep-review.md`](./stack-pulse-2026-05/pr-14-vercel-coep-review.md)                     | Closed | —                                                        |
| H9  | `AI_QUOTA_DISABLED=1` ризик у production         | [`pr-15-ai-quota-disabled-hardblock.md`](./stack-pulse-2026-05/pr-15-ai-quota-disabled-hardblock.md)   | Closed | [#1567](https://github.com/Skords-01/Sergeant/pull/1567) |
| H10 | Pino без enforced redaction policy               | [`pr-16-pino-redaction-policy.md`](./stack-pulse-2026-05/pr-16-pino-redaction-policy.md)               | Closed | [#2125](https://github.com/Skords-01/Sergeant/pull/2125) |

### Medium (M1–M12)

| ID  | Назва                                                                | Source-файл                                                                                            | Статус                                     | GitHub PR                                                                                                       |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| M1  | 80+ env-vars — мігрувати feature-flag-toggle у DB-таблицю            | [`pr-17-env-vars-feature-flag-toggle.md`](./stack-pulse-2026-05/pr-17-env-vars-feature-flag-toggle.md) | Reference                                  | —                                                                                                               |
| M2  | Detox path-trigger пропускає server-shape changes                    | [`pr-18-detox-server-shape-trigger.md`](./stack-pulse-2026-05/pr-18-detox-server-shape-trigger.md)     | Closed                                     | —                                                                                                               |
| M3  | Workers без централізованого health-registry                         | [`pr-19-workers-health-registry.md`](./stack-pulse-2026-05/pr-19-workers-health-registry.md)           | Reference                                  | —                                                                                                               |
| M4  | `patches/` — patch debt без README                                   | [`pr-20-patches-readme.md`](./stack-pulse-2026-05/pr-20-patches-readme.md)                             | Closed                                     | [#2193](https://github.com/Skords-01/Sergeant/pull/2193)                                                        |
| M5  | Service Worker `prompt`-mode без auto-update on inactivity           | [`pr-21-sw-prompt-mode-auto-update.md`](./stack-pulse-2026-05/pr-21-sw-prompt-mode-auto-update.md)     | Closed                                     | [#2309](https://github.com/Skords-01/Sergeant/pull/2309)                                                        |
| M6  | Mobile зашитий Expo SDK 52 (RN 0.76)                                 | [`pr-22-mobile-expo-sdk-53.md`](./stack-pulse-2026-05/pr-22-mobile-expo-sdk-53.md)                     | Deprecated                                 | —                                                                                                               |
| M7  | OpenAPI-spec не contract-tested vs runtime                           | [`pr-23-openapi-contract-tests.md`](./stack-pulse-2026-05/pr-23-openapi-contract-tests.md)             | Reference                                  | —                                                                                                               |
| M8  | Embedding-vendor lock-in (`voyage-3.5-lite`)                         | [`pr-24-embedding-vendor-abstraction.md`](./stack-pulse-2026-05/pr-24-embedding-vendor-abstraction.md) | Closed                                     | —                                                                                                               |
| M9  | `fizruk.vercel.app` + `sergeant.vercel.app` — два production origins | [`pr-25-two-production-origins.md`](./stack-pulse-2026-05/pr-25-two-production-origins.md)             | Partial (PR-1+#327 CORS; OAuth+ADR remain) | [#3392](https://github.com/Skords-01/Sergeant/pull/3392) [#327](https://github.com/Skords-01/Sergeant/pull/327) |
| M10 | DR runbook documented                                                | [`00-overview.md`](./stack-pulse-2026-05/00-overview.md)                                               | Closed                                     | —                                                                                                               |
| M11 | CSP без `report-uri` / `report-to`                                   | [`pr-26-csp-report-uri.md`](./stack-pulse-2026-05/pr-26-csp-report-uri.md)                             | Closed                                     | —                                                                                                               |
| M12 | `INTERNAL_API_KEY` без rotation-механізму                            | [`pr-27-internal-api-key-rotation.md`](./stack-pulse-2026-05/pr-27-internal-api-key-rotation.md)       | Reference                                  | —                                                                                                               |

### Low (L1–L12)

| ID  | Назва                                                         | Source-файл                                                                                                    | Статус                 | GitHub PR                                                |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------- |
| L1  | `__SW_BUILD_ID__` як global → `import.meta.env.VITE_BUILD_ID` | [`pr-28-sw-build-id-import-meta.md`](./stack-pulse-2026-05/pr-28-sw-build-id-import-meta.md)                   | Closed                 | [#2309](https://github.com/Skords-01/Sergeant/pull/2309) |
| L2  | `window.__sergeantShellNavigate` global → BroadcastChannel    | [`pr-29-shell-navigate-broadcast-channel.md`](./stack-pulse-2026-05/pr-29-shell-navigate-broadcast-channel.md) | Partial (PR-1 shipped) | [#2526](https://github.com/Skords-01/Sergeant/pull/2526) |
| L3  | Dockerfile post-install cleanup для CVE-shrink                | [`pr-30-dockerfile-cleanup-cve.md`](./stack-pulse-2026-05/pr-30-dockerfile-cleanup-cve.md)                     | Closed                 | [#2543](https://github.com/Skords-01/Sergeant/pull/2543) |
| L4  | ESLint config 1073 рядки — розділити на per-app               | [`pr-31-eslint-config-split.md`](./stack-pulse-2026-05/pr-31-eslint-config-split.md)                           | Closed                 | —                                                        |
| L5  | `pnpm.overrides` — стара кодова база pinning                  | [`pr-32-pnpm-overrides-cleanup.md`](./stack-pulse-2026-05/pr-32-pnpm-overrides-cleanup.md)                     | Closed                 | —                                                        |
| L6  | 21 hard rules — згрупувати у 5 «Hard Areas»                   | [`pr-33-hard-rules-categorization.md`](./stack-pulse-2026-05/pr-33-hard-rules-categorization.md)               | Closed                 | —                                                        |
| L7  | `runDemoSeedFromUrl` / `runDemoCleanupOnce` — на кожному load | [`pr-34-demo-seed-cleanup-gate.md`](./stack-pulse-2026-05/pr-34-demo-seed-cleanup-gate.md)                     | Closed                 | —                                                        |
| L8  | `LOG_LEVEL=info` default, без 5-min debug-увімкнення в проді  | [`pr-35-log-level-debug-window.md`](./stack-pulse-2026-05/pr-35-log-level-debug-window.md)                     | Closed                 | —                                                        |
| L9  | `lazyImport` chunk-reload без guard проти infinite-loop       | [`pr-36-lazy-import-chunk-reload-guard.md`](./stack-pulse-2026-05/pr-36-lazy-import-chunk-reload-guard.md)     | Closed                 | [#2311](https://github.com/Skords-01/Sergeant/pull/2311) |
| L10 | Postgres image у `docker-compose.yml` не SHA-pinned           | [`pr-37-postgres-image-sha-pin.md`](./stack-pulse-2026-05/pr-37-postgres-image-sha-pin.md)                     | Closed                 | [#2308](https://github.com/Skords-01/Sergeant/pull/2308) |
| L11 | PWA precache — перевірити що всі assets 1st-party             | [`pr-38-pwa-precache-first-party.md`](./stack-pulse-2026-05/pr-38-pwa-precache-first-party.md)                 | Closed                 | [#2312](https://github.com/Skords-01/Sergeant/pull/2312) |
| L12 | `tools/openclaw` SDK Anthropic 0.36.3 outdated                | [`pr-39-tools-console-anthropic-sdk.md`](./stack-pulse-2026-05/pr-39-tools-console-anthropic-sdk.md)           | Closed                 | [#2527](https://github.com/Skords-01/Sergeant/pull/2527) |

---

## Джерело 2 — \_0008-platform-hardening

Операційний baseline: health probes, rate-limit policy, Renovate, supply-chain. Джерело: [`archive/_0008-platform-hardening.md`](./archive/_0008-platform-hardening.md). Статус ініціативи загалом: **Closed** (5/5 фаз merged 2026-05-04).

| ID      | Назва                                                       | Source-файл                                                                    | Статус | GitHub PR                                                |
| ------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ | ------ | -------------------------------------------------------- |
| 0008-P1 | Health probes (liveness / readiness / startup)              | [`archive/_0008-platform-hardening.md`](./archive/_0008-platform-hardening.md) | Done   | [#1634](https://github.com/Skords-01/Sergeant/pull/1634) |
| 0008-P2 | Rate-limit policy refactor (`rateLimit.ts` + `Retry-After`) | [`archive/_0008-platform-hardening.md`](./archive/_0008-platform-hardening.md) | Done   | [#1638](https://github.com/Skords-01/Sergeant/pull/1638) |
| 0008-P3 | Renovate config + Dependabot security-only                  | [`archive/_0008-platform-hardening.md`](./archive/_0008-platform-hardening.md) | Done   | [#1641](https://github.com/Skords-01/Sergeant/pull/1641) |
| 0008-P4 | SBOM generation on release (SPDX + CycloneDX)               | [`archive/_0008-platform-hardening.md`](./archive/_0008-platform-hardening.md) | Done   | [#1639](https://github.com/Skords-01/Sergeant/pull/1639) |
| 0008-P5 | Runbook + docs (platform hardening FAQ)                     | [`archive/_0008-platform-hardening.md`](./archive/_0008-platform-hardening.md) | Done   | [#1642](https://github.com/Skords-01/Sergeant/pull/1642) |

---

## Джерело 3 — \_0009-agent-os-hardening

Agent-OS hardening: lint-гейти проти дрейфу, уніфікація іменування, slim AGENTS.md, Plop-генератори. Джерело: [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md). Статус ініціативи загалом: **Closed** (16/16 заявлених PR-ів merged; PR 3.2 фіналізовано окремо).

| ID        | Назва                                                                                              | Source-файл                                                                    | Статус                                | GitHub PR                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0009-1.1  | `pnpm lint:skills` + skills-lock SHA256                                                            | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1659](https://github.com/Skords-01/Sergeant/pull/1659)                                                                                                                     |
| 0009-1.2a | `pnpm lint:playbook-language` (UA, warn-only)                                                      | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1672](https://github.com/Skords-01/Sergeant/pull/1672)                                                                                                                     |
| 0009-1.2b | Backfill EN-only playbook'ів і SKILL.md (22 batch-PR)                                              | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1772](https://github.com/Skords-01/Sergeant/pull/1772) та ін.                                                                                                              |
| 0009-1.2c | Перемикання `lint:playbook-language` у gate-ON                                                     | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1900](https://github.com/Skords-01/Sergeant/pull/1900)                                                                                                                     |
| 0009-1.3  | Husky pre-commit fast typecheck (`tsc-files`)                                                      | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1821](https://github.com/Skords-01/Sergeant/pull/1821)                                                                                                                     |
| 0009-1.4  | `playbook-schema` extension                                                                        | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1670](https://github.com/Skords-01/Sergeant/pull/1670)                                                                                                                     |
| 0009-1.5  | Hard-rules categorization (`blocker-invariant` / `lint-enforced-convention` / `active-initiative`) | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1660](https://github.com/Skords-01/Sergeant/pull/1660)                                                                                                                     |
| 0009-2.1  | Specialists ↔ skills mapping + Telegram skill-status renderer                                      | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1687](https://github.com/Skords-01/Sergeant/pull/1687), [#1902](https://github.com/Skords-01/Sergeant/pull/1902)                                                           |
| 0009-2.2  | `docs/90-work/superpowers/` → `docs/00-start/agents/` rename                                       | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1684](https://github.com/Skords-01/Sergeant/pull/1684)                                                                                                                     |
| 0009-2.3  | Merge `release-*` playbooks                                                                        | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1705](https://github.com/Skords-01/Sergeant/pull/1705)                                                                                                                     |
| 0009-2.4  | Merge `access-*` playbooks                                                                         | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1707](https://github.com/Skords-01/Sergeant/pull/1707)                                                                                                                     |
| 0009-3.1  | Демоутити дизайн-конвенції з Hard Rules                                                            | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1725](https://github.com/Skords-01/Sergeant/pull/1725)                                                                                                                     |
| 0009-3.2  | AGENTS.md slim (≤ 150 LOC core)                                                                    | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Done (фіналізовано в ініціативі 0009) | —                                                                                                                                                                            |
| 0009-3.3  | Slim `.env.example` + повний reference                                                             | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1775](https://github.com/Skords-01/Sergeant/pull/1775)                                                                                                                     |
| 0009-4.1  | Renovate maintainer runbook                                                                        | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1785](https://github.com/Skords-01/Sergeant/pull/1785)                                                                                                                     |
| 0009-4.2  | Dead-code: knip-only                                                                               | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1795](https://github.com/Skords-01/Sergeant/pull/1795)                                                                                                                     |
| 0009-4.3  | Workflow audit + Owner block у 26 workflow-файлах                                                  | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1788](https://github.com/Skords-01/Sergeant/pull/1788)                                                                                                                     |
| 0009-5.1  | Plop generators (`new-skill`, `new-playbook`, `new-package`, `new-n8n-workflow`)                   | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1796](https://github.com/Skords-01/Sergeant/pull/1796), [#1828](https://github.com/Skords-01/Sergeant/pull/1828), [#1912](https://github.com/Skords-01/Sergeant/pull/1912) |
| 0009-5.2  | `docs/00-start/agents/onboarding.md`                                                               | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1728](https://github.com/Skords-01/Sergeant/pull/1728)                                                                                                                     |
| 0009-5.3  | n8n smoke contract test (dispatcher ↔ n8n workflow drift)                                          | [`archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md) | Merged                                | [#1910](https://github.com/Skords-01/Sergeant/pull/1910)                                                                                                                     |

> Примітка: картки `0009-5.1b` (Plop `new-package`) та `0009-5.1b extras` (`new-n8n-workflow`) об'єднано з `0009-5.1` як складові однієї теми генераторів.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                       | Title                                                                            | Merged     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- |
| [#341](https://github.com/Skords-01/Sergeant/pull/341)   | docs(docs): reconcile tracker drift across open-work surfaces                    | 2026-07-20 |
| [#3649](https://github.com/Skords-01/Sergeant/pull/3649) | chore(root): fizruk a11y/UX tidy + reconcile stale tracked-task docs             | 2026-06-19 |
| [#3536](https://github.com/Skords-01/Sergeant/pull/3536) | docs(docs): doc-layer wave 2 — genre contract, monolith splits, hardening matrix | 2026-06-12 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 3 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
