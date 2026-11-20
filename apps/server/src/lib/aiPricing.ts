/**
 * Anthropic per-million-token pricing (USD).
 *
 * Sources:
 *   https://www.anthropic.com/pricing  — як на 2026-Q2.
 *   Звірка 2026-11-19 з каталогом OpenRouter (`GET /api/v1/models`) і
 *   ендпойнтами моделей (`GET /api/v1/models/<id>/endpoints`): Sonnet 4.x
 *   (`anthropic/claude-sonnet-4.6`, 3/15/3.75/0.3), Haiku 4.5 (1/5/1.25/0.1)
 *   і Opus 4/4.1 (15/75/18.75/1.5) збігаються. Opus 4.5+ коштує 5/25, тож
 *   префікс `claude-opus-4` для них дає оцінку зверху; у маршрутизації Opus
 *   немає. Сімейств `claude-3-*` у каталозі 2026-11-19 немає, їх ціни не
 *   переперевірено (у маршрутизації їх теж немає). Правило для моделей шлюзу
 *   — у коментарі над блоком «Моделі через OpenRouter».
 *
 * Ключі — model-prefix, що матчить `pickAnthropicPricing()` через
 * `startsWith`. Це стійкіше за повну назву моделі: Anthropic регулярно
 * випускає subversions (`-20240620`, `-20241022` …) з тим самим
 * прайсингом, тому match-имо по сімейству.
 *
 * Невідома модель → cost не рахується (краще "невідомо" ніж "0$ — все
 * ок"). Це використовує і Prometheus-counter (`recordAnthropicUsage`)
 * і DB-ledger (`ai_usage_daily.est_cost_usd`). Cache prices: write =
 * 1.25× input, read = 0.10× input — політика Anthropic prompt-caching
 * (див. https://docs.claude.com/en/docs/build-with-claude/prompt-caching).
 *
 * PR-12 (initiative 0019 AI cost tracking) — extracted з `lib/anthropic.ts`
 * у окремий модуль для shared coverage між wrapper-ом, cost-dashboard-ом
 * (PR-13), і budget-alert-ом (PR-14).
 */

export interface AnthropicModelPricing {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
  /** USD per 1M cache-write tokens (= 1.25 × input для Anthropic) */
  cacheWrite: number;
  /** USD per 1M cache-read tokens (= 0.10 × input для Anthropic) */
  cacheRead: number;
}

/**
 * Сімейства моделей Anthropic, які ми підтримуємо у cost-обчисленнях.
 * Ключ — prefix; usage-model порівнюється через `String.prototype.startsWith`,
 * тому subversions (`-20241022`, `-latest`) автоматично підпадають під
 * базову ціну сімейства.
 *
 * Coverage за вимогою PR-12: Sonnet 3 / 3.5 / 3.7 / 4, Haiku 3 / 3.5,
 * Opus 3 / 4.
 */
export const ANTHROPIC_PRICING_USD_PER_MTOK: Record<
  string,
  AnthropicModelPricing
