# Observability-runbook

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
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
3. Подивись чи не було недавнього деплою `apps/server/src/modules/sync/syncV2.ts`.

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

---

# Platform hardening — operational FAQ

> Ці секції додані разом з [Initiative 0008](../initiatives/archive/_0008-platform-hardening.md). Це не алерт-runbook-и (вони вище), а оперативні how-to для повторюваних situations які виникли разом з новою інфраструктурою (probes, rate-limit headers, Renovate, SBOM).

## Як інтерпретувати 429-алерт у Grafana

Алерт `AuthRateLimitSpike` (вище) показує загальний rate. Для **глибшого** аналізу:

1. **Подивись `RateLimit-*` headers** на response-zі. З [Initiative 0008 Phase 2](../initiatives/archive/_0008-platform-hardening.md) сервер emit-ить:
   - `RateLimit-Limit` — конфігурований ліміт (з `apps/server/src/config/rateLimit.ts`).
   - `RateLimit-Remaining` — скільки запитів лишилось у поточному вікні.
   - `RateLimit-Reset` — секунд до скидання вікна.
   - `Retry-After` — у 429-відповідях, секунд до retry.
2. **PromQL для розподілу 429 по policy-ключах:**
   ```promql
   sum by (key, outcome) (rate(rate_limit_hits_total{outcome="blocked"}[5m]))
   ```
   `key` лейбл — це `policy.key` з реєстру (наприклад, `api:auth:sensitive`). Якщо blocked-spike тільки на одному `key` — швидше за все targeted attack або bug у клієнті.
3. **Перевір failMode для затиснутого роуту** в `apps/server/src/config/rateLimit.ts`:
   - `failMode: "closed"` (як у `api:auth:sensitive`) → при degraded Redis+PG limiter повертає 503 + `Retry-After: 5`. Алерт горить, але кредитстаффінг **не** прискорюється.
   - `failMode: "open"` → при degraded limiter пропускає трафік. Очікується підвищений rate; перевір `rate_limit_degraded_total{mode=inmem}` — якщо росте, deps degraded, не атака.
4. **Відрізнити атаку від retry-storm:**
   - Атака → широкий range `req.ip`, рівномірний rate-pattern. Бан через Cloudflare або `RATE_LIMIT_BAN_IPS` env-var.
   - Retry-storm → `req.ip` концентрується на 1-3 джерелах (web/mobile/console). Це bug у клієнті, що ігнорує `Retry-After`. Відкривай issue на surface, патч у наступному релізі.

## Що робити, якщо `/health/readiness` FAIL у production

З [Initiative 0008 Phase 1](../initiatives/archive/_0008-platform-hardening.md) Sergeant exposед три probes:

- `/health/liveness` — process alive (event-loop responsive). Должен бути 200 завжди, поки Node-процес не повис.
- `/health/readiness` — `pg.ping()` + `redis.ping()` обидва ОК. 200/503.
- `/startupz` (also `/health/startup`) — initial migrations + warmup завершені. 200/503; k8s/Render `failureThreshold: 30, periodSeconds: 1`.

**Algorithm коли readiness=503:**

1. **Перший крок — перевір liveness.** `curl https://api.sergeant/health/liveness`. Якщо теж 503 → процес повис, готуйся до restart-у. Якщо 200 → process живий, але dep degraded.
2. **Перевір тіло readiness:**
   ```bash
   curl https://api.sergeant/health/readiness | jq
   ```
   Response має `checks: [{ name: "pg", status: "fulfilled" | "rejected" }, { name: "redis", ... }]`. Точно покаже, що саме не так.
3. **Якщо PG degraded:**
   - Railway → подивись Postgres metrics + connection-pool. Якщо `db_pool_waiting > 0` 5m — корелюй з `DbPoolWaitingSustained` runbook вище.
   - Швидкий патч: збільш `DATABASE_POOL_MAX` (Railway env).
