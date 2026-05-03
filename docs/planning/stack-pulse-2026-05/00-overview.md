# Overview — stack pulse 2026-05

> **Last validated:** 2026-05-03 by Devin. **Next review:** 2026-08-03.
> **Status:** Active

Скорочена картина зрізу стеку, без розгорнутих PR-планів. Деталі — у
відповідних `pr-NN-*.md`.

---

## Сильні сторони (контекст)

- Governance: 17 hard rules + 40 ADR + 30 playbooks з automated checks
  (`scripts/check-hard-rules-registry.mjs`, `check-governance-sync.mjs`,
  `lint-migrations.mjs`).
- Supply chain: SHA-pinned actions, gitleaks, OSV-Scanner + Snyk + pnpm audit
  - Trivy container-scan.
- DB hardening: statement-timeout per-connection, retryable-error backoff,
  advisory-lock на migration runner, `down.sql` companions, sequential
  numbering 001..034.
- Graceful shutdown з hard-timer fallback (`apps/server/src/index.ts`).
- Sentry init order перед express для OpenTelemetry monkey-patching.
- Body-size policy 128KB default + per-route 6mb / 10mb.
- API-server CSP `default-src 'none'` (strict).
- AI memory: pgvector + Voyage + BullMQ ingestion + RAG injection з fail-open
  timeout 1.5s.
- Тести: 966 .ts + 685 .tsx; Testcontainers, Detox iOS+Android, axe-core,
  Argos visual regression.

---

## Зрізова таблиця знахідок

> ID-конвенція: `C1..C6` — Critical, `H1..H10` — High, `M1..M12` — Medium,
> `L1..L12` — Low. ID використовуються у `pr-NN-*.md` як «Linked finding».

### Critical (PR-01..06)