> = {
  // ── Sonnet (3, 3.5, 3.7, 4.x): $3 / $15 ────────────────────────────────
  "claude-sonnet-4": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-3-7-sonnet": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-3-5-sonnet": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-3-sonnet": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  // ── Haiku 4.5: $1 / $5 ────────────────────────────────────────────────
  "claude-haiku-4": {
    input: 1.0,
    output: 5.0,
    cacheWrite: 1.25,
    cacheRead: 0.1,
  },
  // ── Haiku 3.5: $0.80 / $4 ──────────────────────────────────────────────
  "claude-3-5-haiku": {
    input: 0.8,
    output: 4.0,
    cacheWrite: 1.0,
    cacheRead: 0.08,
  },
  // ── Haiku 3: $0.25 / $1.25 ─────────────────────────────────────────────
  "claude-3-haiku": {
    input: 0.25,
    output: 1.25,
    cacheWrite: 0.3,
    cacheRead: 0.03,
  },
  // ── Opus 3 / 4: $15 / $75 ──────────────────────────────────────────────
  "claude-opus-4": {
    input: 15.0,
    output: 75.0,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
  "claude-3-opus": {
    input: 15.0,
    output: 75.0,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
  // ── Моделі через OpenRouter ────────────────────────────────────────────
  // Запасний шлях: коли шлюз прислав `usage.cost`, ця таблиця не потрібна
  // (див. `estimateAnthropicCostUsd`). Вимірювання cache-токенів через шлюз
  // суперечливі: ADR-0087 бачив `cache_read` = 0, а спека `ai-cost-ceiling.md`
  // (за ініціативою 0025) переказує рівні `cache_read` = `cache_creation` =
  // 14 574 при нульовому `input_tokens`. Сирого payload-у в репо немає, тож НЕ
  // спирайся на ці cache-ціни для моделей шлюзу: джерелом вартості є
  // `usage.cost`, таблиця лише запасний шлях.
  //
  // AI-CONTEXT: правило ціни (звірка 2026-11-19). Ціна моделі шлюзу — це
  // МАКСИМУМ кожного поля окремо серед ендпойнтів, які може обрати наш
  // запит: `GET /api/v1/models/<id>/endpoints`, лише ендпойнти з
  // квантизацією зі списку `OPENROUTER_MIN_8BIT_QUANTIZATIONS`
  // (`llm/openrouterDataPolicy.ts`), без `flex`-тиру (ми не шлемо
  // `service_tier`), а `priority`-тир лише для відкритих моделей (за
  // документацією service tiers він бере участь у дефолтній маршрутизації
  // саме в них). Фільтр `data_collection=deny` з публічного API не видно,
  // тож пул береться ширший за справжній, і максимум по ньому — оцінка
  // зверху: стеля `anthropicBudgetGuard` краще спрацює раніше, ніж пізніше.
  // Де ендпойнти не дають окремої ціни запису кешу (`input_cache_write`
  // відсутній), `cacheWrite` = `input`: запис кешу рахуємо як звичайний
  // вхід. Ціни ендпойнтів шлюзу змінюються протягом доби (знижки
  // постачальників), тож звірку повторюй разом із кожною зміною моделі.
  // Звірка й правило описані в `docs/work/specs/tech-debt/backend.md`
  // (блок 2026-11-19).
  //
  // Не в маршрутизації з 2026-08-25 (B37), лишено для старих рядків
  // леджера. Ендпойнти 2026-11-19 (OpenAI, Azure; без flex і priority):
  // 1.25/10, cache read 0.13 (Azure); ціни запису кешу немає → = input.
  // Префікс ловить і `openai/gpt-5.1-mini`/`-codex-mini`, яким ця ціна
  // завищена.
  "openai/gpt-5.1": {
    input: 1.25,
    output: 10.0,
    cacheWrite: 1.25,
    cacheRead: 0.13,
  },
  // Скан чека й імпорт скриншота виписки (`OPENROUTER_RECEIPT_MODEL`) з
  // 2026-11-19, рішення власника за заміром § 6.5 дослідження
  // `2026-11-19-openrouter-new-models.md`. Ендпойнти того ж дня: OpenAI,
  // Azure, Amazon Bedrock — 0.10/0.50, cache write 0.125, cache read 0.01;
  // `openai/flex` і `openai/fast` (priority, модель закрита) виключено
  // правилом вище. Вище 272k токенів входу ціна інша (0.20/0.75): наші запити
  // на порядки менші. Префікс ловить і `openai/gpt-6-luna-pro` (каталог
  // 2026-11-19 — та сама 0.10/0.50).
  "openai/gpt-6-luna": {
    input: 0.1,
    output: 0.5,
    cacheWrite: 0.125,
    cacheRead: 0.01,
  },
  // Шість непотокових пайплайнів (`env/aiRoutingEnv.ts`) і тир-дефолти коуча
  // в `env/env.ts`. Ендпойнти 2026-11-19: лише Google AI Studio, стандартний
  // 0.10/0.40, cache write 0.0833, cache read 0.01 (flex і priority
  // виключено правилом вище). Запис кешу був 0.125 за евристикою 1.25×
  // input; тепер число каталогу.
  "google/gemini-2.5-flash-lite": {
    input: 0.1,
    output: 0.4,
    cacheWrite: 0.0833,
    cacheRead: 0.01,
  },
  // Standard- і floor-тир КОУЧА з 2026-08-26 (див.
  // `modules/chat/aiQuotaTierModels.ts::PRO_TIER_MODEL`). Рішення власника за
  // виміром 2026-08-25: 8/8 на коуч-стенді, нуль порушень голосу, 987 мс —
  // проти `gemini-2.5-flash-lite`, яка стояла тут раніше.
  //
  // Ціни — каталог OpenRouter, знято 2026-08-26; звірено з ендпойнтами
  // 2026-11-19 (Google Vertex і AI Studio, стандартні: 0.30/2.50, cache
  // write 0.0833, cache read 0.03) — без змін.
  //
  // AI-NOTE: `cacheWrite` тут МЕНШИЙ за `input` (0.0833 проти 0.30). Це не
  // помилка перенесення: каталог віддає саме таке число
  // (`input_cache_write: 0.0000000833…`) — у Google context-caching інша
  // модель тарифікації, ніж у Anthropic. Не «виправляй» під евристику.
  "google/gemini-3.5-flash-lite": {
    input: 0.3,
    output: 2.5,
    cacheWrite: 0.0833,
    cacheRead: 0.03,
  },
  // Перший хід чату і floor-тир (`env/chatModels.ts::CHAT_MODEL_DEFAULTS`).
  // Ендпойнти 2026-11-19 (Google Vertex і AI Studio, стандартні): 0.75/3.75,
  // cache write 0.0417, cache read 0.075. До звірки тут стояло 0.38/1.88 —
  // ціна flex-ендпойнта (0.375/1.875), на який без `service_tier: "flex"`
  // запит не потрапляє, тобто оцінка була вдвічі заниженою.
  "google/gemini-3.7-flash": {
    input: 0.75,
    output: 3.75,
    cacheWrite: 0.0417,
    cacheRead: 0.075,
  },
  // Синтез standard-тиру і Free (`env/chatModels.ts`). Ендпойнти 2026-11-19
  // під межею 8 біт: Baidu, StreamLake, Fireworks, DeepInfra (+priority),
  // GMICloud, Venice, SiliconFlow, Parasail, Mancer, Azure. Максимум: вхід і
  // вихід 0.21/0.56 (Azure), cache read 0.075 (Mancer); ціни запису кешу
  // немає → = input. Каталог (ціна за замовчуванням) 0.09/0.18; живі проби
  // того дня йшли на StreamLake і Baidu (0.07/0.14 і 0.027/0.055).
  // AI-NOTE: префікс ловить і `deepseek/deepseek-v4-flash-vision-exp`
  // (каталог 0.44/1.32): якщо її колись маршрутизують, потрібен окремий
  // ключ ПЕРЕД цим.
  "deepseek/deepseek-v4-flash": {
    input: 0.21,
    output: 0.56,
    cacheWrite: 0.21,
    cacheRead: 0.075,
  },
  // Синтез premium-тиру (`env/chatModels.ts`). Ендпойнти 2026-11-19 під
  // межею 8 біт: Cloudflare, StreamLake, Baidu, Morph, Novita, SiliconFlow,
  // DigitalOcean, AtlasCloud, Alibaba, Mistral, BaseTen, Together, Venice,
  // GMICloud, Friendli, Z.AI і priority-ендпойнти BaseTen та Alibaba.
  // Максимум: вхід 2.31 (alibaba/fast), вихід 8.0 (Cloudflare), cache read
  // 0.462 (alibaba/fast); ціни запису кешу немає → = input. Каталог 0.62/2.42;
  // живі проби того дня йшли на Cloudflare (0.19/8.0).
  "z-ai/glm-5.2": {
    input: 2.31,
    output: 8.0,
    cacheWrite: 2.31,
    cacheRead: 0.462,
  },
  // `env/aiRoutingEnv.ts::OPENROUTER_COACH_MODEL` defaults to this
  // vendor-prefixed OpenRouter id (fixed 2026-08-25, B37 — was the
  // proven-broken `openai/gpt-5.1`), and `modules/chat/aiQuotaTierModels.ts`
  // hardcodes the same id as `PRO_TIER_MODEL.premium.coach`'s fallback.
  // Same underlying model as the bare `claude-sonnet-4` prefix above
  // (identical $3/$15 pricing) — needs its own key because OpenRouter ids
  // are vendor-prefixed (`anthropic/…`) and `startsWith` won't bridge the
  // two id styles. Ендпойнти `anthropic/claude-sonnet-4.6` 2026-11-19 (усі
  // пʼять постачальників): 3/15, cache write 3.75, cache read 0.3 — без змін.
  "anthropic/claude-sonnet-4": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
};

/**
 * Повертає pricing для заданої моделі по startsWith-prefix-match,
 * або `null`, якщо модель невідома або це sentinel `"unknown"`.
 *
 * `null` — це сигнал "невідома модель", caller-и трактуть як
 * "не записуй cost"; токени все одно записуються окремо.
 */
export function pickAnthropicPricing(
  model: string,
): AnthropicModelPricing | null {
  if (!model || model === "unknown") return null;
  for (const [prefix, price] of Object.entries(
    ANTHROPIC_PRICING_USD_PER_MTOK,
  )) {
    if (model.startsWith(prefix)) return price;
  }
  return null;
}

/**
 * Per-call usage у термінах Anthropic — повторює форму
 * `response.usage` зі стрімової та non-streaming відповіді.
 *
 * Дозволяє pricing-helper-у бути цілковито незалежним від
 * `anthropic.ts` (щоб тести могли тестувати математику без
 * import-у HTTP-шару).
 */
export interface AnthropicUsageTokens {
  input_tokens?: number | null | undefined;
  output_tokens?: number | null | undefined;
  cache_creation_input_tokens?: number | null | undefined;
  cache_read_input_tokens?: number | null | undefined;
  /**
   * OpenRouter-only: сума в USD, яку шлюз реально списав за цей виклик.
   */
  cost?: number | null | undefined;
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value > 0 ? Math.floor(value) : 0;
}

/**
 * Розрахунок estimated cost у USD для одного Anthropic-виклику.
 * `null` якщо pricing для моделі невідомий — caller вирішує що
 * робити (зазвичай: не інкрементувати cost-counter, але все одно
 * писати tokens).
 *
 * Округлення: float-арифметика, але всі лічильники у Prometheus
 * (counter-и) і у Postgres (`NUMERIC(12,6)`) дозволяють дрібні
 * значення без втрат. Для multi-call summation у dashboard
 * це достатня точність (max помилка < 1e-9 USD).
 */
export function estimateAnthropicCostUsd(
  model: string,
  usage: AnthropicUsageTokens | null | undefined,
): number | null {
  if (!usage) return null;

  // WHY факт важливіший за оцінку: OpenRouter рахує вартість сам і повертає
  // її в `usage.cost` — це вже списані гроші, з урахуванням його націнки й
  // актуального прайсу моделі. Таблиця нижче апроксимує і застаріває при
  // кожній зміні цін у вендора, тож лишається лише для Anthropic-direct і
  // для випадку, коли шлюз `cost` не прислав.
  if (
    typeof usage.cost === "number" &&
    Number.isFinite(usage.cost) &&
    usage.cost > 0
  ) {
    return usage.cost;
  }

  const price = pickAnthropicPricing(model);
  if (!price) return null;

  const inTok = toNonNegativeInt(usage.input_tokens);
  const outTok = toNonNegativeInt(usage.output_tokens);
  const cwTok = toNonNegativeInt(usage.cache_creation_input_tokens);
  const crTok = toNonNegativeInt(usage.cache_read_input_tokens);

  if (inTok === 0 && outTok === 0 && cwTok === 0 && crTok === 0) return 0;

  const usd =
    (inTok * price.input +
      outTok * price.output +
      cwTok * price.cacheWrite +
      crTok * price.cacheRead) /
    1_000_000;

  return usd > 0 ? usd : 0;
}
