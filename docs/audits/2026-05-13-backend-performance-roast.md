# Прожарка #4/10: Backend & Performance (2026-05-13)

> **Last validated:** 2026-05-13 by Devin (child session). **Next review:** 2026-08-11. **Status:** Active

## Контекст

Четверта прожарка з циклу 10 — фокус на бекенді (`apps/server`),
`packages/db-schema`, `packages/shared`. Скоуп — Express-стек, AI-workers,
sync-engine, DB-запити, кешування, latency-бюджети, observability hooks.
Не торкаємось SQLite migration (Stage 8/9 — окрема ініціатива).

Parent session: див. URL у PR-description-і.

## Cross-refs (попередні аудити цієї теми)

- [`2026-05-03-web-deep-dive/03-backend-and-performance.md`](./2026-05-03-web-deep-dive/03-backend-and-performance.md) — найбільший backend-deep-dive, 370 рядків, §4.1–§5.4.
- [`archive/2026-04-26-sergeant-audit-devin.md`](./archive/2026-04-26-sergeant-audit-devin.md) — генеральний аудит, 30/31 пунктів закрито.
- [`2026-05-07-app-audit.md`](./2026-05-07-app-audit.md) — повний аудит застосунку, P0/P1/P2 матриця у §10.
- [`../tech-debt/backend.md`](../tech-debt/backend.md) — running tech-debt log (606 рядків), більшість P0 уже DONE.

## TL;DR (топ-8 болей)

1. **`validateBody`-sentinel-паттерн досі домінує** у handler-ах
   ([`apps/server/src/modules/chat/chat.ts:`](../../apps/server/src/modules/chat/chat.ts)
   - 30+ інших файлів). Забутий `return` після `!parsed.ok` — латентне
     джерело 500-ок. Throw-based варіант кращий, але його не існувало.
     **Закрито в цьому PR (P1, additive `parseBody`/`parseQuery` + tests)**.
2. **`errorHandler` не вмів surface-ити `validation details`**, тому
   нові handler-и, що могли б кидати `ValidationError`, не давали
   клієнту такий же contract як старий `validateBody`-flow. **Закрито в цьому PR.**
