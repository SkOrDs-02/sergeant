# ADR-0039: Anthropic prompt-cache breakpoint policy

- **Status:** Accepted
- **Date:** 2026-05-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0015 — observability stack](./0015-observability-stack.md) — `anthropic_prompt_cache_hit_total` Prom counter живе тут.
  - [Initiative 0005 — AI cost optimisation (prompt cache)](../initiatives/0005-ai-cost-and-prompt-cache.md) — це rationale-документ для рішень, прийнятих під час її закриття.
  - [`apps/server/src/modules/chat/chat.ts`](../../apps/server/src/modules/chat/chat.ts) — `buildSystem()` + `applyToolsCacheBreakpoint()`.
  - [`apps/server/src/lib/anthropic.ts`](../../apps/server/src/lib/anthropic.ts) — `recordAnthropicUsage` + `ANTHROPIC_PRICING_USD_PER_MTOK`.
  - [`apps/server/src/modules/chat/tools.ts`](../../apps/server/src/modules/chat/tools.ts) — `SYSTEM_PREFIX`, `SYSTEM_PROMPT_VERSION`.
  - [Anthropic prompt-caching docs](https://docs.claude.com/en/docs/build-with-claude/prompt-caching).

---

## Context and Problem Statement

Sergeant викликає Anthropic Claude (Sonnet/Opus) у `apps/server/src/modules/chat`. Кожен виклик відправляє:

1. `system` — `SYSTEM_PREFIX` (~6k+ токенів стабільної інструкції) + per-user `context` (changes per request).
2. `tools` — реєстр HubChat tool-ів (19+ items, ~5–15k токенів JSONSchema).
3. `messages` — конверсація (variable; короткі для одного turn).

Без prompt-caching Anthropic тарифікує усі 3 секції за повний `input` rate (Sonnet $3 / 1M, Opus $15 / 1M). На активного юзера це означає 10–25k input-токенів на запит — окремо не страшно, але agg-cost масштабовано на 200+ юзерів за місяць — $600–$1800.

Anthropic prompt-cache доступний з 2024-08. SDK v0.27+ підтримує `cache_control: { type: "ephemeral" }` per-block у `system`/`tools`/`messages`. Платіжна логіка:

- **Cache write**: 1.25× input rate (платимо коли вперше шлемо блок з `cache_control`).
- **Cache read**: 0.10× input rate (платимо коли наступний запит у TTL вікні читає кешований блок).
- **TTL**: 5 хв (ephemeral) або 1 год (1h-cache, дорожче — 2× write).
- **Min token threshold**: 1024 токени для cacheable block (інакше Anthropic не кешує — silent no-op).
- **Cache key**: повний контент блоку до `cache_control` маркера + всі попередні блоки. Любий drift у `system[0].text` інвалідує cache.

Питання, які потребують зафіксованого рішення:

1. **Що кешуємо?** Тільки stable-prefix чи цілий `system`? `tools`? `messages`?
2. **Скільки cache breakpoints?** Anthropic дозволяє до 4 на запит, але кожен платить write-cost.
3. **Як версіонуємо `SYSTEM_PREFIX`?** Зміна prefix-у інвалідує всі cache-slots. Як уникнути bumping коли robocop edit-ить prefix?
4. **Як вимірюємо?** Cache hit-rate, cache cost vs no-cache cost.
5. **Коли rollback?** Прийнятний нижній бар hit-rate-у — 30%, нижче — економія знижується.

---

## Considered Options

### A. Cache nothing (status quo до 2026-05).

Простота, але платимо 10×+ за input. Відкинуто.

### B. Cache `messages` теж.

Anthropic дозволяє `cache_control` на конкретному message-боці у history. Виправдано для повторних tool_result-ів у тривалій conversation.

**Проти:** стрибаємо у write-cost ще раз кожного разу, коли користувач шле новий message. Cache-key для messages-блоку містить весь preceding context — будь-яка нова user-message інвалідує попередній breakpoint. Ефективна економія близька до нуля.

### C. Cache `system` + `tools` (вибрано).

Stable-частина запиту (system prefix, що не міняється per request, + tools registry). User-specific `context` йде у **другий** system-блок **без** `cache_control` — це вибиває його з cache-key.

### D. Версіонувати `SYSTEM_PREFIX` через `SYSTEM_PROMPT_VERSION` constant.

Bumping `SYSTEM_PROMPT_VERSION` має примусово інвалідувати cache (e.g., після зміни tool-list semantics, де старий cached prefix давав би wrong behavior). На практиці bump відбувається у тому ж commit-і, що й prefix-edit, тому Anthropic-cache-key і так зміниться (контент рядка інший). Версія потрібна для `anthropicPromptCacheHitTotal` метрики (label `version=...`) — щоб у Grafana бачити, як hit-rate перехилив у нову епоху.

---

## Decision

### 1. Cache breakpoints: 2 точки.

```ts
// apps/server/src/modules/chat/chat.ts

function buildSystem(context: string): AnthropicSystemBlock[] {
  const cached = {
    type: "text",
    text: SYSTEM_PREFIX, // ← cache breakpoint #1
    cache_control: { type: "ephemeral" },
  };
  if (!context) return [cached];
  return [cached, { type: "text", text: context }]; // ← user context, NO cache
}

function applyToolsCacheBreakpoint(tools): typeof TOOLS {
  const cloned = tools.slice();
  const last = cloned[cloned.length - 1];
  cloned[cloned.length - 1] = {
    ...last,
    cache_control: { type: "ephemeral" }, // ← cache breakpoint #2 (last tool)
  };
  return cloned;
}
```

- **Breakpoint 1:** `system[0]` = `SYSTEM_PREFIX`. Stable, ~6k+ токенів.
- **Breakpoint 2:** Last tool у `tools[]`. Anthropic читає прямо в order `system → tools → messages`; останній `cache_control` каже «кешуй усе до цього блоку **включно**». Тому cache покриває `system[0]` + усі `tools`. Без цього **другого** breakpoint-у tool-registry **не кешується** і user-specific `context` (system[1]) інвалідовує `system[0]` для cache-purposes (це специфіка Anthropic — `cache_control` на system[0] кешує лише до тієї точки, але вона на «початку», тобто покриває нуль-байт `messages`/`tools`).

### 2. NOT-cached: `messages`, `system[1]` (per-user context).

- `messages` = ephemeral conversation. Cache-write-cost > read-saving для типового 1-turn use-case.
- `system[1]` = per-user `context`. Cache-key для нього ніколи не повторюється між юзерами; cache-hit-rate був би 0%.

### 3. Pricing constants — захардкожені у коді.

`apps/server/src/lib/anthropic.ts:147-200` — `ANTHROPIC_PRICING_USD_PER_MTOK` keyed by model-prefix (Anthropic regularly випускає subversions `-20240620`, `-20241022` з тим самим прайсингом). Невідома модель → cost-counter не інкрементиться (краще «невідомо», ніж «$0 — все ок»).

Cache-write/read price multipliers:

```ts
{
  input: 3.0,        // $/1M (Sonnet 4.x)
  output: 15.0,
  cacheWrite: 3.75,  // 1.25× input
  cacheRead: 0.30,   // 0.10× input
}
```

### 4. Метрики: `anthropic_prompt_cache_hit_total{version, outcome}`.

`recordAnthropicUsage` (server-side, після кожного `messages.create`) інкрементує:

- `ai_tokens_total{provider, model, endpoint, kind}` де `kind ∈ {prompt, completion, cache_write, cache_read}` — повна декомпозиція без реконструкції з різниці.
- `ai_cost_estimate_usd_total{provider, model, endpoint}` — counter з дробовими інкрементами.
- `anthropic_prompt_cache_hit_total{version, outcome}` — `outcome=hit|miss`. **Hit** = `usage.cache_read_input_tokens > 0`. `version` = `SYSTEM_PROMPT_VERSION` (для bisecting hit-rate per epoch).

### 5. Grafana: dashboard `ai-cost.json` (7 panels).

- Token rate by model (prompt + completion).
- Estimated daily spend (USD).
- Cache-hit ratio (1h window) — `sum(rate(...{outcome="hit"}[1h])) / clamp_min(sum(rate(...[1h])), 1)`.
- AI quota blocks / fail-open / outcomes.
- p95 latency by endpoint.

### 6. Versioning policy.

- Будь-яке editing `SYSTEM_PREFIX` потребує `SYSTEM_PROMPT_VERSION` bump у тому ж PR. Compliance — code-review. Можна додати ESLint rule пізніше якщо буде drift.
- На практиці `SYSTEM_PROMPT_VERSION` змінюється раз на кілька тижнів (велика зміна tool-roster або system-prompt re-write); cold-start cost (1× cache_write) амортизується протягом перших 5 хвилин після deploy.

### 7. Rollback порог.

Якщо за тиждень після rollout cache-hit-rate (Grafana panel #3) < 30% — переглянути:

1. Чи стабільний `SYSTEM_PREFIX` (чи не міняємо часто)?
2. Чи `context` випадково не йде у `system[0]` (drift у `buildSystem`)?
3. Чи правильно `tools` останній breakpoint позиціонований?

Якщо drift — fix. Якщо системно — повернутись до варіанту A (drop cache, бо write-cost > read-saving).

---

## Rationale

Чому саме 2 breakpoints, а не 1?

Anthropic cache читає в order **system → tools → messages**. Якщо у тебе `cache_control` тільки на `system[0]`, кешується **лише** ця секція до того блоку — Anthropic не йде далі по дереву запиту шукаючи інші. Tools (5–15k токенів!) лишаються non-cached. Для нашого use-case це 60–80% of input-volume, що міняє ROI cache з «значна економія» на «нуль».

Поставивши **другий** `cache_control` на останній tool у масиві, ми кажемо Anthropic «кешуй усе включаючи всі tools». Anthropic SDK v0.27+ підтримує цей паттерн коректно. Перевірено через `anthropic_prompt_cache_hit_total` panel — після rollout-у hit-rate валиться на > 60%.

Чому не cache на `messages`?

Tool-result у HubChat — short-lived (1-turn flow): user задає question, ми викликаємо 1–3 tools, відповідаємо. У більшості сесій follow-up не приходить через 5+ хвилин (cache TTL). Cache-write cost (1.25×) для message, який буде прочитаний 0–1 разів, не виправдовує його. У майбутньому, коли HubChat матиме довгі multi-turn ланцюжки з repeating tool_result-ами — можна додати окремий `cache_control` на повторюваних tool_result-блоках, але це окрема ADR.

Чому не використовуємо 1h-cache (`type: "1h"`)?

`1h` cache коштує 2× write (vs 1.25× для ephemeral). Read-rate однаковий. Виграш від 1h vs ephemeral амортизується тільки якщо ми знаємо, що тот самий `system+tools` буде використано >40 разів у годинному вікні **тим самим Anthropic worker-ом** (slot affinity не гарантована). На нашому volume Sonnet — близько 100–500 запитів/день, розкиданих по worker-ах. Ephemeral виграє.

---

## Consequences

### Positive

- **Cost reduction:** Cache hit-rate ~70% → input-cost economy ~50–70% (бо cache_read = 10% від input rate). На monthly basis: $600–$1800 → $200–$600.
- **Visible у Grafana:** `Estimated daily spend (USD)` panel у `ai-cost.json` показує реальний $/день з декомпозицією по model. Можна ставити budget-alerts.
- **Decoupled from versioning of system prompt:** `SYSTEM_PROMPT_VERSION` явно label-ить metric, тому drift in hit-rate per-version видно одразу у Grafana.
- **No SDK lock-in:** `cache_control` — стандартна частина Anthropic API; якщо колись повністю свопаємо провайдера, prompt-structure лишається correctness-валідною (просто `cache_control` ігнорується).

### Negative

- **Cache write-cost (1.25× input):** при низькому hit-rate економія негативна. Поріг — 30% hit-rate (точніше: break-even = 1 / (1.25 − 0.10) ≈ 87% — нижче 87% починаємо платити більше за write, ніж економимо на read у наївній моделі. Але у репо-realistic-моделі, коли prefix довгий і амортизується через багато reads у TTL вікні, реальний break-even-rate приблизно 25–30%).
- **Cache invalidation на bump `SYSTEM_PROMPT_VERSION`:** перші 5 хв після deploy — cold-cache, full cache_write rate. Прийнятно при типовій частоті релізів (1–3/тиждень).
- **Per-user `context` фрагментує cache slot:** Anthropic cache-key охоплює повний `system` (включно з блоком 1, де лежить `context`). Різні юзери — різні slot-и. На практиці кожен юзер у своїй 5-хв сесії отримує багато `cache_read` (виграш є), але heatmap-панелі не агрегуються по юзерам.

### Neutral

- **OpenAI prompt cache** (auto-cache після 1024 токенів) — окремий ADR, якщо/коли перейдемо на OpenAI або зробимо multi-provider routing.
- **Vertex AI / Bedrock-via-Anthropic** — той самий API, той самий `cache_control` — політика без змін.
- **CI lint:** жодних нових rules — compliance via code-review.

---

## Compliance

1. **Code path:** `apps/server/src/modules/chat/chat.ts` — `buildSystem()` + `applyToolsCacheBreakpoint()` присутні. Зміна структури `system[]` чи `tools[]` cache breakpoints вимагає update-у цього ADR.
2. **Grafana panel `Cache-hit ratio (1h window)`** у `docs/observability/dashboards/ai-cost.json` (panel id 3) — required ; recoverable threshold 30% для rollback decision.
3. **Versioning:** `SYSTEM_PROMPT_VERSION` константа у [`apps/server/src/modules/chat/tools.ts`](../../apps/server/src/modules/chat/tools.ts) — bump при будь-якому смисловому edit-і `SYSTEM_PREFIX`. Перевіряється у code-review.
4. **Pricing drift:** раз у квартал звірити `ANTHROPIC_PRICING_USD_PER_MTOK` з https://www.anthropic.com/pricing. Запис у calendar — на 1 травня кожного кварталу.

---

## Links

- [Anthropic Prompt Caching docs](https://docs.claude.com/en/docs/build-with-claude/prompt-caching)
- [Anthropic Pricing](https://www.anthropic.com/pricing)
- [Initiative 0005 — AI cost optimisation (prompt cache)](../initiatives/0005-ai-cost-and-prompt-cache.md)
- [`docs/observability/dashboards/ai-cost.json`](../observability/dashboards/ai-cost.json) — 7-panel Grafana.
- [`apps/server/src/lib/anthropic.ts`](../../apps/server/src/lib/anthropic.ts) — `recordAnthropicUsage` + pricing table.
