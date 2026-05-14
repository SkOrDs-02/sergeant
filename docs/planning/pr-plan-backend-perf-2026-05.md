# PR-план: Backend & Performance follow-up (з прожарки 2026-05-13)

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

PR-розкладка по решті open / Partial / Follow-up / Backlog items із прожарки
[`docs/audits/2026-05-13-backend-performance-roast.md`](../audits/2026-05-13-backend-performance-roast.md).
Скоуп: `apps/server/`, `packages/db-schema/`, `packages/shared/`,
`docs/observability/`. P0/P1 із самої прожарки вже закриті у її landing-PR-і
— тут лишається передбачуваний P2-tail + дві витягнуті ініціативи з TL;DR
#4 / #7, які потребували крос-app координації.

> Не змішуйте картки в один mega-PR. Кожна — самостійний rollout
> із власним rollback-планом, як того вимагає культура `docs/initiatives/`.

---

## Cross-refs

- [`docs/audits/2026-05-13-backend-performance-roast.md`](../audits/2026-05-13-backend-performance-roast.md) — джерельна прожарка (P1-1…P1-6 закриті, P2-1…P2-8 + два TL;DR-винесення — open).
- [`docs/tech-debt/backend.md`](../tech-debt/backend.md) — running tech-debt log (606 рядків). Особливо `Summary — per-category`, `Observability & logging review`, `Tests coverage map`.
- [`docs/audits/2026-05-07-app-audit.md`](../audits/2026-05-07-app-audit.md) — повний product audit; §10 P0/P1/P2 матриця.
- [`docs/audits/2026-05-03-web-deep-dive/03-backend-and-performance.md`](../audits/2026-05-03-web-deep-dive/03-backend-and-performance.md) — попередній backend deep-dive (370 рядків).
- [`docs/initiatives/stack-pulse-2026-05/`](../initiatives/stack-pulse-2026-05/README.md) — паралельна 16-PR серія; PR-01 (env-уніфікація), PR-12 (Sentry tracesSampler), PR-13 (pg-pool sizing), PR-16 (Pino redaction) — найближчі за поверхнею.

### Дотичні ADR

- [`docs/adr/0015-observability-stack.md`](../adr/0015-observability-stack.md) — Pino + Prometheus + Sentry baseline.
- [`docs/adr/0035-distributed-tracing-opentelemetry.md`](../adr/0035-distributed-tracing-opentelemetry.md) — tracing бутстрап у `obs/tracing.ts`.
- [`docs/adr/0019-push-notifications.md`](../adr/0019-push-notifications.md) — server-driven web-push / APNs / FCM, з якого ростуть `VAPID_*` env-vars у `modules/push/push.ts`.
- [`docs/adr/0013-db-migrations-conventions.md`](../adr/0013-db-migrations-conventions.md) — sequential / two-phase DROP — релевантно для `@sergeant/db-schema` umbrella export drop.
- [`docs/adr/0024-monorepo-apps-packages-split.md`](../adr/0024-monorepo-apps-packages-split.md) — межі між `apps/*` і `packages/*`, які треба тримати під час drop-у umbrella export.

### Governance

- Hard Rule #3 ([`03-api-contract-server-client-test.md`](../governance/rules/03-api-contract-server-client-test.md)) — будь-яка зміна форми API-відповіді у migration-PR-ах має оновити `api-client` + contract-test.
- Hard Rule #21 ([`21-pino-redaction-policy.md`](../governance/rules/21-pino-redaction-policy.md)) — логування під час shutdown / pool.end / tracing-fail.
- Performance budget (`AGENTS.md § Performance budgets`) — `/health` p95 < 100 ms (informal SLO) → формалізуємо у PR-6.

---

## Сітка карток

