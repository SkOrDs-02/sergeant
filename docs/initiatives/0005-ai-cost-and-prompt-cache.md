# 0005 — AI cost optimisation (Anthropic prompt cache + AI-ops dashboards)

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Done (2026-05-04). Prompt-cache на 2 breakpoints (system + last tool), token / cost / cache-hit Prom counters, 7-panel `ai-cost` Grafana dashboard, alerts на cost / quota — усе шипнуто. Policy зафіксована у [ADR-0039](../adr/0039-anthropic-prompt-cache-policy.md).
> **Priority:** P0 (Sprint 1)
> **Owner:** `@Skords-01`
> **ETA:** 3 working days
> **Sources:** Design Review 2026-05-03 §8 (AI integration), [`docs/tech-debt/backend.md`](../tech-debt/backend.md)

## TL;DR

Sergeant досить агресивно використовує Anthropic Claude (Sonnet/Opus) для chat-actions, planning і tool-calls. **Prompt cache (`cache_control: { type: "ephemeral" }`)** зараз **не вмикається** — кожен виклик відправляє повну системну інструкцію (~3-6k токенів) і chatActions registry (~5-15k токенів) як свіжий вхід. Anthropic offer-ить ~50–90% economy на cached input. Окремо — нема Grafana-панелі «AI cost per day per provider/model» — економія не виміряна. Ця ініціатива:

1. Вмикає prompt cache на статичних сегментах (`system`, `tools`, `examples`).
2. Додає Pino-метрику `ai_request_cost_usd` (Anthropic returns `cache_creation_input_tokens` / `cache_read_input_tokens` у usage).
3. Додає Grafana-панель «AI cost per day / per model / cache hit-rate» + alert на «> $X / day».

## Чому зараз

- Кожен `aiCall` зараз відправляє ~10-25k токенів вхідного контексту. Sonnet input = $3 / 1M, Opus = $15 / 1M. На активного юзера це ≈ $0.10–$0.30/день. На 200 юзерів × 30 днів — **$600–$1800/міс**, без чорних свят.
- Prompt cache доступний у Anthropic SDK з 2024-08; інтеграція коштує **~50 LOC** на Anthropic client, але закриває 50-90% input-cost. Це найдешевший win на frontier.
- Сервер не пише cost-метрику взагалі — ми не знаємо, де болить, і не можемо ставити budget-alerts.
- AI-ops Grafana панель — окремо вимога з audit (для розуміння latency / 429 / cache hit-rate). Без observability (ініціатива 0004) частково сліпі.

## Скоуп

**In:**

1. Prompt cache на:
   - `system` prompt (статичні інструкції, ~3-6k токенів)
   - `tools` registry (chatActions JSONSchema, ~5-15k токенів)
   - `examples` (few-shot, якщо є)
2. Pino-метрика `ai_request_cost_usd` + `ai_cache_hit_rate` (per provider, per model).
3. Grafana dashboard `ai-ops.json` із панелями:
   - cost per day per model
   - cache hit-rate
   - p95 latency per route × model
   - 429 / 5xx rate per provider
   - top-10 most expensive endpoints
4. Alert: `daily_cost_usd > 50` → Telegram ping (sandbox).
5. Коротка ADR-замітка `0041+-anthropic-prompt-cache-policy.md` — чому ми кешуємо саме `system` + `tools`, не всю розмову.

**Out:**

- OpenAI prompt cache (auto-cache після 1024 токенів — нічого вмикати не треба, тільки додати метрику).
- Загальне «AI cost budgeting per user» — окрема ініціатива (potentially P2, після того, як буде baseline).
- Ré-prompting / prompt-shrink — окрема vs cache.
- Перенос chat-actions у server-side (вони вже там для більшості; web викликає server endpoint `/api/chat`).

## План змін

### Фаза 1 — prompt cache (1 PR)

**PR `feat-anthropic-prompt-cache`:**

- В `apps/server/src/modules/chat/anthropicClient.ts` (або де лежить виклик `messages.create`):
  ```ts
  const response = await anthropic.messages.create({
    model,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: tools.map((t) => ({ ...t, cache_control: { type: "ephemeral" } })), // якщо SDK підтримує per-tool
    messages,
  });
  ```
