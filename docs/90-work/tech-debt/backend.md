# Backend Tech Debt Inventory

> **Оновлено 2026-08-07 (tech-debt reconcile).** Переміряно на HEAD: міграцій **117** up (`117_fizruk_workout_sets_user_idx.sql`), а не 82 — маркер від 2026-07-20 нижче застарів на 35 міграцій. `eslint.server-maxlines-allowlist.json` = `[]` (підтверджено). **Увесь блок § «P1 (наступний спринт)» виявився закритим і не переміряним:** `vitest --coverage` у CI живе job-ом `Test coverage (vitest)` (`ci.yml`, `test:coverage:ci` + `coverage-ratchet.mjs --floors`); Playwright happy-path — **23** `@critical`-специ (пункт просив «3–4»); CSP `report-uri` шле і `apps/web/vercel.json`, і `apps/landing/vercel.json` у сінк `/api/csp-report` (`routes/csp-report.ts`); explicit `Permissions-Policy` — там само, 19 директив, під pin-тестом `apps/web/src/test/permissionsPolicyHeader.test.ts`. **Хвіст:** докстрінг `apps/server/src/http/security.ts` досі стверджує, що `report-uri`/`report-to` endpoint не налаштований — це вже неправда для фронтенд-політики (для API-only CSP сервера — усе ще так). Server raw >600 LOC (12 файлів, найбільші `modules/chat/aiQuota.ts` 921, `env/env.ts` 852) лишаються під **effective** порогом — не борг.
>
> **Оновлено 2026-08-01.** § «Tests coverage map» нижче звірено з живим прогоном — застарілі цифри з 2026-05-05 (60.51% lines, три «0-15%» surface-и) замінені актуальними (93.02% lines; nutrition tool handlers / `syncV2.ts` / `weekly-digest.ts` тепер 95-100%). Заразом знайдено й полагоджено міграцією `096_finyk_fizruk_pk_text.sql`: **8 finyk + 7 fizruk таблиць** мали PK `uuid`, а клієнт шле доменно-префіксовані id (`b_…`, `w_…`, `dl_…`, тощо) — той самий клас бага, що й `094`/`095` того ж дня для routine/nutrition. Живий доказ — `invalid input syntax for type uuid` у CI на `finyk_manual_expenses` і `fizruk_daily_log`; повний розбір, включно з тим, чому «а де ще» знайшло ще 13 таблиць, — у коментарі міграції `097`. **Побічний хвіст того самого класу бага:** `apps/server/src/migrations/__tests__/{035-nutrition-tables,039-finyk-tables,050-routine-full-state,052-fizruk-full-state}.test.ts` (Testcontainers, `information_schema.columns` snapshot) досі очікували буквальний `uuid`-тип для тих самих колонок — `094`/`095` зламали два з них ще 2026-08-01 і ніхто не помітив (Docker-залежні, soft-skip локально), `097` зламала решту два. Виправлено: очікування → `text`, а «down → re-up restores the same schema fingerprint» тести обгорнуто down/up відповідної PK-міграції (`094`/`095`/`097`) навколо власного down/up тестованого файлу — інакше re-up без PK-міграції повертав колонку назад до `uuid`.
>
> **Last validated:** 2026-07-20 by @cursoragent (full reconcile vs HEAD). **Next review:** 2026-09-27.
> **Оновлено 2026-07-20.** Re-audit: міграції **82** (latest `082_plata_card_token.sql`); `eslint.server-maxlines-allowlist.json` = `[]`; `asyncHandler` **видалено** ([PR #134](https://github.com/SkOrDs-02/sergeant/pull/134)) — Express 5 native async rejection; `chat.ts` ~547 / `metrics.ts` ~557 / `syncV2.ts` ~520 LOC. Hosting ops-секції переведені з Railway на **Coolify/Hetzner** (ADR-0074). **Post-waves:** Privat/Mono upstream body scrub — **Closed** [#347](https://github.com/SkOrDs-02/sergeant/pull/347). Server files з raw >600 (env/aiQuota/rateLimit/…) лишаються під порогом **effective** LOC — не allowlist.
> **Оновлено 2026-06-01.** PR E/F закрито (див. Status log).
> **Status:** Active

> **Оновлено 2026-07-09 (CodeQL rate-limit finding).** [PR #134](https://github.com/SkOrDs-02/sergeant/pull/134) (asyncHandler cleanup) отримав 40 CodeQL high-severity `missing rate limiting` алертів — CodeQL позначає їх «new in this PR», бо prettier переформатував (де-індентував) майже кожен route-registration блок після зняття `asyncHandler`-обгортки. Перевірено 2 конкретні приклади (`routes/billing.ts` § `/api/billing/stripe-webhook`, `routes/mono-webhook.ts`) — в обох умова (authorized/webhook-роут без `rateLimitExpress()` у middleware-ланцюжку) існувала **до** PR #134; сам PR не додав і не прибрав жодного rate-limiter-виклику. Це diff-атрибуційний false-positive CodeQL, не регрес.
>
> **Резолюція 2026-07-09 (rate-limit audit).** Аудит проведено — знахідка accepted-by-design. Увесь `/api/internal/*` за спільним bearer-guard-ом (`INTERNAL_API_KEY`, constant-time, fail-closed — `routes/internal/index.ts`): M2M, ніколи не публічне, лімітер дав би нуль безпеки й зламав n8n-батчі. Публічні webhooks — signature-verified (межа безпеки = підпис). User-роути — session-auth + `rateLimitExpress` де треба. Рішення git-tracked у [`audit-exceptions.md` § CodeQL alert exceptions](../../04-governance/security/audit-exceptions.md#codeql-alert-exceptions-i1) за протоколом `codeql.md`. Опційний DiD-лімітер на публічні webhooks — окремий PR за sign-off власника (payment-path). Backlog-пункт закрито.
>
> **Оновлено 2026-07-09 (CodeRabbit pre-existing findings).** [PR #134](https://github.com/SkOrDs-02/sergeant/pull/134) отримав 9 actionable CodeRabbit-зауважень у `routes/internal/*` — та сама причина, що й CodeQL-алерти вище: prettier переформатував майже кожен route-block, diff-based тули заново «побачили» старий код. Кожне з 9 перевірено прямим порівнянням з `origin/main` — усі pre-existing, PR #134 нічого з них не вносив (окрім одного власного `eslint-disable`-рядка в `prompts.ts`, що відповідає наявній конвенції репо — англійською, як у `db.ts`/`n8n.ts`/`tools-strategy-docs.ts`). Реальні знахідки, варті окремого аудиту:
>
> - ✅ **`routes/internal/ai-memory-dlq.ts`** (Major) — виправлено: DLQ replay-цикл тепер використовує `enqueueMemoryIngestStrict` / `markDlqRowReplayedStrict` (Strict-варіанти rethrow-ять реальні failure-и), рядки 35, 38, 157, 166.
> - ✅ **`routes/internal/alerts.ts`** (Major) — виправлено: `notYetRepeated`, `notYetSentryWarned`, `notSnoozed` прокидуються у `listPendingAlerts()` (рядки 274–276); фільтри більше не ігноруються.
> - ✅ **`routes/internal/openclaw/routes-write.ts`** (Major) — виправлено: якщо `recordTopicMessage` кине після успішного `postToTopic`, архів-збій логується й ковтається — роут повертає успішний результат посту без 500 і без ретрай-дубля (рядки 175–204; коментар пояснює рішення in-place).
> - ✅ **`routes/internal/seo.ts`** (Major) — виправлено: `rank-snapshot` перевіряє `Number.isInteger(row.keywordId)` (рядки 137–139); цілочисельна валідація блокує дробовий `keywordId`.
> - ✅ **`routes/internal/users.ts`** (Major — domain invariant) — виправлено: cohort-запит використовує `'Europe/Kyiv'` в SQL (рядок 39 — `AT TIME ZONE 'Europe/Kyiv'`).
> - ✅ **`routes/internal/growth.ts`** / **`routes/internal/marketing.ts`** (Minor) — виправлено: `nonNegBigIntStr` (growth.ts рядок 62, marketing.ts рядок 24) clamp-ає до 0 від'ємні значення; `spendCents`/`cacCents` (growth.ts рядки 250–251) і `impressions`/`engagements` (marketing.ts рядки 269–270) передаються через неї.
>
> Усі 6 знахідок закриті. Жодних відкритих backlog-пунктів з CodeRabbit PR #134 не залишилось.
>
> **Оновлено 2026-07-09.** `express-5-migration-plan.md` виконано ([PR #131](https://github.com/SkOrDs-02/sergeant/pull/131)): `express` 4.22 → 5.2, `@types/express` 4 → 5. Реальний breaking-change surface — 4 wildcard-роути (path-to-regexp v8), портовані на root-inclusive `RegExp`/named-wildcard форми; `@types/express@5` дав нуль type-drift. Повний server unit-suite (3308 тестів) зелений. **Follow-up:** `asyncHandler` cleanup виконано в [PR #134](https://github.com/SkOrDs-02/sergeant/pull/134) — `apps/server/src/http/asyncHandler.ts` видалено; production call-sites = 0. Scope-рядок нижче (§ Scope) — Express 5.
>
> **Оновлено 2026-07-01 (tech-debt reconcile).** Metrics-label split + OFF/USDA normalizers shipped. **2026-07-10 / 2026-07-20:** server `max-lines` allowlist повністю очищено (`[]`); колишні 6 залишків (`openclaw` routes/tools, `stripe`, `metrics`, `applySync`, `chat`) декомпозовані / під 600 effective. План — [tech-debt-assessment-2026-07-01.md](./tech-debt-assessment-2026-07-01.md).

> **Оновлено 2026-06-01.** Не-actionable секції тепер несуть токен `🚫 Blocked-reason: <category>`: «Operational visibility — Coolify env-var changes» (`owner-decision`) та «Push credentials» (`external-infra`). Легенда + grep-підказка — у [`README.md § Статус-маркери`](./README.md#статус-маркери--що-можна-брати-зараз-а-що-ні).
>
> **Оновлено 2026-06-01 (annex reconcile).** Із 2026-05-15 code-debt annex закрито два пункти: **(a)** `TODO(token-reencrypt)` — є proactive sweep CLI `apps/server/scripts/token-reencrypt-rollover.ts` (`pnpm reencrypt:tokens`), key-rotation playbook більше не заблокований (H4 Closed); **(c)** `sessionProtection.ts` із 2 `as unknown as X` кастами **видалено** — session-логіка переїхала в `auth/sessionFingerprint.ts` + `http/requireSession.ts`, bypass-патернів у non-test server-src — 0. Пункт **(b)** (`sync_op_log` партиціювання, roadmap PR-050) лишається відкритим — **план зафіксовано в [ADR-0065](../../04-governance/adr/0065-sync-op-log-retention-and-multi-instance-fanout.md)** (PG `LISTEN/NOTIFY` fan-out + retention-за-курсором; реалізація gated на multi-instance тригер). Суміжний client-side DLQ TTL вже закрито окремо (`purgeStaleTerminalOutbox` у `packages/db-schema/src/sqlite/syncOpOutboxPurgeStale.ts`).
>
> **Оновлено 2026-08-04 (pre-beta schema-debt audit).** Пункт **(b)** досліджено ще раз під тиском «а що як реалізувати зараз, поки `sync_op_log` порожня перед wipe-ом» — і **свідомо НЕ реалізовано**. Знахідка: партиціювання по будь-якій time-колонці (напр. `server_ts`) вимагає розширити `UNIQUE (user_id, idempotency_key)` до `UNIQUE (user_id, idempotency_key, server_ts)` (Postgres-вимога — partition key мусить входити в кожен unique/PK), а це назавжди вимикає backstop проти конкурентного дубль-інсерту одного ідемпотентного ключа. **Виправлення (CodeRabbit PR #627 review):** попереднє формулювання тут стверджувало, що "обидва конкурентні INSERT-и мають різний `server_ts`" — це невірно: `NOW()` повертає час старту транзакції, тож конкурентні INSERT-и можуть отримати як однаковий, так і різний `server_ts`, жодної гарантії унікальності немає. Реальна причина відмови backstop-у глибша й не залежить від цього: щойно `server_ts` входить у UNIQUE-кортеж, два рядки з ОДНАКОВИМ `(user_id, idempotency_key)` можуть співіснувати за РІЗНИХ timestamps — другий INSERT більше не падає з 23505 незалежно від того, збігся `server_ts` чи ні, і apply-шлях виконується двічі. Порожність таблиці знімає ризик "перестворення гарячої таблиці", але НЕ цей структурний ризик — він стосується кожного майбутнього рядка, не лише backfill-у. Деталі — доданий "Addendum (2026-08-04)" у [ADR-0065](../../04-governance/adr/0065-sync-op-log-retention-and-multi-instance-fanout.md). Схема лишилась незмінною; тригер реалізації (§ Compliance в ADR-0065) не змінився.

> **Оновлено 2026-05-15.** Code-debt audit annex (Claude Opus 4.7 external session, monorepo-wide scan). **Closed in this PR (`refactor(server): consolidate sleep() helper into lib/timing`):** consolidated 6 duplicated `sleep(ms)` helpers (`db.ts`, `lib/anthropic.ts`, `lib/bankProxy.ts`, `lib/webpushSend.ts`, `modules/ai-memory/embeddings.ts`, `push/send.ts`) into the existing `lib/timing.ts:sleep` export; replaced 7 hardcoded AI-call timeout literals with named constants — new `modules/nutrition/timeouts.ts:NUTRITION_AI_TIMEOUTS_MS` (5 sites: day-plan/week-plan/recommend-recipes/shopping-list/food-search) and `modules/chat/chat.ts:CHAT_TOOL_TIMEOUT_MS` (2 sites). **New items added to backlog (low signal-to-noise, not blockers):** (a) `apps/server/src/auth/encryptingAdapter.ts:95` — `TODO(token-reencrypt)` lazy rollover relies on user-triggered OAuth (no background re-encryption path; blocks key-rotation playbook); (b) `apps/server/src/modules/sync/syncV2.ts:243` + `syncV2Stream.ts:42` — `TODO(roadmap-pr-050)` `sync_op_log` партиціювання + архівація (tied to roadmap PR-050); (c) `apps/server/src/auth/sessionProtection.ts` — 2 non-test `as unknown as X` casts (document, не блокує).

> Scope: **`apps/server/src/`** (Node.js 20 ESM, Express 5, PostgreSQL, Better Auth, Anthropic, Monobank/Privat, web-push, Pino, Prometheus, Sentry). У тексті нижче історично згадувався tree `server/*.js` — той самий продукт після переносу в monorepo; нові PR мають посилатися лише на `apps/server/src/**/*.ts`.
>
> Методологія: пофайловий аудит + зведення по категоріях. Перший PR — лише цей документ. Виправлення йдуть окремими тематичними PR (A–E, див. Roadmap).
>
> **Status update (refresh):** з моменту створення цього документу реалізовано P0-A–P0-E (див. [Status log](#status-log)). Поточний залишок P0 — нульовий; актуальні блокери в категорії «Банки» і «AI-квоти» закриті, web-push тепер з timeout/retry/breaker. Решта — P1/P2.
>
> Позначки:
>
> - **Блокер** — реальний ризик (race condition, leak, відсутність timeout на зовнішній HTTP).
> - **Високий** — помітний борг (валідація обходить центральну схему, дублювання логіки, широкий catch).
> - **Середній** — косметика / consistency (нейм, дрібні оптимізації).
> - **Низький** — nice-to-have.

## Зміст

1. [Summary — per-category](#summary--per-category)
2. [Per-file findings](#per-file-findings)
3. [Consolidated issue groups](#consolidated-issue-groups)
4. [Bank integrations deep-dive](#bank-integrations-deep-dive)
5. [AI quota deep-dive](#ai-quota-deep-dive)
6. [Database & migrations review](#database--migrations-review)
7. [Observability & logging review](#observability--logging-review)
8. [Secret-logging audit](#secret-logging-audit)
9. [Tests coverage map](#tests-coverage-map)
10. [Gradual TypeScript migration plan](#gradual-typescript-migration-plan)
11. [Roadmap — PR breakdown](#roadmap--pr-breakdown)

---

## Summary — per-category

| Категорія               | Статус               | Короткий висновок                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Валідація (zod)         | ~~Високий~~ → **OK** | ✅ PR A. `RefinePhotoSchema` синхронізована з handler-ом (`prior_result`/`portion_grams`/`qna`). `mono`/`privat`/`sync` використовують централізовані `*QuerySchema`/`*BodySchema`. Ручна перевірка `req.body` не знайдена у `apps/server/src` (grep `req\.body\.` поза `validate*` → 0).                                                                                                                                                                                                |
| Error handling          | ~~Високий~~ → **OK** | ✅ PR A + Express 5. Широкі `catch { res.status(500).json({ error: e.message }) }` не знайдені. Handler-и — native async + `ExternalServiceError`/`ValidationError`/`RateLimitError` + central `errorHandler` (рідкісні прямі `res.status` у edge-case гілках — див. `modules/chat/chat.ts`). `asyncHandler` обгортку знято в PR #134.                                                                                                                                                   |
| Банки (mono/privat)     | ~~Блокер~~ → **OK**  | ✅ PR B. `apps/server/src/lib/bankProxy.ts` — timeout=15s (`BANK_FETCH_TIMEOUT_MS`), retry з jitter (5xx/timeout/network, respect `Retry-After`), circuit breaker 5-fails / 30s per-upstream, TTL-cache 60s для GET. `modules/mono/mono.ts` / `modules/mono/privat.ts` — тонкі адаптери.                                                                                                                                                                                                 |
| Web-push (sendPush)     | ~~Блокер~~ → **OK**  | ✅ [PR #335](https://github.com/Skords-01/Sergeant/pull/335). `apps/server/src/lib/webpushSend.ts` — timeout=10s (AbortController+Promise.race), retry [0, 500ms+jitter] на 5xx/timeout, per-origin circuit breaker 5-fails / 30s (FCM/Apple/Mozilla ізольовані). Outcome-класифікація: `ok`/`invalid_endpoint`/`rate_limited`/`timeout`/`circuit_open`/`error` → `external_http_requests_total{upstream="push"}`.                                                                       |
| AI-квоти                | ~~Високий~~ → **OK** | ✅ PR C. `consumeQuota` — один атомарний `INSERT … ON CONFLICT DO UPDATE WHERE t.request_count + EXCLUDED.request_count <= $5 RETURNING request_count`. Pre-check `cost > limit` → 429 без TX. Per-cost параметр імплементовано (tool-use = 2, text-only = 1).                                                                                                                                                                                                                           |
| SQL / параметризація    | **OK**               | Усі `pool.query` параметризовані. Ризикових місць не знайдено.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| N+1                     | **OK**               | `syncPushAll` робить 1 statement на модуль у BEGIN/COMMIT — за дизайном. `sendPush` — `SELECT` + паралельний webpush.send — не N+1.                                                                                                                                                                                                                                                                                                                                                      |
| Індекси / soft-delete   | **Середній**         | Всього 3 міграції; покриття достатнє для поточних query-патернів. `deleted_at` / soft-delete ніде не використовується — в інвентарі як tech-debt-seed, а не блокер.                                                                                                                                                                                                                                                                                                                      |
| Логи                    | **Переважно OK**     | Структурний Pino + ALS (`requestId`/`userId`/`module`) підтягуються автоматично. `X-Request-Id` в response-header + у JSON-тілі помилки. Метрики RED/USE по маршрутах — покриті.                                                                                                                                                                                                                                                                                                         |
| Таймаути / retry (HTTP) | **OK**               | ✅ Anthropic: `timeoutMs` + 3 retry. Barcode/food-search: `AbortSignal.timeout`. Банки: `bankProxy.ts` timeout+retry+breaker+cache. Web-push: [PR #335](https://github.com/Skords-01/Sergeant/pull/335) timeout+retry+per-origin breaker.                                                                                                                                                                                                                                                |
| Дублювання логіки       | **Середній**         | OFF/USDA нормалізатори, pantry→string map, dual-metric `record*` — повторюються у 2–3 файлах.                                                                                                                                                                                                                                                                                                                                                                                            |
| Секрети в логах         | **OK**               | Sentry `sendDefaultPii=false` + `beforeSend` стрипає body/cookies. Логер не дампить headers. Email логується як SHA-256[:12]. Anthropic key не логується. `SENTRY_DSN` ✅ активовано на Coolify production (ADR-0074).                                                                                                                                                                                                                                                                   |
| Тести                   | **Середній**         | ✅ [PR #336](https://github.com/Skords-01/Sergeant/pull/336) + розширення: `apps/server/src/smoke.test.ts`, `modules/chat/chat.test.ts`, `modules/push/push.test.ts`, `lib/webpushSend.test.ts`, `push/send.test.ts`, `modules/nutrition/food-search.test.ts`, `modules/nutrition/barcode.test.ts`, `modules/sync/sync.test.ts` тощо. Залишок: **SSE chat end-to-end**, **route-level coach / nutrition contract tests** (окрім unit на `nutritionResponse`) — PR F / інкрементальні PR. |

---

## Per-file findings

Префікс у репозиторії: **`apps/server/src/`** (TypeScript; суфікс `.js` в ESM-імпортах — вимога Node для резолву модулів). Нижче — актуальний зріз після P0-A–E, TS-переносу та додаткових тестів. Абзаци про «блокери» в `mono`/`privat` без `bankProxy`, «немає `validateBody`» у nutrition, «немає `chat.test`» — **архівні** (див. git-історію PR A–E та [#335](https://github.com/Skords-01/Sergeant/pull/335)).

### Entry, app shell, DB, auth

| Файл         | Статус / залишковий борг                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`   | **OK** — graceful shutdown, pool sampler; **низький**: `catch { /* ignore */ }` навколо Sentry flush — прийнятно.                                                                                                                                                                                                                                                                                                 |
| `app.ts`     | **OK** — body-size caps, middleware pipeline.                                                                                                                                                                                                                                                                                                                                                                     |
| `config.ts`  | **OK** — frozen config.                                                                                                                                                                                                                                                                                                                                                                                           |
| `db.ts`      | **OK** — query wrapper + метрики; **середній**: глобальний `DB_SLOW_MS` 200ms; **низький**: catch навколо histogram observe.                                                                                                                                                                                                                                                                                      |
| `auth.ts`    | **OK** — Better Auth; **середній**: lazy Sentry + catch у тестових моках.                                                                                                                                                                                                                                                                                                                                         |
| `aiQuota.ts` | **OK** — atomic upsert + per-cost (PR C) + **per-tool ліміти/ваги shipped** (`toolCost()`/`toolLimit()`, `AI_QUOTA_TOOL_LIMITS` JSON, dedicated `tool:<name>` buckets via `consumeToolQuota()`); ~~metrics-label split~~ **shipped** (`aiQuotaBlocksTotal{reason,cost}` — `obs/metrics.ts:310`, `ai_cost_consumed_total{subject_type,bucket_type}` — `obs/metrics.ts:339`); **середній**: catch на метриках — OK. |
| `sentry.ts`  | **OK**; **середній**: `SENTRY_TRACES_SAMPLE_RATE` 0.1 у проді може бути дорогим.                                                                                                                                                                                                                                                                                                                                  |

### `http/` (infra)

- **OK** — `validate.ts`, `errorHandler.ts`, `jsonSafe.ts`, barrel `index.ts`. (`asyncHandler.ts` видалено в PR #134.)
- **`schemas.ts` — OK (post-PR A):** `RefinePhotoSchema` та nutrition/sync/mono/privat схеми **використовуються** у відповідних handler-ах (`validateBody` / `validateQuery`); попередній аудит про розсинхрон — закритий.
- **`rateLimit.ts` — середній:** in-memory fixed-window ×N при multi-instance (Redis — на майбутнє). `TODO(M9)` ASN-keying — dep-blocked.

### `obs/` + `lib/`

- **errors.ts** — OK; частина handler-ів досі відповідає через `res.status` у специфічних гілках (SSE) — **низький** consistency gap vs `next(e)`.
- **logger.ts**, **metrics.ts**, **requestContext.ts** — OK.
- **anthropic.ts** — OK (timeout + retry); **низький** — `recordStreamEnd` для stream — відповідальність caller (`chat.ts` дотримується).
- **bankProxy.ts**, **webpushSend.ts**, **externalHttp.ts**, **nutritionResponse.ts** (+ unit-тести) — OK.

### `routes/*`

- **OK** — `setModule` → rate-limit → handler (Express 5 native async).

### `modules/chat/chat.ts` + `modules/chat/tools.ts`

- **OK / середній:** каталог **`TOOLS`** винесено в **`chat/tools.ts`** (файл великий за LOC — **середній** борг підтримуваності, не безпеки).
- **OK** — основні шляхи помилок Anthropic мапляться на HTTP status; refund квоти при upstream-failure.
- **OK** — prompt-caching на SYSTEM_PREFIX (`cache_control: ephemeral`) активований у [#864](https://github.com/Skords-01/Sergeant/pull/864) (audit PR-12.A); per-request метрика `anthropic_prompt_cache_hit_total{version,outcome=hit|miss}` включно зі streaming-шляхом.
- **OK** — per-tool lifecycle-метрика `chat_tool_invocations_total{tool, outcome=proposed|executed|unknown_tool}` ([#924](https://github.com/Skords-01/Sergeant/pull/924), audit PR-12.C). Whitelist від `TOOLS`-реєстру (anti-cardinality), wired у обидва кроки handler-а. `proposed - executed` дає кількість запропонованих, але не виконаних tool-call-ів.
- **OK** — server-side truncation великих `tool_result`-payload-ів ([#922](https://github.com/Skords-01/Sergeant/pull/922), audit PR-12.E): threshold 2 000 chars, head 600 + tail 400 + marker, повний blob у Sentry breadcrumb `chat.tool_result`. Метрика `chat_tool_result_truncated_total{reason}`. Закриває edge case з briefing/digest, що зривав continuation.
- **Середній** — SSE heartbeat (`SSE_HEARTBEAT_MS`); на жорсткому proxy read-timeout можливі обриви — tune `ping` / `flushHeaders` за потреби.
- **Низький** — якщо `response.body` без `getReader()` до старту SSE — прямий `res.status(500).json` (рідкісний edge); решта stream-errors йдуть у SSE payload.
- **OK** — **`chat.test.ts`** + **`chat.stream.test.ts`** ([#900](https://github.com/Skords-01/Sergeant/pull/900), audit PR-4.A) повністю покривають handler + 17 тестів на streaming-шлях `streamAnthropicToSse`/`streamOneIterationToSse` (line-buffer, chunk-boundaries, auto-continuation, cap, partial-text, abort).
- **Operations:** lifecycle нових tools формалізований у [`docs/04-governance/adr/0002-tool-lifecycle.md`](../../04-governance/adr/0002-tool-lifecycle.md) (audit PR-12.D) — Proposal / Safety / Rollout / KPIs з KPI-thresholds на `chat_tool_invocations_total`.

### `modules/chat/coach.ts` + `coach.test.ts`

- **Середній** — `parseMemory` fallback на `raw` без warn; немає тестів на **`coachInsight`** / route-level AI.
- **OK** — `validateBody` для memory POST.

### `modules/sync/sync.ts` + `sync.test.ts`

- **OK** — `validateBody(SyncPushSchema | SyncPullSchema | SyncPushAllSchema)`; ручний `VALID_MODULES` **знято**.
- **OK** — LWW, `recordSync`; **середній** — extra `SELECT` у conflict-гілці (мікро-оптимізація).

### `modules/mono/mono.ts` / `privat.ts`

- **OK** — **`bankProxyFetch`** + **`validateQuery(MonoQuerySchema | PrivatQuerySchema)`**; retry/cache/breaker (PR B). Попередні три «блокери» — **архівні**.

### `modules/push/push.ts`

- **OK** — delegація в **`webpushSend`** (timeout + retry + breaker, PR #335); є **`push.test.ts`**. Нативний пайплайн: **`push/send.ts`** + **`send.test.ts`**.

### `modules/nutrition/barcode.ts`

- **OK** — timeouts на OFF/USDA/UPCitemdb.
- **OK** — TTL in-memory кеш по штрихкоду з hit/miss sentinel.
- **OK (2026-04-28)** — **`barcode.test.ts`** покриває cascade
  (OFF → USDA → UPCitemdb), cache hit/miss, invalid input, upstream failure;
  додано regression, що transient 429/5xx upstream відповіді не кешуються як
  miss sentinel.

### `modules/nutrition/food-search.ts` + `food-search.test.ts`

- **Високий / середній** — великий `UK_TO_EN` inline + дубль нормалізації з barcode; часткове покриття **`food-search.test.ts`**.

### `modules/digest/weekly-digest.ts`

- **OK** — **`validateBody(WeeklyDigestSchema, …)`** + `ExternalServiceError` / `ValidationError`.
- **Середній** — довгий system prompt inline → винести в `prompts/` за бажанням.

### `modules/nutrition/*`

- **OK** — ключові handler-и з **`validateBody`** (`analyze-photo`, `refine-photo`, `day-hint`, `day-plan`, `week-plan`, `shopping-list`, `recommend-recipes`, `parse-pantry`, `backup-upload`); **`backup-download`** — вузький файловий `try/catch` (ENOENT) + rethrow, без широкого `e.message` клієнту.
- **OK (2026-04-28)** — дубль pantry→prompt string між `day-plan`,
  `week-plan`, `shopping-list`, `recommend-recipes` консолідовано в
  **`lib/pantryFormat.ts`** + unit-тести.
- **Низький** — переконатися, що в `parse-pantry.ts` немає shadowing імені `parsed` (перевірка ESLint).

---

## Consolidated issue groups

<details>
<summary>A–D + C2 — всі закриті (✅ DONE), розгорнути історичний рекорд</summary>

### A. Валідація (zod) — ~~потребує PR A~~ **✅ DONE**

Чекліст PR A виконано у **`apps/server/src`**: nutrition handler-и з `validateBody`, `RefinePhotoSchema` узгоджена з body, `sync` на `SyncPushSchema`/`SyncPullSchema`/`SyncPushAllSchema`, `mono`/`privat` з `MonoQuerySchema`/`PrivatQuerySchema`, `weekly-digest` з `WeeklyDigestSchema`, `backup-upload` з `BackupUploadSchema`. Деталі — § [Per-file findings](#per-file-findings).

### B. Центральний error handler — ~~потребує PR A~~ **✅ DONE**

Широкі `catch → res.status(500).json({ error: e.message })` зняті з доменних handler-ів на користь **`ExternalServiceError`** / **`ValidationError`** / **`RateLimitError`** + центральний **`errorHandler`** (див. `http/errorHandler.ts`). Express 5 проброшує async reject нативно (`asyncHandler` видалено в PR #134). Залишкові прямі `res.status` — лише в узгоджених гілках (наприклад, passthrough HTTP-коду від upstream у `mono.ts` / stream edge-case у `chat.ts`).

### C. Банки — ~~потребує PR B~~ **✅ DONE**

Див. deep-dive нижче.

### D. AI-квоти — ~~потребує PR C~~ **✅ DONE**

Див. deep-dive нижче.

### C2. Web-push — **✅ DONE** ([PR #335](https://github.com/Skords-01/Sergeant/pull/335))

Раніше `webpush.sendNotification` у `modules/push/push.ts` викликався без timeout/retry/breaker — повільний FCM/Apple/Mozilla міг тримати Node-worker і pg-conn.

Тепер через `apps/server/src/lib/webpushSend.ts`:

- **timeout = 10s** (`WEBPUSH_TIMEOUT_MS` env-override) через `AbortController` + `Promise.race` (web-push lib не приймає AbortSignal; controller поставлений в `abort()` по timeout-у, соккет закривається TCP-keepalive).
- **retry [0, 500ms+jitter]** на 5xx / network / timeout; **НЕ** ретраїмо 4xx (404/410 = invalid_endpoint, 429 = per-sub rate-limit).
- **Per-origin circuit breaker** (`new URL(endpoint).origin`): FCM (`https://fcm.googleapis.com`) і Apple (`https://web.push.apple.com`) — окремі стани, 5 fails / 30s open-window; half-open після timeout-у дозволяє 1 probe-запит.
- **Outcome classification**: `ok`/`invalid_endpoint`/`rate_limited`/`timeout`/`circuit_open`/`error`.
- **Метрики**: `external_http_requests_total{upstream="push", outcome="…"}` + історичний `push_sends_total{outcome}`.
- 13 unit-тестів (happy / класифікація / retry / timeout / breaker per-origin isolation).

</details>

### E. Міграції / індекси — потребує PR D

Див. DB-section нижче.

### F. Спостережуваність / логи — потребує PR E (частково зроблено в рамках PR #335)

В основному вже ок; precision-fix-и у нижньому розділі.

### G. Дублювання логіки (cross-cutting)

- ~~`elapsedMs(start)`~~ → **DONE (PR [#3363](https://github.com/Skords-01/Sergeant/pull/3363)).** ✅ Винесено в спільний util `apps/server/src/lib/timing.ts:elapsedMs` (~13 call-sites мігровано на shared helper; решта `apps/server/src` модулів уже імпортують його замість локального дубля).
- ~~`pantry items → prompt string`~~ → **DONE 2026-04-28**:
  `apps/server/src/lib/pantryFormat.ts` + `pantryFormat.test.ts`.
- ~~OFF/USDA normalizers~~ → **DONE**: уніфіковано у `apps/server/src/lib/normalizers/{off,usda,upcitemdb,mono,uk-to-en}.ts` з `index.ts` re-export-ами; `modules/nutrition/barcode.ts:18` і `modules/nutrition/food-search.ts:14` імпортують спільний модуль (звірено 2026-07-01).
- ~~`FNV-1a safeKeyFromToken`~~ → **DONE 2026-04-28**:
  `apps/server/src/lib/backupKey.ts` + `backupKey.test.ts`.

---

## Bank integrations deep-dive

| Вимога                     | Mono / Privat (після PR B)                                                                                                                                                                                  | Примітки                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Fetch timeout              | ✅ `bankProxy.ts` — `BANK_FETCH_TIMEOUT_MS` (default 15s)                                                                                                                                                   |                                                     |
| Retry + jitter             | ✅ 5xx / timeout / network; respect `Retry-After`                                                                                                                                                           |                                                     |
| Circuit breaker            | ✅ 5 fails / 30s open per upstream                                                                                                                                                                          |                                                     |
| 60s cache (GET)            | ✅ TTL cache з ключем без збереження сирого токена                                                                                                                                                          |                                                     |
| Validation (zod)           | ✅ `MonoQuerySchema` / `PrivatQuerySchema` + path whitelist у handler-ах                                                                                                                                    |                                                     |
| Помилки upstream → клієнту | ✅ **Closed** [#347](https://github.com/SkOrDs-02/Sergeant/pull/347): клієнту лише стабільний `{ error, code, requestId? }` (`BANK_UPSTREAM_ERROR` / `BANK_UNAVAILABLE`); сирий body банку не прокидається. |                                                     |
| Наявні тести               | ✅ `modules/mono/bankProxy.test.ts`                                                                                                                                                                         | Розширення: cache-hit / breaker-open — за бажанням. |

Реалізація (фактична): **`apps/server/src/lib/bankProxy.ts`** + тонкі **`modules/mono/mono.ts`** / **`modules/mono/privat.ts`** (делегують `bankProxyFetch`).

### Monobank webhook integration (Track A)

Webhook-based server-side integration added in PR2. Key components:

- **`modules/mono/crypto.ts`** — AES-256-GCM encryption/decryption for token-at-rest storage using `MONO_TOKEN_ENC_KEY` (32-byte hex). Never log raw tokens.
- **`modules/mono/connection.ts`** — connect (validate token → register webhook → persist encrypted token + accounts), disconnect (unregister webhook best-effort → delete connection), syncState (lightweight DB read). All gated by `MONO_WEBHOOK_ENABLED`.
- **`modules/mono/webhook.ts`** — public `POST /api/mono/webhook/:secret` endpoint. Path-secret auth with timing-safe comparison, idempotent UPSERT into `mono_transaction`, balance/event updates. Prometheus metrics: `mono_webhook_received_total{status}`, `mono_webhook_duration_ms{status}`.
- **DB schema**: `mono_connection`, `mono_account`, `mono_transaction` (migration `008_mono_integration.sql`).
- **Feature flag**: `MONO_WEBHOOK_ENABLED` (env, default `false`). When disabled, connect/disconnect/syncState return 404; webhook endpoint is always mounted but rejects unknown secrets.

---

## AI quota deep-dive

### Race condition fix

```diff
- async function consumeQuota(subject, day, limit) {
-   const client = await pool.connect();
-   try {
-     await client.query("BEGIN");
-     const sel = await client.query(
-       `SELECT request_count … FOR UPDATE`, [subject, day]
-     );
-     const cur = sel.rows[0]?.request_count ?? 0;
-     if (cur >= limit) { ROLLBACK; return {ok:false,…}; }
-     INSERT or UPDATE …
-     COMMIT;
-     return {ok:true, remaining: limit - next, limit};
-   } finally { client.release(); }
- }
+ async function consumeQuota(subject, day, limit, cost = 1) {
+   const r = await pool.query(`
+     INSERT INTO ai_usage_daily (subject_key, usage_day, request_count)
+     VALUES ($1, $2::date, $3)
+     ON CONFLICT (subject_key, usage_day) DO UPDATE
+       SET request_count = ai_usage_daily.request_count + $3
+       WHERE ai_usage_daily.request_count + $3 <= $4
+     RETURNING request_count`,
+     [subject, day, cost, limit]
+   );
+   if (r.rowCount === 0) return { ok: false, remaining: 0, limit };
+   return { ok: true, remaining: limit - r.rows[0].request_count, limit };
+ }
```

Властивості:

- Single statement → no explicit TX → no `FOR UPDATE` contention.
- `WHERE count + cost <= limit` — атомарна перевірка ліміту на рівні UPSERT.
- `cost` параметр дає готовий hook для per-tool differentiation.

### Per-tool limits

> ✅ **Shipped 2026-06-01.** Core per-tool limits implemented in `apps/server/src/modules/chat/aiQuota.ts` — `toolCost()` (`DEFAULT_TOOL_COST=3`), `toolLimit()` reads `AI_QUOTA_TOOL_LIMITS` JSON, `consumeToolQuota()` uses dedicated `tool:<name>` buckets (`TOOL_BUCKET_PREFIX`). Env shape differs from the original sketch below (`AI_QUOTA_TOOL_LIMITS` JSON map instead of a single `AI_DAILY_TOOL_LIMIT`). ~~Only open item: the metrics-label split below.~~ **Metrics-label split теж shipped** (звірено 2026-07-01 — див. пункт нижче): section повністю закрита.
>
> 📘 **Документація (2026-06-04, ✅ PR [#3363](https://github.com/Skords-01/Sergeant/pull/3363)).** Cost-формула, override через `AI_QUOTA_TOOL_COST` / `AI_QUOTA_TOOL_LIMITS` і precedence задокументовані в docstring-ах `toolCost()` / `toolLimit()` / `consumeToolQuota()` + runbook-секція "Runbook: per-tool cost-override механізм" у [`docs/04-governance/security/ai-quota-kill-switch.md`](../../04-governance/security/ai-quota-kill-switch.md). Doc-entry `AI_QUOTA_TOOL_LIMITS` cost-override — resolved (лишається тільки metrics-label split, § нижче).

- ~~Додати `AI_DAILY_TOOL_LIMIT` (fallback = 0.5 × `AI_DAILY_USER_LIMIT`).~~ Shipped as `AI_QUOTA_TOOL_LIMITS` JSON map.
- ~~Ендпоінти з `toolUse: true` … `assertAiQuota(req, res, { cost: … })`.~~ Shipped via `consumeToolQuota()`.
- ~~Chat без tool_use / всі nutrition handler-и → `cost: 1`.~~ Shipped.
- ~~Метрики: розділити `aiQuotaBlocksTotal{reason}` на `{reason, cost}`, додати `ai_cost_consumed_total{subject_type}`.~~ **Shipped** (звірено 2026-07-01): `obs/metrics.ts:310` — `aiQuotaBlocksTotal` з `labelNames: ["reason", "cost"]`; `obs/metrics.ts:339` — `ai_cost_consumed_total` з `labelNames: ["subject_type", "bucket_type"]`; інкременти у `modules/chat/aiQuota.ts:354+`.

---

## Database & migrations review

### `user_profile.payload` не має серверного правила «чий запис новіший»

**Заведено 2026-08-09** під час ревʼю PR [#762](https://github.com/SkOrDs-02/sergeant/pull/762) (L-8 фаза 2). Знахідку підняв CodeRabbit, свою ж пропозицію відкликав після розбору — запис збережено саме тому, що правильний діагноз там прозвучав, а простий фікс до нього не підходить.

**Що не так.** `upsertUserProfile` (`apps/server/src/modules/me/profile.ts`) робить сліпу заміну всього JSONB-payload-а. Клієнт шле **повний** знімок профілю після кожного локального редагування (`pushCombinedProfile` у `apps/web/src/core/profile/profileWriteThrough.ts`), тож пристрій, який давно не синхронізувався, може перезаписати свіже видалення факту з банку памʼяті — і `removeMemoryBankEntry`, і його бамп `memoryBank.updatedAt` цьому не завадять, бо сервер мітки часу **не порівнює**.

**Чому не лікується блокуванням.** `SELECT … FOR UPDATE` на upsert-і серіалізує два записи, але пізніший усе одно робить сліпу заміну — застарілий знімок переможе просто в детермінованому порядку. Проблема не в гонці, а у **відсутності політики розвʼязання конфлікту**.

**Що потрібно насправді — і чому це рішення власника.** Серверний LWW або merge: порівнювати вхідний `memoryBank.updatedAt` зі збереженим і відхиляти/зливати старіший. Три причини, чому це не дрібна правка:

- Докстрінг модуля прямо оголошує його **свідомо НЕ oplog-sync**: «no LWW-guard, no `sync_op_log` involvement». Додати LWW = змінити задекларований контракт.
- `payload` накриває не лише `memoryBank`, а й біометрію — один спільний timestamp не годиться, потрібен по-секційний.
- Потрібне правило для перекосів годинників між пристроями (мітку ставить клієнт).

**Ціна відкладання.** Сценарій вузький (видалення факту паралельно з пушем зі старого пристрою), але наслідок тихий: факт «воскресає» в UI і в RAG, а жоден лог цього не показує.

### Міграції (`apps/server/src/migrations/`)

На 2026-07-20 — **82** файли міграцій (lex order, без `.down.sql`-компаньйонів), найновіша `082_plata_card_token.sql`. **Канонічний список — сама директорія `apps/server/src/migrations/`**; повний перелік тут навмисно не дублюємо, бо інлайн-енумерація швидко дрейфує (на 2026-05-13 тут стояло «32», на 2026-05-29 — «73»). Більшість має `.down.sql` companion для local rollback (production runner у `apps/server/migrate.mjs` ніколи не виконує down-міграції).

### Індекси — по реальних query-патернах

| Таблиця              | Реальні запити                                                                                                | Індекс                                                                                                                                                                                                                                                                                                                                                                                                           | Статус |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `module_data`        | `WHERE user_id=$1 AND module=$2` (push/pull); `INSERT … ON CONFLICT (user_id, module)`                        | PK `(user_id, module)`                                                                                                                                                                                                                                                                                                                                                                                           | **OK** |
| `ai_usage_daily`     | `INSERT … ON CONFLICT (subject_key, usage_day, bucket, endpoint)`; `DELETE WHERE usage_day < NOW() - 30 days` | PK `(subject_key, usage_day, bucket, endpoint)` (**ЗАКРИТО 2026-08-04**, міграція `106_ai_usage_daily_endpoint_pk.sql`; раніше PK лишався 3-колонковим `(subject_key, usage_day, bucket)` з міграції 004, тоді як код уже писав `ON CONFLICT` на 4 колонки з міграції 104 — другий `endpoint` на ту саму трійку падав `23505`, бо `ON CONFLICT` не резолвиться проти НЕ-arbiter констрейнта) + idx `(usage_day)` | **OK** |
| `push_subscriptions` | `SELECT … WHERE user_id=$1`; `DELETE WHERE endpoint = ANY($1)`                                                | UNIQUE(endpoint) + index на user_id                                                                                                                                                                                                                                                                                                                                                                              | **OK** |
| `session`            | Better Auth — керує сама                                                                                      | n/a                                                                                                                                                                                                                                                                                                                                                                                                              | **OK** |

### EXPLAIN ANALYZE — закрито в PR D ✅

- ✅ `module_data` upsert (O(1) через PK) — план зашитий у [`016_constraints_and_query_plan_notes.sql`](../../../apps/server/src/migrations/016_constraints_and_query_plan_notes.sql) (патерн A) + продубльовано як `COMMENT ON TABLE module_data` у [`032_query_plan_documentation.sql`](../../../apps/server/src/migrations/032_query_plan_documentation.sql) щоб `psql \d+` показувало contract.
- ✅ `ai_usage_daily` purge (O(rows older than 30d)) — `COMMENT ON INDEX idx_ai_usage_daily_day` у `032_query_plan_documentation.sql` фіксує: `Bitmap Index Scan` на `idx_ai_usage_daily_day`; на <10k рядків Postgres сам обере seq-scan (обидва плани прийнятні).
- ✅ `push_subscriptions.user_id` — окремий `idx_push_subscriptions_user_id` НЕ потрібен; цю роль виконує partial-індекс `idx_push_subs_user_active` (`005_backend_hardening.sql`, замінив дроп-нутий `idx_push_subs_user` з 003). `032_query_plan_documentation.sql` додає `COMMENT ON INDEX idx_push_subs_user_active` що задокументовано як канонічний обʼєкт цього requirement-у.

### Consistency constraints — закрито в PR D ✅

- ✅ `ai_usage_daily.request_count > 0` — inline CHECK у [`002_ai_usage_daily.sql`](../../../apps/server/src/migrations/002_ai_usage_daily.sql); `COMMENT ON COLUMN` додано у `032`.
- ✅ `module_data.version >= 1` — `module_data_version_positive` CHECK у [`016_constraints_and_query_plan_notes.sql`](../../../apps/server/src/migrations/016_constraints_and_query_plan_notes.sql) (NOT VALID + VALIDATE дрилл).
- ✅ `push_subscriptions.endpoint ≤ 2048` — `push_subscriptions_endpoint_max_length` CHECK у `016`.
- ✅ `module_data.module IN (…)` — `module_data_module_check` у [`024_module_check_and_soft_delete.sql`](../../../apps/server/src/migrations/024_module_check_and_soft_delete.sql) (defense-in-depth поверх `VALID_MODULES` set-у в sync.ts).
- ✅ FK `push_subscriptions.user_id → user.id ON DELETE CASCADE` — у [`003_baseline_schema.sql:65`](../../../apps/server/src/migrations/003_baseline_schema.sql) (constraint `push_subscriptions_user_id_fkey`); `COMMENT ON CONSTRAINT` додано у `032`.

### Soft-delete — реалізовано (PR #012, міграції 005/006/024) ✅

- `push_subscriptions.deleted_at` (005), `push_devices.deleted_at` (006), `module_data.deleted_at` (005, на виріст), `mono_transaction.deleted_at` + `ai_usage_daily.deleted_at` + `sync_audit_log.deleted_at` (024).
- Гарячі read-path-и фільтрують `WHERE deleted_at IS NULL` через partial-індекси: `idx_push_subs_user_active`, `idx_push_devices_user_active`, `mono_transaction_active_idx`. Cascade-traversal на user-delete пробігає по тих самих індексах.
- Раніше тут стояв abstract "не додавати soft-delete глобально"; обʼєктний підхід (per-table partial-index + soft-delete column лише там, де потрібен audit / unsubscribe-flow) виявився правильним компромісом — overhead відсутній, бо partial-індекси ігнорують soft-deleted рядки.

### Довгі запити — закрито в PR D ✅

- ✅ Inline EXPLAIN ANALYZE-нотатки на гарячих міграціях (016 — 4 патерни синку/push, 024 — partial для `mono_transaction` listу, 032 — підсумкові COMMENT ON для `psql \d+`).
- `idx_module_data_server_updated_at` — досі **не створено**, нема feature-у "recent changes across all modules". Залишається у tech-debt-seed-секції (P2).

### Routine: PK-тип `routine_*` розходиться з клієнтським id (ЗАКРИТО 2026-08-01)

**Закрито 2026-08-01** міграцією
[`094_routine_pk_text.sql`](../../../apps/server/src/migrations/094_routine_pk_text.sql):
`id` у `routine_habits` / `routine_tags` / `routine_categories` /
`routine_entries` переведено з `uuid` у `text`, drizzle-модель і снапшот-тест
підтягнуто слідом.

Гіпотеза 2026-07-24 підтвердилась повністю — і виявилась ширшою, ніж
описано нижче. Живий прогін (`docs/90-work/audits/web-qa-pre-beta.md`) показав,
що падав не лише `routine_entries`, а **всі чотири таблиці**: `routineUid`
додає префікс `hab_`/`tag_`/`cat_` до кожного id. Тобто Рутина не мала на
сервері жодного рядка, а помилка осідала в клієнтському `sync_op_outbox` і
нікуди не спливала.

Доказ до/після — той самий `POST /api/v2/sync/push` із реальними клієнтськими
id: до міграції всі чотири `apply_failed` (контрольний op із голим UUID —
`applied`), після — всі чотири `applied`, і `pull` віддає id незмінними.

Обрано послаблення типу колонки, а не переписування id на клієнті: у
`routine_entries` id навмисно детермінований (ключ дедуплікації чекінів), тож
випадковий UUID зламав би саме цю властивість. Двофазність не знадобилась —
`uuid → text` лише розширює домен значень, FK на ці id немає.

**Чому баг прожив 12 днів.** Не через відсутність інструментації: сервер увесь
час писав `logger.warn({ msg: "sync_v2_apply_failed" })` з текстом помилки
Postgres і крутив `sync_op_log_apply_total{status="rejected"}`. Німим був
**клієнт** — `markRejected` ставив рядку `status='rejected'` у локальному
SQLite і мовчав, а SLO рахував запити, а не операції, тож батч із суцільними
реджектами повертав HTTP 200 і виглядав як успіх.

Закрито разом із міграцією:

- `markRejected` в `apps/web/src/core/syncEngine/singleton.ts` тепер шле
  термінальні реджекти (крім штатного `lww_conflict`) у logger і Sentry;
- у [SLO.md § 3.1](../../03-operations/observability/SLO.md) описано правило
  `SyncApplyFailedSpike` поверх уже наявної метрики — design-only, як і решта
  алертів у цьому репо.

Nutrition-частина того ж класу закрита міграцією 095 (див. наступний запис).

<details>
<summary>Історія запису (до закриття)</summary>

**Знайдено 2026-07-24** під час фіксу tombstone-resurrection (audit routine
E-1). `routine_entries.id` у Postgres — `UUID`
([`026_routine_tables.sql:33`](../../../apps/server/src/migrations/026_routine_tables.sql),
`packages/db-schema/src/pg/routine.ts:25`), у клієнтському SQLite — `TEXT`, а
клієнт формує id як `hab_<base36>_<rand>:YYYY-MM-DD`
(`packages/routine-domain/src/storage.ts` + `sqliteWriter/diff.ts`
`buildCompletionRowId`). Реальний push із браузера має падати на `22P02`
(`invalid input syntax for type uuid`) ще на `SELECT … WHERE id = $1` →
`apply_failed` → термінальний reject в outbox (та сама втрата чекіну, що й
E-1). Те саме для `routine_habits` / `routine_tags` / `routine_categories`.
Наявні тести маскують проблему, бо вживають валідні UUID-и.

**Чому не в цьому PR:** зміна типу PK по 4 таблицях + бекфіл + FK — Hard Rule
#4 (двофазність) і рішення власника поверхні. Знято ЛИШЕ tombstone-причину;
до цієї міграції твердження «чекін більше не губиться» непідтверджене.

**Наступний крок:** live-перевірка (dev-сервер + справжня БД + справжній
`habitId`) → окремий PR із двофазною міграцією типу.

**Оновлення 2026-07-25 (W1-ROUTINE-APPEND, стадія 1).** Нова таблиця
`routine_completion_events` (міграція
[`085`](../../../apps/server/src/migrations/085_routine_completion_events.sql))
СВІДОМО оголошує `id TEXT`, а не `UUID` — щоб не повторити цю саму пастку.
Клієнт генерує `id` детерміновано (`buildCompletionEventId` у
`@sergeant/routine-domain`), сервер застосовує через
`INSERT ... ON CONFLICT (id) DO NOTHING`
([`applyCompletionEvents.ts`](../../../apps/server/src/modules/sync/routine/applyCompletionEvents.ts)).
Для СТАРИХ таблиць (`routine_entries` / `routine_habits` / `routine_tags` /
`routine_categories`) борг лишається ВІДКРИТИМ і закриється лише стадією 5
(припинення запису в `routine_entries` + двофазний DROP) — до того моменту
твердження «чекін доїжджає до сервера» так само непідтверджене.

</details>

### Nutrition: PK-тип `nutrition_*` розходиться з клієнтським id (ЗАКРИТО 2026-08-01)

**Закрито 2026-08-01** міграцією
[`095_nutrition_pk_text.sql`](../../../apps/server/src/migrations/095_nutrition_pk_text.sql)
слідом за 094 (routine).

Гіпотеза 2026-07-25 підтвердилась, і знову виявилась ширшою: уражені не дві
таблиці, а **чотири** — клієнт не шле UUID у жодній з них.

| таблиця                  | форма клієнтського id        |
| ------------------------ | ---------------------------- |
| `nutrition_pantries`     | `home` \| `p_<ms>_<idx>`     |
| `nutrition_pantry_items` | `<pantryId>::<idx>::<name>`  |
| `nutrition_meals`        | `meal_mig_<ts>_<idx>_<uuid>` |
| `nutrition_recipes`      | `rcp_ai_<hash>`              |

Прогін `POST /api/v2/sync/push` із цими id: до міграції всі чотири
`apply_failed` (контроль із голим UUID — `applied`), після — всі чотири
`applied`. Разом із PK переведено `nutrition_pantry_items.pantry_id` і
`nutrition_prefs.active_pantry_id`; FK `pantry_id → nutrition_pantries(id)`
знято й повернуто в тій самій транзакції.

**Що НЕ полагоджено (і типом не лікується):** id позиції комори містить
`index` і `name`, тож перейменування продукту чи зсув у масиві породжує новий
id — LWW-upsert по такому ключу лишається нестабільним. Канонічний шлях —
append-only `nutrition_pantry_events` із ключем `item_key` (ADR-0077 §3.2).
Міграція 095 прибрала лише `22P02`.

<details>
<summary>Історія запису (до закриття)</summary>

**Знайдено 2026-07-25** під час W1-PANTRY-APPEND стадії 1. Той самий клас
багу, що описаний вище для routine, але в коморі — і досі не помічений.

`nutrition_pantries.id` і `nutrition_pantry_items.id` у Postgres — `UUID`
([`035_nutrition_tables.sql`](../../../apps/server/src/migrations/035_nutrition_tables.sql)),
у клієнтському SQLite — `TEXT`. Клієнт формує обидва id як **НЕ-UUID** рядки:

- комора — `home` (default) або `p_<ms>_<idx>`
  ([`nutritionPantries.ts`](../../../packages/nutrition-domain/src/nutritionPantries.ts));
- позиція — `` `${pantryId}::${index}::${name}` `` (детермінований id із
  позиційного LS-масиву, `extractPantrySnapshots` у
  [`nutritionStorage.ts`](../../../apps/web/src/modules/nutrition/lib/nutritionStorage.ts)).

Отже реальний push комори з браузера має падати на `22P02`
(`invalid input syntax for type uuid`) ще на `SELECT … WHERE id = $1` у
`applyNutritionPantryItems` → `apply_failed` → термінальний reject в outbox.
Наявні тести цього не ловлять, бо вживають валідні UUID-и — рівно як у
routine-випадку.

**Додаткове зауваження:** `id` позиції містить `index` і `name`, тож
перейменування продукту або зсув у масиві **породжує новий id**. Навіть після
фіксу типу LWW-upsert по такому ключу лишається нестабільним.

**Що зроблено в стадії 1:** нова таблиця `nutrition_pantry_events`
(міграція [`086`](../../../apps/server/src/migrations/086_nutrition_pantry_events.sql))
СВІДОМО оголошує `id` / `pantry_id` / `item_id` / `meal_id` як `TEXT`, щоб не
успадкувати пастку, і ключує згортку на `item_key` (`canonicalFoodKey`), а не
на `item_id`. FK на `nutrition_pantries(id)` через це неможливий (TEXT vs
UUID) — лишився лише FK на `"user"(id)`. Рішення зафіксоване в
[ADR-0077](../../04-governance/adr/0077-pantry-append-only-ledger.md) §3.2.

**Чому не в цьому PR:** зміна типу PK по двох таблицях + бекфіл + FK — Hard
Rule #4 (двофазність) і рішення власника поверхні, як і в routine-випадку.

**Наступний крок:** live-перевірка (dev-сервер + справжня БД + справжня
комора) → окремий PR із двофазною міграцією типу. До того моменту твердження
«комора синхронізується між пристроями» — непідтверджене.

</details>

### Routine: фізичне перейменування `routine_streaks` (відкрито, `недок`)

**Знайдено:** audit routine E-4. `routine_streaks.current_streak` /
`longest_streak` — net-лічильник кліків «відмітив/зняв» по всіх звичках
разом (increment-only PN-counter, clamp `>= 0`), а не derived день-стрік.
Правильне ім'я — `routine_completion_counter`.

**Зроблено 2026-07-24 (documentation-фаза):** міграція
`084_routine_streaks_phantom_docs.sql` (`COMMENT ON TABLE`/`COLUMN`, нуль
DDL) + JSDoc-попередження у `packages/db-schema/src/pg/routine.ts`,
`packages/db-schema/src/sqlite/routine.ts` і док-стрінгу
`applyRoutineStreaks`.

**Чому rename заблокований:** рядок `routine_streaks` — одночасно (a) ім'я
PG-таблиці, (b) ім'я SQLite-таблиці всередині вже встановлених web/mobile
клієнтів, (c) wire-protocol table key increment-опів з outbox. Потрібен
координований web+mobile rollout з app-store лагом (EAS) — Hard Rule #4
two-phase DROP цього класу змін не покриває.

### Pre-beta schema-debt audit (ЗАКРИТО частково 2026-08-04)

Разовий прохід по схемних боргах, скористаний тим, що прод-БД не містить
користувачів і буде wipe-нута перед бетою (founder confirmed). Міграції
`104`–`115`, `apps/server/src/migrations/`.

- ✅ **091-номер потрійний конфлікт** — `091_ai_usage_endpoint_and_cache.sql`
  (третій, ніколи не задеплоєний файл із зайнятим номером) перейменовано на
  `104_ai_usage_endpoint_and_cache.sql` + bookkeeping-guard
  `105_rename_091_ai_usage_endpoint_and_cache.sql`. `scripts/lint-migrations.mjs`
  whitelist переведено з number-based на filename-based
  (`APPLIED_DUPLICATE_FILENAMES`), щоб нові колізії по 091 більше не
  проходили мовчки.
- ✅ **`ai_usage_daily` PK vs `ON CONFLICT`** — `106_ai_usage_daily_endpoint_pk.sql`
  перебудував PK на 4 колонки `(subject_key, usage_day, bucket, endpoint)`;
  див. рядок в "Індекси" вище. Sentinel-канон для відсутнього ендпоінта —
  `'legacy'` (backfill), Stage 2 має уніфікувати з живим кодом
  (`anthropicUsageStore.ts:169` досі пише `'unknown'`).
- ⚠️ **`mono_connection.webhook_secret` (plaintext) — DROP НЕ виконано, лише
  запланований.** `107_mono_connection_drop_webhook_secret.sql` містить
  Phase-2 DROP із `TWO-PHASE-DROP` header-ом, готовий до merge, АЛЕ
  `connection.ts`/`rotateSecret.ts` досі пишуть цю колонку — Stage 2 має
  спершу прибрати ці записи, інакше деплой цієї міграції зламає upsert.
- ✅ **`routine_habits.paused` — DROP НЕ виконано (свідомо).** На відміну
  від задачі, знайдено ЖИВИХ читачів/писарів по обидва боки:
  `applySyncFullState.ts` + `lib/reminders/sweep.ts` (сервер),
  `routine-domain/src/reducers.ts` + web/mobile `sqliteReader`/`sqliteWriter`
  (клієнт). Two-phase Phase 1 (сервер перестає читати/писати) ще не
  відбувся — DROP зараз повторив би incident #704. Задокументовано в
  `packages/db-schema/src/pg/routine.ts` і `sqlite/routine.ts`.
- ✅ **`finyk_networth_history.networth` REAL → DOUBLE PRECISION** —
  `108_finyk_networth_history_double.sql`, лослесс widening cast.
- ✅ **day-key доктрина (ADR-0078)** — `nutrition_pantry_events` і
  `nutrition_goal_periods` отримали `tz_offset_min` (`109_nutrition_events_tz_offset.sql`
  - клієнтська sqlite-міграція `006_nutrition_events_tz_offset.sql`),
    зрівнявши їх із `routine_completion_events` (085). `effective_from`
    переформульовано з "Kyiv-local" на device-local (коментар-only, формат
    CHECK не змінився).
- ✅ **CHECK на day-key формат** — `110_day_key_format_checks.sql` додає
  `^\d{4}-\d{2}-\d{2}$` на `routine_pushups.date_key`,
  `nutrition_water_log.date_key`, `fizruk_wellbeing.date_key`,
  `routine_completion_events.date_key`, `push_reminder_log.day_key`.
- ✅ **GDPR-схема** — `111_user_preferences_gdpr.sql`
  (`health_data_consent` + `analytics` DEFAULT TRUE→FALSE; **server-side
  fallback `dataRights.ts:DEFAULT_PREFERENCES.analytics=true` НЕ
  оновлено цією міграцією — Stage 2**), `112_user_force_verify_at.sql`
  (`"user".force_verify_at`, Phase D email-verification-sweep gate),
  `113_gdpr_cleanup_queue.sql` (ADR-0016 § ADR-6.3, wiring — Stage 2).
- ✅ **`nutrition_backups`** — `114_nutrition_backups.sql`, PG-заміна
  ефемерного `fs.writeFile` у `backup-upload.ts` (перенос коду — Stage 2).
- ✅ **`user_profile`** — `115_user_profile.sql` + Drizzle-модель
  `packages/db-schema/src/pg/profile.ts`, write-through сховище для
  `USER_PROFILE`/`HUB_BIOMETRICS` (endpoint-и — Stage 2/4).
- 🚫 **`sync_op_log` retention/partition — НЕ реалізовано (свідомо).**
  Партиціювання по time-колонці вимагало б розширити
  `UNIQUE(user_id, idempotency_key)` до трьох колонок, що назавжди
  вимикає idempotency-backstop проти конкурентного дубль-інсерту. Деталі —
  addendum у [ADR-0065](../../04-governance/adr/0065-sync-op-log-retention-and-multi-instance-fanout.md)
  (2026-08-04).
- 🚫 **SPIKE-легасі в sqlite migrations — НЕ прибрано (свідомо).**
  `ROUTINE_SPIKE_CLIENT_MIGRATIONS`/`ROUTINE_SPIKE_MIGRATIONS_TABLE`
  активно імпортуються web+mobile `clientMigrate.ts` і 9 test-файлами;
  `@removeBy 2026-09-01` ще не настав. `001_routine_spike.sql` ledger-ім'я
  лишено — рескейл ризикує зламати вже змігровані локальні SQLite-стани
  розробників/бета-тестерів за нульову функціональну вигоду.

---

## Observability & logging review

### Вже є

- **Pino** + ALS-mixin (`requestId`/`userId`/`module` у кожному рядку).
- **Sentry** з PII-redaction, beforeSend/beforeBreadcrumb.
- **Prometheus**: `http_requests_total`, `http_request_duration_ms`, `db_query_duration_ms`, `db_slow_queries_total`, `db_errors_total`, `ai_quota_blocks_total`, `ai_quota_fail_open_total`, `external_http_requests_total`, `rate_limit_hits_total`, `sync_operations_total`, `sync_duration_ms`, `sync_payload_bytes`, `sync_conflicts_total`, `auth_attempts_total`, `auth_session_lookup_duration_ms`, `push_*`, `app_errors_total{kind,status,code,module}`, `anthropic_prompt_cache_hit_total{version,outcome}` ([#864](https://github.com/Skords-01/Sergeant/pull/864), audit PR-12.A), `chat_tool_invocations_total{tool,outcome}` ([#924](https://github.com/Skords-01/Sergeant/pull/924), audit PR-12.C — `outcome=proposed|executed|unknown_tool` lifecycle), `chat_tool_result_truncated_total{reason}` ([#922](https://github.com/Skords-01/Sergeant/pull/922), audit PR-12.E).
- **Request-id**: `X-Request-Id` header + у JSON-тілі помилок.
- **/livez**, **/readyz**, **/metrics** endpoints.

### Gaps → PR E

- **Високий** — метрики відсутні на nutrition-handler-ах (лише загальна RED через Express-middleware; немає per-endpoint ms-histogram для AI-викликів з breakdown по endpoint/model/tokens).
- **Середній** — немає `app_build_info` gauge (version/commit/release) — корисно для readiness-dashboard.
- **Середній** — per-route error-rate не має окремого шардингу на `route_pattern` (зараз `module` label — достатньо для топ-рівня).
- **Низький** — ✅ закрито 2026-09-02: Sentry release / `app_build_info` беруть `GIT_SHA`, запечений у образ build-arg-ом із `deploy-api.yml`; `RAILWAY_GIT_COMMIT_SHA` знято з усіх каскадів (ADR-0074).

---

## Secret-logging audit

| Шар         | Ризик                  | Поточна поведінка                                                                                                                                                   | Статус     |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Sentry      | send request body      | `sendDefaultPii: false`, `beforeSend` стрипає `request.data`/`cookies`, breadcrumbs стрипає `request_body_size`                                                     | **OK**     |
| Pino        | log request headers    | `requestLog.js` пише лише `method/path/status/ms/userAgent` (перевірено), НЕ `authorization`/`cookie`                                                               | **OK**     |
| Pino        | log error objects      | `serializeError()` стрипає `err.cause`/`err.response.data` для operational; `includeStack=true` лише для 5xx                                                        | **OK**     |
| Mono/Privat | upstream body → client | ✅ **Closed** [#347](https://github.com/Skords-01/Sergeant/pull/347) — scrub у `privat.ts` (+ узгоджений контракт з mono): клієнту не віддаємо сирий upstream body. | **Closed** |
| Anthropic   | api-key у logs         | `anthropicMessages` не логує key; `authorization` header ставиться inline                                                                                           | **OK**     |
| Web-push    | VAPID key у logs       | web-push.setVapidDetails() — не логується                                                                                                                           | **OK**     |
| Auth        | email                  | `emailFingerprint = SHA-256(email).slice(0,12)` у метриках і логах                                                                                                  | **OK**     |
| Auth        | password               | Better Auth не логує; body-stream стрипається у Sentry                                                                                                              | **OK**     |
| Database    | connection string      | ніде не логується (перевірено)                                                                                                                                      | **OK**     |

### `.env.example` — аудит

- Перевірити, чи всі env з `config.js` + `auth.js` + `aiQuota.js` + `rateLimit.js` + `sentry.js` + `anthropic.js` + `db.js` задокументовані.
- У PR E зробити оновлення + додати `BANK_FETCH_TIMEOUT_MS`, `BANK_CACHE_TTL_MS`, `AI_DAILY_TOOL_LIMIT`, `AI_TOOL_COST`.

---

## Tests coverage map

> **Звірено 2026-08-01 з живим `pnpm --filter @sergeant/server test:coverage`.** Таблиця нижче — знімок з часів PR F (травень 2026) і не оновлювалась відтоді; рядки, позначені ❌/частково, могли отримати тести пізніше без синхронного апдейту цього файлу. Джерело правди по агрегатних % — `coverage-ratchet.json` (repo root) і `docs/02-engineering/testing/README.md` § «Coverage ratchet», не ця таблиця.

Шляхи відносно **`apps/server/src/`**.

| Файл / зона                                                                                  | Тест є?                                                                   | Залишок (PR F / інкремент)                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `aiQuota.ts`                                                                                 | ✅ `aiQuota.test.ts`                                                      | Симуляція гонок під навантаженням — опційно.                                                   |
| `auth.ts`                                                                                    | частково `auth.test.ts`                                                   | trustedOrigins / edge cases — розширити.                                                       |
| `db.ts`                                                                                      | ✅ `db.test.ts` + `db.poolSlowConnect.test.ts` + `db.poolMetrics.test.ts` | 88% lines (2026-08-01) — рядок вище позначав «❌», застаріло.                                  |
| `modules/chat/chat.ts`                                                                       | ✅ `modules/chat/chat.test.ts`                                            | **Повний SSE + tool_use** end-to-end — середній пріоритет.                                     |
| `modules/chat/coach.ts`                                                                      | ✅ `modules/chat/coach.test.ts`                                           | `coachInsight`, route-level AI — додати.                                                       |
| `modules/sync/sync.ts`                                                                       | ✅ `modules/sync/sync.test.ts`                                            | Розширені контракти push/pull/pushAll — за бажанням.                                           |
| `modules/sync/syncV2.ts`                                                                     | ✅ `modules/sync/syncV2.test.ts` + integration                            | 95.34% lines (2026-08-01) — рядок вище позначав «~0-1%», застаріло.                            |
| `modules/mono/mono.ts` / `privat.ts`                                                         | через `modules/mono/bankProxy.test.ts`                                    | Інтеграційні сценарії cache/breaker — опційно.                                                 |
| `modules/push/push.ts`                                                                       | ✅ `modules/push/push.test.ts`                                            | Edge cases stale endpoint / dual-write метрик — опційно.                                       |
| `push/send.ts`                                                                               | ✅ `push/send.test.ts`                                                    | Native APNs/FCM mocks — за потреби.                                                            |
| `lib/webpushSend.ts`                                                                         | ✅ `lib/webpushSend.test.ts`                                              | —                                                                                              |
| `modules/nutrition/barcode.ts`                                                               | ✅ `modules/nutrition/barcode.test.ts`                                    | Каскад OFF→USDA→UPC, cache hit/miss, invalid input, transient upstream failures покриті.       |
| `modules/nutrition/food-search.ts`                                                           | ✅ `modules/nutrition/food-search.test.ts`                                | 97.22% lines (2026-08-01). Розширити UK_TO_EN / merge edge cases.                              |
| `modules/nutrition/{day-hint,day-plan,parse-pantry,find-recipes,shopping-list,week-plan}.ts` | ✅ per-file `*.test.ts`                                                   | 95-100% lines (2026-08-01) — рядок нижче позначав «Anthropic tool handlers ~0-15%», застаріло. |
| `modules/digest/weekly-digest.ts`                                                            | ✅ `modules/digest/weekly-digest.test.ts`                                 | 99.17% lines (2026-08-01) — рядок вище позначав «❌», застаріло.                               |
| `modules/nutrition/*`                                                                        | частково (`nutritionResponse.test.ts`)                                    | Контракт-тести per handler (happy + invalid body) — PR F.                                      |

Цільове покриття (без зміни цілей):

- `modules/chat/chat.ts`, `modules/sync/sync.ts`, `modules/chat/coach.ts` — прагнути ≥ 80% lines/branches.
- Контракт-тести: per route — (1) happy path, (2) invalid body, (3) oversize body, (4) unauthenticated, (5) rate-limited.

---

## Gradual TypeScript migration plan — ✅ DONE (archived)

**Стан (2026-05-04):** TS-міграція закрита **в усьому монорепо**, не тільки на сервері.

- `apps/server/src/**/*.ts` — 100% TS. `.js` у `apps/server/` лишилися тільки як deploy/build-glue (`migrate.mjs`, `build.mjs`).
- `apps/web/src/**/*.{ts,tsx}` — 100% TS. У production-source `.js`/`.jsx` — 0 (перевірено `find apps/web/src -type f \( -name "*.js" -o -name "*.jsx" \)`).
- `packages/openclaw-plugin/src/**/*.ts` — 100% TS (historical `tools/openclaw` workspace removed).
- `apps/mobile/src/**/*.{ts,tsx}` + `apps/mobile/app/**/*.tsx` — 100% TS (mobile також прогнано).
- `apps/mobile-shell/**/*.ts` — 100% TS.
- `packages/**/src/**` — 100% TS (включно з 4 domain-пакетами та `@sergeant/api-client`).

**Strict-режим:** `pnpm strict:coverage` = **13 / 13 пакетів = 100%** (`strict: true` + `allowJs: false` всюди — Phase 4 + Phase 5c, PR [#1454](https://github.com/Skords-01/Sergeant/pull/1454)). Решта `.js`/`.cjs`/`.mjs` у репо — конфіги збірки (vite/vitest/tailwind/jest/metro/babel/eslint), `node --test` спеці для `eslint-plugin-sergeant-design` (за конвенцією `.mjs`), та `packages/design-tokens/*.js` (навмисно дуально-публікується JS, щоб Tailwind config міг його `require`).

### Що ще лишилось (`Phase 6+`) — це **strictness-тюнінг**, не міграція

- `noUncheckedIndexedAccess` rollout — **Done** (Hard Rule #19); див. [`frontend.md` §11.1](./frontend.md).
- Інші opt-in-прапори (`exactOptionalPropertyTypes`, `noImplicitReturns`, …) — теж ✅ у [`frontend.md` §11.1](./frontend.md).
- Білд-pipeline сервера — поточний `tsx` + `tsc --noEmit` достатній; project references не потрібні (typecheck-час у CI бюджет тримає).

> Цей розділ свідомо лишається як archive-marker, щоб PR-описи з 2026-Q1, що лінкують сюди, не били 404. Будь-яке посилання на «допиляти TS-міграцію» з 2026-04-XX і пізніше — стейл; реальні залишки — strictness, а не file-rename.

---

## Roadmap — PR breakdown

| PR                  | Тема                                                                                                                                                   | Файли                                                                                                                                                                                                             | Залежності | Breaking                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------- |
| **Inventory** (цей) | Документ `docs/90-work/tech-debt/backend.md`                                                                                                           | 1 новий файл                                                                                                                                                                                                      | —          | Ні                                                 |
| **PR A** ✅         | Уніфікація zod-валідації + central errorHandler wiring                                                                                                 | `apps/server/src/http/schemas.ts`, nutrition modules, `modules/sync/sync.ts`, `modules/mono/mono.ts`, `modules/mono/privat.ts`, `modules/digest/weekly-digest.ts`, `modules/push/push.ts`, `modules/chat/chat.ts` | Inventory  | Ні (вивід — той самий `{error, code, requestId}`). |
| **PR B** ✅         | Банки: timeout + retry + jitter + circuit breaker + 60s cache                                                                                          | `apps/server/src/lib/bankProxy.ts`, `modules/mono/mono.ts`, `modules/mono/privat.ts`, `modules/mono/bankProxy.test.ts`                                                                                            | —          | Ні (семантика GET лишається).                      |
| **PR C** ✅         | AI quota: atomic upsert + per-tool cost                                                                                                                | `apps/server/src/modules/chat/aiQuota.ts`, `apps/server/src/http/requireAiQuota.ts`, `apps/server/src/modules/chat/chat.ts`, `apps/server/src/modules/chat/aiQuota.test.ts`                                       | —          | Ні (external contract той самий).                  |
| **PR #335** ✅      | Web-push hardening: timeout + retry + per-origin circuit breaker                                                                                       | `apps/server/src/lib/webpushSend.ts` + тести, `modules/push/push.ts`                                                                                                                                              | —          | Ні (зовнішній API push-ендпоінтів незмінний).      |
| **PR #336** ✅      | Supertest-smoke на 8 ендпоінтів через `createApp()` factory                                                                                            | `apps/server/src/smoke.test.ts`, devDep `supertest` + `@types/supertest`                                                                                                                                          | —          | Ні (лише тести).                                   |
| **PR D** ✅         | Міграції: EXPLAIN ANALYZE inline-коментарі + CHECK-constraints + `idx_push_subs_user_active` як канонічний обʼєкт для `idx_push_subscriptions_user_id` | `apps/server/src/migrations/{005,016,024,032}*.sql`, оновлення `docs/90-work/tech-debt/backend.md`                                                                                                                | —          | Ні (всі зміни — additive).                         |
| **PR E** ✅         | Log/obs polish: відсутні метрики, `app_build_info`, оновлений `.env.example`                                                                           | `apps/server/src/obs/metrics.ts`, `obs/logger.ts`, `.env.example`                                                                                                                                                 | —          | Ні.                                                |
| **PR F (опц.)** ✅  | Test coverage: chat/sync/coach ≥80% + contract tests                                                                                                   | `modules/chat/chat.test.ts`, `modules/push/push.test.ts`, `modules/nutrition/food-search.test.ts`, `modules/nutrition/*.test.ts`, route-level `coachInsight` / nutrition contract tests                           | PR A       | Ні.                                                |
| **PR TS-1**         | ~~Gradual TS migration~~ **✅ Done** (код у `apps/server/src`)                                                                                         | —                                                                                                                                                                                                                 | PR A–E     | Ні.                                                |

---

## Operational visibility — Coolify env-var changes

> 🚫 **Blocked-reason: owner-decision** — backlog, не брати зараз. Тригер → ініціатива власника `@Skords-01` після env-var incident / плановий SOC2-audit. Деталі owner/trigger — нижче у секції.

> **Контекст.** Action item §A5 з [`docs/90-work/audits/archive/2026-05-04-csp-disable-retrospective.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-05-04-csp-disable-retrospective.md) — staging-gate ловить deploy-config drift у репо (`vercel.json`, `Dockerfile`, `build.mjs`), але **НЕ** ловить runtime env-var changes у PaaS dashboard. Бекенд переїхав з Railway на **Hetzner + Coolify** ([ADR-0074](../../04-governance/adr/0074-hosting-hetzner-coolify.md)); gap лишився: Coolify UI/API env edits теж поза git.

**Gap (перенесено з Railway-ери; актуальний для Coolify):**

- Немає автоматичного audit-trail «env-var changed in production project» у репо.
- Немає built-in change-detection dashboard («різниця між env-state сьогодні і тиждень тому») у git-tracked формі — лише snapshot у Coolify UI.

**Що зробити (high-level — деталі ініціативи пізніше):**

| Крок | Дія                                                                                                                           | Артефакт                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1    | Periodic snapshot Coolify env-vars (API/CLI) → SHA-256-hash-set у Redis/Postgres `coolify_env_snapshots`.                     | новий cron-script + n8n / worker                        |
| 2    | Diff-detection vs попереднього snapshot-у; на change → Sentry breadcrumb + Slack/email `@Skords-01`.                          | Sentry-tag `coolify_env_change`                         |
| 3    | Persist diff (без значень — лише keys + hash + timestamp) для governance/SOC2-evidence.                                       | Migration + admin endpoint                              |
| 4    | Hard-rule/lint: новий `*_DISABLE` / `*_BYPASS` / `*_OVERRIDE` у `EnvSchema` MUST мати entry у `secret-ownership-register.md`. | Розширити hard-rules категорією `security-flag-sunset`. |

**Owner:** `@Skords-01`. **Trigger** — новий env-var-related incident або плановий SOC2-audit.

## **Альтернативи розглянуті і відкинуті:** Vault/Doppler overengineering; повна заборона runtime security-knobs (частково вже в `access-policy.md`).

## Status log

| Дата       | PR                                                     | Тема                                                    | Результат                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-XX | PR A                                                   | Zod-валідація + central errorHandler                    | Закрив обидва рядки «Високий» у Summary. Grepped `apps/server/src` на широкі catch до res.json — 0 для доменних handler-ів; edge-case без reader у `modules/chat/chat.ts` — § Per-file. RefinePhotoSchema synced.                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-04-XX | PR B                                                   | Банки: timeout/retry/breaker/cache                      | `apps/server/src/lib/bankProxy.ts` — 15s timeout, retry з jitter, 5/30s breaker, 60s cache для GET. mono/privat — тонкі адаптери.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-04-XX | PR C                                                   | AI quota atomic upsert + cost                           | `consumeQuota` — single-statement upsert з per-cost ваги. `SELECT FOR UPDATE` знято. Tool-use = cost 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-04-XX | [#335](https://github.com/Skords-01/Sergeant/pull/335) | Web-push hardening                                      | Новий wrapper `apps/server/src/lib/webpushSend.ts`: timeout 10s, retry [0,500ms+jitter], per-origin breaker, outcome-classification, 13 unit-тестів.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-04-24 | Docs                                                   | Inventory refresh                                       | Вирівняно шляхи з `apps/server/src`, оновлено Per-file / Tests / Bank deep-dive / міграції / TS-план.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-04-XX | [#336](https://github.com/Skords-01/Sergeant/pull/336) | Supertest-smoke                                         | 9 smoke-тестів на 8 ендпоінтів через `createApp()` factory (`/livez`, `/health` ok/503, `/metrics`, `/api/push/vapid-public`, `/api/push/send`, `/api/mono`, `/api/chat`, unknown→404).                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-05-03 | PR D                                                   | Міграції: EXPLAIN ANALYZE + CHECK                       | `032_query_plan_documentation.sql` — закриває § "EXPLAIN ANALYZE" + "Consistency constraints" + verifies `idx_push_subscriptions_user_id` requirement. Усі CHECK-и (`module_data_version_positive`, `push_subscriptions_endpoint_max_length`, `module_data_module_check`, `request_count > 0`) уже були в коді з 002–024. `idx_push_subs_user_active` (005, partial WHERE deleted_at IS NULL) — канонічний обʼєкт замість окремого `idx_push_subscriptions_user_id`.                                                                                                                            |
| 2026-05-04 | Docs                                                   | Doc refresh                                             | § «Gradual TypeScript migration plan» формально закрито (TS-міграція = 100% у всьому монорепо: `apps/{web,server,console,mobile,mobile-shell}/src` + `packages/**/src` — 0 production `.js`/`.jsx`; `pnpm strict:coverage` = 13/13). P1-список синхронізовано з реальним станом коду: `Assets.tsx` (40 LOC), `ActiveWorkoutPanel.tsx` (240), `WeeklyDigestStories.tsx` (122), `Transactions.tsx` (288) — декомпозовані; залишається `HubDashboard.tsx` (715 LOC). Виявлено через `find apps/{web,server}/src -type f \( -name "*.js" -o -name "*.jsx" \)` + `node scripts/strict-coverage.mjs`. |
| 2026-06-01 | PR E                                                   | Log/obs polish: app_build_info, .env.example            | `app_build_info` gauge підтверджено в `obs/metrics.ts` (labels: version/commit/release/env/node_version, value=1 при старті; тест в `obs/metrics.test.ts`). `.env.example` доповнено документацією `BANK_FETCH_TIMEOUT_MS`, `BANK_CACHE_TTL_MS`, `AI_DAILY_TOOL_LIMIT`, `AI_TOOL_COST`, `RAILWAY_GIT_COMMIT_SHA`, `GIT_COMMIT`, `SENTRY_RELEASE`, `METRICS_TOKEN`.                                                                                                                                                                                                                              |
| 2026-06-01 | PR F                                                   | Test coverage: coach mergeMemory + food-search contract | `coach.test.ts` розширено 3 тестами на mergeMemory (LWW-upsert per weekKey, сортування desc, retention ≤12 записів). `food-search.test.ts` розширено 4 тестами (контракт `FoodSearchSuccessSchema`, порожній upstream, prefix-match «молок»→«milk», точний переклад «яйце»→«egg»). Snapshot `registerRoutes.test.ts.snap` синхронізовано з 3 новими debug-window ендпоінтами. Підсумок: 2839 tests passed, typecheck clean, 7 pre-existing billing failures незмінні.                                                                                                                           |

### Поточний залишок P0

Нульовий. Оригінальний список P0 («Топ-5 P0»):

1. ~~Таймаути/ретраї/breaker на `mono`/`privat`/`web-push`~~ — ✅ `bankProxy.ts` + PR #335.
2. ~~`aiQuota.consumeQuota` → атомарний upsert~~ — ✅ PR C.
3. ~~12 широких `catch(e){res.json({error:e.message})}` → `next(e)`~~ — ✅ PR A (grep по `apps/server/src` → 0 для доменних handler-ів).
4. ~~Sync zod-схем з handler-ами (`RefinePhotoSchema`)~~ — ✅ PR A.
5. ~~Supertest-smoke на 8 ендпоінтів через `createApp()` factory~~ — ✅ PR #336.

### P1 (наступний спринт) — ✅ порожній (звірено 2026-08-07)

Список закритий повністю. Кожен рядок переміряний на HEAD, а не списаний з попереднього маркера:

- ~~Розпил 5 найтовщих компонентів: `Assets.jsx` … `HubDashboard.tsx`.~~ **Усі декомпозовані** — `HubDashboard.tsx` зараз ~150 LOC (див. [`frontend.md` §4](./frontend.md)).
- ~~`vitest --coverage` у CI.~~ **Done** — job `Test coverage (vitest)` у [`ci.yml`](../../../.github/workflows/ci.yml): `pnpm test:coverage:ci` + гейт `scripts/ci/coverage-ratchet.mjs --floors` (floors у `coverage-thresholds.json`). NB: `apps/mobile` навмисно виключений (`--filter=!@sergeant/mobile`, web-focus фаза) — саме тому mobile-floor 30 не має CI-виміру для ратчету.
- ~~TS-міграція~~ **Done**.
- ~~3–4 E2E happy-path у Playwright.~~ **Done з запасом** — **23** `@critical`-специ у `apps/web/tests/smoke/`, лейн `critical-flow` блокує PR.
- ~~CSP `report-uri` + explicit `Permissions-Policy`.~~ **Done** — обидва заголовки в `apps/web/vercel.json` і `apps/landing/vercel.json`; `report-uri` + `report-to` вказують на `/api/csp-report` (сінк — `apps/server/src/routes/csp-report.ts`, `modules/observability/csp-report.ts`), `Permissions-Policy` має 19 директив і pin-тест `apps/web/src/test/permissionsPolicyHeader.test.ts`. **Залишковий борг — один докстрінг:** `apps/server/src/http/security.ts` усе ще пише «`report-uri`/`report-to` endpoint НЕ налаштований». Для API-only CSP самого сервера це правда, для фронтенд-політики — ні; формулювання вводить в оману і варте правки при наступному дотику до файлу.

---

### Нотатки по PR A

- Змін **не видно в публічному API** за винятком: помилки валідації повертаються у форматі `{error, details: [{path, message}], code: "VALIDATION", requestId}` (раніше `{error: "..."}`). Клієнти вже цей формат обробляють (див. `server/http/validate.js`).
- SSE-стрім `chat.js` залишається без змін.

### Нотатки по PR B

- При **circuit open** клієнт отримує `503 + Retry-After` + `code: "BANK_UNAVAILABLE"`. Клієнт повинен ретраїти (frontend → добавити backoff у `useMonoSync` / `usePrivatSync`, але це поза бекендом).

### Нотатки по PR C

- Single-statement upsert знімає необхідність у `pool.connect()`/`BEGIN`/`FOR UPDATE`. Поверніть до `pool.query` (через `query()` wrapper з метриками).
- Per-tool: додається опціональний `cost` у `assertAiQuota(req, res, {cost})`. За замовчуванням — 1. `chat` з наявним `tool_results` → 2.

---

## Push credentials

> 🚫 **Blocked-reason: external-infra** — код-pipeline готовий; це провізія секретів поза репо (Apple Developer APNs `.p8` key + Google FCM service-account). Розблокування — створити/завантажити credentials і виставити env-vars у **Coolify** (ADR-0074). Чек-ліст нижче.

Native push-send pipeline (`apps/server/src/push/send.ts::sendToUser` →
APNs через `@parse/node-apn`, FCM HTTP v1 через `google-auth-library`)
реалізовано у commit `36de093` і доставляє payload на iOS / Android / web
паралельно. Цей розділ — операційний чек-ліст для провізії credentials,
щоб native-гілка перестала бути no-op (`apns_disabled` / `fcm_disabled`).

### APNs (iOS)

1. Apple Developer → [Keys](https://developer.apple.com/account/resources/authkeys/list) →
   «+» → назва «Sergeant APNs» → галочка «Apple Push Notifications service (APNs)»
   → Register. Завантаж `AuthKey_XXXXXXXX.p8` (одноразово — повторно не дають!).
2. На тій самій сторінці скопіюй `Key ID` (10-символьний) і `Team ID`
   (у правому верхньому кутку будь-якої сторінки Apple Developer).
3. У Coolify → `apps/server` / API service → Environment Variables додай:

   | Env var           | Значення                                                                                                                                                       |
   | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `APNS_P8_KEY`     | Вміст `.p8` файлу як є (з `-----BEGIN PRIVATE KEY-----`). Coolify приймає багаторядкові значення.                                                              |
   | `APNS_KEY_ID`     | 10-символьний Key ID з кроку 2.                                                                                                                                |
   | `APNS_TEAM_ID`    | 10-символьний Team ID з кроку 2.                                                                                                                               |
   | `APNS_BUNDLE_ID`  | `com.sergeant.shell` (Capacitor) або `com.sergeant.app` (Expo RN) — має співпадати з bundle-id-ом клієнта, що реєструється через `POST /api/v1/push/register`. |
   | `APNS_PRODUCTION` | `true` для App Store / TestFlight, `false` або unset для debug-build-ів на локальному девайсі.                                                                 |

   Якщо PEM потрапив у single-line env-змінну з `\n`-escape-ами
   (наприклад, через CLI export), сервер нормалізує їх автоматично
   (див. `loadApnsKey` у `apnsClient.ts`).

### FCM (Android)

1. [Firebase Console](https://console.firebase.google.com/) → твій проєкт
   (той самий, що в `google-services.json` клієнта) → Project Settings →
   Service accounts → **Generate new private key**. Завантажиться JSON з
   полями `project_id`, `client_email`, `private_key`.
2. Закодуй JSON у base64 одним рядком:

   ```bash
   base64 -w0 firebase-adminsdk-XXXXX.json
   # або на macOS:
   base64 -i firebase-adminsdk-XXXXX.json | tr -d '\n'
   ```

3. Coolify → API service → Environment Variables:

   | Env var                    | Значення                                         |
   | -------------------------- | ------------------------------------------------ |
   | `FCM_SERVICE_ACCOUNT_JSON` | Base64-рядок з кроку 2 (вся JSON, без newlines). |

   Сервер декодує base64 на boot, парсить JSON і кешує OAuth2 access-token
   (margin 60 с до expiry — див. `getFcmAccessToken` у `fcmClient.ts`).
   Невалідний JSON → warn-log `"fcm_init_failed"` + FCM sender disabled;
   APNs / web-push продовжать працювати.

### Перевірка

Після деплою з усіма env-ами:

```bash
# локально або через Coolify / curl до prod URL
curl -X POST https://<server>/api/v1/push/test \
  -H "authorization: Bearer <session-token>" \
  -H "content-type: application/json" \
  -d '{"title":"Test","body":"Hello from server","silent":false}'
```

Відповідь — `PushSendSummarySchema` з
`{ delivered: { ios, android, web }, cleaned, errors }`. `delivered.*`
повинні бути > 0 для платформ, на яких у юзера є зареєстровані пристрої.
Якщо `errors[]` містить `"apns_disabled"` / `"fcm_disabled"` — відповідний
env-набір не підхопився; переглянь Coolify logs на `apns_disabled_log` /
`fcm_init_failed` на boot-і.

### Legacy web-push HTTP (`/api/push/subscribe`) — прибрати після метрик

Поки `POST`/`DELETE /api/push/subscribe` лишаються proxy для старих вкладок
(див. `apps/server/src/modules/push/push.ts`, лог `push_deprecation`). **Після того,
як у логах не буде викликів за розумне вікно:**

1. Видалити legacy-роути та handlers (`apps/server/src/routes/push.ts`,
   `apps/server/src/modules/push/push.ts`).
2. Прибрати `subscribe` / `unsubscribe` з
   `packages/api-client/src/endpoints/push.ts` та оновити
   `apps/web/src/shared/hooks/usePushNotifications.test.tsx`.
3. Перевірити README / `docs/02-engineering/architecture/api-v1.md` на згадки legacy-шляху.

### Rotation

- APNs `.p8`: Apple дозволяє до 2 активних Keys на team. Для ротації —
  створи новий Key, задеплой з новим `APNS_P8_KEY`/`APNS_KEY_ID`, і
  revoke старий через Apple Developer Console. Сервер на boot створить
  новий `apn.Provider` з актуальними кредами.
- FCM service-account: те саме — згенеруй нову приватку у Firebase
  Console → Service accounts → **Manage service account permissions** →
  новий key, задеплой, видали старий. Кеш OAuth-токена очиститься на
  рестарті.

## Конвенції для майбутніх PR

- **Жодних mass-rewrite**. Кожен PR — тематичний, reviewable за один присід (≤ 600 рядків diff там, де це можливо).
- **Жодних breaking змін у публічному API** без нотатки `BREAKING:` у title/body PR.
- CI має пройти (`pnpm lint && pnpm typecheck && pnpm test`).
- Тести обов'язкові для кожного PR з логікою (не для PR-документу).
