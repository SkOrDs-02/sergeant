# Observability-runbook

> **Last validated:** 2026-05-01 by @devin-ai. **Next review:** 2026-07-30.
> **Status:** Active

Інструкції "що робити, коли спрацював алерт" для правил з
[`prometheus/alert_rules.yml`](./prometheus/alert_rules.yml). Тримай коротко:
перший крок завжди `/metrics` + логи Pino за той же інтервал.

Загальне:

- Прод entry point — `apps/server/src/index.ts` (компілюється у `apps/server/dist-server/` build-артефакти; режим вибирається `SERVER_MODE` або авто з `REPLIT_DOMAINS`; для Railway — `SERVER_MODE=railway` / автодефолт). Хостинг — Railway.
- Метрики за bearer-токен: `GET /metrics` з `Authorization: Bearer $METRICS_TOKEN`.
- Логи — Pino JSON у stdout, з ALS-контекстом `{requestId, userId, module}`.
- Sentry ловить fatal/error (включно з `err.cause` чейном).

---

## HttpErrorBudgetBurn

**Що горить**: `http_requests_total{status=~"5.."}` рахунок стрибнув.

1. Перевір розподіл 5xx по path+module:
   ```promql
   sum by (path, module) (rate(http_requests_total{status=~"5.."}[5m]))
   ```
2. Подивись `app_errors_total{kind,status,code,module}` за той же інтервал —
   видно чи це operational (AppError) чи programmer.
3. Знайди логи Pino `level>=error` за period, особливо ті що несуть
   `err.cause.message` і `err.cause.stack`.
4. Частий суспект №1 — DB saturated: перевір `db_pool_waiting` і
   `db_query_duration_ms` одночасно.
5. Якщо це AI endpoint (chat/coach/nutrition) — `ai_requests_total{outcome}`
   підкаже, чи це Anthropic-outage замаскований під 500.
6. Якщо root cause = вичерпана пам'ять / OOM на Railway — збільш план або
   знайди leak у `process_resident_memory_bytes`.

## HttpLatencyP95High

1. `sum by (path) (histogram_quantile(0.95, sum by (le, path) (rate(http_request_duration_ms_bucket[5m]))))` — знайти гарячі path-и.
2. Частий суспект — `auth_session_lookup_duration_ms` через кожен запит
   (див. `AuthSessionLookupSlow` алерт нижче).
3. Перевір `db_query_duration_ms` + `db_pool_waiting > 0` як симптом saturate-у.
4. Якщо гарячий path — `/api/sync` чи AI endpoint — застосуй специфічний runbook.

## SyncErrorBudgetBurn

**Ризик**: клієнти втрачають дані або бачать застарілий стан.

1. Розкрий outcome-breakdown:
   ```promql
   sum by (op, module, outcome) (rate(sync_operations_total[5m]))
   ```
2. `too_large` → хтось б'ється у `MAX_BLOB_SIZE`. Знайди user у логах
   (`path=/api/sync, module=sync`) і проінформуй / обріж.
3. `unauthorized` підскочив → перевір `auth_attempts_total` — можливо
   глобальна auth-проблема відбивається на sync.
4. `error` підскочив → Pino-логи + Sentry issues. Найчастіше це DB
   timeout на `sync_push`.
5. Перевір `sync_payload_bytes` — великі payload-и можуть зʼїдати pool.
6. При повному пробої — тимчасово пропиши `rate_limit` жорсткіше, щоб
   клієнти не добивали бекенд ретраями.

## SyncLatencyP95High

1. `histogram_quantile(0.95, sum by (le, op, module) (rate(sync_duration_ms_bucket[5m])))` — який саме op+module тягне p95.
2. Перевір `db_query_duration_ms` і `db_pool_waiting` — sync IO-важкий.
3. Якщо `sync_payload_bytes` p95 стрибнув — хтось шле великі сторінки.

## SyncConflictSpike

Не SLO-порушення, але варто дивитись.

1. `sum by (module) (rate(sync_conflicts_total[1h]))` — хто конфліктить.
2. Типово: два девайси одного user-а пишуть незалежно, `lastPulledAt`
   старий. Якщо вибух на одному module — регресія в логіці merge-у.
3. Подивись чи не було недавнього деплою `apps/server/src/modules/sync/sync.ts`.

## AuthErrorBudgetBurn

1. Breakdown:
   ```promql
   sum by (op, outcome) (rate(auth_attempts_total[5m]))
   ```
2. `outcome=error` означає internal error (5xx) а не bad-credentials.
3. Перший підозрюваний — better-auth адаптер / DB. Глянь
   `app_errors_total{module="auth"}` і Pino logs.
4. Якщо тільки `sign_in/sign_up` падає, а `session_check` здоровий —
   проблема у верифікації пароля/email (bcrypt / SMTP).

## AuthSessionLookupSlow

Критично — session lookup на кожному authenticated API.

1. `histogram_quantile(0.95, sum by (le) (rate(auth_session_lookup_duration_ms_bucket[5m])))` підтверджує.
2. Перевір `db_pool_waiting > 0` — pool saturate є найчастіший root cause.
3. Перевір розмір `sessions` таблиці й індекси (`EXPLAIN ANALYZE` на query).
4. Як тимчасовий фікс — більший pool (`DATABASE_POOL_MAX`).

## AuthRateLimitSpike

