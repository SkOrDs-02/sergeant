# Observability-runbook

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
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

> Ці секції додані разом з [Initiative 0008](../initiatives/0008-platform-hardening.md). Це не алерт-runbook-и (вони вище), а оперативні how-to для повторюваних situations які виникли разом з новою інфраструктурою (probes, rate-limit headers, Renovate, SBOM).

## Як інтерпретувати 429-алерт у Grafana

Алерт `AuthRateLimitSpike` (вище) показує загальний rate. Для **глибшого** аналізу:

1. **Подивись `RateLimit-*` headers** на response-zі. З [Initiative 0008 Phase 2](../initiatives/0008-platform-hardening.md) сервер emit-ить:
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

З [Initiative 0008 Phase 1](../initiatives/0008-platform-hardening.md) Sergeant exposед три probes:

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

SBOM (Software Bill of Materials) — це machine-readable список **всіх** runtime-залежностей релізу, з версіями і integrity-хешами. З [Initiative 0008 Phase 4](../initiatives/0008-platform-hardening.md) на кожен release ми генеруємо два формати:

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

## OpenTelemetry traces (server-side OTLP)

**Звідки:** [ADR-0035](../adr/0035-distributed-tracing-opentelemetry.md) shipped 2026-05-05 (initiative [0004 Phase 2 + 4](../initiatives/0004-server-observability.md)). Server `apps/server/src/obs/{tracing,spans,sampler}.ts` — NodeSDK + auto-instrumentation для `http`, `express`, `pg`, `redis`, `undici`. Web `packages/api-client/src/httpClient.ts` додає `traceparent` header у кожний fetch.

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