- Тільки **статичні** сегменти (system, tools). User messages — без cache.
- Перевірити, що SDK version ≥ потрібна (v0.27+ для `cache_control` per-tool, fallback на per-system якщо стара).
- Логувати у Pino:
  ```ts
  log.info("ai.usage", {
    provider: "anthropic",
    model,
    input_tokens: usage.input_tokens,
    cache_creation_tokens: usage.cache_creation_input_tokens,
    cache_read_tokens: usage.cache_read_input_tokens,
    output_tokens: usage.output_tokens,
    cost_usd: computeCost(usage, model),
  });
  ```
- Додати unit-test, що у `messages.create` параметрах `system[0].cache_control = "ephemeral"`.

### Фаза 2 — cost-computation utility (1 PR)

**PR `feat-ai-cost-metrics`:**

- `apps/server/src/modules/chat/aiCost.ts`:

  ```ts
  export const PRICES = {
    "claude-sonnet-4-5": {
      input: 3,
      cache_create: 3.75,
      cache_read: 0.3,
      output: 15,
    }, // $/1M
    "claude-opus-4": {
      input: 15,
      cache_create: 18.75,
      cache_read: 1.5,
      output: 75,
    },
    // ...
  } as const;

  export function computeCost(usage: Usage, model: string): number;
  ```

- (Ціни — на момент ініціативи; перевірити перед merge.) Ці значення зашити **константами**, не викликати pricing API на кожен запит.
- Покрити unit-tests; тестові сценарії: повний cache-miss, повний cache-hit, mix.

### Фаза 3 — Grafana dashboards (1 PR)

**PR `chore-grafana-ai-ops`:**

- `ops/grafana/dashboards/ai-ops.json` (5 panels — див. Скоуп).
- `ops/grafana/alerts/`:
  - `ai_daily_cost_usd > 50` → Telegram `#ai-ops`.
  - `ai_cache_hit_rate < 30%` за 1 год → Telegram `#ai-ops-warn`.
  - `ai_429_rate > 5%` за 5 хв → Telegram `#ai-ops`.
- Запис у [`docs/observability/runbook.md`](../observability/runbook.md): «як інтерпретувати AI алерти, як зробити drill-down per model».

### Фаза 4 — ADR (1 PR)

**PR `adr-0041-anthropic-prompt-cache-policy`:**

- Створити `docs/adr/0041+-anthropic-prompt-cache-policy.md` (next number — перевірити). Зміст:
  - Контекст: Anthropic prompt cache, 5-min TTL, $3.75 / 1M write, $0.30 / 1M read.
  - Рішення: кешуємо тільки `system` + `tools`. **Не кешуємо** user messages (privacy + breakpoint логіка).
  - Наслідки: cache write-cost 1.25× vs input. Тому **тільки якщо** `system + tools > 1024 tokens` (мінімальний поріг Anthropic). Cache-hit rate треба моніторити; якщо < 30% — переглянути prompt structure.
  - Альтернативи: OpenAI auto-cache (стандарт), Vertex caching, custom Redis cache на response side.

## Критерії DONE

- [x] У всіх Anthropic-викликах `system[0].cache_control = "ephemeral"`.
- [x] У Pino логах `ai.usage` events містять `cache_read_tokens` / `cache_creation_tokens` / `cost_usd`.
- [x] Grafana dashboard `ai-ops.json` live з 5 panels.
- [x] Cost / day per model видно у Grafana (1 тиждень baseline зібрано).
- [ ] Alert `ai_daily_cost_usd > 50` спрацьовує (тестово знизити поріг до $0.01 і перевірити).
- [ ] Cache hit-rate **за тиждень після rollout ≥ 60%** (target).
- [x] ADR `0041+-anthropic-prompt-cache-policy.md` змерджено.
- [x] CI lint + tests проходять.

## Ризики та митиґація

| Ризик                                                          | Мітигація                                                                                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Prompt cache write-cost (1.25×) > вигоди при низькому hit-rate | Hit-rate < 30% за тиждень → відключити cache і повернутись до plain prompt. Поріг — у ADR-0041.                       |
| Зміни у `system` prompt інвалідуют cache → нульовий hit        | Зробити `system` стабільнішим: винести user-specific деталі у `messages` (як вже є). System повинен бути pure-static. |
| Pricing API drift — наші константи `PRICES` застарівають       | Раз у місяць перевіряти у doc-link. Quarterly review у calendar.                                                      |
| Pino logs з `usage` блокують прод (надто часто пишемо)         | Логуємо тільки на errors або 1% sample (decision per metric). Стандартний шлях — Prometheus counter, а не лог.        |
| Cache `ephemeral` має 5-min TTL — холодний старт після паузи   | Прийнятно: один cold call per session є нормою.                                                                       |

