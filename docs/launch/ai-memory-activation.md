# AI Memory — activation runbook

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Active

Як перевести pgvector AI memory підсистему з dormant у production-active після
landing PR1 (foundation) + PR2 (ingestion) + PR3 (retrieval). Усі три PR-и
змержені dormant: `AI_MEMORY_ENABLED=false` за замовчуванням → `remember()` /
`recall()` no-op-лять без HTTP до Voyage / БД, нема ніяких side-effects.

ADR — [`docs/adr/0028-pgvector-ai-memory.md`](../adr/0028-pgvector-ai-memory.md).
Інтеграційний doc — [`docs/integrations/voyage-pgvector.md`](../integrations/voyage-pgvector.md).

---

## Pre-flight checklist

Перед першим toggle-ом:

- [ ] **Voyage rate-limit + billing.** Підтвердити, що Voyage акаунт має
      достатній quota: на горизонті 1k активних × 500 memories/міс × 200 tokens
      ≈ 100M tokens/міс ≈ **~$2/міс**. Free tier дає 50M tokens/міс — достатньо
      для пілоту, але прод-rollout потребує paid акаунту. Dashboard:
      <https://dash.voyageai.com/>.
- [ ] **pgvector extension у Railway Postgres.** Перевірити, що міграція 025
      (`025_ai_memories_pgvector.sql`) виконана на prod-БД:
      `SELECT to_regclass('ai_memories');` має повернути не-null.
      Якщо null — `pnpm --filter @sergeant/server db:migrate` спочатку.
- [ ] **Anthropic prompt cache warm-up budget.** `SYSTEM_PROMPT_VERSION v6→v7`
      інвалідує cache на першому request-і кожного активного юзера після
      deploy. Очікуваний spike: ~5хв elevated cost (≈ $1–2 на 1k активних).
- [ ] **Redis BullMQ доступний.** Ingestion-черга `ai-memory-ingest`
      (Redis-keys під `sergeant:` prefix-ом) потребує Redis. Якщо
      `REDIS_URL` відсутній — fallback на in-process dispatch (працює,
      але без retry-семантики).
- [ ] **Метрики dashboard.** Налаштувати Grafana panel-и для
      `ai_memory_ingest_*` (PR2) і `voyage_external_http_*` (PR1) метрик.

---

## Activation steps

### Step 1. Provision `VOYAGE_API_KEY` (Railway)

1. Створити прод-API-ключ на <https://dash.voyageai.com/api-keys>. Назва
   рекомендована: `sergeant-prod` (для traceability у Voyage billing).
2. У Railway dashboard для сервісу `hub-api`:
   - Variables → New Variable
   - Name: `VOYAGE_API_KEY`
   - Value: `pa-...` (без quotes, без trailing whitespace)
   - Service: `hub-api` тільки (НЕ `hub-web` — клієнт не дзвонить Voyage).
3. **Redeploy не потрібен** — Voyage-клієнт читає env при першому виклику
   `recall()` / `remember()`. Якщо `AI_MEMORY_ENABLED=false`, ключ читається
   тільки коли flag вмикається (Step 2).

### Step 2. Toggle `AI_MEMORY_ENABLED=true` (Railway)

1. У Railway dashboard для `hub-api`:
   - Variables → знайти `AI_MEMORY_ENABLED` → Edit
   - Value: `true`
2. Railway автоматично redeploy-ить сервіс (~30s). Це **хот toggle** —
   жодних DDL змін не відбувається.
3. **Верифікація:** після redeploy зробити sanity-curl з production-сесією:
   ```bash
   curl -X POST https://sergeant-production.up.railway.app/api/ai-memory/recall \
     -H "Cookie: better-auth.session_token=<token>" \
     -H "Content-Type: application/json" \
     -d '{"query":"тест активації memory","top_k":3}'
   ```
   Очікуваний результат: 200 з `{"memories":[]}` (порожньо, бо ще ніхто
   нічого не зберігав). Якщо 503 з `EMBEDDING_PROVIDER_UNAVAILABLE` →
   ключ не підхопився → перевірити Step 1.

### Step 3. Enable per-source ingestion (за бажанням, поетапно)

Master-flag `AI_MEMORY_ENABLED=true` сам по собі ще не починає писати у
`ai_memories`. Producer-и керуються окремими прапорцями:

| Producer                                                             | Flag                             | Default | Що робити                                                  |
| -------------------------------------------------------------------- | -------------------------------- | ------- | ---------------------------------------------------------- |
| `mono/webhook`                                                       | `MONO_AI_MEMORY_INGEST_ENABLED`  | `false` | Виставити `true` коли готові індексувати транзакції        |
| `weekly-digest`                                                      | _no flag_ — auto-on після master | —       | Перший digest-cron запише через ~24h                       |
| `POST /api/ai-memory/ingest` (chat/fizruk/nutrition/routine/journal) | _no flag_ — клієнт-driven        | —       | Web-/mobile-клієнти будуть викликати, як зараз заплановано |