4. **Якщо Redis degraded:**
   - Перевір `rate_limit_degraded_total{mode=closed}` — якщо росте, всі auth-роути серверу будуть 503. Залежить від `failMode: "closed"` policy.
   - Швидкий патч (не для prod): `RATE_LIMIT_FAIL_CLOSED_AUTH=false` env-var → revert до open-mode без redeploy. **УВАГА:** це послабляє credential-stuffing захист, тримай не довше за hour.
5. **Не перезавантажуй pod-и просто щоб «спробувати»** — startup probe з `failureThreshold: 30` сам перезапустить, якщо warmup застряг.

## `/health/workers` — worker fleet snapshot

`GET /health/workers` (PR-31) повертає JSON з per-queue/worker breakdown. **Не** є platform-probe-ом — Railway його не використовує. Призначення: дашборди, runbook-investigation, alert-channel debug.

```bash
curl https://api.sergeant/health/workers | jq
```

Контракт відповіді:

```json
{
  "status": "healthy" | "unhealthy",
  "timestamp": "2026-05-06T08:30:00.000Z",
  "workers": {
    "aiMemoryIngest": {
      "enabled": true,           // env: AI_MEMORY_ENABLED
      "started": true,           // BullMQ Worker.start() succeeded
      "fallbackMode": false,     // true коли enabled+!started → in-process direct dispatch
      "concurrency": 4,
      "attempts": 5,
      "jobCounts": { "waiting": 0, "active": 0, "delayed": 0, "failed": 0 }
    },
    "monoEnrichment": {
      "enabled": true,           // env: MONO_ENRICHMENT_WORKER_ENABLED && ANTHROPIC_API_KEY
      "intervalMs": 5000,
      "queueDepth": {
        "pending": 5, "processing": 1, "done": 4242,
        "failed": 0, "dead_letter": 0, "total": 4248
      }
    },
    "backgroundQueue": {
      "status": "healthy",
      "queued": 0,
      "running": 0,
      "concurrency": 5,
      "isShuttingDown": false
    }
  }
}
```

Status-code mapping:

- **200** — обидві worker-sample-функції повернулися без `error`. Worker-disabled / fallback / порожня черга — все ще healthy.
- **503** — хоч одна повернула `error` (Redis/DB unreachable). На worker-у, що зафейлив, `jobCounts`/`queueDepth` буде `null` і додасться поле `error` зі stripped message (без stack-trace — L7 invariant).

**Коли користуватись:**

1. **Alert "ai-memory-ingest queue depth growing":** перевір `aiMemoryIngest.jobCounts.failed` + `delayed`. Якщо `failed > 0` за 5min — Anthropic/Voyage incident, runbook → `docs/launch/tech/ai-memory-activation.md §Outage`.
2. **Alert "mono enrichment lag":** перевір `monoEnrichment.queueDepth.pending` + `processing`. Якщо pending росте, але processing=0 — worker не стартував у одній з replic-ів. Перевір `MONO_ENRICHMENT_WORKER_ENABLED` env у Railway.
3. **Reproduce CI flakiness:** `aiMemoryIngest.fallbackMode=true` означає Redis недоступний — у CI це норма, у production sign of disaster.

## AI memory activation & Day-30 decision-point

> **Owner:** `@Skords-01`. **Scope:** server. **Last validated:** 2026-05-13 by Devin (PR-19). **Related:** [`docs/launch/tech/ai-memory-activation.md`](../launch/tech/ai-memory-activation.md), [`docs/governance/feature-flags.md`](../governance/feature-flags.md), [ADR-0028](../adr/0028-pgvector-ai-memory.md).

### Контекст

AI memory (pgvector + Voyage embeddings) — Phase 2 feature з kill-switch-ом за бюджетом. PR-plan-2026-05 §Decision points фіксує: якщо за **30 днів** після активації `ai_memories` накопичила < 100 rows за останні 7 днів — модуль не виправдовує operational cost (Voyage квота + pgvector storage + maintenance) і **kill-имо**.

### Стейн прапорців (production)