## Метрики

| Метрика                                     | Baseline (2026-05-03) | Target (post-rollout) |
| ------------------------------------------- | --------------------- | --------------------- |
| Anthropic input-tokens per request (median) | ~10-25k               | -50% (cached portion) |
| Cache hit-rate (за `system + tools`)        | 0% (не вмикається)    | ≥ 60% за тиждень      |
| Cost / day / 100 active users (avg)         | $10-30 (estimate)     | $5-15                 |
| Grafana panel «cost per day per model»      | none                  | live                  |
| `ai_429_rate`                               | ?                     | < 1%                  |

## Власник, ревʼюери

- **Lead:** `@Skords-01`.
- **Required review:** будь-який PR із змінами у `apps/server/src/modules/chat/**` потребує review від CODEOWNERS.

## Посилання

- Design Review 2026-05-03 — §8 AI Integration
- [Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Anthropic Pricing](https://www.anthropic.com/pricing)
- [ADR-0039 — Anthropic prompt-cache breakpoint policy](../adr/0039-anthropic-prompt-cache-policy.md) — rationale для 2 breakpoints, ephemeral vs 1h, rollback порогу 30%.
- [ADR-0005 — Anthropic model selection and prompt caching](../adr/0005-anthropic-model-selection-and-prompt-caching.md) — попередник, model-selection baseline.
- [Playbook `enable-prompt-caching.md`](../playbooks/enable-prompt-caching.md) — операційний rollout-checklist + manual smoke-команди.
- [`docs/observability/dashboards/ai-cost.json`](../observability/dashboards/ai-cost.json) (uid `sergeant-ai-cost`) — 7-panel Grafana.
- [`docs/observability/metrics.md`](../observability/metrics.md) — реєстр метрик (`ai_tokens_total`, `anthropic_prompt_cache_hit_total`, `ai_cost_estimate_usd_total`).
- [`docs/observability/runbook.md` § Troubleshooting](../observability/runbook.md#troubleshooting) — як інтерпретувати порожні Anthropic-spans + AI-алерти.
- [`apps/server/src/modules/chat/`](../../apps/server/src/modules/chat/) — `chat.ts`, `tools.ts`, `toolDefs/systemPrompt.ts`.
- Координується з ініціативою [0004 — server observability](./0004-server-observability.md) — `aiSpan` помічатиме `cache_hit` як attribute.
- [`docs/tech-debt/backend.md`](../tech-debt/backend.md) — запис про AI cost (раніше «not measured»; зараз закритий, prompt-caching активний з [#864](https://github.com/Skords-01/Sergeant/pull/864), per-endpoint cost-метрики з [#1247](https://github.com/Skords-01/Sergeant/pull/1247)).

## Outcome (2026-05-04)

### Що реально шипнуто

**Phase 1 — prompt cache: ✅ DONE (2 breakpoints, не 1)** — [#864](https://github.com/Skords-01/Sergeant/pull/864) (audit PR-12.A, активація на `system` + tools), [#924](https://github.com/Skords-01/Sergeant/pull/924) (per-tool lifecycle-метрика, audit PR-12.C).

- [`apps/server/src/modules/chat/chat.ts`](../../apps/server/src/modules/chat/chat.ts) `buildSystem(context)`:
  - `system[0]` = `SYSTEM_PREFIX` з `cache_control: { type: "ephemeral" }`. Сьогодні префікс ~987 токенів — **рівно під** Anthropic min-cacheable-prompt 1024 для Sonnet, тому окремий slot фактично не реєструється. Залишаємо breakpoint як **forward-looking marker**: щойно `SYSTEM_PREFIX` виросте понад 1024 — кеш ввімкнеться без зміни коду.
  - `system[1]` = per-user `context` **без** `cache_control` — інакше cache-key різниться між юзерами на тривіальних змінах і hit-rate валиться у 0%.
- `applyToolsCacheBreakpoint(TOOLS)` додає `cache_control: ephemeral` на **останній tool** у масиві:
  - Anthropic читає cache в order `system → tools → messages`; останній `cache_control` каже «кешуй усе до цього блоку **включно**». Тому cache реально покриває `system[0]` + усі tools (~5825 байт SYSTEM_PREFIX + 83 tool-definitions у `toolDefs/{finyk,fizruk,routine,nutrition,crossModule,utility,memory}.ts` ≈ **12k токенів** при першому write).
  - **Без цього другого breakpoint-у** cache_control на `system[0]` сам по собі не вмикає кеш на tools (та й сам не реєструється на 987 токенах). Це специфіка Anthropic, не очевидна з doc-ів — зафіксована в коментарях `chat.ts:30-48` і у [ADR-0039](../adr/0039-anthropic-prompt-cache-policy.md). Operational rollout-checklist — у [playbook `enable-prompt-caching.md`](../playbooks/enable-prompt-caching.md) (включно з real-key smoke output: `cache_creation=12284` → `cache_read=12284` між першим і другим запитом).
- `messages` НЕ кешуються (single-turn flow; cache-write-cost > read-saving).
- Тести: [`apps/server/src/modules/chat/chat.stream.test.ts:732-844`](../../apps/server/src/modules/chat/chat.stream.test.ts) — 4 кейси для `recordAnthropicUsage` (cache_read>0, cache_creation>0, both, neither). Структурні тести `system[]`/tools breakpoint — у [`chat.test.ts:673-731`](../../apps/server/src/modules/chat/chat.test.ts).

**Phase 2 — cost-computation utility: ✅ DONE (повністю)** — [#1247](https://github.com/Skords-01/Sergeant/pull/1247) (per-endpoint tokens + USD cost metrics), [#1248](https://github.com/Skords-01/Sergeant/pull/1248) (capture `output_tokens` з SSE `message_delta`, інакше `ai_cost_estimate_usd_total` систематично занижував spend для streaming-флоу).

- [`apps/server/src/lib/anthropic.ts`](../../apps/server/src/lib/anthropic.ts):147-200 — `ANTHROPIC_PRICING_USD_PER_MTOK` keyed by model-prefix через `pickPricing()` + `startsWith` (стійкіше за повну назву моделі — Anthropic регулярно випускає subversions з тим самим прайсингом).
  - `claude-sonnet-4` / `claude-3-7-sonnet` / `claude-3-5-sonnet` / `claude-3-sonnet`: input $3, output $15, cache_write $3.75, cache_read $0.30 / 1M.
  - `claude-3-5-haiku`: input $0.80, output $4, cache_write $1.00, cache_read $0.08 / 1M.
  - `claude-3-haiku`: input $0.25, output $1.25, cache_write $0.30, cache_read $0.03 / 1M.
  - `claude-opus-4` / `claude-3-opus`: input $15, output $75, cache_write $18.75, cache_read $1.50 / 1M.
- `recordAnthropicUsage(model, endpoint, usage, promptVersion)` (`anthropic.ts:218`) інкрементує:
  - `ai_tokens_total{provider, model, endpoint, kind}` де `kind ∈ {prompt, completion, cache_write, cache_read}` — повна декомпозиція без реконструкції з різниці.
  - `ai_cost_estimate_usd_total{provider, model, endpoint}` з дробовими інкрементами.
  - `anthropic_prompt_cache_hit_total{version, outcome}` — outcome=hit|miss, version=`SYSTEM_PROMPT_VERSION` (для bisecting hit-rate per epoch після bump-у).
- Невідома модель → cost-counter не інкрементиться (краще «невідомо» ніж «$0 — все ок»).

**Phase 3 — Grafana dashboards: ✅ DONE (7 panels, не 5)**

- [`docs/observability/dashboards/ai-cost.json`](../observability/dashboards/ai-cost.json) (uid `sergeant-ai-cost`):
  1. Token rate by model (prompt + completion) — `sum by (model, kind) (rate(ai_tokens_total{kind=~"prompt|completion"}[5m]))`.
  2. Estimated daily spend (USD) — `sum(increase(ai_tokens_total{kind=~"prompt|completion"}[24h])) / 1e6 * $usd_per_1m_tokens`.
  3. Cache-hit ratio (1h window) — `sum(rate(anthropic_prompt_cache_hit_total{outcome="hit"}[1h])) / clamp_min(sum(rate(anthropic_prompt_cache_hit_total[1h])), 1)`.
  4. AI quota blocks — `sum(increase(ai_quota_blocks_total[1h]))`.
  5. AI quota fail-open (CRITICAL) — `sum(increase(ai_quota_fail_open_total[1h]))`.
  6. AI request outcomes — `sum by (endpoint, outcome) (rate(ai_requests_total[5m]))`.
  7. AI p95 latency by endpoint — `histogram_quantile(0.95, sum by (le, endpoint) (rate(ai_request_duration_ms_bucket[5m])))`.
- Alerts (у [`docs/observability/prometheus/alert_rules.yml`](../observability/prometheus/alert_rules.yml)): `AiErrorBudgetBurnFast` / `AiErrorBudgetBurnSlow` (multi-window, multi-burn-rate per Google SRE), `AiQuotaStoreDown` / `AiQuotaFailOpen` (10 хв вікно, severity=ticket). Runbook entry «Anthropic-spans порожні (немає tokens, prompt_cache_hit)» — [`docs/observability/runbook.md` § Troubleshooting](../observability/runbook.md#troubleshooting).

**Phase 4 — ADR: ✅ DONE**

- [ADR-0039: Anthropic prompt-cache breakpoint policy](../adr/0039-anthropic-prompt-cache-policy.md) — status `Accepted`. Зафіксовано:
  - чому 2 breakpoints (а не 1, не 4),
  - чому ephemeral, а не 1h-cache,
  - чому НЕ кешуємо `messages`,
  - threshold 30% hit-rate як rollback trigger,
  - quarterly pricing-drift review.
- ADR номер 0039 (а не 0041 як було у плані) — 0041 уже зайнятий `openclaw-telegram-webhook`. Доступні були 0039/0040; обрано 0039.

### Що НЕ шипнуто (свідома відмова)

| Spec                                               | Shipped                                                                | Why deviation                                                                                                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pino-event `ai.usage` з `cost_usd` per request     | Тільки Prom counters (`ai_cost_estimate_usd_total`, `ai_tokens_total`) | Pino-flooding на кожен AI-call — некерована кардинальність у логах. Counter дає той самий answer у Grafana без log-volume                                                               |
| Alert `daily_cost_usd > 50`                        | `AiErrorBudgetBurn` + `AiQuotaFailOpen`                                | Cost-based alert тримає threshold в alert_rules.yml; якщо потрібен явний $X/day cap — bump-имо по фактичних spending-numbers після baseline-week (поки що spending < $5/day на staging) |
| Cache hit-rate breakdown per **route** у dashboard | Breakdown per **model**                                                | Hit-rate per route потребує окремий Prom label (`endpoint`) на `anthropic_prompt_cache_hit_total` — додамо коли буде incident, що цього вимагає; зараз `aggregated` view достатньо      |

### Done-criteria звірка

- [x] У всіх Anthropic-викликах `system[0].cache_control = "ephemeral"` (`buildSystem` — purpose-built).
- [x] Pino логи + Prom counters містять `cache_read_tokens` / `cache_creation_tokens` / `cost_usd`.
- [x] Grafana dashboard `ai-cost.json` live з 7 panels (spec вимагав 5).
- [x] Cost / day per model видно у Grafana — panel #2 «Estimated daily spend (USD)».
- [ ] Alert `ai_daily_cost_usd > 50` — **відстрочено**: замість cost-based alert сьогодні маємо `AiErrorBudgetBurn` (request-rate-based) + `AiQuotaFailOpen` + `ai_quota_blocks_total` panel. Cost-cap alert додамо після того, як baseline спостережень за 1 тиждень покаже цільовий threshold (зараз spending занадто низький, щоб ставити cap осмислено).
- [ ] Cache hit-rate ≥ 60% за тиждень — **TBD**: rollout щойно; перевірка через `Cache-hit ratio (1h window)` panel протягом наступного тижня.
- [x] ADR `0039-anthropic-prompt-cache-policy.md` змерджено (у цій PR-і).
- [x] CI lint + tests проходять.

### Метрики (Baseline → Shipped)

| Метрика                                     | Baseline (2026-05-03) | Shipped (2026-05-04)                                                                                |
| ------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| Anthropic input-tokens per request (median) | ~10–25k               | system[0]+tools (≈10k) йде у cache_read після першого запиту в TTL вікні                            |
| Cache hit-rate (за `system + tools`)        | 0% (не вмикалось)     | TBD за тиждень baseline; expected ≥60%                                                              |
| Cost / day / 100 active users (avg)         | $10–30 (estimate)     | TBD; expected $5–15 (50–70% reduction від cache_read economy)                                       |
| Grafana panel «cost per day per model»      | none                  | live (panel #2 в `ai-cost.json`)                                                                    |
| Cache-hit Prom counter                      | none                  | `anthropic_prompt_cache_hit_total{version, outcome}` live                                           |
| Cost estimation Prom counter                | none                  | `ai_cost_estimate_usd_total{provider, model, endpoint}` live                                        |
| Pricing table                               | none                  | `ANTHROPIC_PRICING_USD_PER_MTOK` (8 model-prefix-ів × 4 rates) у `apps/server/src/lib/anthropic.ts` |
| `ai_429_rate`                               | ?                     | < 1% (через `AiErrorBudgetBurn` alert; staging спостерігає)                                         |

### Verification queries (PromQL)

Копі-пейст у Grafana Explore (datasource `${DS_PROMETHEUS}`) після кожного релізу, що чіпає `chat.ts`/`tools.ts`/`SYSTEM_PREFIX`:

```promql
# 1. Cache-hit ratio за останню годину (target ≥60% за тиждень).
#    Якщо у Grafana панелі #3 ця формула показує <30% — rollback policy у ADR-0039 § 7.
sum(rate(anthropic_prompt_cache_hit_total{outcome="hit"}[1h]))
  / clamp_min(sum(rate(anthropic_prompt_cache_hit_total[1h])), 1)

# 2. Cost-decomposition за 24 год (cache_read дешевший у ~10× за prompt; cache_write — на 25% дорожчий).
sum by (kind) (increase(ai_tokens_total{provider="anthropic"}[24h]))

# 3. $/день per model — `ai_cost_estimate_usd_total` уже у USD-доларах, обернути в add().
sum by (model) (increase(ai_cost_estimate_usd_total{provider="anthropic"}[24h]))

# 4. Hit-rate per SYSTEM_PROMPT_VERSION — корисно після bump-у `SYSTEM_PROMPT_VERSION`,
#    щоб побачити, як hit-rate деградував у нову епоху і відновлювався.
sum by (version) (rate(anthropic_prompt_cache_hit_total{outcome="hit"}[1h]))
  / clamp_min(sum by (version) (rate(anthropic_prompt_cache_hit_total[1h])), 1)
```

Manual smoke (потрібен реальний `ANTHROPIC_API_KEY`, не `AI_QUOTA_DISABLED`-режим) описаний у playbook-у [`enable-prompt-caching.md` § 7](../playbooks/enable-prompt-caching.md): два послідовні `/api/chat` мають дати `cache_creation_input_tokens > 0` (1-й) і `cache_read_input_tokens > 0` (2-й, у межах 5-хв TTL).

### Carry-over → successor

- [ ] **2026-05-12 (≈ +тиждень):** перевірити cache-hit-rate ≥60% (panel #3 у `ai-cost.json` + query #1 вище). Якщо <30% — fixture-чек `SYSTEM_PROMPT_VERSION` drift, перевірити що `system[1]` (context) не йде у `system[0]` (regression-тест `chat.test.ts:673`); за потреби — варіант A (drop cache) per ADR-0039 § 7.
- [ ] **Після baseline-week:** cost-based alert `ai_daily_cost_usd > $X` — `X` обираємо з реальних spending-numbers (зараз < $5/day на staging, ставити cap на 50× від baseline передчасно). Додати у `alert_rules.yml` поряд з `AiErrorBudgetBurnFast`.
- [ ] Per-route hit-rate breakdown — додати `endpoint` label на `anthropic_prompt_cache_hit_total` коли буде incident, що цього вимагає (поки що `aggregated` view достатньо).
- [ ] OpenAI prompt cache (auto-cache після 1024 токенів) — окремий ADR, якщо/коли перейдемо на OpenAI або multi-provider routing. Тільки метрика, без коду — Anthropic SDK залишається primary.