3. **`app_build_info` Gauge існує у коді
   ([`obs/metrics.ts:713-736`](../../apps/server/src/obs/metrics.ts#L713)),
   але НЕ задокументовано** у `docs/observability/metrics.md`. Grafana-promql
   шаблони (`* on (instance) group_left(release) <metric>`) тримаються
   на цій серії, але ніхто крім авторів не знає, як її використовувати.
   **Закрито в цьому PR (нова секція §15a).**
4. **Багато `process.env[...]` reads у `obs/metrics.ts`,
   `modules/push/push.ts`, `routes/push.ts`** — обходять
   `env/env.ts`-zod-валідацію і не покриті startup assert-ом
   ([`docs/audits/2026-05-07-app-audit.md:396`](./2026-05-07-app-audit.md#L396),
   P2). У `metrics.ts` пять reads. **Частково закрито (metrics.ts) в цьому PR.**
5. **`GET /metrics` token-check через `!==`** —
   ([`obs/metrics.ts:1010-1018`](../../apps/server/src/obs/metrics.ts#L1010))
   timing-side-channel: short-circuit на першій байт-розбіжності → байт-за-байтом
   recovery під час scrape-ів. Низький risk (METRICS_TOKEN не публічний),
   але `safeStringEqual` уже існує у репо. **Закрито в цьому PR.**
6. **Регресія "зник API-роут" або "новий public роут без security рев'ю"**
   до сьогодні ловилася лише `registerRoutes.test.ts` snapshot-у
   ([`routes/registerRoutes.test.ts`](../../apps/server/src/routes/registerRoutes.test.ts)),
   який showcase-ить інвентар, але НЕ перевіряє інваріанти на кшталт
   "усі `/api/*` під `/api`-префіксом" чи "`/api/internal/*` не дублюється
   у public namespace-і". **Закрито в цьому PR (3 нові інваріантні тести).**
7. **`@sergeant/db-schema/migrate` umbrella export досі експортується**
   ([`docs/audits/2026-05-07-app-audit.md:389`](./2026-05-07-app-audit.md#L389),
   P0+). Mobile-сурфейси (5 imports) і 1 web-impport ще на ньому;
   web-fix частково зроблено, mobile залишилось. **Не в цьому PR** — потребує
   крос-app координації, виноситься у наступну прожарку.
8. **`docs/observability/metrics.md` не покриває `cost monitoring` секцію
   повністю** — лише `infra_monthly_cost_usd` + `voyage_daily_budget_usd`,
   але per-model `anthropic_tokens_total` join-pattern із
   `app_build_info`-ом не показаний. **Не в цьому PR**, малий impact.

## P0 (blocker / data-loss / silent regression)

P0 у скоупі бекенду на момент аудиту вже закриті у попередніх прожарках
(валідація, error handling, banks, web-push, AI quota, TS migration —
див. [`docs/tech-debt/backend.md`](../tech-debt/backend.md) summary table).
Останній відкритий P0 — A1 з [`2026-05-07-app-audit.md`](./2026-05-07-app-audit.md#A1)
(SQLite `no such table: sync_op_outbox`) — заявка stage 8/9 (SQLite
migration), поза скоупом цієї прожарки.

## P1 (operational risk, observability gaps)

### P1-1. `validateBody`-sentinel — забутий `return` як латентне 500 ✅ Зроблено в цьому PR

- **File:** [`apps/server/src/http/validate.ts:1-70`](../../apps/server/src/http/validate.ts)
- **Дія:** **Add** `parseBody<S>(schema, req): z.infer<S>` і
  `parseQuery<S>(schema, req)` — throw-based variants. Кидають
  `ValidationError(msg, { cause: { details: [{ path, message }] } })`,
  які `errorHandler` обробляє як 400 з `code: VALIDATION` + `details` у
  response body. Старі callsite-и `validateBody`/`validateQuery`
  продовжують працювати без змін (additive change).
- **Why P1:** забутий `return` після `validateBody`-sentinel-кейсу був
  одним із джерел 500-ок із sync-related handler-ів у Sentry (бачив у
  history). Throw-based варіант усуває цей клас помилок —
  `asyncHandler` + `errorHandler` гарантують відповідь.
- **Tests added:** 5 нових кейсів у [`http/validate.test.ts`](../../apps/server/src/http/validate.test.ts).

### P1-2. `errorHandler` surfaces `cause.details` для operational помилок ✅ Зроблено в цьому PR

- **File:** [`apps/server/src/http/errorHandler.ts:78-93`](../../apps/server/src/http/errorHandler.ts)
- **Дія:** **Change** — додано `extractClientDetails(cause)` хелпер, який
  витягує `cause.details: Array` лише для 4xx (operational). Для 5xx
  (programmer) — `details` не surface-имо, щоб не лікити стек/PII.
  Контракт response body ідентичний до старого
  `validateBody`-sentinel-у (`{ error, message, code, details, requestId }`).
- **Why P1:** без цього новий `parseBody` був би "тихий" — клієнт втрачав
  би per-field message-і, які UI використовує для form-error-highlighting
  (Hard Rule #3 API contract: server ↔ api-client ↔ test).
- **Tests added:** 2 нових кейси (4xx surfaces, 5xx redacts) у
  [`http/errorHandler.test.ts`](../../apps/server/src/http/errorHandler.test.ts).

### P1-3. `GET /metrics` token-check через `!==` (timing-leak) ✅ Зроблено в цьому PR

- **File:** [`apps/server/src/obs/metrics.ts:1009-1022`](../../apps/server/src/obs/metrics.ts#L1009)
- **Дія:** **Change** `got !== expected` → `safeStringEqual(got, expected)`
  (constant-time, через `crypto.timingSafeEqual`). Хелпер уже існує у
  [`http/safeCompare.ts`](../../apps/server/src/http/safeCompare.ts) для
  Stripe-webhook signature comparison.
- **Why P1:** ризик низький (METRICS_TOKEN не публічний, не передається
  у user-flow), але `!==` — це класична побайтова уразливість, яка є
  тривіальною для виправлення коли хелпер уже у репо.
- **Tests added:** 4 нових кейси у [`obs/metrics.test.ts`](../../apps/server/src/obs/metrics.test.ts)
  (no-token, wrong-token, same-length-different-content, valid-token).

### P1-4. Route registry — інваріантні тести (а не лише snapshot) ✅ Зроблено в цьому PR

- **File:** [`apps/server/src/routes/registerRoutes.test.ts`](../../apps/server/src/routes/registerRoutes.test.ts)
- **Дія:** **Add** 3 нових інваріантних it-блоки:
  - "реєструє щонайменше 60 ендпоінтів" — sanity-проти-empty-router.
  - "кожен роут живе або під `/api/`, або під коротким health/metrics-альясом".
  - "`/api/internal/*` не дублюються у public `/api/*` namespace-і".
- **Why P1:** snapshot-діф каже "щось змінилось", але інваріант каже
  "це конкретно нелегальна зміна". Поточно ловив би
  `app.use("/api", apiCorsMiddleware())`-bypass-кейс, який легко
  пропустити у code-review (роут зʼявляється під голим `/v2/...`).

### P1-5. `app_build_info` documented у metrics.md §15a ✅ Зроблено в цьому PR

- **File:** [`docs/observability/metrics.md:325-360`](../observability/metrics.md#15a-buildrelease-identity-app_build_info)
- **Дія:** **Add** нова секція `## 15a. Build/release identity
(app_build_info)` з PromQL-шаблонами для join-on-labels у Grafana
  (per-release latency, error-rate, rolling-deploy detection).
- **Why P1:** ця метрика була "tribal knowledge" — без документації
  Grafana-промптери не знали, як її використовувати, і копіювали
  `release` у кожну метрику окремо (cardinality explosion).

### P1-6. `metrics.ts` reads з `process.env` мігровано до `env.ts` ✅ Зроблено в цьому PR

- **Files:**
  - [`apps/server/src/env/env.ts:340-346`](../../apps/server/src/env/env.ts#L340) — додано `GIT_COMMIT`, `VERCEL_GIT_COMMIT_SHA`, `npm_package_version`.
  - [`apps/server/src/obs/metrics.ts:722-735, 1009`](../../apps/server/src/obs/metrics.ts#L722) — `process.env[...]` → `env.xxx`.
- **Why P1:** одне з джерел P2 з
  [`2026-05-07-app-audit.md:396`](./2026-05-07-app-audit.md#L396) —
  centralize `process.env`-reads, щоб zod-валідація ловила typo на
  startup-і. logger.ts свідомо НЕ мігрую — circular dep (env.ts → logger.ts).
  push.ts — пізніше (~6 callsite-ів + 15 testів патчать env, треба
  окремий PR).

## P2 (DX, тести, документація)

### P2-1. `push.ts` / `routes/push.ts` `process.env` reads (P2 з 2026-05-07-app-audit) ❌ Не в цьому PR

- **Files:** [`apps/server/src/modules/push/push.ts:36-49,268-273`](../../apps/server/src/modules/push/push.ts), [`apps/server/src/routes/push.ts:87`](../../apps/server/src/routes/push.ts#L87).
- **Why виносимо:** module-load-time const-reads (`VAPID_PUBLIC`,
  `VAPID_PRIVATE`) — будь-яке переписування на `env`-import зачіпає 15+
  testів, які паттерн-патчать `process.env["VAPID_*"]` між it-блоками.
  Запропоновано як окрема прожарка (`refactor(server): centralize push
env reads through env.ts`).

### P2-2. `obs/tracing.ts` `process.env` reads (через дефолтний argument) ❌ Тут не торкаємось

- **File:** [`apps/server/src/obs/tracing.ts:105,121,251`](../../apps/server/src/obs/tracing.ts#L105).
- **Why виносимо:** `env: NodeJS.ProcessEnv = process.env` — це
  injection-pattern для тестів, рефактор у `env.ts` зламає DI. Окрема
  розмова чи переписувати чи лишити.

### P2-3. `@sergeant/db-schema` umbrella `./migrate` export — drop ❌ Не в цьому PR

- **Files:** [`packages/db-schema/package.json`](../../packages/db-schema/package.json), 5 mobile imports, 1 web.
- **Why виносимо:** mobile-сурфейси поза скоупом цієї прожарки.
  Запропоновано як `chore(db-schema): drop umbrella ./migrate export`
  у наступній мобільно-фокусній прожарці (#5/10 — Mobile App, або
  #6/10 — Data Layer).

### P2-4. Documentation gap: per-model AI-token join-pattern ❌ Низький impact

- **File:** [`docs/observability/metrics.md`](../observability/metrics.md) §6
- **Why виносимо:** мінорна документаційна правка, можна закрити одним
  commit-ом будь-якій сесії.

### P2-5. `pool.end()` failure handling під час shutdown ⚠️ Open

- **File:** [`apps/server/src/index.ts:323-331`](../../apps/server/src/index.ts#L323)
- **Why open:** `try { await pool.end() } catch { /* log */ }` —
  swallows errors, але якщо pg-pool корумпований (active txn у одному
  з worker-ів), `pool.end()` зависає до hard-timeout-у (5s) → клієнти
  отримують ECONNRESET замість graceful 503. Запропонована fix-а: AbortController
  з `SHUTDOWN_GRACE_MS / 2` для pool drain. Не критично, бо hard-timer
  все одно ловить.

### P2-6. Health-endpoint p95 не алертимо в Grafana ⚠️ Open

- **Files:** AGENTS.md §Performance budgets каже "Backend `/health` p95
  < 100 ms (informal SLO)", але немає Alertmanager-правила.
- **Why open:** інформативно, не блокер; додати в alerts.yml у
  наступному observability-PR.

### P2-7. Sentry SENTRY_SAMPLING_RULES — admin=1.0 для `/api/internal/*` ⚠️ Open

- **File:** [`apps/server/src/sentry.ts`](../../apps/server/src/sentry.ts)
- **Why open:** перевірити, що n8n-webhook spike-и не б'ють Sentry-quota.
  Потрібно власне виміряти rate-і, виносимо у моніторинг-прожарку.

### P2-8. `docs/observability/metrics.md` §Відкриті питання — застаріле ⚠️ Cosmetic

- Не в скоупі цього PR.

## Прогрес виконання (закрито в цьому PR)

| Тег  | Опис                                                           | Файли                                                                        | Δ LOC    |
| ---- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| P1-1 | `parseBody`/`parseQuery` throw-based validation helpers        | `apps/server/src/http/validate.ts`, `http/index.ts`, `http/validate.test.ts` | ~80      |
| P1-2 | `errorHandler` surfaces `cause.details` для 4xx                | `apps/server/src/http/errorHandler.ts`, `http/errorHandler.test.ts`          | ~50      |
| P1-3 | `GET /metrics` token-check → `safeStringEqual` (constant-time) | `apps/server/src/obs/metrics.ts`, `obs/metrics.test.ts`                      | ~50      |
| P1-4 | Route registry — 3 нові інваріантні тести                      | `apps/server/src/routes/registerRoutes.test.ts`                              | ~50      |
| P1-5 | Документація `app_build_info` у metrics.md §15a                | `docs/observability/metrics.md`                                              | ~40      |
| P1-6 | `obs/metrics.ts` мігровано на `env.ts` reads + нові env-keys   | `apps/server/src/env/env.ts`, `obs/metrics.ts`                               | ~25      |
|      |                                                                | **Всього**                                                                   | **~295** |

Файлів змінено: **9** (`apps/server/src/http/{validate,index,validate.test,errorHandler,errorHandler.test}.ts`,
`apps/server/src/obs/{metrics,metrics.test}.ts`,
`apps/server/src/env/env.ts`, `apps/server/src/routes/registerRoutes.test.ts`,
`docs/observability/metrics.md`, `docs/audits/README.md` + цей файл).

## Все, що НЕ зайшло в PR (виноситься у наступну прожарку)

- **P0+** `chore(db-schema): drop umbrella ./migrate export` — потрібен у mobile-фокусній прожарці.
- **P2** Migration `push.ts` / `routes/push.ts` `process.env` reads → `env.ts` — окремий PR через 15+ test-патчів.
- **P2** `obs/tracing.ts` env-injection refactor — обговорюємо, чи лишити DI-pattern.
- **P2** SQLite `sync_op_outbox` no-such-table fix — Stage 8/9 (інша ініціатива).
- **P2** Documentation gap у `metrics.md` §6 (AI-token join-pattern) — окремий cosmetic PR.
- **P2** Shutdown: `pool.end()` AbortController — нерефлексія, hard-timer ловить.
- **P2** Health p95 Alertmanager rule — observability-PR.
- **P2** Sentry sampling для `/api/internal/*` — потрібен власний моніторинг.

## Methodology notes

- Не торкався SQLite-migration коду (Stage 8/9 — окрема ініціатива).
- Не модифікував `docs/audits/README.md` поза одним рядком про цей roast (правило з task spec).
- Не використовував `--no-verify` для git commits (hard-rule #7).
- Не force-pushed у main/master (hard-rule #6).
- `pnpm check` прогнано локально до open-PR (див. PR-description).
- Документація — українською; код, коментарі, тести — англійською/міксом (за конвенцією репо: коментарі вже були українською, тож новий код продовжує конвенцію).

## Що далі

Наступна прожарка backend-теми (≈ серпень 2026 — `Next review` цього файлу):

- Закрити решту P2 з цього списку.
- Audit `apps/server/src/modules/sync/syncV2.ts` (3014 рядків — найбільший файл у репо; chunkability?).
- Audit `apps/server/src/routes/internal/openclaw.ts` (1321 рядок) — security boundary між public/internal-namespace-ом.