| Flag                            | Default (code) | Activation                      | Назначення                                                                              |
| ------------------------------- | -------------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| `AI_MEMORY_ENABLED`             | `false`        | Railway env → `true`            | Master kill-switch для всього модуля (remember/recall/RAG/ingestion).                   |
| `MONO_AI_MEMORY_INGEST_ENABLED` | `true`         | Без дії — стартує з master-flag | Per-source гейт для `finyk` source. Виставити `false` тільки як selective kill (PR-19). |

Subordinate-логіка: `MONO_AI_MEMORY_INGEST_ENABLED` має значення лише при `AI_MEMORY_ENABLED=true`. Master `false` → всі source-и no-op (`mode="disabled"` метрика), per-source-flag ігнорується.

### Activation procedure

Канонічний runbook — [`docs/launch/tech/ai-memory-activation.md`](../launch/tech/ai-memory-activation.md). TL;DR:

1. **Pre-flight (Railway):** `VOYAGE_API_KEY` provisioned, БД-міграція 025 застосована, `pgvector` extension доступний.
2. **Step 2** — `AI_MEMORY_ENABLED=true` у Railway → автоматичний redeploy.
3. **Step 3** — finyk-ingest вмикається автоматично (sub-flag default `true`). Перші writes у `ai_memories` мають зʼявитись протягом ~5–30s після першого mono-webhook.
4. **Step 4** — end-to-end smoke test через HubChat (див. activation runbook).

### Що моніторити (T+0 ... T+30 днів)

| Сигнал                                                                           | Норма                | Action при відхиленні                                                                                                              |
| -------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ai_memory_ingest_enqueued_total{mode="queued"}` rate                            | > 0 при mono-traffic | Якщо =0 при non-zero mono-traffic → master або per-source flag вимкнений; перевір Railway env.                                     |
| `ai_memory_ingest_enqueued_total{mode="source_disabled"}` rate                   | 0                    | > 0 означає `MONO_AI_MEMORY_INGEST_ENABLED=false` у Railway env; підтвердь, що це навмисний kill, інакше реверт.                   |
| `ai_memory_ingest_processed_total{outcome="ok"}` rate                            | ≈ enqueue rate       | `outcome="retry"`/`permanent_fail` spike → Voyage/pgvector incident, дивись [`docs/launch/tech/ai-memory-activation.md` § Outage]. |
| `ai_memory_ingest_queue_depth`                                                   | < 100 jobs steady    | Росте → Voyage rate-limit; знизити `AI_MEMORY_INGEST_CONCURRENCY` 4 → 2.                                                           |
| `SELECT count(*) FROM ai_memories WHERE inserted_at > now() - interval '7 days'` | ≥ 100 на T+30        | **< 100 на Day 30 → kill module** (див. нижче).                                                                                    |

### Day-30 decision-point query

Запускай раз на тиждень починаючи з Day 14 (forecast trend) і офіційно на Day 30:

```sql
-- Total rows за останні 7 днів — за source breakdown
SELECT
  source,
  count(*) AS rows_7d
FROM ai_memories
WHERE inserted_at >= now() - interval '7 days'
GROUP BY source
ORDER BY rows_7d DESC;

