# ADR-0022: Atomic SQL daily quotas — `INSERT ... ON CONFLICT DO UPDATE WHERE`

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`apps/server/src/modules/chat/aiQuota.ts`](../../apps/server/src/modules/chat/aiQuota.ts) — middleware + `consumeQuota`/`refundConsumed`.
  - [`apps/server/src/migrations/002_ai_usage_daily.sql`](../../apps/server/src/migrations/002_ai_usage_daily.sql) — таблиця `ai_usage_daily`.
  - [`apps/server/src/migrations/004_ai_usage_daily_tool_bucket.sql`](../../apps/server/src/migrations/004_ai_usage_daily_tool_bucket.sql) — `bucket` колонка для tool-квот.
  - [`apps/server/src/obs/metrics.ts`](../../apps/server/src/obs/metrics.ts) — `aiQuotaBlocksTotal`, `aiQuotaFailOpenTotal`.
  - [`apps/server/src/http/rateLimit.ts`](../../apps/server/src/http/rateLimit.ts) — попередній шар (per-route rate-limit).
  - PR-історія: tool bucket [#774](https://github.com/Skords-01/Sergeant/pull/774), refund-on-fail [#760](https://github.com/Skords-01/Sergeant/pull/760).

---

## 0. TL;DR

Денна AI-квота в `ai_usage_daily` (`subject_key, usage_day, bucket, request_count`) інкрементується **одним атомарним SQL-стейтментом**:

```sql
INSERT INTO ai_usage_daily AS t (subject_key, usage_day, bucket, request_count)
VALUES ($1, $2::date, $3, $cost)
ON CONFLICT (subject_key, usage_day, bucket)
DO UPDATE SET request_count = t.request_count + EXCLUDED.request_count
  WHERE t.request_count + EXCLUDED.request_count <= $limit
RETURNING request_count;
```

Race-conditions не існує: PG ON CONFLICT — взаємовиключний per-row, отже два конкурентні `consumeQuota` не можуть разом перевищити ліміт. WHERE на `DO UPDATE` повертає 0 рядків при перевищенні → caller отримує `{ ok: false }`. Немає read-then-write, немає `SELECT FOR UPDATE`, немає optimistic-CAS-loops.

| Властивість    | Значення                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Subject        | `u:<userId>` (logged-in) або `ip:<request-ip>` (anonymous)                                                        |
| Bucket         | `default` (chat/coach/digest, cost=1) або `tool:<name>` (cost=`AI_QUOTA_TOOL_COST=3`)                             |
| Limits (env)   | `AI_DAILY_USER_LIMIT=120`, `AI_DAILY_ANON_LIMIT=40`, `AI_QUOTA_TOOL_LIMITS={...}`                                 |
| Refund         | `req.aiQuotaRefund?.()` при upstream-fail; idempotent; `GREATEST(0, count - cost)`                                |
| DB unavailable | Fail-open (return ok=true, log warn `aiQuotaFailOpenTotal`); upstream-rate-limit і per-route limit все одно діють |
| Day rollover   | UTC `today()` = `new Date().toISOString().slice(0,10)`; новий рядок щодня                                         |

---

## ADR-12.1 — Чому атомарний UPSERT, а не SELECT-FOR-UPDATE

### Status

accepted.

### Context

Класичний "read-modify-write" квоти має race:

```ts
// 🐛 Race-condition
const current = await pool.query(
  "SELECT request_count FROM ai_usage_daily WHERE …",
);
if (current + cost > limit) return { ok: false };
await pool.query(
  "UPDATE ai_usage_daily SET request_count = request_count + $cost …",
);
```

Між SELECT і UPDATE два конкурентні запити обидва бачать `current=119`, обидва вирішують «119+1<=120 OK», обидва INSERT-ять — фактичний count 121, ліміт 120 порушено.

Альтернативи фіксу:

1. **`SELECT FOR UPDATE`** — блокує row на дроговизну транзакції. Працює, але:
   - 2 RTT (SELECT + UPDATE) замість 1.
   - Збільшує lock contention при високому QPS (увесь pool чекає).
   - Якщо INSERT-нового рядка треба (юзер вперше за день) — `SELECT FOR UPDATE` нічого не лочить, race повертається.
2. **Application-level mutex (Redis SETNX, lock-server).**
   Додає інфру (Redis), яку Sergeant зараз не має у Railway-стеку.
3. **Optimistic-CAS loop:** `UPDATE … WHERE request_count = $stale RETURNING; якщо rows=0 → retry`. Працює, але loop у hot-path = неприйнятна complexity.
4. **Атомарний UPSERT з conditional `WHERE` на `DO UPDATE`** (наш вибір).

### Decision

**Один SQL-стейтмент:**

```sql
INSERT INTO ai_usage_daily AS t (subject_key, usage_day, bucket, request_count)
VALUES ($1, $2::date, $3, $cost)
ON CONFLICT (subject_key, usage_day, bucket)
DO UPDATE SET request_count = t.request_count + EXCLUDED.request_count
  WHERE t.request_count + EXCLUDED.request_count <= $limit
RETURNING request_count;
```

Семантика:

- **Якщо рядка немає** (юзер вперше за день у цьому bucket-і): `INSERT VALUES (...,$cost)` встав-аає рядок з `request_count = $cost`. Pre-check `cost > limit` (у JS-коді) покриває edge-case коли cost сам перевищує ліміт — без нього INSERT би вставив count > limit.
- **Якщо рядок існує:** `ON CONFLICT … DO UPDATE … WHERE count + cost <= limit` — UPDATE виконується тільки якщо новий count не перевищує. Якщо WHERE = false, `RETURNING` повертає 0 рядків → caller бачить `{ ok: false }` без додаткового SQL.
- **PG гарантує per-row exclusive lock** на час ON CONFLICT — два конкурентні запити серіалізуються per-row, ніколи не overflow-ять.

Один RTT, без application locks, без retry-loops.

### Consequences

**Позитивні:**

- 1 RTT — мінімальна latency на hot-path.
- Жодного race-condition — formally guarded by PG semantics.
- Простий fail-mode: 0 rows → blocked, інакше `remaining = limit - new_count`.
- Test-coverage у `aiQuota.test.ts` через `__aiQuotaTestHooks.consumeQuota` (~30 тестів, real Postgres у Testcontainers).

**Негативні:**

- WHERE на `DO UPDATE` — non-trivial PG-feature; не всі знайомі. Документуємо у doc-comment-коді (`apps/server/src/modules/chat/aiQuota.ts:306-316`).
- `INSERT ... ON CONFLICT DO UPDATE WHERE` теоретично залежить від PG-version (≥9.5 потрібно). Sergeant target — Postgres 16, OK.

### Alternatives considered

— Див. вище (SELECT FOR UPDATE, Redis lock, CAS-loop). Усі mathisi проблеми, наш UPSERT — найпростіший.

---

## ADR-12.2 — Subject keys: `u:<userId>` vs `ip:<request-ip>`

### Status

accepted.

### Context

Анонімний юзер (без login-у) має квоту нижчу (40 vs 120). Його ідентифікуємо за IP (`getIp(req)` з `apps/server/src/http/rateLimit.ts`, що враховує `X-Forwarded-For` від Railway proxy).

Питання: один IP — багато юзерів (corporate NAT, VPN), або один юзер — багато IP (mobile roaming).

### Decision

**Subject = `u:<userId>` коли є валідна Better-Auth сесія, інакше `ip:<request-ip>`.** Limits декларовані окремо:

- `AI_DAILY_USER_LIMIT=120` — вистачає для звичайного юзера на день (chat × 30, coach × 5, digest × 2, ще 80 на tool-вызовы).
- `AI_DAILY_ANON_LIMIT=40` — нижче, бо anonymous = більший ризик abuse.

NAT-сценарій: офіс на 50 людей за одним IP → одна анонімна квота 40 на 50 людей = 0.8 запиту per person. Якщо це реальний use-case — soft-suggest юзеру логінитись. UX-test показав, що anonymous trial → login conversion ~30% при ліміті 40 (досить, щоб юзер встиг зрозуміти продукт; недостатньо, щоб грати без logging).

VPN-сценарій (один юзер, IP rotation): юзер при login-і одразу переходить на `u:<userId>`, IP вже не лімітує. Anonymous-VPN-jumpers — edge case; ще не зустрічали abuse-ів.

`getIp(req)` обов'язково trustує `X-Forwarded-For` тільки від відомих proxy-IP (Railway гарантує), щоб клієнт не міг spoof-нути header.

### Consequences

**Позитивні:**

- Logged-in юзери отримують повну квоту, незалежно від мережі.
- Anonymous abuse ліцензований per-IP.

**Негативні:**

- NAT-fronted офіс — обмежений anonymous quota; рішення — login.
- IPv6 на mobile (один юзер змінює IP кожні кілька хвилин) — anonymous квота ефективно вища, але це OK (не плануємо anonymous-only fraud).

### Alternatives considered

1. **Hash-based device fingerprinting** для anonymous. Privacy-concern; не пишемо.
2. **Per-User-Agent throttle.** UA легко spoof-ається.

---

## ADR-12.3 — Buckets: `default` vs `tool:<name>`

### Status

accepted.

### Context

Tool-use AI-виклики (Anthropic tool-use API, where model викликає function на нашій стороні) дорожчі по token-у і по wall-clock — типово 2-5 RTT proxy + parsing parallel-tools. Якщо вони витрачали б одне квоту з chat-у, юзер за 30 chat-турнів + 30 tool-турнів вичерпував би ліміт за хвилини.

### Decision

**`bucket` колонка** (додано migration `004_ai_usage_daily_tool_bucket.sql`):

- `default` — звичайний chat / coach / digest / nutrition-AI (cost=1).
- `tool:<name>` — окремий tool-use виклик (cost=`AI_QUOTA_TOOL_COST=3`, конфігуровано env-var-ом).

Per-tool-limits через `AI_QUOTA_TOOL_LIMITS` (JSON-env: `{"analyze_workout": 20, "rephrase_recipe": 50}`). Якщо tool не у map-і — `AI_QUOTA_TOOL_DEFAULT_LIMIT` (default `null` = unlimited у межах загального user-quota).

PRIMARY KEY → `(subject_key, usage_day, bucket)`. Один юзер на один день має ≥1 рядок (один на bucket).

### Consequences

**Позитивні:**

- Можна окремо лімітувати дорогі tool-и (наприклад, `analyze_workout` — 20/день), не заважаючи звичайному chat-у.
- Cost=3 (configurable) дає запас на fairness.
- Метрика `aiQuotaBlocksTotal{bucket=...}` дозволяє діагностувати, який bucket найчастіше блокує юзерів.

**Негативні:**

- Один юзер за день може мати 5-10 рядків (default + кілька tool-bucket-ів). Не проблема для розміру таблиці (~100 KB на 10k DAU/day).
- Cost-конфігурацію потрібно тримати документованою (env-var у `.env.example`).

### Alternatives considered

1. **Cost=1 для всіх викликів.** Просто, але tool-use токенів-то набагато більше; через 10 викликів `analyze_workout` юзер пожирає квоту, призначену для 30 chat-турнів.
2. **Окрема таблиця `ai_usage_tool_daily`.** Дублює інфру.

---

## ADR-12.4 — Refund on upstream failure

### Status

accepted.

### Context

Якщо ми списали квоту, потім Anthropic повернув 500 — фактично юзер заплатив запитом за невдалий результат. Без refund-у — повторно retry юзер витрачає 2 кваті при одному успішному запиті.

### Decision

**Idempotent refund-closure атачиться на `req`:**

```ts
(req as Request & WithAiQuotaRefund).aiQuotaRefund = async () => {
  if (used) return;
  used = true;
  await refundConsumed(ticket);
};
```

Handler у разі upstream-fail (Anthropic 5xx/timeout/client disconnected) викликає `req.aiQuotaRefund?.()`. Idempotent — другий виклик no-op.

`refundConsumed` SQL:

```sql
UPDATE ai_usage_daily
   SET request_count = GREATEST(0, request_count - $cost)
 WHERE subject_key = $1 AND usage_day = $2::date AND bucket = $3
```

`GREATEST(0, ...)` захищає від:

- Day rollover (стара квота вже скинута новим рядком).
- Подвійного refund-а (якщо `if (used)` обходиться).
- Refund-а на квоту, яка вже manually-reset-нута (admin tool).

Refund **не throw-ить** — refund-а помилка не може ламати response юзеру (там і так уже error-path).

### Consequences

**Позитивні:**

- Юзер не платить за upstream-fail.
- Idempotent — закриває крайові випадки.
- `GREATEST(0, ...)` — захист від negative count.

**Негативні:**

- 2-й RTT (consume + refund). Тільки на error-path, коли user уже бачить error → +50ms latency погоди не робить.

### Alternatives considered

— **Не lim-ити upfront, а post-hoc** (consume після успішного response). Спокусливо, але ламає race-condition guarantee: 2 паралельні запити обидва побачили `count<limit`, обидва дозволилися, обидва успішно завершились — count перевищено.

---

## ADR-12.5 — Fail-open при недоступності DB

### Status

accepted.

### Context

При `DATABASE_URL` undefined (dev mode без Postgres) або PG-down (Railway DB incident) — що робити? Вирубити всі AI-фічі? Дозволити необмежено?

### Decision

**Fail-open.** При:

- `process.env.DATABASE_URL` undefined,
- `ECONNREFUSED` / `ENOTFOUND` / `aiQuotaFailOpenTotal`-ECONNECTION error-codes,
- table doesn't exist (relation `ai_usage_daily` does not exist),

`consumeQuota` повертає `{ ok: true, remaining: null, limit: null, reason: 'store_unavailable' }`. Метрика `aiQuotaFailOpenTotal` інкрементується для дашбордів.

Argument: **upstream Anthropic rate-limit + per-route rate-limit** (`apps/server/src/http/rateLimit.ts`) обмежують QPS незалежно від quota. Найгірший сценарій fail-open під PG-incident — юзер витрачає upstream limit (Anthropic-tier), а не наш daily-cap. Acceptable trade-off vs повного простою AI-фіч.

### Consequences

**Позитивні:**

- DB-incident не валит AI-фічі. Юзер бачить нормальну роботу.
- `aiQuotaFailOpenTotal` метрика → on-call-alert.

**Негативні:**

- Під час incident-а юзер може зробити більше запитів, ніж daily-cap. Anthropic-bill зросте незначно (per-tier limit все одно).
- Якщо incident триває тиждень — недостатньо protection. Mitigation: alert на `aiQuotaFailOpenTotal > 0` для negotiations DB-team.

### Alternatives considered

1. **Fail-closed (deny all AI under DB-incident).** Юзеру невдоволення, support-flood.
2. **In-memory fallback counter.** Переноситься між інстансами Railway (horizontal scale → counter сегментується). Ускладнення з малою віддачею.

---

## Implementation status

- ✅ Migration `002_ai_usage_daily.sql` — таблиця.
- ✅ Migration `004_ai_usage_daily_tool_bucket.sql` — `bucket` колонка.
- ✅ `aiQuota.ts` middleware (~400 LOC) + `__aiQuotaTestHooks` для unit-тестування.
- ✅ Integration-тести (`aiQuota.test.ts`) проти real Postgres у Testcontainers.
- ✅ Метрики `aiQuotaBlocksTotal{bucket,outcome}`, `aiQuotaFailOpenTotal`.
- ✅ Refund-on-fail (`req.aiQuotaRefund`) інтегровано у chat / coach / digest / nutrition handler-и.
- ⏳ Адмін-tool на reset квоти конкретного юзера (поки немає; SQL-update вручну).
- ⏳ Dashboard у Grafana (шаблон у `apps/server/grafana/`).

## Open questions

- **Quota peryload-aware.** Зараз `cost=1`/`cost=3` константно. Логічно було б weight-увати по фактичних token-ах (input + output). Не робимо: ускладнить `req.aiQuotaRefund` (треба знати фактичний cost), token-count Anthropic повертає в response — добавляється post-call-update step. Можливо в наступній ітерації.
- **Per-feature quotas** (наприклад, "weekly digest — max 10 generation per week"). Може жити в тій самій таблиці з `bucket = 'feature:weekly_digest'` і кастомним `usage_day` (тиждень-key). Поки не реалізовано — feature-quotas hard-coded у scheduler-ах.
- **Multi-region.** При Railway-горизонтальному масштабуванні всі інстанси дивляться в один Postgres → атомарність зберігається. Якщо колись пере-кочуємо на multi-region (read-replicas) — `consumeQuota` має йти у primary; це доку поточної архітектури, OK.