> 30% auth-атак попадає на limiter → або brute-force, або баг у клієнті.

1. `rate(rate_limit_hits_total{key="api:auth:sensitive",outcome="blocked"}[5m])` — обсяг.
2. Подивись Pino logs з `module=auth` — корелюй `req.ip`. Якщо
   однакова IP — бан через Cloudflare або `RATE_LIMIT_BAN_IPS`.
3. Якщо це клієнт-реагує на 401 ретраями без backoff — зафіксуй issue.

## AiErrorBudgetBurn

1. Breakdown:
   ```promql
   sum by (endpoint, outcome) (rate(ai_requests_total[5m]))
   ```
2. `outcome=rate_limited` від Anthropic → включи тимчасово m'якший `assertAiQuota` або проси кредит.
3. `outcome=timeout` → див. `ai_request_duration_ms` p95 + Anthropic status page.
4. `outcome=bad_response` (якщо є) → regression у парсингу. Відкат.
5. `ai_quota_blocks_total{reason="limit"}` стрибнув → ми самі блокуємо користувачів (не помилка бекенду).

## AiLatencyP95High

1. `histogram_quantile(0.95, sum by (le, endpoint) (rate(ai_request_duration_ms_bucket[5m])))` — який endpoint тормозить.
2. Глянь status.anthropic.com. Якщо там incident — deduplicate.
3. Якщо лише weekly-digest тормозить, інші здорові — ймовірно зростає
   розмір prompt-у (надто багато контексту). Підріж.

## ExternalHttpErrorBudgetBurn

Стороння залежність деградує — ми не контролюємо.

1. `sum by (upstream, outcome) (rate(external_http_requests_total[5m]))`.
2. Для Monobank/Privat → перевір їхні статус-сторінки.
3. Якщо barcode upstream (off/usda/upcitemdb) недоступний — client-side
   fallback має вже грати, просто трекай.
4. Якщо це не одноразовий сплеск — деградуй UI-фічу (hide CTA, no retries).

## UnhandledRejection / UncaughtException

Завжди баг. Stack-trace — у Pino `level=fatal` з повним `err.cause` chain.

1. Відкрий Sentry issue (має бути автоматично створений).
2. Correlate за `requestId` у лозі з HTTP-access логом.
3. Patch гіпотетично в наступному релізі; temporary — тримай за алерт.
4. `unhandledRejectionsTotal` не має бути >0 у нормі, навіть не короткочасно.

## DbPoolWaitingSustained

Leading indicator. `db_pool_waiting > 0` 5m → ticket. Пейдж
`DbPoolSaturated` ще не впав, але p95 уже просідає, бо кожен
session-check чекає слот.

1. `sum by (op) (rate(db_query_duration_ms_count[5m]))` — хто раптом
   почав робити багато запитів? Новий endpoint? N+1?
2. `histogram_quantile(0.95, sum by (le, op) (rate(db_query_duration_ms_bucket[5m])))`
   — який op п'є pool.
3. Сверь із git-log: недавній deploy (< 1h) з новою heavy query —
   найчастіший винуватець. Якщо так — розкати або патчі запит.
4. Якщо `db_pool_waiting` падає до 0 за кілька хвилин — резолв.
   Якщо росте далі — чекай `DbPoolSaturated` і дій за ним.

## DbPoolSaturated

`db_pool_waiting > 0` 10m → connection contention.

1. Миттєво: збільш `DATABASE_POOL_MAX` (Railway env).
2. Дослідь: `db_slow_queries_total{op}` — які operations довше `DB_SLOW_MS`.
3. Знайди потенційні long-running transactions у логах
   (`level=info` з `module=db, msg="slow query"`).
4. Перевір, чи не відбувся нещодавно deploy, що додав новий heavy read-path.

## AiQuotaStoreDown

`ai_quota_fail_open_total` зростає → `assertAiQuota` не може
записати в `ai_usage_daily` і **пропускає запити без ліку**. Юзери
можуть вийти за денний ліміт → непередбачуваний Anthropic-білл.

1. `sum by (reason) (increase(ai_quota_fail_open_total[30m]))` — зрозумій
   категорію:
   - `database_url_missing` → env зник/не переексопортнувся. Перевір
     Railway service vars і deploy-логи.
   - `db_error` → Postgres down/unreachable/table missing. Глянь
     `db_errors_total{code}` і Pino `msg=ai_quota_store_unavailable`
     (там є `err.code`).
2. Поки fix не виїхав — **тимчасово заборони AI-фічі** через
   `AI_QUOTA_DISABLED=0` і `AI_DAILY_ANON_LIMIT=0` / `AI_DAILY_USER_LIMIT=0`,
   щоб `assertAiQuota` повертав 429 замість fail-open.
3. Перевір міграцію `ai_usage_daily`: `SELECT to_regclass('ai_usage_daily')`.
   Якщо null — запусти міграції.
4. Після відновлення — дивись Anthropic-dashboard, чи не було сплеску
   витрат за вікно fail-open.

## ProgrammerErrors

`kind=programmer` → виняток без `AppError`-обгортки, код не очікував.

1. Перший suspect — недавній deploy. Перевір Sentry issues за останню годину.
2. Correlate `module` з кодовою базою. `module="unknown"` → десь
   `setRequestModule()` не викликався (або код поза request context).
3. Fix: огорни у `AppError({ kind: "operational" })` де доречно,
   або виправ root cause.