-- Глобальне число для decision-rule
SELECT count(*) AS rows_7d_total
FROM ai_memories
WHERE inserted_at >= now() - interval '7 days';
```

**Decision rule (PR-plan §Decision points):**

- `rows_7d_total >= 100` → **continue** — модуль виправдовує бюджет, переходимо у Phase 3 (recall optimisation, eval suite).
- `rows_7d_total < 100` → **kill** — виконати kill-procedure нижче.

### Kill procedure

Якщо Day-30 рішення — kill:

1. **Швидкий kill (≤30s):** `AI_MEMORY_ENABLED=false` у Railway → redeploy. `recall_memory` tool, RAG-injection і ingest все no-op-ять; existing data у `ai_memories` залишається.
2. **Видалення коду:** окремий PR `revert(server): rollback AI memory module (PR-19 Day-30 decision)`. Drop migrations НЕ робити одразу — лишити schema на місці ≥30 днів на випадок реверсу рішення.
3. **Документація:** позначити `AI_MEMORY_ENABLED` і `MONO_AI_MEMORY_INGEST_ENABLED` як `Killed YYYY-MM-DD` у [`docs/governance/feature-flags.md`](../governance/feature-flags.md); архівувати activation runbook у `docs/launch/tech/archive/`.
4. **Постмортем:** короткий `docs/learnings/ai-memory-kill-postmortem.md` із сигналами (`rows_7d` timeline, Voyage USD spend, top reasons for low adoption).

### Edge cases

- **Master `false`, sub-flag `true`:** найчастіший стан до активації; ingest no-op-ить, метрика `mode="disabled"`. **Не паніч** — це expected.
- **Master `true`, sub-flag `false`:** intentional selective kill. Метрика `mode="source_disabled"` росте, `mode="queued"`=0. Підтверди у Railway, що sub-flag навмисно вимкнено.
- **Spike у `mode="enqueue_error"`:** Redis incident або invalid source enum. Подивись pino-лог `ai_memory_ingest_enqueue_failed` / `ai_memory_ingest_invalid_source`.

## Як обробити Renovate PR із breaking change

Per [ADR-0044](../adr/0044-renovate-vs-dependabot.md), Renovate — primary tool для regular weekly bumps. Більшість PR-ів — devDep patches з auto-merge. Для **нон-trivial** PR-ів:

| Тип PR                                                       | Дія                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chore(deps): update <dev-dep> to v<patch>`                  | **Auto-merge** після зеленої CI. Не торкатися.                                                                                                   |
| `chore(deps): update <dev-dep> to v<minor>`                  | Прочитай PR title, swipe through diff, merge якщо CI ✅.                                                                                         |
| `chore(deps): update <prod-dep> to v<minor>`                 | Read changelog у PR body. Run `pnpm --filter @sergeant/server test` локально якщо це `apps/server` dep. Merge при ✅.                            |
| `chore(deps): update <prod-dep> to v<major>`                 | **Hands-on review.** Read changelog. Локальний run + manual smoke. Merge тільки після підтвердження що breaking-change уважно перевірений.       |
| `chore(deps): update group "anthropic/sentry/opentelemetry"` | Завжди manual review — ці групи pinned (initiative 0008 spec). Часто requires API-changes у consumers (`apps/server/src/lib/anthropic.ts` тощо). |
| **Duplicate PR** від `dependabot[bot]`                       | Закрий Dependabot-PR з коментарем `duplicate of Renovate group: <name>` (per ADR-0044).                                                          |
| **Security-PR від `dependabot[bot]`**                        | **High priority** — daily schedule навмисно. Auto-merge label `automerge-eligible` чи review за SLA.                                             |

Якщо breaking change ламає CI:

1. **Не push-ай force з patch-ем у Renovate-branch.** Renovate перепише, твої commit-и зникнуть.
2. Замість того, **закрий PR не merge-ивши**, склонуй branch локально, патчі в окремий branch на твою feature, відкриваєш свій PR. Renovate створить новий PR через тиждень — на той момент твій fix вже у main.

## Що таке SBOM і де його шукати на release

SBOM (Software Bill of Materials) — це machine-readable список **всіх** runtime-залежностей релізу, з версіями і integrity-хешами. З [Initiative 0008 Phase 4](../initiatives/archive/_0008-platform-hardening.md) на кожен release ми генеруємо два формати:

- **SPDX-JSON** (`sergeant-<tag>.spdx.json`) — NTIA-compliant, стандарт індустрії, читається `trivy sbom`, `grype`, `syft`.
- **CycloneDX-JSON** (`sergeant-<tag>.cdx.json`) — OWASP-стандарт, читається OWASP-Dependency-Track, JFrog Xray.

**Де знайти SBOM:**

1. **На GitHub Release page**: <https://github.com/Skords-01/Sergeant/releases/tag/v*>. Файли `*.spdx.json` і `*.cdx.json` прикріплені як assets.
2. **В Actions storage** (90 днів retention): Actions tab → workflow «Release SBOM» → run for the tag → Artifacts section.
3. **Регенерація для попереднього тегу**: Actions → Release SBOM → "Run workflow" → input `ref=v0.5.0` → Run. SBOM з'явиться як artifact (не attach-иться до Release якщо тригер manual).