**Рекомендований порядок (дні 1–7 після Step 2):**

- **День 1.** Тільки master-flag. `recall()` працює (через `recall_memory`
  HubChat tool + RAG-injection), але `ai_memories` порожня → жодних
  results. Це **safe rollout** — перевіряємо латенцію Voyage embed без
  write-навантаження на БД.
- **День 2–3.** Увімкнути `MONO_AI_MEMORY_INGEST_ENABLED=true`. Спостерігати
  `ai_memory_ingest_processed_total{source="finyk", outcome=...}` — має
  ростити `ok` метрику на кожній mono-webhook-транзакції.
- **День 4–7.** Спостерігати `ai_memory_ingest_queue_depth` — має триматися
  низькою (< 100 jobs). Якщо росте → Voyage rate-limit-ить (`429`) →
  знизити `AI_MEMORY_INGEST_CONCURRENCY` з 4 до 2.

### Step 4. End-to-end smoke test

Після Step 3, день 7+: перевірити, що memory повертається через chat.

1. У web/mobile-клієнті як test-user-а зробити фінансову транзакцію через
   Mono-webhook (потрібно нову, щоб точно відіндексувалась після Step 3).
2. Чекати ~5–30 секунд (BullMQ + Voyage embed).
3. Відкрити HubChat і запитати: «нагадай мою останню транзакцію».
4. **Очікуваний flow:**
   - RAG-injection додає в system prompt блок `[Релевантні спогади:]`
     з топ-4 memory-фактами (видно у `apps/server/src/modules/chat/chat.ts`
     debug-логах: `rag_context_built` з `count`).
   - Anthropic може власноруч викликати tool `recall_memory` для
     уточнення → `POST /api/ai-memory/recall` → top-K results.
5. Якщо асистент відповідає з реальними даними транзакції — flow працює.
   Якщо відповідає generic-text-ом — перевірити логи Pino:
   - `rag_context_skipped` з `reason=*` — короткий query / немає user-id
   - `rag_context_failed` — Voyage timeout / 5xx → no-op fallback працює
   - `recall_memory_called` — tool-call успішний

---

## Rollback / kill-switch

Якщо щось пішло не так:

1. **Швидкий kill (≤30s):** `AI_MEMORY_ENABLED=false` у Railway → redeploy.
   Усі гілки (`recall_memory` tool, RAG-injection, ingestion-producer-и)
   no-op-лять негайно. Existing data у `ai_memories` лишається — нема
   destructive truncate.
2. **Selective ingestion kill:** залишити master-flag, виставити
   `MONO_AI_MEMORY_INGEST_ENABLED=false` — finyk-source перестає писати,
   решта продовжує. Корисно якщо Mono-webhook генерує 429 на Voyage.
3. **Voyage outage:** circuit-breaker сам розмикається після 3 послідовних
   5xx. Метрика `voyage_external_http_breaker_state` = `open` → ingestion
   park-иться у BullMQ retry-черзі, retrieval повертає 503 (graceful).
   Жодних додаткових toggle-ів не треба.
4. **GDPR forget-user-request:** `forgetUser(userId)` працює **незалежно**
   від master-flag-а — це GDPR escape-hatch. `DELETE /api/me` (Better Auth)
   вже cascade-ить через FK `ON DELETE CASCADE`.

---

## Observability checklist

Після активації моніторити:

| Метрика                                                      | Поріг алерту                     | Де дивитись                       |
| ------------------------------------------------------------ | -------------------------------- | --------------------------------- |
| `voyage_external_http_requests_total`                        | `outcome=error` > 5% — alert     | Grafana `Voyage` panel            |
| `voyage_external_http_breaker_state`                         | `open` > 5min — alert            | Grafana `Voyage` panel            |
| `ai_memory_ingest_queue_depth{state="waiting"}`              | > 1000 sustained — alert         | Grafana `AI memory` panel         |
| `ai_memory_ingest_processed_total{outcome="permanent_fail"}` | > 1% — alert                     | Grafana `AI memory` panel         |
| `http_request_duration_ms{path="/api/chat"}` p95             | +500ms vs baseline — investigate | Grafana `HTTP` panel              |
| Voyage billing                                               | $50/міс — soft cap               | <https://dash.voyageai.com/usage> |

Дашборд-панелі ще не створені — окремий PR (див. roadmap нижче).