| #     | PR (conventional)                                                                 | Size | P-level                       | Surface (домінантний)                                                                                                                                                       |
| ----- | --------------------------------------------------------------------------------- | ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR-01 | `refactor(server): centralize push env reads through env.ts`                      | M    | P2                            | `apps/server/src/modules/push/push.ts`, `routes/push.ts`, `env/env.ts`, тести                                                                                               |
| PR-02 | `refactor(server): drop process.env DI default in obs/tracing.ts`                 | S    | P2                            | `apps/server/src/obs/tracing.ts`, `env/env.ts`, `obs/tracing.test.ts`                                                                                                       |
| PR-03 | `chore(db-schema): drop umbrella ./migrate export`                                | M    | P2 (P0+ для type-cleanliness) | `packages/db-schema/package.json`, mobile + web import sites                                                                                                                |
| PR-04 | `docs(observability): document per-model AI-token join-pattern in metrics.md §6`  | S    | P2                            | `docs/observability/metrics.md`                                                                                                                                             |
| PR-05 | `fix(server): bounded pool.end() drain with AbortController on shutdown`          | S    | P2                            | `apps/server/src/index.ts` (shutdown sequence)                                                                                                                              |
| PR-06 | `feat(observability): Alertmanager rule for backend /health p95 SLO`              | S    | P2                            | `docs/observability/prometheus/alert_rules.yml`, `docs/observability/SLO.md`                                                                                                |
| PR-07 | `feat(server): tighten Sentry sampling for /api/internal/* (admin=1.0)`           | S    | P2                            | `apps/server/src/sentry.ts`, `docs/observability/sentry-sampling.md`                                                                                                        |
| PR-08 | `docs(observability): refresh metrics.md §Відкриті питання`                       | XS   | P2                            | `docs/observability/metrics.md`                                                                                                                                             |
| PR-09 | `refactor(server): migrate validateBody→parseBody (batch 1 — nutrition)`          | M    | P2                            | `apps/server/src/modules/nutrition/*.ts` + матчений тест-стек                                                                                                               |
| PR-10 | `refactor(server): migrate validateBody→parseBody (batch 2 — sync/chat/internal)` | L    | P2                            | `modules/sync/syncV2{,Stream}.ts`, `modules/chat/{chat,coach}.ts`, `routes/internal/*`, `routes/{billing,push,waitlist}.ts`, `modules/{ai-memory,digest,transcribe,mono}/*` |
| PR-11 | `feat(governance): eslint rule prefer-parseBody for new server handlers`          | S    | P2                            | `packages/eslint-plugin-sergeant-design/`, `apps/server/eslint.config.*`                                                                                                    |
| PR-12 | `chore(audits): scope syncV2.ts + routes/internal/openclaw.ts deep-roasts`        | S    | P3                            | `docs/audits/` (нові stub-и `2026-08-…-sync-engine.md`, `…-openclaw-internal.md`)                                                                                           |

> Розміри (`pnpm check` + review-time): **XS** ≤ 30 LOC / 1 файл, **S** ≤ 150 LOC / ≤ 4 файли, **M** ≤ 500 LOC / ≤ 12 файлів, **L** > 500 LOC / > 12 файлів.

---

## PR-01 — `refactor(server): centralize push env reads through env.ts`

**Surface**