**Як використовувати при CVE-disclosure:**

1. Завантаж SBOM з релізу що зараз у проді.
2. Запусти `trivy sbom sergeant-v<tag>.spdx.json` — отримуєш список CVE проти цього SBOM-snapshot-а.
3. Це **швидше** за full re-scan і відповідає на питання "is prod affected by this CVE" без redeploy.

**Compliance use-case:** аудитор просить SBOM → надсилаєш SPDX-файл з GitHub Release. Sigstore-signing буде Phase 3 ([I3-sbom-generation.md](../security/hardening/I3-sbom-generation.md) Phase 3 Open).

## RagQualityGateDegraded

**Що горить**: weekly `.github/workflows/rag-quality-gate.yml` зафіксував
mean `recall@4` < `warn_threshold` (default `0.5`), але ≥ `kill_threshold`
(default `0.4`). Eval-harness — 50-query golden-set
[`apps/server/src/__fixtures__/rag-eval/golden.json`](../../apps/server/src/__fixtures__/rag-eval/golden.json)
(8 domains, `expected_memory_ids` рефи). PR-21 ввімкне `--mode=live`
(real Voyage + pgvector retrieval); contract — `apps/server/src/lib/ragEval/
golden.ts`. Повна документація харнесу +
metric формули (recall@K / P@1 / MRR) + baseline-comparison: [`docs/
architecture/rag-eval.md`](../architecture/rag-eval.md).

**Рівень**: warn — RAG залишається ON, але є early-warning regression.

**Реакція**:

1. Відкрий artifact `rag-eval-summary` із workflow run-у. JSON містить
   `perDomain` breakdown і per-query recall. Знайди, де `mean` найнижчий
   (наприклад, `finyk: 0.32` vs `chat: 0.85` → проблема саме у finyk-
   ingestion).
2. Звір з `git log apps/server/src/modules/ai-memory/` за останні 7 днів:
   чи були changes у embeddings.ts / vectorStore.ts / `voyageEmbedProvider`?
   Bump `VOYAGE_EMBEDDING_MODEL` без re-embed-у — найчастіша причина drop-у
   (vector-spaces несумісні).
3. Перевір upstream Voyage status: https://status.voyageai.com.
4. Якщо ingestion-pipeline здоровий (логи Pino `level=info src.module=ai-memory`
   без spike-ів `level=error`) → це поступова деградація. Відкрий follow-up
   PR з тегом `ai-memory` для root-cause investigation.
5. Якщо metric не повертається у `pass` за 2 weekly run-и поспіль —
   ескалуй до `RagQualityGateKillSwitch` (нижче) до планового
   decision-point Day 60 (`pr-plan-2026-05.md`).
6. Якщо це **false-positive** через regression-у самого harness (наприклад,
   PR-20 змінив golden-set і expected-refs тепер невалідні) — close issue
   з labels `false-positive` + посилання на root-cause PR.

## RagQualityGateKillSwitch

**Що горить**: weekly eval зафіксував `recall@4` < `kill_threshold`
(default `0.4`). Це **decision-point Day 60** з
[`pr-plan-2026-05.md`](../planning/pr-plan-2026-05.md) — RAG потрібно
вимкнути до того, як це впливає на користувачів.

**Рівень**: critical — RAG injection у chat може повертати irrelevant
context-и, що деградує AI-відповіді.

**Реакція (immediate, <30 хв)**:

1. **Зараз же** — `AI_MEMORY_ENABLED=false` на Railway dashboard →
   redeploy. Це master kill-switch (`apps/server/src/env/env.ts:586`);
   після redeploy:
   - retrieval повертає `[]` без виклику Voyage/pgvector
     ([`apps/server/src/modules/ai-memory/service.ts`](../../apps/server/src/modules/ai-memory/service.ts));
   - ingestion-worker no-op-ує (BullMQ-jobs минають processing);
   - `/api/chat` працює без RAG-injection (`AI_MEMORY_RAG_TOP_K`
     ефективно стає `0`).