---

## Redis startup configuration

`Sergeant.redis` (Railway service `humorous-eagerness/redis`,
id `51da2282-8cf4-47bb-b632-92e060704b78`) хостить BullMQ-стейт двох черг
(`auth-mail`, `ai-memory-ingest`, prefix `sergeant:`) і rate-limit
counters. Конфігурація задається у `startCommand` сервіс-інстансу
(`production` env, id `81b68dcb-0107-44ba-b719-df445ea71c71`) — у репо її
немає, бо Redis провіжнений з template-image `redis:7-alpine` без
own-Dockerfile-у.

**Поточний `startCommand` (2026-05-02):**

```sh
sh -c 'exec redis-server \
  --requirepass "$REDIS_PASSWORD" \
  --maxmemory 200mb \
  --maxmemory-policy noeviction \
  --appendonly no \
  --save ""'
```

**Чому `noeviction`, а не `allkeys-lru`:** BullMQ docs
(<https://docs.bullmq.io/guide/going-to-production#maxmemory-policy>) явно
вимагають `noeviction`. Із `allkeys-lru` Redis під memory-pressure може
evict-ити enqueued jobs до того, як worker їх підхопить — це viewable
data-loss всередині черги (job було записано, але worker його ніколи не
побачить). Спочатку (2026-05-02) Redis підняли з default-template
`--maxmemory-policy allkeys-lru` → BullMQ при connect-і логував warning. У
той самий день переключили через Railway GraphQL `serviceInstanceUpdate` +
`serviceInstanceRedeploy`. Тепер worker-и логують лише
`bullmq_connection_ready` без warning-у.

**Як змінити повторно:**

```sh
RAILWAY_TOKEN="…" \
  ENVIRONMENT_ID="81b68dcb-0107-44ba-b719-df445ea71c71" \
  SERVICE_ID="51da2282-8cf4-47bb-b632-92e060704b78"

curl -sS -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation Q(\$eid: String!, \$sid: String!, \$cmd: String!) { serviceInstanceUpdate(environmentId: \$eid, serviceId: \$sid, input: { startCommand: \$cmd }) }\",\"variables\":{\"eid\":\"$ENVIRONMENT_ID\",\"sid\":\"$SERVICE_ID\",\"cmd\":\"<новий startCommand>\"}}"

curl -sS -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation Q(\$eid: String!, \$sid: String!) { serviceInstanceRedeploy(environmentId: \$eid, serviceId: \$sid) }\",\"variables\":{\"eid\":\"$ENVIRONMENT_ID\",\"sid\":\"$SERVICE_ID\"}}"
```

**Verify:** `curl -sS https://sergeant-production.up.railway.app/healthz |
jq .checks.redis` має повертати `connected: true, reconnectAttempts: 0`,
а Sergeant logs — `redis_connected` + `bullmq_connection_ready` без
`Eviction policy is allkeys-lru` warning-у.

**Persistence trade-off:** `--appendonly no --save ""` означає, що Redis
ephemeral — на restart-і всі in-flight BullMQ jobs губляться. Для нашого
use case (finyk → ingest, weekly digest, auth-mail) це OK: продюсери
ретраяться (`mono-webhook` re-fires, `weekly-digest` cron-працює щонеділі).
Якщо колись захочемо durability — окремий PR з recreate volume + chown.

---

## Roadmap після активації

Технічні TODO, які не блокують rollout, але треба підбити:

- **ESLint guard** — заблокувати direct-import з `vectorStore.ts` /
  `embeddings.ts` через `@typescript-eslint/no-restricted-imports` у
  `eslint-plugin-sergeant-design`. TODO зафіксований в [ADR-0028 § Compliance](../adr/0028-pgvector-ai-memory.md#compliance).
- **Re-embed worker (PR2.1)** — batch-job для re-embed-у при зміні
  `voyage-3.5-lite` / `embedding_version`.
- **Prometheus dashboard** — рознести `ai_memory_*` і `voyage_external_http_*`
  у окрему Grafana-панель.
- **PR4: hybrid hot/cold storage** — `user_memory_summaries` + pgvector
  тільки для hot 90 днів. Threshold-и в [ADR-0028 § Scaling thresholds](../adr/0028-pgvector-ai-memory.md#scaling-thresholds).
  Не зараз — потрібно для >100k активних юзерів.

---

## Related

- [ADR-0028: pgvector + Voyage embeddings](../adr/0028-pgvector-ai-memory.md)
- [Voyage AI + pgvector integration doc](../integrations/voyage-pgvector.md)
- [Feature flags registry](../feature-flags.md)
- [Observability runbook](../observability/runbook.md)
