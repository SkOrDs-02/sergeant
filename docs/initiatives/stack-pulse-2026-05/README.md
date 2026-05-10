# Stack pulse — 2026-05

> **Last validated:** 2026-05-10 by Devin. **Next review:** 2026-08-08.
> **Status:** Active

Серія планів-PR-ів для виправлення слабких місць стеку Sergeant, виявлених
під час глибокого зрізу 2026-05-03. Кожен файл — самостійний executable
план для одного PR-а: scope, acceptance criteria, тести, rollout, risks.

> **Це не аудит.** Аудити лежать у [`docs/audits/`](../../audits/README.md).
> Тут — дорожня карта **наступних кроків**: «що, де, чому, як перевірити».
> Документи у цьому каталозі — `Active` поки відповідний PR не змерджений,
> після — статус → `Closed` з посиланням на PR, файл лишається як historical record.

---

## Як читати

- **Severity** — критичність, яка випливає з зрізу: `Critical` / `High` / `Medium` / `Low`.
- **Туркі-точки** — конкретні `file:line` для швидкого старту.
- **DoD** (Definition of Done) — чек-ліст, без якого PR не закривається.
- **Тести** — конкретні test-files, які треба додати/оновити (інакше PR не вважається завершеним).
- **Rollout** — як саме викочуємо: feature-flag / staged / immediate.

---

## Виконавче резюме

Sergeant — дисциплінований monorepo з над-середньою інженерною культурою.
Найбільші ризики цього зрізу — **соціальні**, не технічні (bus factor = 1).
Серед технічних — **подвійна env-система**, **bcrypt password silent truncation**,
**rate-limit fail-open**, **TS 6 + @types/node 25 на Node 20** і **plain-PAT
для OpenClaw з `contents:write`**.

Окремі PR-плани нижче — по 1 PR на одну окрему причину. Не поєднуйте їх у
mega-PR — кожен має власний рівень ризику і rollback-план.

---

## Критичні (Critical) — Sprint 1, наступні 2 тижні