2. Перевір що kill-switch застосувався: `curl
https://<server>/health/workers` — `ai-memory-ingest` має бути `stopped`.
3. Створи incident-thread у `#alerts` (Telegram) з посиланням на issue
   - workflow run.
4. Артефакт `rag-eval-summary` → glance: чи це global regression (mean
   ↓ у всіх domain-ах) чи localized (один domain провалився)?
5. **Root-cause investigation** (<24h):
   - Чи був embedding-model bump (`VOYAGE_EMBEDDING_MODEL`) без
     re-embed-batch-у? → revert env + re-embed.
   - Чи був schema-зміна у `ai_memories` (CHECK-constraint, нова
     source)? → rollback міграції.
   - Чи був ingestion-change, що писав malformed content (e.g.,
     prompt-templates з placeholder-ами замість real text)? →
     revert ingestion PR.
6. Після root-cause fix → запусти eval manually:
   ```bash
   gh workflow run rag-quality-gate.yml \
     -f mode=mock  # або 'live' коли PR-21 зашиплений
   ```
   Якщо `status=pass` → revert kill-switch (`AI_MEMORY_ENABLED=true`)
   - close issue.
7. Якщо протягом 7 днів root-cause не знайдено / fix не закриває
   issue → формальне Day 60 рішення `kill module` (видалити PR-19/22
   pipeline, відкотити schema-changes; див. `pr-plan-2026-05.md`
   § Day 60 milestone).

**False-positive triage**: weekly eval у mock-mode завжди має mean=1.0.
Якщо в `mock`-mode прийшов `kill` — це bug у harness або у CLI math,
**не** у RAG-pipeline. Виправити harness першочергово, kill-switch не
вмикати.

## OpenTelemetry traces (server-side OTLP)

**Звідки:** [ADR-0035](../adr/0035-distributed-tracing-opentelemetry.md) shipped 2026-05-05 (initiative [0004 Phase 2 + 4](../initiatives/archive/_0004-server-observability.md)). Server `apps/server/src/obs/{tracing,spans,sampler}.ts` — NodeSDK + auto-instrumentation для `http`, `express`, `pg`, `redis`, `undici`. Web `packages/api-client/src/httpClient.ts` додає `traceparent` header у кожний fetch.

### Ввімкнення