- `apps/server/src/modules/push/push.ts` — `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `PUSH_SEND_TARGET_LIMIT`, `PUSH_SEND_TARGET_WINDOW_MS`.
- `apps/server/src/routes/push.ts` — `PUSH_INTERNAL_ALLOWED_IPS` (`routes/push.ts:87`).
- `apps/server/src/env/env.ts` — додати поля `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL?`, `PUSH_SEND_TARGET_LIMIT?`, `PUSH_SEND_TARGET_WINDOW_MS?`, `PUSH_INTERNAL_ALLOWED_IPS?` із production-`refine()`-ами.
- `apps/server/src/modules/push/push.test.ts` (+ можливі сусіди в `routes/push.test.ts`) — перевести patch-of-`process.env` на DI / module-mock + lazy getters з `env.xxx`.

**Scope**

- Перенести module-load-time `const VAPID_PUBLIC = process.env["VAPID_PUBLIC_KEY"]` → lazy-getter або factory у середині модуля, що читає `env.VAPID_PUBLIC_KEY`.
- У production-mode `assertStartupEnv()` має валідувати `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` як обов'язкові (порушення → fail-fast при boot, а не silent fail у `/api/push`).
- `VAPID_EMAIL` тримати warn-only у dev, але вимагати в production (поведінка вже така у поточному коді `push.ts:47-52`).
- `PUSH_INTERNAL_ALLOWED_IPS` (`routes/push.ts:87`) — переписати через `env.PUSH_INTERNAL_ALLOWED_IPS` із дефолтом `""`.

**Out of scope**

- Зміна payload-схеми push-notification-ів.
- APNs / FCM dispatch-логіка ([`lib/webpushSend.ts`](../../apps/server/src/lib/webpushSend.ts) — окремий шлях).
- Будь-яке торкання `obs/tracing.ts` — це PR-02.

**Acceptance criteria**

- [ ] У `apps/server/src/modules/push/push.ts` і `apps/server/src/routes/push.ts` немає `process.env[...]` reads (grep-guard).
- [ ] `env/env.ts` Zod-схема включає всі 6 push-env-полів із доречними `.refine()` / production-required guard-ами.
- [ ] `pnpm --filter @sergeant/server test push` зелений (паттерн-патч `process.env` замінено на `vi.mock("../env/env.js", ...)` або фабрику).
- [ ] `assertStartupEnv()` у production з пустим `VAPID_*` → throws із referenced error-msg.
- [ ] CI-guard `scripts/check-env-single-source.mjs` (вже існує з PR-01 stack-pulse) лишає push-файли у allowlist-і, або список оновлено.

**Risks / mitigations**

- 15+ test-кейсів патчать `process.env["VAPID_*"]` між it-блоками — refactor може дати масовий rebase. **Mitigation:** перший commit — суто перенос test-фабрики `setVapidEnv()` у `__tests__/fixtures.ts`, без зміни `push.ts`; другий commit — заміна.
- Production без `VAPID_*` сьогодні warn-only — нова fail-fast поведінка ламає dev-instances. **Mitigation:** `NODE_ENV !== "production"` → warn (як зараз); прод — fail-fast.

**Estimate:** M (~250 LOC including tests). **Dependencies:** none, але м'яко наслідує патерн із PR-01 stack-pulse (#2122). **Owner:** TBD (backend-engineer).

---

## PR-02 — `refactor(server): drop process.env DI default in obs/tracing.ts`

**Surface**

- `apps/server/src/obs/tracing.ts:105,121,251` — функції-фабрики з дефолт-аргументом `env: NodeJS.ProcessEnv = process.env`.
- `apps/server/src/obs/tracing.test.ts` (якщо є — інакше створюємо).

**Scope**

- Замість default-param-у `env = process.env` → явний `import { env } from "../env/env.js"`. Тестова сторона передає `env`-object через explicit DI (наприклад, factory-функція приймає `{ env: Pick<EnvSchema, "OTEL_*" | "SENTRY_*"> }`).
- Документуємо у JSDoc, що дефолт навмисно прив'язаний до zod-валідованого `env`, не до сирого `process.env`.

**Out of scope**

- Зміна tracing-семантики (sampling-rate, span-naming).
- OTLP-exporter destination (інша конфіг-частина).

**Acceptance criteria**

- [ ] `grep "process.env" apps/server/src/obs/tracing.ts` → 0 рядків.
- [ ] Тести не приймають `env`-mock із сирим `process.env`; замість того передають fixture, типізований як `Pick<EnvSchema, …>`.
- [ ] `pnpm --filter @sergeant/server test tracing` зелений.
- [ ] `pnpm typecheck` без `any` у нових сигнатурах (Hard Rule).

**Risks / mitigations**

- DI-pattern із `process.env` навмисний для injection у тестах. **Mitigation:** перед merge — sync з owner OTel-ініціативи (див. ADR-0035), щоб переконатись, що жодного external runtime не покладається саме на сигнатуру з `process.env`-default.

**Estimate:** S (~80 LOC). **Dependencies:** немає, але краще після PR-01 (одна eval-сесія, один CI-guard refresh). **Owner:** TBD (backend-engineer).

---

## PR-03 — `chore(db-schema): drop umbrella ./migrate export`

**Surface**

- `packages/db-schema/package.json` — `exports["./migrate"]` (umbrella) → видалити; залишити лише `./migrate/runner`, `./migrate/pg`, `./migrate/sqlite`, `./migrate/types`.
- `apps/mobile/src/modules/routine/lib/dualWrite/{adapter,parity,index}.ts` + 3 `__tests__/*.ts` + `clientMigrate.ts` + `residualImport.ts` — 7 imports, переписати на специфічні subpath-и (`@sergeant/db-schema/migrate/sqlite`, `@sergeant/db-schema/migrate/runner`).
- 1 web-import (вже частково мігрований у попередніх PR-ах — звірити по `git grep "db-schema/migrate\"" apps/web`).
- `packages/db-schema/src/migrate/*` — JSDoc-пасажі, які посилаються на umbrella, оновити.

**Scope**

- Codemod: replace `from "@sergeant/db-schema/migrate"` → відповідний subpath на основі імен, що імпортуються (`SqliteMigrationClient` → `/sqlite`; `runMigrations` → `/runner`; `createPgAdapter` → `/pg`).
- Прибрати umbrella entry з `package.json`. Якщо лишається 1+ невідловлений імпорт — CI типчек впаде на ESM resolution.
- Оновити `docs/audits/2026-05-07-app-audit.md` (рядок про umbrella → DONE) + цей PR-план.

**Out of scope**

- Реструктуризація `@sergeant/db-schema/src/sqlite/migrations/index.ts` (1131 LOC — окрема ініціатива).
- SQLite Stage 8/9 migration (інша гілка).
- Будь-який runtime-change у migration-runner-і.

**Acceptance criteria**

- [ ] `grep -rn "@sergeant/db-schema/migrate\"" apps packages` → 0.
- [ ] `packages/db-schema/package.json` не експортує umbrella `./migrate`.
- [ ] `pnpm --filter @sergeant/db-schema build` + `pnpm --filter @sergeant/mobile typecheck` + `pnpm --filter @sergeant/web typecheck` зелені.
- [ ] Detox / mobile integration-тести у `apps/mobile/src/modules/routine/lib/dualWrite/__tests__/` зелені.
- [ ] Hard Rule #10 lifecycle markers оновлені у зачеплених `.md`.

**Risks / mitigations**

- Mobile bundler (Metro) кешує subpath-resolution. **Mitigation:** документувати `pnpm clean && pnpm install --frozen-lockfile` у PR-description; CI кеш — інвалідувати через `pnpm-lock.yaml` зміну (немає — отже, треба явно зачистити).
- Втрачений import у branch-coverage. **Mitigation:** PR-комент із grep-командою як CI step (не блокувальний, але показує zero-hits).

**Estimate:** M (~150 LOC, 7-9 файлів). **Dependencies:** жодних кодових; крос-app координація — узгодити з owner-ом mobile перед merge. **Owner:** TBD (mobile-engineer + backend-engineer co-review).

---

## PR-04 — `docs(observability): document per-model AI-token join-pattern in metrics.md §6`

**Surface**

- `docs/observability/metrics.md` §6 (AI-метрики).
- Опційно: `docs/observability/dashboards/*.json` — приклад існуючого Grafana-панелі, що користується patterns-ом.

**Scope**

- Додати приклад PromQL `anthropic_tokens_total{model="claude-sonnet-4"} * on (instance) group_left(release) app_build_info` — той самий join-pattern, що задокументовано у §15a (`app_build_info`) у landing-PR.
- Показати per-model breakdown: який лейбл існує (`model`), типові значення.
- Додати кросс-лінк §15a ↔ §6 (двосторонній).
- Опційно: PromQL для `voyage_*`, `embedding_*` cost-attribution.

**Out of scope**

- Зміна метрик у коді (`obs/metrics.ts`).
- Створення нових Grafana-панелей (це окремий PR `observability` сурфейсу).

**Acceptance criteria**

- [ ] `docs/observability/metrics.md` §6 містить мінімум один `app_build_info`-join PromQL для AI-токенів.
- [ ] Кросс-лінк на §15a (build/release identity) у обох напрямках.
- [ ] `pnpm format` + `pnpm lint:markdown` (якщо є) — зелені.
- [ ] `Last validated` у `metrics.md` оновлено (bump хуком).

**Risks / mitigations**

- Cosmetic-PR — практично без ризику. **Mitigation:** жодних кодових змін, лише doc.

**Estimate:** S (~50 LOC прози + 1-2 PromQL fenced-block). **Dependencies:** none. **Owner:** TBD (any-engineer).

---

## PR-05 — `fix(server): bounded pool.end() drain with AbortController on shutdown`

**Surface**

- `apps/server/src/index.ts:323-331` (поточний `try { await pool.end() } catch { … }`).
- `apps/server/src/env/env.ts` — додати `POOL_DRAIN_TIMEOUT_MS?` (default = `SHUTDOWN_GRACE_MS / 2`).
- `apps/server/src/index.test.ts` (якщо немає — створити cell для shutdown sequence).

**Scope**

- Обгорнути `pool.end()` у `Promise.race([pool.end(), abortablePromise(timeout)])` з AbortController.
- На timeout → log `pool_drain_timeout` (Pino, level=warn, redact-safe) і пропускаємо `pool.end()` далі — hard-timer (`SHUTDOWN_HARD_TIMEOUT_MS`) усе одно зупиняє процес.
- Не міняємо порядок shutdown-кроків (worker-stop sequence) — він уже зафіксований у поточному коді.

**Out of scope**

- Recovery-логіка для застряглих transactions (потребує DB-side `pg_terminate_backend()`).
- Зміна `SHUTDOWN_GRACE_MS` / `SHUTDOWN_HARD_TIMEOUT_MS` дефолтів.

**Acceptance criteria**

- [ ] У `index.ts` shutdown-секції `pool.end()` обгорнутий race із `POOL_DRAIN_TIMEOUT_MS`.
- [ ] На timeout — лог `pool_drain_timeout` (нова `obs/metrics.ts`-counter необов'язково; якщо додаємо — задокументуємо у §15).
- [ ] Тест `apps/server/src/index.test.ts` сценарій: mock-pool-end чекає 10 с → shutdown повертається через `POOL_DRAIN_TIMEOUT_MS`.
- [ ] `pnpm --filter @sergeant/server test:integration` зелений (Testcontainers — реальний Postgres, реальний pool).

**Risks / mitigations**

- Передчасний abort залишає open transactions у БД. **Mitigation:** worker-stop fence уже виконано раніше у sequence — на момент `pool.end()` нових query не має; race-window мінімальний.
- Hard-timer і так ловить hang — без додаткової роботи. **Mitigation:** PR має пройти review від owner-а observability (поточна swallow-стратегія — навмисна, не bug).

**Estimate:** S (~120 LOC including test). **Dependencies:** none. **Owner:** TBD (backend-engineer).

---

## PR-06 — `feat(observability): Alertmanager rule for backend /health p95 SLO`

**Surface**

- `docs/observability/prometheus/alert_rules.yml` — нова rule `BackendHealthP95High`.
- `docs/observability/SLO.md` — секція "Health endpoint p95" (формалізуємо з informal SLO в `AGENTS.md`).
- `docs/observability/alertmanager.yml` — pre-flight перевірка, що `severity = ticket` route існує (а він вже є — лише verify).

**Scope**

- Recording rule `job:health_p95_5m` на існуючому метрику `http_request_duration_seconds{route="/health"}` (звірити, що метрика експозиція є; якщо ні — інший PR на instrumentation).
- Alert: `BackendHealthP95High` — `job:health_p95_5m > 0.1` (100 ms, AGENTS.md budget) за `for: 5m`, severity=`ticket`.
- SLO-документ — формалізувати порог + escalation-policy (link на runbook).

**Out of scope**

- Зміна `/health`-handler-логіки.
- Інші endpoint-ові SLO (chat first-token p95, sync-push p95) — формалізуємо окремими PR-ами.

**Acceptance criteria**

- [ ] `docs/observability/prometheus/alert_rules.yml` містить `BackendHealthP95High` із `for: 5m`, threshold = `0.1`, severity=`ticket`.
- [ ] `docs/observability/SLO.md` має нову секцію `Health endpoint p95`.
- [ ] `promtool check rules` (якщо існує CI step) — зелений.
- [ ] Link з `AGENTS.md` informal-SLO рядка → формалізована SLO-секція.

**Risks / mitigations**

- Метрика для `/health` може існувати з іншим лейблом (наприклад, `route="/health/ready"`). **Mitigation:** перед merge — `curl http://localhost:3000/metrics | grep http_request_duration_seconds | grep health` локально + smoke production.
- Алерт стане noisy у часи піків (cold start). **Mitigation:** `for: 5m` уже згладжує; review після першого тижня — підняти до `for: 10m` або підняти поріг.

**Estimate:** S (~80 LOC YAML + проза). **Dependencies:** none. **Owner:** TBD (any-engineer).

---

## PR-07 — `feat(server): tighten Sentry sampling for /api/internal/* (admin=1.0)`

**Surface**

- `apps/server/src/sentry.ts` — `SENTRY_SAMPLING_RULES` (рядок 32+) додати правило `match: "/api/internal/"` із `1.0`. Перевірити, що існуючі `/api/internal/openclaw/write/` (`1.0`) і `/api/admin/` (`1.0`) — лишаються, нова rule — це загальний "будь-який internal namespace".
- `docs/observability/sentry-sampling.md` — задокументувати rule і rationale.
- `apps/server/src/sentry.test.ts` (якщо є — інакше створюємо).

**Scope**

- Додати rule. Перевірити, що ordering правильний (specific перед general — Sentry застосовує перше match).
- Виміряти baseline: скільки spans з `/api/internal/*` Sentry отримує сьогодні (за тиждень) — додати у PR-description.
- На основі baseline вирішити: чи sampling=`1.0` не пробиває Sentry-quota; якщо ризик — `0.5` із option-у на upgrade.

**Out of scope**

- Зміна Sentry plan / quota.
- Sampling для public `/api/*` (інша дискусія).

**Acceptance criteria**

- [ ] `apps/server/src/sentry.ts` `SENTRY_SAMPLING_RULES` містить `/api/internal/*` rule.
- [ ] Test (unit, не runtime) перевіряє, що `samplingContext.transaction = "/api/internal/foo"` → rate = `1.0`.
- [ ] `docs/observability/sentry-sampling.md` оновлений із новою rule і baseline-кількостями.
- [ ] PR-description містить лінк на Sentry-дашборд із baseline (за останні 7 днів).

**Risks / mitigations**

- Sentry quota може пробитися на webhook-spike-ах. **Mitigation:** baseline вимірювання — обов'язкова частина PR-description; якщо risk — `0.5` + rule "1.0 тільки для write-side".

**Estimate:** S (~100 LOC + проза). **Dependencies:** none, але м'яко наслідує PR-12 stack-pulse (Sentry tracesSampler). **Owner:** TBD (backend-engineer).

---

## PR-08 — `docs(observability): refresh metrics.md §Відкриті питання`

**Surface**

- `docs/observability/metrics.md` — секція "Відкриті питання" (footer).

**Scope**

- Перечитати секцію, прибрати застарілі питання (закриті у попередніх PR-ах — `app_build_info` doc, safeStringEqual, etc.).
- Додати поточні (`/api/internal/*` sampling baseline, per-model AI-token join-pattern документація — обидва тепер мають PR-ів у цьому плані).
- Cosmetic, без коду.

**Out of scope**

- Зміна метрик у `obs/metrics.ts`.
- Документація нових метрик (це PR-04).

**Acceptance criteria**

- [ ] Кожен пункт у §Відкриті питання — або має trackable issue/PR-link, або видалений.
- [ ] `Last validated` оновлено (хуком).
- [ ] `pnpm format` зелений.

**Risks / mitigations**

- Нульовий ризик — pure doc. **Mitigation:** review за зразком "це все ще питання?" від owner-а observability.

**Estimate:** XS (~30 LOC). **Dependencies:** none; PR-04 + PR-06 + PR-07 мають створити закриваючі лінки, з якими цей PR підметає secção. **Owner:** TBD (any-engineer).

---

## PR-09 — `refactor(server): migrate validateBody→parseBody (batch 1 — nutrition)`

**Surface**

- `apps/server/src/modules/nutrition/*.ts` (11 файлів — `analyze-photo`, `backup-upload`, `barcode`, `day-hint`, `day-plan`, `food-search`, `parse-pantry`, `recommend-recipes`, `refine-photo`, `shopping-list`, `week-plan`). Усі по 2 callsites = ~22 заміни.
- Матчений тест-стек у `apps/server/src/modules/nutrition/__tests__/` — перевірити, що response-shape ідентичний (Hard Rule #3, 4xx із `details`).

**Scope**

- Replace pattern:

  ```ts
  const parsed = validateBody(SomeSchema, req, res);
  if (!parsed.ok) return;
  const data = parsed.data;
  ```

  на:

  ```ts
  const data = parseBody(SomeSchema, req);
  ```

  - `asyncHandler` уже на місці (інакше — додати).

- Для `validateQuery` — аналогічно `parseQuery`.
- Тести `errorHandler`-flow уже існують (`http/errorHandler.test.ts` після P1-2). Не дублюємо — лише точкові тести на кожен handler, що 400 повертає `code: VALIDATION` + `details`.

**Out of scope**

- Зміна `*Schema` (zod).
- Зміна response shape.
- Інші модулі (`sync`, `chat`, `internal/*`) — це batch 2 (PR-10).

**Acceptance criteria**

- [ ] `grep -c "validateBody\|validateQuery" apps/server/src/modules/nutrition/*.ts` → 0.
- [ ] Усі nutrition route-и обгорнуті `asyncHandler` (якщо не були).
- [ ] `pnpm --filter @sergeant/server test nutrition` зелений.
- [ ] `pnpm api:check-openapi-types` зелений (response shape не змінилась).
- [ ] Sample request у production → response body має ту саму форму (manual smoke у staging — рекомендовано).

**Risks / mitigations**

- Забутий `return` у legacy-flow → `parseBody` усуває цей клас помилок, але intermediate state (handler з sentinel + новий handler з parseBody) → потенційний контракт-drift. **Mitigation:** batch-PR робить уніформну заміну — або всі, або жоден.
- Tests які explicitly мокали `res.status(400).json(…)` → треба адаптувати під `errorHandler`-driven 400. **Mitigation:** `errorHandler.test.ts` уже покриває shape; module-tests лише перевіряють status code + `code: "VALIDATION"`.

**Estimate:** M (~300 LOC including test адаптацій). **Dependencies:** жодних кодових (P1-1 і P1-2 уже у main). **Owner:** TBD (backend-engineer).

---

## PR-10 — `refactor(server): migrate validateBody→parseBody (batch 2 — sync/chat/internal/решта)`

**Surface**

- `apps/server/src/modules/sync/{syncV2,syncV2Stream}.ts`.
- `apps/server/src/modules/chat/{chat,coach}.ts`.
- `apps/server/src/modules/ai-memory/{ingestRoute,recallRoute}.ts`.
- `apps/server/src/modules/digest/weekly-digest.ts`, `modules/transcribe/transcribe.ts`, `modules/mono/{privat,read}.ts`.
- `apps/server/src/routes/{billing,push,waitlist}.ts` + `routes/internal/*.ts` (8 файлів).
- Матчені тести.

**Scope**

- Той самий codemod, що у PR-09, але на ширшому скоупі.
- Особливо обережно з `chat.ts` (стрімінг — переконатись, що `parseBody`-throw не лишає stream-handle висіти; `asyncHandler` має закрити).
- Внутрішні route-и (`routes/internal/*`) — підвищена увага: response shape використовується n8n / OpenClaw, contract має лишитись.

**Out of scope**

- Зміна стрімінг-логіки чат-handler-ів.
- Зміна form-of-response для internal-route-ів.

**Acceptance criteria**

- [ ] `grep -rn "validateBody\|validateQuery" apps/server/src` (поза `http/`, `__tests__/`) → 0.
- [ ] `pnpm --filter @sergeant/server test` зелений (повний suite).
- [ ] `pnpm --filter @sergeant/server test:integration` зелений (Testcontainers — реальний Postgres проганяє chat / sync flow).
- [ ] `pnpm api:check-openapi-types` зелений.
- [ ] Manual smoke: streaming chat не лишає висіти curl-ний request після ValidationError.

**Risks / mitigations**

- Великий PR (L). **Mitigation:** робити по 3-4 файли на commit; PR має multiple commit-ів, що review-ються інкрементально. Якщо ризик — розбити на batch 2a + 2b після PR-09.
- Streaming-handler-и можуть бути крихкі. **Mitigation:** перед merge — guide-runner step `apps/server/src/modules/chat/__tests__/streaming.test.ts` має існувати або бути доданий.
- Internal contract drift. **Mitigation:** `routes/registerRoutes.test.ts` інваріантні тести (з P1-4) ловлять зникнення/появу route-у; contract-тести (`me.contract.test.ts`-style) — додати для internal route-ів якщо немає.

**Estimate:** L (~700 LOC including tests, 20+ файлів). **Dependencies:** PR-09 (як sanity-baseline). **Owner:** TBD (backend-engineer).

---

## PR-11 — `feat(governance): eslint rule prefer-parseBody for new server handlers`

**Surface**

- `packages/eslint-plugin-sergeant-design/` (нова rule `prefer-parse-body-over-validate-body`).
- `apps/server/eslint.config.*` — увімкнути.
- Допустимо — readme rule-у.

**Scope**

- Custom AST-rule: warn (потім error через 1 sprint) на `validateBody` / `validateQuery` callsite. Виключити `apps/server/src/http/validate.ts` (де ці функції визначені).
- Початково — `warn` для backward-compat (якщо PR-10 десь пропустив).
- Через 1 sprint — підняти до `error` через governance-sync.

**Out of scope**

- Зміна `validate.ts` (depreciation marker лишити, не видаляти — collback можливості).
- Інші governance-правила.

**Acceptance criteria**

- [ ] Rule `prefer-parse-body-over-validate-body` екзистує у plugin-і + має BAD/GOOD приклад у `docs/governance/rules/`.
- [ ] `pnpm --filter eslint-plugin-sergeant-design test` зелений.
- [ ] `pnpm lint` на `apps/server/src` не падає (бо PR-09 + PR-10 уже мігрували callsites; rule = warn).
- [ ] PR-description описує rollout plan: `warn` тепер → `error` через 1 sprint.

**Risks / mitigations**

- Rule помилково ловить legacy/test-файли. **Mitigation:** допустимий suffix exclusion (`.test.ts` → дозволено `validateBody`-references у setup; перевірити).

**Estimate:** S (~150 LOC включно з test-кейсами AST-rule-у). **Dependencies:** PR-09 + PR-10 (мігровані callsites, інакше rule розіб'є build). **Owner:** TBD (backend-engineer + governance-owner).

---

## PR-12 — `chore(audits): scope syncV2.ts + routes/internal/openclaw.ts deep-roasts`

**Surface**

- `docs/audits/2026-08-XX-sync-engine-roast.md` (stub-файл).
- `docs/audits/2026-08-XX-openclaw-internal-roast.md` (stub-файл).
- `docs/audits/README.md` — реєстрація.

**Scope**

- Створити два stub-планa для майбутніх deep-roast-ів:
  - **`sync_engine_roast`** — `syncV2.ts` 3031 рядків (найбільший файл у репо). Питання: chunkability, atomic-transaction boundaries, idempotency-key hot path, retry semantics.
  - **`openclaw_internal_roast`** — `routes/internal/openclaw.ts` 1781 рядок. Питання: security boundary (admin-only? service-account-only?), audit-log coverage, write-tool approval gate.
- Stub-формат: TL;DR (3-4 буліт), Scope, Methodology hints, Cross-refs, Out-of-scope.
- Без рекомендацій / fix-ів — лише розкладка задачі.

**Out of scope**

- Реальний аудит (це 1-2-денна сесія для кожного — наступний 3-month cycle, серпень 2026).
- Decomposition / refactor — отримаємо рекомендації після аудиту.

**Acceptance criteria**

- [ ] Два stub-файли у `docs/audits/` із валідними frontmatter (`Last validated`, `Next review`, `Status: Draft`).
- [ ] `docs/audits/README.md` має посилання на обидва.
- [ ] Stub-файли — кожен ≤ 100 рядків.

**Risks / mitigations**

- Stub без owner-а — лишається спрямованим у нікуди. **Mitigation:** `Owner` поле — `TBD (backend-engineer)`, `Next review = 2026-08-11` (співпадає з backend-roast cycle).

**Estimate:** S (~150 LOC проза). **Dependencies:** none. **Owner:** TBD (backend-engineer).

---

## Sequencing

```
                    ┌─ PR-04 (metrics §6 doc)  ────────────────┐
                    │                                          │
PR-01 (push env) ───┤                                          │
PR-02 (tracing) ────┼─ незалежні, можна паралелити ──────────► PR-08 (cleanup §Відкриті)
PR-05 (pool.end) ───┤
PR-06 (health p95)──┤
PR-07 (sentry sub) ─┘

PR-03 (umbrella drop)  — крос-app, окремо; не блокує жоден з 01/02/05.

PR-09 (validate→parse batch 1, nutrition)
   │
   ▼
PR-10 (validate→parse batch 2, sync/chat/internal)
   │
   ▼
PR-11 (eslint prefer-parseBody rule)

PR-12 (audit stubs) — паралельно з будь-яким.
```

- **Паралельно (Sprint A, 1-2 тижні):** PR-01, PR-02, PR-04, PR-05, PR-06, PR-07. Шість дрібних/середніх змін, мало конфліктів між собою (різні файли).
- **Sprint B (1-2 тижні):** PR-03 (потребує mobile-co-review), PR-09 (стартує validate→parse sweep), PR-12 (stub-аудити — пишеться у вільний час).
- **Sprint C:** PR-10 (більший sweep, після PR-09 baseline).
- **Sprint D:** PR-11 (eslint rule). Тільки після того як PR-09 + PR-10 у main.
- **Sprint E:** PR-08 — фінальний підмет, бо потребує закриваючих лінків від PR-04 / PR-06 / PR-07.

---

## Risks / known unknowns

| Ризик                                                                              | Probability | Impact | Mitigation                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ----------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process.env` migrations (PR-01, PR-02) ламають test-фабрики 15+ кейсів            | High        | Medium | Окремий commit, що мігрує тест-fixture перед заміною коду; не змішувати.                                                                              |
| Drop umbrella export (PR-03) пропускає одиничний mobile import → CI fail на mobile | Medium      | Medium | Grep-guard у PR-description + pre-merge `pnpm clean && pnpm install` на mobile workspace; ESM resolve-error дуже видимий у CI.                        |
| validate→parse sweep (PR-09/10) drift-ить contract для одиничного route-у          | Medium      | High   | Hard Rule #3 contract-test + `api:check-openapi-types` як CI gate; реєстраційні тести (P1-4) ловлять missing route.                                   |
| `pool.end()` race fix (PR-05) приховує реальний bug у worker-stop sequence         | Low         | Low    | Hard-timer лишається; review від observability-owner-а; metric `pool_drain_timeout` як operational-signal на майбутнє.                                |
| Sentry-sampling (PR-07) пробиває quota                                             | Medium      | Medium | Baseline-вимірювання — required частина PR-description; якщо risk → знизити до `0.5`.                                                                 |
| Health p95 alert (PR-06) генерує noise на cold-start-ах                            | Medium      | Low    | `for: 5m` уже згладжує; revisit після першого тижня.                                                                                                  |
| Audit stub-и (PR-12) лишаються "вічними draft-ами"                                 | High        | Low    | `Next review = 2026-08-11` зв'язує з основним backend-roast cycle; якщо до серпня ніхто не взявся — переводимо у Archived із чітким "skip rationale". |
| Validate→parse migration vs. внутрішніх n8n / OpenClaw споживачів                  | Medium      | Medium | `routes/internal/*` має contract-test покриття (Hard Rule #3); якщо немає — додаємо у scope PR-10 одного route-у.                                     |

### Known unknowns

- Чи метрика `http_request_duration_seconds{route="/health"}` уже експонована? Якщо ні — PR-06 розпадається на (a) instrumentation, (b) alert. Перевірити локально перед стартом.
- Скільки spans з `/api/internal/*` Sentry зараз отримує (baseline для PR-07). Перевірити Sentry-дашборд.
- Чи Detox / mobile bundler коректно інвалідує subpath-cache після PR-03. Перевірити на staging-build.
- Чи `validateBody` хтось консумить через generic re-export з `http/index.ts` (інакше grep чистий). Перевірити перед PR-09.

---

## Out-of-scope для всієї цієї планувальної серії

- SQLite Stage 8/9 migration (`sync_op_outbox` no-such-table fix із [`docs/audits/2026-05-07-app-audit.md`](../audits/2026-05-07-app-audit.md#A1)) — окрема ініціатива.
- Decomposition `syncV2.ts` / `routes/internal/openclaw.ts` — після deep-roast-у з PR-12.
- Будь-який frontend / mobile scope, що не задіяний у PR-03.
- Будь-яка governance-зміна, не пов'язана з parseBody-rule (PR-11).