| ID  | Заголовок                                                           | PR-план                                             | Статус                                                                |
| --- | ------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| C1  | Подвійна env-система (`env.ts` + `env/env.ts` + `betterAuthEnv.ts`) | [PR-01](./pr-01-unify-env-modules.md)               | Planned                                                               |
| C2  | Rate-limit in-memory fallback при відмові Redis                     | [PR-02](./pr-02-rate-limit-fail-closed.md)          | **Merged** ([#1552](https://github.com/Skords-01/Sergeant/pull/1552)) |
| C3  | bcrypt + `MAX_PASSWORD_LENGTH=128` (silent 72-byte cap)             | [PR-03](./pr-03-bcrypt-password-limit.md)           | **Merged** ([#1550](https://github.com/Skords-01/Sergeant/pull/1550)) |
| C4  | Bus factor = 1 (єдиний `@Skords-01` owner усього)                   | [PR-04](./pr-04-bus-factor-secondary-owners.md)     | Planned                                                               |
| C5  | TypeScript 6.0.3 + `@types/node@25.6` на Node 20                    | [PR-05](./pr-05-typescript-types-node-downgrade.md) | Planned                                                               |
| C6  | OpenClaw plain `Git_PAT` з `contents:write`                         | [PR-06](./pr-06-openclaw-github-app.md)             | Planned                                                               |

### High (PR-07..16)

| ID  | Заголовок                                        | PR-план                                          | Статус                                                                   |
| --- | ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------ |
| H1  | Body-size policy order-dependent                 | [PR-07](./pr-07-body-size-declarative-policy.md) | Planned                                                                  |
| H2  | API-version rewrite committed to v1 forever      | [PR-08](./pr-08-api-versioning-consolidation.md) | Planned                                                                  |
| H3  | `@parse/node-apn` non-canonical maintainer       | [PR-09](./pr-09-apns-library-adr.md)             | Planned                                                                  |
| H4  | Better Auth security review (own-crypto adapter) | [PR-10](./pr-10-better-auth-security-review.md)  | Planned                                                                  |
| H5  | Drizzle schema ↔ SQL drift untracked             | [PR-11](./pr-11-drizzle-schema-drift-ci.md)      | Planned                                                                  |
| H6  | Sentry tracesSampleRate static 0.1               | [PR-12](./pr-12-sentry-traces-sampler.md)        | Planned                                                                  |
| H7  | PG pool size 10 — undersized для AI ingestion    | [PR-13](./pr-13-postgres-pool-sizing.md)         | Planned                                                                  |
| H8  | Vercel COEP `require-corp` — broad blast radius  | [PR-14](./pr-14-vercel-coep-review.md)           | Planned                                                                  |
| H9  | `AI_QUOTA_DISABLED=1` ризик у production         | [PR-15](./pr-15-ai-quota-disabled-hardblock.md)  | **In review** ([#1567](https://github.com/Skords-01/Sergeant/pull/1567)) |
| H10 | Pino без enforced redaction policy               | [PR-16](./pr-16-pino-redaction-policy.md)        | Planned                                                                  |

### Medium (без окремих PR-плані поки не призначений owner)

| ID  | Заголовок                                                            | Owner | Trigger to convert into PR   |
| --- | -------------------------------------------------------------------- | ----- | ---------------------------- |
| M1  | 80+ env-vars — мігрувати feature-flag-toggle у DB-таблицю            | TBD   | при додаванні 90-ї змінної   |
| M2  | Detox path-trigger пропускає server-shape changes                    | TBD   | next mobile API breakage     |
| M3  | Workers без централізованого health-registry                         | TBD   | next stalled-worker incident |
| M4  | `patches/` — patch debt без README                                   | TBD   | next Expo SDK upgrade        |
| M5  | Service Worker `prompt`-mode без auto-update on inactivity           | TBD   | next major web release       |
| M6  | Mobile зашиван Expo SDK 52 (RN 0.76)                                 | TBD   | до Q3 2026 (SDK 53 GA)       |
| M7  | OpenAPI-spec не contract-tested vs runtime                           | TBD   | при першому contract-bug     |
| M8  | Embedding-vendor lock-in (`voyage-3.5-lite`)                         | TBD   | при появі quality regression |
| M9  | `fizruk.vercel.app` + `sergeant.vercel.app` — два production origins | TBD   | clarification needed         |
| M10 | DR runbook відсутній                                                 | TBD   | до production launch         |
| M11 | CSP без `report-uri` / `report-to`                                   | TBD   | при першому unknown CSP-bug  |
| M12 | `INTERNAL_API_KEY` без rotation-механізму                            | TBD   | next n8n credential breach   |

### Low (поліровка, не блокують)

| ID  | Заголовок                                                     |
| --- | ------------------------------------------------------------- |
| L1  | `__SW_BUILD_ID__` як global → `import.meta.env.VITE_BUILD_ID` |
| L2  | `window.__sergeantShellNavigate` global → BroadcastChannel    |
| L3  | Dockerfile post-install cleanup для CVE-shrink — крихкий      |
| L4  | ESLint config 712 рядків — розділити на per-app               |
| L5  | `pnpm.overrides` — стара кодова база pinning                  |
| L6  | 17 hard rules — згрупувати у 5 «Hard Areas»                   |
| L7  | `runDemoSeedFromUrl` / `runDemoCleanupOnce` — на кожному load |
| L8  | `LOG_LEVEL=info` default, без 5-min debug-увімкнення в проді  |
| L9  | `lazyImport` chunk-reload без guard проти infinite-loop       |
| L10 | Postgres image у `docker-compose.yml` не SHA-pinned           |
| L11 | PWA precache — перевірити що всі assets 1st-party             |
| L12 | `apps/console` SDK Anthropic 0.36.3 outdated                  |

---

## Redundancies (зайве)

| #   | Що                                                    | Рекомендація                                    |
| --- | ----------------------------------------------------- | ----------------------------------------------- |
| R1  | env.ts + env/env.ts + betterAuthEnv.ts                | unify (PR-01)                                   |
| R2  | `ts-prune` + `knip`                                   | видалити `ts-prune`                             |
| R3  | 3× Sentry SDK (node, react, react-native)             | unified release-name `sergeant@${COMMIT_SHA}`   |
| R4  | API-version rewrite                                   | видалити (PR-08)                                |
| R5  | `apps/console` + OpenClaw (обидва Telegram-bot-и)     | дочекатися ADR-0032 завершення                  |
| R6  | `pnpm.overrides` для давно-патчених CVE               | quarterly cleanup                               |
| R7  | `SERVER_MODE=railway` / `replit` runtime-flag         | окремий entrypoint якщо Replit ≠ production     |
| R8  | `@types/node@25` всюди + Node 20 runtime              | downgrade (PR-05)                               |
| R9  | 17 hard rules — design + engineering у одному реєстрі | розділити на «Hard Engineering» + «Hard Design» |

---

## Missing (відсутнє)

| #    | Що                                       | Запропонована дія                                 |
| ---- | ---------------------------------------- | ------------------------------------------------- |
| MS1  | `docs/operations/disaster-recovery.md`   | DR runbook + monthly drill cron                   |
| MS2  | `/api/health/workers` endpoint           | реалізувати в межах M3                            |
| MS3  | Contract testing (Pact / Schemathesis)   | топ-10 endpoint-ів                                |
| MS4  | `actions/dependency-review-action` на PR | додати у `ci.yml`                                 |
| MS5  | E2E на mobile-shell (Capacitor)          | iOS-Capacitor pipeline через Maestro              |
| MS6  | Performance budget per route             | `metrics/p95.test.ts` з threshold                 |
| MS7  | Threat model document (STRIDE)           | 1-сторінка у `docs/security/`                     |
| MS8  | Migration `down.sql` rollback drill у CI | applied → run down → re-run forward → diff schema |
| MS9  | Cost monitoring dashboard                | Grafana `cost_per_user_per_module`                |
| MS10 | Public status page                       | self-hosted instatus у `apps/console`             |
| MS11 | Privacy policy CI-check                  | annual review checklist в `.github/`              |
| MS12 | Build provenance / SBOM                  | `cyclonedx-bom` step → release artifact           |

---

## Метрики для трекінгу прогресу

| Metric                              | Now (estimate)     | Target Q4                |
| ----------------------------------- | ------------------ | ------------------------ |
| `env_var_count_in_single_file`      | 80+                | <20 (rest → flags)       |
| `bus_factor`                        | 1                  | ≥2                       |
| `migration_drift_detected_in_ci`    | no check           | yes (fail PR)            |
| `auth_brute_force_resistance`       | replicas × 5/15min | 5/15min globally         |
| `bcrypt_password_max_useful_length` | 72 (silent)        | 72 (explicit) / Argon2id |
| `dr_drill_frequency`                | never              | quarterly                |
| `cost_visibility`                   | manual             | dashboard p/feature      |
| `secret_rotation_for_OPENCLAW_PAT`  | never              | 90d via GH App           |
| `worker_health_alerting`            | none               | <5min lag                |

---

## Що НЕ міняти (контр-інтуїтивні рекомендації)

1. **Не виганяти governance** — 40 ADR + 30 playbook + 17 rules це **єдина
   причина**, чому соло-проєкт залишається coherent. Інвестувати у
   consolidation, не cut.
2. **Не зливати local-first sync** — CloudSync з LWW conflict-resolution дає
   offline-first UX, який конкуренти не мають. Diff-erentiator.
3. **Не тікати на Hono / Cloudflare Workers** — Express + Railway + Postgres
   = найдешевший boring tech-stack. Не переписувати без ADR з benchmarks.
4. **Не додавати GraphQL** — REST + Zod + OpenAPI працюють. Кожен новий
   contract layer — це більше дрейфу.
5. **Не вимагати 100% test coverage** — quality > quantity.