OTel SDK реєструється тільки коли `OTEL_EXPORTER_OTLP_ENDPOINT` (або `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) встановлений. Без env-у — `aiSpan`/`dbSpan` працюють як no-op-обгортки (NoopTracer).

```bash
# Honeycomb
railway variables set OTEL_EXPORTER_OTLP_TRACES_ENDPOINT='https://api.honeycomb.io:443/v1/traces'
railway variables set OTEL_EXPORTER_OTLP_TRACES_HEADERS='x-honeycomb-team=hcaik_***,x-honeycomb-dataset=sergeant-prod'

# Grafana Cloud Tempo
railway variables set OTEL_EXPORTER_OTLP_TRACES_ENDPOINT='https://otlp-gateway-prod-eu-north-0.grafana.net/otlp/v1/traces'
railway variables set OTEL_EXPORTER_OTLP_TRACES_HEADERS='Authorization=Basic <base64(instanceId:apiKey)>'

# Tempo self-hosted
railway variables set OTEL_EXPORTER_OTLP_TRACES_ENDPOINT='http://tempo:4318/v1/traces'

# Опційно — після ввімкнення, щоб не платити двічі за server-side latency
railway variables set SENTRY_TRACES_SAMPLE_RATE='0'
```

Інші env-vars:

- `OTEL_SERVICE_NAME` — default `sergeant-api`.
- `OTEL_SERVICE_VERSION` — explicit; fallback на `SENTRY_RELEASE` → `RAILWAY_GIT_COMMIT_SHA` → `VERCEL_GIT_COMMIT_SHA` → `GITHUB_SHA`.
- `OTEL_TRACES_SAMPLE_RATE` — default 0.1 (10% для GET-non-AI). Health-routes завжди 0%, AI/write — завжди 100% (див. `apps/server/src/obs/sampler.ts`).

### Sampling матриця

| Маршрут                                                                                   | Decision                  | Чому                                                  |
| ----------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------- |
| `/livez`, `/readyz`, `/healthz`, `/startupz`                                              | 0%                        | Здоров'я-перевірки шумлять, нульова цінність у trace. |
| `/api/chat/**`, `/api/coach/**`, `/api/nutrition/**`, `/api/digest/**`, `/api/v1/chat/**` | 100%                      | AI-cost-візуалізація + p95 latency debug.             |
| `POST/PUT/PATCH/DELETE` на будь-якому маршруті                                            | 100%                      | Writes — критично для audit-trail-у.                  |
| `GET` на не-AI-маршруті                                                                   | `OTEL_TRACES_SAMPLE_RATE` | Default 0.1; configurable.                            |
| Будь-який маршрут із sampled-парентом                                                     | inherit (parent-based)    | W3C Trace Context — повага до upstream-decision-у.    |

### Privacy

`apps/server/src/obs/tracing.ts` має `HEADER_DENYLIST`: authorization, cookie, set-cookie, x-api-key, x-token, x-csrf-token, x-mono-webhook-secret, x-openclaw-webhook-secret, x-api-secret, x-internal-token, proxy-authorization. Auto-instrumentation редактує ці headers перед export. `aiSpan` НЕ пише prompt text у attributes — лише `gen_ai.system`, `gen_ai.request.model`, optional tokens та outcome.

### Troubleshooting

**Q: SDK init-лог є, але trace-и не приходять у backend.**
A: Перевірити `OTEL_EXPORTER_OTLP_TRACES_HEADERS` (чи правильні API-ключі). `BatchSpanProcessor` має internal-buffer — flush при graceful shutdown (`SIGTERM`/`SIGINT`); поки сервер живий, trace-и можуть затриматись на ~5 сек. Локально для debug — `OTEL_LOG_LEVEL=debug` env-var.

**Q: Pino logs показують `traceId`, але немає span-tree у backend.**
A: ALS-bridge у `apps/server/src/http/traceContext.ts` бере `traceId` навіть коли OTel SDK не запущений (із header `traceparent` або x-trace-id). Якщо є логи з `traceId` але немає span-у — означає, що OTel SDK не зареєструвавсь (env не виставлено) або sampler вирішив `NOT_RECORD`. Перевірити sampler-decision: `/livez` і `GET /api/finyk/transactions?` (при default rate) можуть НЕ семплюватись.

**Q: Sentry і OTel показують різні latency-картинки.**
A: Sentry web tracing і OTel server tracing — окремі трекери. Sentry використовує browser Performance API; OTel використовує express middleware. Розбіжність 5–15ms — нормально (різні точки вимірювання). Для unified-картинки — `SENTRY_TRACES_SAMPLE_RATE=0` на сервері + покладатись на OTel (Sentry web error-tracking залишається).

**Q: Anthropic-spans порожні (немає tokens, prompt_cache_hit).**
A: `aiSpan` отримує meta з `[result, meta]` tuple inner-функції. Якщо upstream API повернув error до того як `usage` був доступний — meta порожній. Перевірити `error.message` у span-status — там буде причина.

## WF-25 — Morning briefing cron (07:00 Kyiv → founder DM)

**Що це.** n8n cron-workflow [`25-morning-briefing-cron.json`](../../ops/n8n-workflows/25-morning-briefing-cron.json) щоранку о 07:00 Kyiv (`0 7 * * *`, `settings.timezone="Europe/Kyiv"`) дергає server endpoint [`POST /api/internal/openclaw/briefing/morning`](../runbooks/openclaw-morning-briefing.md) (PR-26), парсить `{markdown, data}`, паралельно запускає (а) запис у `n8n_webhook_events` через [`POST /api/internal/webhook-events/record`](../../apps/server/src/routes/internal/webhook-events.ts) і (b) DM founder-у через raw HTTP до `api.telegram.org/bot{OPENCLAW_BOT_TOKEN}/sendMessage`. LLM-summarization ще НЕ підключено — cron шле raw hardcoded-template markdown.

**Як monitorити.**

- **Healthy:** один Telegram DM від `@OpenClaw_sergeant_bot` щоранку ~07:00 Kyiv. Усі 5 секцій або `notConfigured: true` (env-var unset на API side) або з реальними даними.
- **Stuck pending:** `SELECT COUNT(*) FROM n8n_webhook_events WHERE workflow_id='25-morning-briefing-cron' AND processed_at IS NULL AND error IS NULL AND received_at < NOW() - INTERVAL '15 minutes';` — `> 0` означає, що `recordWebhookEvent` помітив запис, але PR-29 retention/replay-CLI ще не відмітив його як processed. На сьогодні `processed_at` для cron-ів ніколи не set — це експлуатаційний baseline; alert тільки коли `error IS NOT NULL`.
- **Telegram delivery fail:** перевір `error` рядок у `n8n_webhook_events`: якщо `OPENCLAW_BOT_TOKEN`/`OPENCLAW_FOUNDER_TG_USER_ID` не виставлені на n8n Railway → Telegram-нода поверне 401/400 (workflow продовжує завдяки `onError: continueRegularOutput`, але DM не дійшов). Аудит-row однакою INSERT-ний, видно у `SELECT * FROM n8n_webhook_events WHERE workflow_id='25-morning-briefing-cron' ORDER BY received_at DESC LIMIT 5;`.
- **Heartbeat:** WF-99 `*/3h` heartbeat дасть знати, що n8n живий навіть якщо WF-25 silent. WF-98 error-handler ловить runtime errors WF-25 через `errorWorkflow=iC82EFJzqBny9kxI` і ескалит у `#meta`.

**Як disable.**

- **На день/тиждень:** у n8n UI (`Sergeant Ops n8n`) → відкрий workflow `25 — Morning Briefing Cron (07:00 Kyiv → founder DM)` → toggle `Active` → OFF. Git-version залишає `active: false` для всіх workflow-ів, тому це не perdana — наступний `n8n:import` не reactivate-нe її.
- **Назавжди:** змінити `status` у `ops/n8n-workflows/manifest.json` з `"experimental"` на `"draft"` (або вилучити рядок) і видалити з `REPORTING-MATRIX.md`. У n8n UI workflow залишиться, але `pnpm n8n:export` напише `active: false` в git і `pnpm n8n:import` deactivate-нe.
- **Hot-disable без UI:** на n8n Railway встанови `OPENCLAW_FOUNDER_TG_USER_ID=""` — endpoint-call і audit-INSERT все ще пройдуть, але raw Telegram HTTP-call отримає `Bad Request: chat not found` і повідомлення тихо не доставиться. Audit-row у `n8n_webhook_events` лишиться, тому ти бачиш intentional-disable у логах.

**Env-vars на n8n Railway.**

| Var                           | Призначення                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| `PUBLIC_API_BASE_URL`         | Base URL до Sergeant API (`https://api.sergeant.app` / staging URL). |
| `INTERNAL_API_KEY`            | Bearer для `/api/internal/*` routes. Mathing з server-side env.      |
| `OPENCLAW_BOT_TOKEN`          | Token для `@OpenClaw_sergeant_bot` (cofounder bot, не alert bot).    |
| `OPENCLAW_FOUNDER_TG_USER_ID` | Telegram user_id founder-а (private DM target).                      |

API-side env-vars для briefing-секцій (Stripe / PostHog / GitHub / n8n / Sentry) — у [`docs/runbooks/openclaw-morning-briefing.md`](../runbooks/openclaw-morning-briefing.md). Якщо API-side env-var missing — briefing рендерить `notConfigured: true` hint у відповідній секції, cron виконується успішно.
