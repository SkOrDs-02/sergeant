# Backend Tech Debt Inventory

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

> Scope: **`apps/server/src/`** (Node.js 20 ESM, Express 4, PostgreSQL, Better Auth, Anthropic, Monobank/Privat, web-push, Pino, Prometheus, Sentry). У тексті нижче історично згадувався tree `server/*.js` — той самий продукт після переносу в monorepo; нові PR мають посилатися лише на `apps/server/src/**/*.ts`.
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
| Error handling          | ~~Високий~~ → **OK** | ✅ PR A. Широкі `catch { res.status(500).json({ error: e.message }) }` не знайдені (grep `catch\s*\([^)]*\)\s*\{[^}]*res\.(status\|json)` у `apps/server/src` → 0). Handler-и йдуть через `asyncHandler` + `ExternalServiceError`/`ValidationError`/`RateLimitError` + central `errorHandler` (рідкісні прямі `res.status` у edge-case гілках — див. `modules/chat/chat.ts`).                                                                                                            |
| Банки (mono/privat)     | ~~Блокер~~ → **OK**  | ✅ PR B. `apps/server/src/lib/bankProxy.ts` — timeout=15s (`BANK_FETCH_TIMEOUT_MS`), retry з jitter (5xx/timeout/network, respect `Retry-After`), circuit breaker 5-fails / 30s per-upstream, TTL-cache 60s для GET. `modules/mono/mono.ts` / `modules/mono/privat.ts` — тонкі адаптери.                                                                                                                                                                                                 |
| Web-push (sendPush)     | ~~Блокер~~ → **OK**  | ✅ [PR #335](https://github.com/Skords-01/Sergeant/pull/335). `apps/server/src/lib/webpushSend.ts` — timeout=10s (AbortController+Promise.race), retry [0, 500ms+jitter] на 5xx/timeout, per-origin circuit breaker 5-fails / 30s (FCM/Apple/Mozilla ізольовані). Outcome-класифікація: `ok`/`invalid_endpoint`/`rate_limited`/`timeout`/`circuit_open`/`error` → `external_http_requests_total{upstream="push"}`.                                                                       |
| AI-квоти                | ~~Високий~~ → **OK** | ✅ PR C. `consumeQuota` — один атомарний `INSERT … ON CONFLICT DO UPDATE WHERE t.request_count + EXCLUDED.request_count <= $5 RETURNING request_count`. Pre-check `cost > limit` → 429 без TX. Per-cost параметр імплементовано (tool-use = 2, text-only = 1).                                                                                                                                                                                                                           |
| SQL / параметризація    | **OK**               | Усі `pool.query` параметризовані. Ризикових місць не знайдено.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| N+1                     | **OK**               | `syncPushAll` робить 1 statement на модуль у BEGIN/COMMIT — за дизайном. `sendPush` — `SELECT` + паралельний webpush.send — не N+1.                                                                                                                                                                                                                                                                                                                                                      |
| Індекси / soft-delete   | **Середній**         | Всього 3 міграції; покриття достатнє для поточних query-патернів. `deleted_at` / soft-delete ніде не використовується — в інвентарі як tech-debt-seed, а не блокер.                                                                                                                                                                                                                                                                                                                      |
| Логи                    | **Переважно OK**     | Структурний Pino + ALS (`requestId`/`userId`/`module`) підтягуються автоматично. `X-Request-Id` в response-header + у JSON-тілі помилки. Метрики RED/USE по маршрутах — покриті.                                                                                                                                                                                                                                                                                                         |
| Таймаути / retry (HTTP) | **OK**               | ✅ Anthropic: `timeoutMs` + 3 retry. Barcode/food-search: `AbortSignal.timeout`. Банки: `bankProxy.ts` timeout+retry+breaker+cache. Web-push: [PR #335](https://github.com/Skords-01/Sergeant/pull/335) timeout+retry+per-origin breaker.                                                                                                                                                                                                                                                |
| Дублювання логіки       | **Середній**         | OFF/USDA нормалізатори, pantry→string map, dual-metric `record*` — повторюються у 2–3 файлах.                                                                                                                                                                                                                                                                                                                                                                                            |
| Секрети в логах         | **OK**               | Sentry `sendDefaultPii=false` + `beforeSend` стрипає body/cookies. Логер не дампить headers. Email логується як SHA-256[:12]. Anthropic key не логується.                                                                                                                                                                                                                                                                                                                                |
| Тести                   | **Середній**         | ✅ [PR #336](https://github.com/Skords-01/Sergeant/pull/336) + розширення: `apps/server/src/smoke.test.ts`, `modules/chat/chat.test.ts`, `modules/push/push.test.ts`, `lib/webpushSend.test.ts`, `push/send.test.ts`, `modules/nutrition/food-search.test.ts`, `modules/nutrition/barcode.test.ts`, `modules/sync/sync.test.ts` тощо. Залишок: **SSE chat end-to-end**, **route-level coach / nutrition contract tests** (окрім unit на `nutritionResponse`) — PR F / інкрементальні PR. |

---

## Per-file findings

Префікс у репозиторії: **`apps/server/src/`** (TypeScript; суфікс `.js` в ESM-імпортах — вимога Node для резолву модулів). Нижче — актуальний зріз після P0-A–E, TS-переносу та додаткових тестів. Абзаци про «блокери» в `mono`/`privat` без `bankProxy`, «немає `validateBody`» у nutrition, «немає `chat.test`» — **архівні** (див. git-історію PR A–E та [#335](https://github.com/Skords-01/Sergeant/pull/335)).

### Entry, app shell, DB, auth

| Файл         | Статус / залишковий борг                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`   | **OK** — graceful shutdown, pool sampler; **низький**: `catch { /* ignore */ }` навколо Sentry flush — прийнятно.                                              |
| `app.ts`     | **OK** — body-size caps, middleware pipeline.                                                                                                                  |
| `config.ts`  | **OK** — frozen config.                                                                                                                                        |
| `db.ts`      | **OK** — query wrapper + метрики; **середній**: глобальний `DB_SLOW_MS` 200ms; **низький**: catch навколо histogram observe.                                   |
| `auth.ts`    | **OK** — Better Auth; **середній**: lazy Sentry + catch у тестових моках.                                                                                      |
| `aiQuota.ts` | **OK** — atomic upsert + per-cost (PR C); **високий (P1)**: немає окремих per-tool лімітів / ваг у продуктовій політиці; **середній**: catch на метриках — OK. |
| `sentry.ts`  | **OK**; **середній**: `SENTRY_TRACES_SAMPLE_RATE` 0.1 у проді може бути дорогим.                                                                               |

### `http/` (infra)

- **OK** — `validate.ts`, `asyncHandler.ts`, `errorHandler.ts`, `jsonSafe.ts`, barrel `index.ts`.
- **`schemas.ts` — OK (post-PR A):** `RefinePhotoSchema` та nutrition/sync/mono/privat схеми **використовуються** у відповідних handler-ах (`validateBody` / `validateQuery`); попередній аудит про розсинхрон — закритий.
- **`rateLimit.ts` — середній:** in-memory fixed-window ×N при multi-instance (Redis — на майбутнє).

### `obs/` + `lib/`

- **errors.ts** — OK; частина handler-ів досі відповідає через `res.status` у специфічних гілках (SSE) — **низький** consistency gap vs `next(e)`.
- **logger.ts**, **metrics.ts**, **requestContext.ts** — OK.
- **anthropic.ts** — OK (timeout + retry); **низький** — `recordStreamEnd` для stream — відповідальність caller (`chat.ts` дотримується).
- **bankProxy.ts**, **webpushSend.ts**, **externalHttp.ts**, **nutritionResponse.ts** (+ unit-тести) — OK.

### `routes/*`

- **OK** — `setModule` → rate-limit → `asyncHandler(handler)`.

### `modules/chat/chat.ts` + `modules/chat/tools.ts`

- **OK / середній:** каталог **`TOOLS`** винесено в **`chat/tools.ts`** (файл великий за LOC — **середній** борг підтримуваності, не безпеки).
- **OK** — основні шляхи помилок Anthropic мапляться на HTTP status; refund квоти при upstream-failure.
- **OK** — prompt-caching на SYSTEM_PREFIX (`cache_control: ephemeral`) активований у [#864](https://github.com/Skords-01/Sergeant/pull/864) (audit PR-12.A); per-request метрика `anthropic_prompt_cache_hit_total{version,outcome=hit|miss}` включно зі streaming-шляхом.
- **OK** — per-tool lifecycle-метрика `chat_tool_invocations_total{tool, outcome=proposed|executed|unknown_tool}` ([#924](https://github.com/Skords-01/Sergeant/pull/924), audit PR-12.C). Whitelist від `TOOLS`-реєстру (anti-cardinality), wired у обидва кроки handler-а. `proposed - executed` дає кількість запропонованих, але не виконаних tool-call-ів.
- **OK** — server-side truncation великих `tool_result`-payload-ів ([#922](https://github.com/Skords-01/Sergeant/pull/922), audit PR-12.E): threshold 2 000 chars, head 600 + tail 400 + marker, повний blob у Sentry breadcrumb `chat.tool_result`. Метрика `chat_tool_result_truncated_total{reason}`. Закриває edge case з briefing/digest, що зривав continuation.
- **Середній** — SSE heartbeat (`SSE_HEARTBEAT_MS`); на жорсткому proxy read-timeout можливі обриви — tune `ping` / `flushHeaders` за потреби.
- **Низький** — якщо `response.body` без `getReader()` до старту SSE — прямий `res.status(500).json` (рідкісний edge); решта stream-errors йдуть у SSE payload.
- **OK** — **`chat.test.ts`** + **`chat.stream.test.ts`** ([#900](https://github.com/Skords-01/Sergeant/pull/900), audit PR-4.A) повністю покривають handler + 17 тестів на streaming-шлях `streamAnthropicToSse`/`streamOneIterationToSse` (line-buffer, chunk-boundaries, auto-continuation, cap, partial-text, abort).
- **Operations:** lifecycle нових tools формалізований у [`docs/adr/0002-tool-lifecycle.md`](../adr/0002-tool-lifecycle.md) (audit PR-12.D) — Proposal / Safety / Rollout / KPIs з KPI-thresholds на `chat_tool_invocations_total`.

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

Широкі `catch → res.status(500).json({ error: e.message })` зняті з доменних handler-ів на користь **`asyncHandler`** + **`ExternalServiceError`** / **`ValidationError`** / **`RateLimitError`** + центральний **`errorHandler`** (див. `http/errorHandler.ts`). Залишкові прямі `res.status` — лише в узгоджених гілках (наприклад, passthrough HTTP-коду від upstream у `mono.ts` / stream edge-case у `chat.ts`).

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

- `elapsedMs(start)` → винести в спільний util (зараз повторюється в 4+ файлах `apps/server/src`).
- ~~`pantry items → prompt string`~~ → **DONE 2026-04-28**:
  `apps/server/src/lib/pantryFormat.ts` + `pantryFormat.test.ts`.
- OFF/USDA normalizers → уніфікувати між `modules/nutrition/barcode.ts` і `modules/nutrition/food-search.ts` (shared `apps/server/src/lib/foodNormalize.ts`).
- ~~`FNV-1a safeKeyFromToken`~~ → **DONE 2026-04-28**:
  `apps/server/src/lib/backupKey.ts` + `backupKey.test.ts`.

---

## Bank integrations deep-dive

| Вимога                     | Mono / Privat (після PR B)                                                                                                                                       | Примітки                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Fetch timeout              | ✅ `bankProxy.ts` — `BANK_FETCH_TIMEOUT_MS` (default 15s)                                                                                                        |                                                     |
| Retry + jitter             | ✅ 5xx / timeout / network; respect `Retry-After`                                                                                                                |                                                     |
| Circuit breaker            | ✅ 5 fails / 30s open per upstream                                                                                                                               |                                                     |
| 60s cache (GET)            | ✅ TTL cache з ключем без збереження сирого токена                                                                                                               |                                                     |
| Validation (zod)           | ✅ `MonoQuerySchema` / `PrivatQuerySchema` + path whitelist у handler-ах                                                                                         |                                                     |
| Помилки upstream → клієнту | ⚠️ Частково: 429 мапиться на зрозуміле повідомлення + `Retry-After`; інші коди можуть прокидати `body` upstream у JSON — **середній** ризик leak (P2 hardening). |                                                     |
| Наявні тести               | ✅ `modules/mono/bankProxy.test.ts`                                                                                                                              | Розширення: cache-hit / breaker-open — за бажанням. |

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

- Додати `AI_DAILY_TOOL_LIMIT` (fallback = 0.5 × `AI_DAILY_USER_LIMIT`).
- Ендпоінти з `toolUse: true` (`chat` при наявності tool_results) викликають `assertAiQuota(req, res, { cost: Number(process.env.AI_TOOL_COST) || 2 })`.
- Chat без tool_use / всі nutrition handler-и → `cost: 1`.
- Метрики: розділити `aiQuotaBlocksTotal{reason}` на `{reason, cost}`, додати `ai_cost_consumed_total{subject_type}`.

---

## Database & migrations review

### Міграції (`apps/server/src/migrations/`)

На момент оновлення інвентарю — **8** файлів міграцій (lex order): `001_noop.sql`, `002_ai_usage_daily.sql`, `003_baseline_schema.sql`, `004_ai_usage_daily_tool_bucket.sql`, `005_backend_hardening.sql`, `006_push_devices.sql` (+ `.down.sql`), `007_module_data_user_fk.sql`. Перші три — як у попередньому аудиті; `004+` — tool-bucket для AI-квот, hardening, push_devices, FK на `module_data`.

### Індекси — по реальних query-патернах

| Таблиця              | Реальні запити                                                                              | Індекс                                            | Статус |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------ |
| `module_data`        | `WHERE user_id=$1 AND module=$2` (push/pull); `INSERT … ON CONFLICT (user_id, module)`      | PK `(user_id, module)`                            | **OK** |
| `ai_usage_daily`     | `INSERT … ON CONFLICT (subject_key, usage_day)`; `DELETE WHERE usage_day < NOW() - 30 days` | PK `(subject_key, usage_day)` + idx `(usage_day)` | **OK** |
| `push_subscriptions` | `SELECT … WHERE user_id=$1`; `DELETE WHERE endpoint = ANY($1)`                              | UNIQUE(endpoint) + index на user_id               | **OK** |
| `session`            | Better Auth — керує сама                                                                    | n/a                                               | **OK** |

### EXPLAIN ANALYZE — треба додати inline-коментарі до міграцій для важких запитів

- `module_data` upsert: зараз O(1) через PK. Коментар: `-- EXPLAIN ANALYZE shows Index Only Scan on module_data_pkey, cost ≤ 0.04ms on 10k rows`.
- `ai_usage_daily` purge: O(rows older than 30d). Коментар: `-- DELETE uses idx_ai_usage_daily_usage_day; seq scan on table <10k rows is fine`.
- Для `push_subscriptions`: якщо кількість user-підписок зростатиме, додати `CREATE INDEX CONCURRENTLY idx_push_subscriptions_user_id ON push_subscriptions(user_id)` — перевірити, що вже існує.

### Consistency constraints

- `ai_usage_daily.request_count > 0` — **OK**.
- `module_data.version >= 1` — варто додати як CHECK.
- `push_subscriptions.endpoint` довжина — поточна TEXT без обмеження; додати CHECK `length(endpoint) ≤ 2048`.
- FK: `push_subscriptions.user_id → user.id ON DELETE CASCADE` — **перевірити міграцію 003**; якщо нема, додати.

### Soft-delete

- Сьогодні ніде не використовується. Це свідомо: `push_subscriptions` реально має бути hard-delete (ендпоінти більше не валідні). Для `module_data` soft-delete не потрібен — user може очистити blob, але версія зростатиме.
- Рекомендація: **не додавати soft-delete глобально** — створює overhead без бізнес-потреби. Якщо для `user.delete` (GDPR) треба trail — робити через окрему таблицю `deleted_user_audit` замість `deleted_at` колонок.

### Довгі запити → PR D

- Додати `-- EXPLAIN ANALYZE …` коментарі до кожної міграції з нетривіальним запитом.
- Додати `idx_module_data_server_updated_at` (опціонально) якщо з'явиться feature "recent changes across all modules".

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
- **Низький** — Sentry release береться з `RAILWAY_GIT_COMMIT_SHA`, але Replit не має еквіваленту — ок для дев-режиму.

---

## Secret-logging audit

| Шар         | Ризик                  | Поточна поведінка                                                                                                                                                                                           | Статус       |
| ----------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Sentry      | send request body      | `sendDefaultPii: false`, `beforeSend` стрипає `request.data`/`cookies`, breadcrumbs стрипає `request_body_size`                                                                                             | **OK**       |
| Pino        | log request headers    | `requestLog.js` пише лише `method/path/status/ms/userAgent` (перевірено), НЕ `authorization`/`cookie`                                                                                                       | **OK**       |
| Pino        | log error objects      | `serializeError()` стрипає `err.cause`/`err.response.data` для operational; `includeStack=true` лише для 5xx                                                                                                | **OK**       |
| Mono/Privat | upstream body → client | 429 — локалізоване повідомлення + `Retry-After`; інші статуси можуть містити сирий `body` у JSON (`mono.ts`) — **середній** (P2 whitelist / scrub). PR B закрив transport-ризики, не семантику повідомлень. | **Середній** |
| Anthropic   | api-key у logs         | `anthropicMessages` не логує key; `authorization` header ставиться inline                                                                                                                                   | **OK**       |
| Web-push    | VAPID key у logs       | web-push.setVapidDetails() — не логується                                                                                                                                                                   | **OK**       |
| Auth        | email                  | `emailFingerprint = SHA-256(email).slice(0,12)` у метриках і логах                                                                                                                                          | **OK**       |
| Auth        | password               | Better Auth не логує; body-stream стрипається у Sentry                                                                                                                                                      | **OK**       |
| Database    | connection string      | ніде не логується (перевірено)                                                                                                                                                                              | **OK**       |

### `.env.example` — аудит

- Перевірити, чи всі env з `config.js` + `auth.js` + `aiQuota.js` + `rateLimit.js` + `sentry.js` + `anthropic.js` + `db.js` задокументовані.
- У PR E зробити оновлення + додати `BANK_FETCH_TIMEOUT_MS`, `BANK_CACHE_TTL_MS`, `AI_DAILY_TOOL_LIMIT`, `AI_TOOL_COST`.

---

## Tests coverage map

Шляхи відносно **`apps/server/src/`**.

| Файл / зона                          | Тест є?                                    | Залишок (PR F / інкремент)                                                               |
| ------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `aiQuota.ts`                         | ✅ `aiQuota.test.ts`                       | Симуляція гонок під навантаженням — опційно.                                             |
| `auth.ts`                            | частково `auth.test.ts`                    | trustedOrigins / edge cases — розширити.                                                 |
| `db.ts`                              | ❌                                         | pg mock — низький пріоритет.                                                             |
| `modules/chat/chat.ts`               | ✅ `modules/chat/chat.test.ts`             | **Повний SSE + tool_use** end-to-end — середній пріоритет.                               |
| `modules/chat/coach.ts`              | ✅ `modules/chat/coach.test.ts`            | `coachInsight`, route-level AI — додати.                                                 |
| `modules/sync/sync.ts`               | ✅ `modules/sync/sync.test.ts`             | Розширені контракти push/pull/pushAll — за бажанням.                                     |
| `modules/mono/mono.ts` / `privat.ts` | через `modules/mono/bankProxy.test.ts`     | Інтеграційні сценарії cache/breaker — опційно.                                           |
| `modules/push/push.ts`               | ✅ `modules/push/push.test.ts`             | Edge cases stale endpoint / dual-write метрик — опційно.                                 |
| `push/send.ts`                       | ✅ `push/send.test.ts`                     | Native APNs/FCM mocks — за потреби.                                                      |
| `lib/webpushSend.ts`                 | ✅ `lib/webpushSend.test.ts`               | —                                                                                        |
| `modules/nutrition/barcode.ts`       | ✅ `modules/nutrition/barcode.test.ts`     | Каскад OFF→USDA→UPC, cache hit/miss, invalid input, transient upstream failures покриті. |
| `modules/nutrition/food-search.ts`   | ✅ `modules/nutrition/food-search.test.ts` | Розширити UK_TO_EN / merge edge cases.                                                   |
| `modules/digest/weekly-digest.ts`    | ❌                                         | AI JSON parse / prompt fixture — **середній**.                                           |
| `modules/nutrition/*`                | частково (`nutritionResponse.test.ts`)     | Контракт-тести per handler (happy + invalid body) — PR F.                                |

Цільове покриття (без зміни цілей):

- `modules/chat/chat.ts`, `modules/sync/sync.ts`, `modules/chat/coach.ts` — прагнути ≥ 80% lines/branches.
- Контракт-тести: per route — (1) happy path, (2) invalid body, (3) oversize body, (4) unauthenticated, (5) rate-limited.

---

## Gradual TypeScript migration plan

**Стан (оновлення інвентарю):** серверний застосунок повністю у **`apps/server/src/**/_.ts`** з Vitest-тестами `_.test.ts`; ESM-імпорти з суфіксом `.js` — очікуваний патерн для Node. План «хвиль» нижче — **архівний RFC** (використовувати як чекліст strictness, а не як blocker).

### Принцип (архів)

- `tsconfig.server.json` вже існує (використовується у `pnpm typecheck`).
- `allowJs: true` + поступове перейменування `.js → .ts` по файлах.
- Жодного великого рефактору в одному PR. Один thematic group = один PR з міграцією.

### Можливі наступні кроки (P2)

- Підвищити `strictness` / `noImplicitAny` у межах `@sergeant/server` (або локального `tsconfig`) без зміни runtime.
- Якщо `pnpm typecheck` для сервера перевищує комфортний бюджет часу — розбити на **project references** (`apps/server/tsconfig.json` + refs).
- Розглянути єдиний build-pipeline (`tsc --outDir` або `tsx` + `tsc --noEmit` у CI) — за потреби деплою; зараз прийнятний поточний спосіб запуску TS через toolchain репозиторію.

---

## Roadmap — PR breakdown

| PR                  | Тема                                                                                              | Файли                                                                                                                                                                                                             | Залежності | Breaking                                           |
| ------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------- |
| **Inventory** (цей) | Документ `docs/tech-debt/backend.md`                                                              | 1 новий файл                                                                                                                                                                                                      | —          | Ні                                                 |
| **PR A** ✅         | Уніфікація zod-валідації + central errorHandler wiring                                            | `apps/server/src/http/schemas.ts`, nutrition modules, `modules/sync/sync.ts`, `modules/mono/mono.ts`, `modules/mono/privat.ts`, `modules/digest/weekly-digest.ts`, `modules/push/push.ts`, `modules/chat/chat.ts` | Inventory  | Ні (вивід — той самий `{error, code, requestId}`). |
| **PR B** ✅         | Банки: timeout + retry + jitter + circuit breaker + 60s cache                                     | `apps/server/src/lib/bankProxy.ts`, `modules/mono/mono.ts`, `modules/mono/privat.ts`, `modules/mono/bankProxy.test.ts`                                                                                            | —          | Ні (семантика GET лишається).                      |
| **PR C** ✅         | AI quota: atomic upsert + per-tool cost                                                           | `apps/server/src/aiQuota.ts`, `apps/server/src/http/requireAiQuota.ts`, `apps/server/src/modules/chat/chat.ts`, `apps/server/src/aiQuota.test.ts`                                                                 | —          | Ні (external contract той самий).                  |
| **PR #335** ✅      | Web-push hardening: timeout + retry + per-origin circuit breaker                                  | `apps/server/src/lib/webpushSend.ts` + тести, `modules/push/push.ts`                                                                                                                                              | —          | Ні (зовнішній API push-ендпоінтів незмінний).      |
| **PR #336** ✅      | Supertest-smoke на 8 ендпоінтів через `createApp()` factory                                       | `apps/server/src/smoke.test.ts`, devDep `supertest` + `@types/supertest`                                                                                                                                          | —          | Ні (лише тести).                                   |
| **PR D**            | Міграції: коментарі EXPLAIN ANALYZE, CHECK-constraints, можливий `idx_push_subscriptions_user_id` | `apps/server/src/migrations/*.sql`, оновлення `docs/tech-debt/backend.md`                                                                                                                                         | —          | Ні (всі зміни — additive).                         |
| **PR E**            | Log/obs polish: відсутні метрики, `app_build_info`, оновлений `.env.example`                      | `apps/server/src/obs/metrics.ts`, `obs/logger.ts`, `.env.example`                                                                                                                                                 | —          | Ні.                                                |
| **PR F (опц.)**     | Test coverage: chat/sync/coach ≥80% + contract tests                                              | `modules/chat/chat.test.ts`, `modules/push/push.test.ts`, `modules/nutrition/food-search.test.ts`, `modules/nutrition/*.test.ts`, route-level `coachInsight` / nutrition contract tests                           | PR A       | Ні.                                                |
| **PR TS-1**         | ~~Gradual TS migration~~ **✅ Done** (код у `apps/server/src`)                                    | —                                                                                                                                                                                                                 | PR A–E     | Ні.                                                |

---

## Status log

| Дата       | PR                                                     | Тема                                 | Результат                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-XX | PR A                                                   | Zod-валідація + central errorHandler | Закрив обидва рядки «Високий» у Summary. Grepped `apps/server/src` на широкі catch до res.json — 0 для доменних handler-ів; edge-case без reader у `modules/chat/chat.ts` — § Per-file. RefinePhotoSchema synced. |
| 2026-04-XX | PR B                                                   | Банки: timeout/retry/breaker/cache   | `apps/server/src/lib/bankProxy.ts` — 15s timeout, retry з jitter, 5/30s breaker, 60s cache для GET. mono/privat — тонкі адаптери.                                                                                 |
| 2026-04-XX | PR C                                                   | AI quota atomic upsert + cost        | `consumeQuota` — single-statement upsert з per-cost ваги. `SELECT FOR UPDATE` знято. Tool-use = cost 2.                                                                                                           |
| 2026-04-XX | [#335](https://github.com/Skords-01/Sergeant/pull/335) | Web-push hardening                   | Новий wrapper `apps/server/src/lib/webpushSend.ts`: timeout 10s, retry [0,500ms+jitter], per-origin breaker, outcome-classification, 13 unit-тестів.                                                              |
| 2026-04-24 | Docs                                                   | Inventory refresh                    | Вирівняно шляхи з `apps/server/src`, оновлено Per-file / Tests / Bank deep-dive / міграції / TS-план.                                                                                                             |
| 2026-04-XX | [#336](https://github.com/Skords-01/Sergeant/pull/336) | Supertest-smoke                      | 9 smoke-тестів на 8 ендпоінтів через `createApp()` factory (`/livez`, `/health` ok/503, `/metrics`, `/api/push/vapid-public`, `/api/push/send`, `/api/mono`, `/api/chat`, unknown→404).                           |

### Поточний залишок P0

Нульовий. Оригінальний список P0 («Топ-5 P0»):

1. ~~Таймаути/ретраї/breaker на `mono`/`privat`/`web-push`~~ — ✅ `bankProxy.ts` + PR #335.
2. ~~`aiQuota.consumeQuota` → атомарний upsert~~ — ✅ PR C.
3. ~~12 широких `catch(e){res.json({error:e.message})}` → `next(e)`~~ — ✅ PR A (grep по `apps/server/src` → 0 для доменних handler-ів).
4. ~~Sync zod-схем з handler-ами (`RefinePhotoSchema`)~~ — ✅ PR A.
5. ~~Supertest-smoke на 8 ендпоінтів через `createApp()` factory~~ — ✅ PR #336.

### P1 (наступний спринт)

- Розпил 5 найтовщих компонентів: `Assets.jsx` (928), `ActiveWorkoutPanel.tsx` (949), `WeeklyDigestStories.tsx` (867), `Transactions.jsx` (737), `HubDashboard.tsx` (663).
- `vitest --coverage` у CI.
- TS-міграція `finyk/domain+lib` та `nutrition/hooks+lib` (Хвиля 3 для domain; утилітарна частина готова).
- 3–4 E2E happy-path у Playwright.
- CSP `report-uri` + explicit `Permissions-Policy`.

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
3. У Railway → `apps/server` service → Variables додай:

   | Env var           | Значення                                                                                                                                                       |
   | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `APNS_P8_KEY`     | Вміст `.p8` файлу як є (з `-----BEGIN PRIVATE KEY-----`). Railway приймає багаторядкові значення.                                                              |
   | `APNS_KEY_ID`     | 10-символьний Key ID з кроку 2.                                                                                                                                |
   | `APNS_TEAM_ID`    | 10-символьний Team ID з кроку 2.                                                                                                                               |
   | `APNS_BUNDLE_ID`  | `com.sergeant.shell` (Capacitor) або `com.sergeant.app` (Expo RN) — має співпадати з bundle-id-ом клієнта, що реєструється через `POST /api/v1/push/register`. |
   | `APNS_PRODUCTION` | `true` для App Store / TestFlight, `false` або unset для debug-build-ів на локальному девайсі.                                                                 |

   Якщо PEM потрапив у single-line env-змінну з `\n`-escape-ами
   (наприклад, через `railway env set`), сервер нормалізує їх автоматично
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

3. Railway → `apps/server` service → Variables:

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
# локально або через Railway CLI
curl -X POST https://<server>/api/v1/push/test \
  -H "authorization: Bearer <session-token>" \
  -H "content-type: application/json" \
  -d '{"title":"Test","body":"Hello from server","silent":false}'
```

Відповідь — `PushSendSummarySchema` з
`{ delivered: { ios, android, web }, cleaned, errors }`. `delivered.*`
повинні бути > 0 для платформ, на яких у юзера є зареєстровані пристрої.
Якщо `errors[]` містить `"apns_disabled"` / `"fcm_disabled"` — відповідний
env-набір не підхопився; переглянь Railway logs на `apns_disabled_log` /
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
3. Перевірити README / `docs/architecture/api-v1.md` на згадки legacy-шляху.

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
