/**
 * Anthropic per-million-token pricing (USD).
 *
 * Sources:
 *   https://www.anthropic.com/pricing  — як на 2026-Q2.
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
  // ── Моделі чату через OpenRouter (2026-07-30) ──────────────────────────
  // Запасний шлях: коли шлюз прислав `usage.cost`, ця таблиця не потрібна
  // (див. `estimateAnthropicCostUsd`). Cache-ціни — за тією ж конвенцією
  // 1.25×/0.10×, хоча через OpenRouter cache-токени вимірювано лишаються
  // нулями, тож на суму вони не впливають.
  "openai/gpt-5.1": {
    input: 1.25,
    output: 10.0,
    cacheWrite: 1.5625,
    cacheRead: 0.125,
  },
  "google/gemini-2.5-flash-lite": {
    input: 0.1,
    output: 0.4,
    cacheWrite: 0.125,
    cacheRead: 0.01,
  },
  // Standard- і floor-тир КОУЧА з 2026-08-26 (див.
  // `modules/chat/aiQuotaTierModels.ts::PRO_TIER_MODEL`). Рішення власника за
  // виміром 2026-08-25: 8/8 на коуч-стенді, нуль порушень голосу, 987 мс —
  // проти `gemini-2.5-flash-lite`, яка стояла тут раніше.
  //
  // Ціни — каталог OpenRouter, знято 2026-08-26 (`/api/v1/models`), а не
  // виведено з агрегованої вартості прогону. Це втричі дорожче за вхід і
  // вшестеро за вихід, ніж 2.5-flash-lite — саме звідси $0.16 → $0.64 на 1k
  // викликів у звіті; два незалежні джерела зійшлись.
  //
  // AI-NOTE: `cacheWrite` тут МЕНШИЙ за `input` (0.0833 проти 0.30) і тому
  // ламає евристику `input × 1.25`, за якою складені сусідні gemini-записи.
  // Це не помилка перенесення: каталог віддає саме таке число
  // (`input_cache_write: 0.0000000833…`) — у Google context-caching інша
  // модель тарифікації, ніж у Anthropic. Не «виправляй» під евристику.
  "google/gemini-3.5-flash-lite": {
    input: 0.3,
    output: 2.5,
    cacheWrite: 0.0833,
    cacheRead: 0.03,
  },
  // Floor-тир чату з 2026-08-26 (див. `env/chatModels.ts::CHAT_MODEL_DEFAULTS`).
  "google/gemini-3.7-flash": {
    input: 0.38,
    output: 1.88,
    cacheWrite: 0.475,
    cacheRead: 0.038,
  },
  // ── Chat-дефолти під `CHAT_VIA_OPENROUTER=true` (2026-08-25, B38) ──────
  // `env/chatModels.ts::CHAT_MODEL_DEFAULTS` реально ганяє основний трафік
  // чату на ці два id (firstTurn/standard → deepseek, synthesis → glm-5.2),
  // а таблиця вище про них не знала — `est_cost_usd` для основного трафіку
  // мовчки виходив 0 (рятував лише `usage.cost` від шлюзу, якщо той його
  // прислав). Ціни — каталог OpenRouter станом на 2026-08-25.
  "deepseek/deepseek-v4-flash": {
    input: 0.04,
    output: 0.08,
    cacheWrite: 0.05,
    cacheRead: 0.004,
  },
  "z-ai/glm-5.2": {
    input: 1.4,
    output: 4.4,
    cacheWrite: 1.75,
    cacheRead: 0.14,
  },
  // `env/aiRoutingEnv.ts::OPENROUTER_COACH_MODEL` defaults to this
  // vendor-prefixed OpenRouter id (fixed 2026-08-25, B37 — was the
  // proven-broken `openai/gpt-5.1`), and `modules/chat/aiQuotaTierModels.ts`
  // hardcodes the same id as `PRO_TIER_MODEL.premium.coach`'s fallback.
  // Same underlying model as the bare `claude-sonnet-4` prefix above
  // (identical $3/$15 pricing) — needs its own key because OpenRouter ids
  // are vendor-prefixed (`anthropic/…`) and `startsWith` won't bridge the
  // two id styles.
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