| PR  | План                                                                                    | Severity | Effort  | Status                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | [Уніфікувати env-модулі сервера](./pr-01-unify-env-modules.md)                          | Critical | 1–2 дні | Closed — merged (env/env.ts Zod schema + assertStartupEnv in main)                                                                            |
| 02  | [Rate-limit fail-closed на `/api/auth/*`](./pr-02-rate-limit-fail-closed.md)            | Critical | 1 день  | Closed — merged [#1552](https://github.com/Skords-01/Sergeant/pull/1552)                                                                      |
| 03  | [`MAX_PASSWORD_LENGTH` policy correction](./pr-03-bcrypt-password-limit.md)             | Critical | 1–2 дні | Closed — merged [#1550](https://github.com/Skords-01/Sergeant/pull/1550)                                                                      |
| 04  | [Secondary owners + knowledge-transfer plan](./pr-04-bus-factor-secondary-owners.md)    | Critical | 1 тижд. | Closed — CODEOWNERS placeholders + 6 walkthroughs + ops-runbook + AGENTS.md `Secondary` (22/22) + `L2 escalation` → playbook + coverage gate  |
| 05  | [`@types/node` ↓ 20.x + ADR на TS 6 vs 5.x](./pr-05-typescript-types-node-downgrade.md) | Critical | 1 день  | Closed — merged (^20.19.0 in all workspaces + pnpm.overrides + renovate + [ADR-0050](../../adr/0050-typescript-major-version-policy.md))      |
| 06  | [OpenClaw → GitHub App, прибрати `Git_PAT` fallback](./pr-06-openclaw-github-app.md)    | Critical | 2–3 дні | Closed — Phase 1 [#1816](https://github.com/Skords-01/Sergeant/pull/1816) + Phase 2 merged (Hard Rule #20 in env.ts blocks PAT in production) |

## Високі (High) — Sprint 2–3, поточний квартал

| PR  | План                                                                                               | Severity | Effort  | Status                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 07  | [Declarative body-size policy](./pr-07-body-size-declarative-policy.md)                            | High     | 0.5 дня | Closed — merged [#2081](https://github.com/Skords-01/Sergeant/pull/2081)                                                                                                                                                        |
| 08  | [API versioning consolidation (видалити v1-rewrite-shim)](./pr-08-api-versioning-consolidation.md) | High     | 0.5 дня | Closed — research done, decision = keep mirror ([ADR-0053](../../adr/0053-api-versioning-policy.md) + [spike](../../notes/spikes/2026-05-api-v1-usage.md))                                                                      |
| 09  | [`@parse/node-apn` review (ADR-only)](./pr-09-apns-library-adr.md)                                 | High     | 0.5 дня | Closed — ADR-0048 merged ([docs/adr/0048-apns-provider-library.md](../../adr/0048-apns-provider-library.md))                                                                                                                    |
| 10  | [Better Auth security review + Safari/Webkit E2E](./pr-10-better-auth-security-review.md)          | High     | 2–3 дні | Closed — implemented in PR-48 (ADR-0049 + Safari/Webkit E2E + crypto review)                                                                                                                                                    |
| 11  | [Drizzle schema ↔ SQL drift CI gate](./pr-11-drizzle-schema-drift-ci.md)                           | High     | 1–2 дні | Closed — drift CI gate in main (`scripts/check-schema-drift.mjs` + `packages/db-schema/src/__tests__/drift.test.ts`, fixed in [#2089](https://github.com/Skords-01/Sergeant/pull/2089))                                         |
| 12  | [Sentry tracesSampler dynamic per-route](./pr-12-sentry-traces-sampler.md)                         | High     | 0.5 дня | Closed — merged [#2086](https://github.com/Skords-01/Sergeant/pull/2086)                                                                                                                                                        |
| 13  | [PG pool sizing + monitoring + alerts](./pr-13-postgres-pool-sizing.md)                            | High     | 1 день  | Closed — `PG_POOL_SIZE` default 10→20, slow-connect Sentry breadcrumb + `db_slow_pool_connects_total`, [`docs/observability/pg-pool-sizing.md`](../../observability/pg-pool-sizing.md) (pool gauges + alerts шипились раніше)   |
| 14  | [Vercel COEP review (require-corp)](./pr-14-vercel-coep-review.md)                                 | High     | 0.5 дня | Closed by M21                                                                                                                                                                                                                   |
| 15  | [`AI_QUOTA_DISABLED=1` hard-block у production](./pr-15-ai-quota-disabled-hardblock.md)            | High     | 0.5 дня | Closed — merged [#1567](https://github.com/Skords-01/Sergeant/pull/1567) (throw in env.ts + tests in main)                                                                                                                      |
| 16  | [Pino redaction policy + ESLint guard](./pr-16-pino-redaction-policy.md)                           | High     | 1 день  | Closed — merged [#2125](https://github.com/Skords-01/Sergeant/pull/2125) (Hard Rule #21 + `sergeant-design/no-raw-req-in-pino-log` + [`docs/security/logging-redaction-policy.md`](../../security/logging-redaction-policy.md)) |

---

## Medium (PR-17..27, trigger-gated)

Кожен Medium-айтем має готовий `pr-NN-*.md` план з real `file:line` touchpoints
(broken out 2026-05-07). PR-плани — `Planned`, owner = TBD, активуються при
відповідному trigger-event (нова env-зміна, contract bug, stalled-worker
incident і т.д.).

| PR  | План                                                                                         | Linked finding | Effort   | Trigger to activate                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------- | -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 17  | [Env-vars → DB feature-flag toggle](./pr-17-env-vars-feature-flag-toggle.md)                 | M1             | 3–5 днів | при додаванні 90-ї змінної                                                                                                          |
| 18  | [Detox server-shape path-trigger](./pr-18-detox-server-shape-trigger.md)                     | M2             | 1 день   | next mobile API breakage                                                                                                            |
| 19  | [Workers health-registry endpoint](./pr-19-workers-health-registry.md)                       | M3, MS2        | 2–3 дні  | next stalled-worker incident                                                                                                        |
| 20  | [`patches/` README + freshness-gate](./pr-20-patches-readme.md)                              | M4             | 0.5 дня  | Closed — merged [#2193](https://github.com/Skords-01/Sergeant/pull/2193) (`patches/README.md` schema + `pnpm lint:patches` CI gate) |
| 21  | [SW prompt-mode auto-update](./pr-21-sw-prompt-mode-auto-update.md)                          | M5             | 1 день   | next major web release                                                                                                              |
| 22  | [Mobile Expo SDK 52 → 53](./pr-22-mobile-expo-sdk-53.md)                                     | M6             | 5–7 днів | до Q3 2026 (SDK 53 GA)                                                                                                              |
| 23  | [OpenAPI contract tests + drift-check](./pr-23-openapi-contract-tests.md)                    | M7, MS3        | 3–5 днів | при першому contract-bug                                                                                                            |
| 24  | [Embedding-vendor abstraction (provider interface)](./pr-24-embedding-vendor-abstraction.md) | M8             | 2–3 дні  | при появі quality regression                                                                                                        |
| 25  | [Consolidate two production origins](./pr-25-two-production-origins.md)                      | M9             | 2 дні    | next CSP/CORS-related incident                                                                                                      |
| 26  | [CSP `report-uri` / `report-to` endpoint](./pr-26-csp-report-uri.md)                         | M11            | 0.5 дня  | Partially closed — legacy `report-uri` live (`apps/web/vercel.json`); pending = modern Reporting API + body-cap + monitoring doc    |
| 27  | [`INTERNAL_API_KEY` rotation mechanism](./pr-27-internal-api-key-rotation.md)                | M12            | 2–3 дні  | next security audit / leak                                                                                                          |

## Low (PR-28..39, поліровка)

| PR  | План                                                                                    | Linked finding | Effort     | Status                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------- | -------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 28  | [`__SW_BUILD_ID__` → `import.meta.env`](./pr-28-sw-build-id-import-meta.md)             | L1             | 0.5 дня    | Closed — merged [#2309](https://github.com/Skords-01/Sergeant/pull/2309) (`apps/web/src/sw/version.ts` + `apps/web/vite-env.d.ts` + `apps/web/tsconfig.sw.json` use `import.meta.env.VITE_BUILD_ID`)                           |
| 29  | [Shell-navigate global → BroadcastChannel](./pr-29-shell-navigate-broadcast-channel.md) | L2             | 1 день     | Planned                                                                                                                                                                                                                        |
| 30  | [Dockerfile cleanup → distroless multi-stage](./pr-30-dockerfile-cleanup-cve.md)        | L3             | 1 день     | Planned                                                                                                                                                                                                                        |
| 31  | [ESLint config split per-app](./pr-31-eslint-config-split.md)                           | L4             | 1–2 дні    | Planned                                                                                                                                                                                                                        |
| 32  | [`pnpm.overrides` cleanup + audit-script](./pr-32-pnpm-overrides-cleanup.md)            | L5             | 0.5 дня    | Planned                                                                                                                                                                                                                        |
| 33  | [Hard rules — categorize](./pr-33-hard-rules-categorization.md)                         | L6, R9         | 0.5–1 день | Closed — implemented via 3 enforcement-categories ([ADR-0045](../../adr/0045-hard-rules-taxonomy.md), `hard-rules.json` `category` field, `hard-rules-matrix.md`, `pnpm lint:hard-rules-registry`)                             |
| 34  | [Demo seed/cleanup lazy-gate](./pr-34-demo-seed-cleanup-gate.md)                        | L7             | 0.5 дня    | Planned                                                                                                                                                                                                                        |
| 35  | [`LOG_LEVEL` debug-window CLI toggle](./pr-35-log-level-debug-window.md)                | L8             | 0.5 дня    | Planned                                                                                                                                                                                                                        |
| 36  | [`lazyImport` chunk-reload guard](./pr-36-lazy-import-chunk-reload-guard.md)            | L9             | 0.5 дня    | Closed — merged [#2311](https://github.com/Skords-01/Sergeant/pull/2311) (`MAX_RELOADS=3` counter-window guard у `apps/web/src/core/lib/chunkReload.ts`)                                                                       |
| 37  | [Postgres image SHA-pin + Renovate](./pr-37-postgres-image-sha-pin.md)                  | L10            | 0.5 дня    | Closed — merged [#2308](https://github.com/Skords-01/Sergeant/pull/2308) (`docker-compose.yml` SHA-pin + Renovate `pinDigests` rule + [`docs/development/local-postgres-setup.md`](../../development/local-postgres-setup.md)) |
| 38  | [PWA precache 1st-party verify](./pr-38-pwa-precache-first-party.md)                    | L11            | 0.5 дня    | Closed — merged [#2312](https://github.com/Skords-01/Sergeant/pull/2312) (`scripts/check-pwa-precache-1st-party.mjs` build-time gate + CI step + `globIgnores` for `*.map`)                                                    |
| 39  | [`tools/console` Anthropic SDK 0.36 → 1.x](./pr-39-tools-console-anthropic-sdk.md)      | L12            | 0.5–1 день | Planned                                                                                                                                                                                                                        |

---

Дивись також:

- [`docs/audits/2026-04-28-implementation-roadmap.md`](../../audits/2026-04-28-implementation-roadmap.md) — попередній roadmap
- [`docs/tech-debt/`](../../tech-debt/README.md) — living tech-debt registries
- [`docs/planning/dev-stack-roadmap.md`](../../planning/archive/dev-stack-roadmap.md) — топ-15 ROI-roadmap

---

## Convention для нових PR-планів у цьому каталозі

```markdown
# PR-NN: <короткий заголовок>

> **Last validated:** YYYY-MM-DD by @<owner>. **Next review:** YYYY-MM-DD.
> **Status:** Planned | In progress | Closed (PR #XXXX)

|                    |                                    |
| ------------------ | ---------------------------------- |
| **Severity**       | Critical / High / Medium / Low     |
| **Linked finding** | C1 / H3 / ... (з `00-overview.md`) |
| **Owner**          | @username (TBD)                    |
| **Effort**         | X днів                             |
| **Risk**           | Low / Medium / High                |
| **Touches**        | apps/server/src/..., packages/...  |

## Контекст

## Scope

## Out of scope

## Acceptance criteria (DoD)

## Тести

## Rollout

## Risks & mitigations

## Touchpoints (file:line)
```

При закритті PR — оновити `Status:` на `Closed (PR #NNNN)`, додати посилання на merged-PR і **не видаляти** файл.
