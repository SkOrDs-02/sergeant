/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * Модель юніт-економіки AI-шару: ціни, розміри промптів, персони, парк.
 *
 * AI-CONTEXT: попередня оцінка (`01-monetization-and-pricing.md` § 9.5–9.6)
 * жила прозою в доці й протухла за 11 днів — 2026-08-04 чат переїхав на
 * OpenRouter, а § 9.5 досі рахує Sonnet/Haiku з prompt-cache. Тому числа тут
 * не переписуються руками: розміри префікса беруться з ПРОДОВОГО
 * `buildToolsPayload`, а Anthropic-прайс — з продової `aiPricing.ts`. Зміниш
 * реєстр інструментів — доповідь порахує нове число сама.
 *
 * AI-DANGER: усе, що нижче — ОЦІНКА, а не вимір трафіку. Прод-даних немає
 * (PostHog 2026-08-06: 7 повідомлень чату за 60 днів, 3 юзери), тож частоти
 * в `PERSONAS` — гіпотези, а не спостереження. Точні тут лише дві речі:
 * розмір payload-у й прайс-лист. Усе інше множиться на здогад.
 */

import {
  ANTHROPIC_PRICING_USD_PER_MTOK,
  type AnthropicModelPricing,
} from "../../src/lib/aiPricing.js";
import { buildToolsPayload } from "../../src/modules/chat/promptCache.js";
import { SYSTEM_PREFIX, TOOLS } from "../../src/modules/chat/tools.js";

// ── Токенізація ──────────────────────────────────────────────────────

/**
 * Симв./токен окремо для ASCII і кирилиці. Діапазони — з § 9.5 монетизації;
 * єдиний живий вимір токенайзера Anthropic у репо (`cache_creation=12284`,
 * `docs/00-start/playbooks/enable-prompt-caching.md`) лягає всередину.
 *
 * Розділення обов'язкове: JSON-схеми інструментів — майже чистий ASCII
 * (~3.6 симв./токен), а описи й системний промпт українською — ~1.9. Одна
 * усереднена константа помиляється в 1.5-2 рази залежно від того, чого в
 * рядку більше.
 */
const CHARS_PER_TOKEN = {
  ascii: { lo: 4.0, mid: 3.6, hi: 3.2 },
  cyrillic: { lo: 2.4, mid: 1.9, hi: 1.4 },
} as const;

export type TokenBand = "lo" | "mid" | "hi";

/** Токени рядка за смугою оцінки (`hi` = песимістично, більше токенів). */
export function tokensOf(text: string, band: TokenBand = "mid"): number {
  let ascii = 0;
  let cyrillic = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii++;
    else cyrillic++;
  }
  return Math.round(
    ascii / CHARS_PER_TOKEN.ascii[band] +
      cyrillic / CHARS_PER_TOKEN.cyrillic[band],
  );
}

/** Токени за кількістю символів із заданою часткою кирилиці. */
export function tokensFromChars(
  chars: number,
  cyrillicShare: number,
  band: TokenBand = "mid",
): number {
  const cyr = chars * cyrillicShare;
  return Math.round(
    (chars - cyr) / CHARS_PER_TOKEN.ascii[band] +
      cyr / CHARS_PER_TOKEN.cyrillic[band],
  );
}

// ── Живий вимір префікса чату ────────────────────────────────────────

export interface ChatPrefix {
  /** Скільки tool-схем реально їде в контекстне вікно. */
  inContextTools: number;
  chars: number;
  tokens: number;
  /** Чи вміє модель tool search (інакше — весь реєстр у кожному запиті). */
  toolSearch: boolean;
}

/**
 * Контекстний префікс для моделі = не-deferred tools + `SYSTEM_PREFIX`.
 * Саме він оплачується на КОЖНОМУ запиті (або кешується, якщо Anthropic).
 */
export function measureChatPrefix(
  model: string,
  band: TokenBand = "mid",
): ChatPrefix {
  const payload = buildToolsPayload(model) as Array<Record<string, unknown>>;
  const inContext = payload.filter((t) => t["defer_loading"] !== true);
  const text = JSON.stringify(inContext) + SYSTEM_PREFIX;
  return {
    inContextTools: inContext.length,
    chars: text.length,
    tokens: tokensOf(text, band),
    toolSearch: inContext.length < payload.length,
  };
}

export const TOOL_COUNT = TOOLS.length;

// ── Прайс-лист ───────────────────────────────────────────────────────

export interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  /** Звідки взято число — друкується у звіті, щоб його можна було спростувати. */
  source: string;
}

/**
 * Прайс OpenRouter-моделей. Anthropic-моделі НЕ дублюються — вони беруться з
 * продової `ANTHROPIC_PRICING_USD_PER_MTOK` (див. `priceFor`), інакше дві
 * таблиці розійдуться, і саме так у B1 аудиту зникла стеля витрат.
 *
 * `deepseek-v4-flash` і `glm-5.2` немає в жодній таблиці репо (це і є дефект
 * B1 з `ai-pipeline-2026-08-05.md`: модель поза таблицею не рухає лічильник
 * бюджету). Числа нижче — з каталогу OpenRouter, звірені власником 2026-08-06.
 *
 * AI-DANGER: у першій редакції цього файлу ціни були ВИВЕДЕНІ з вартості
 * прогону стенду ($1.51/1k і $1.64/1k, докстрінг `env/chatModels.ts`), бо
 * прайс-листа під рукою не було. Для deepseek оцінка збіглася по входу
 * ($0.08 проти $0.09), але вихід був завищений удвічі; для glm-5.2 вона
 * занизила ціну ВТРИЧІ. Урок конкретний: зворотне виведення прайсу з
 * агрегованої вартості прогону не працює, коли невідома пропорція
 * вхід/вихід. Не відновлюй ті числа — онови ці.
 *
 * `glm-5.2` хостять кілька провайдерів, і OpenRouter маршрутизує між ними
 * (Balanced за замовчуванням), тож ціна не одна: список 2026-08-06 дає від
 * $0.5446/$1.712 у знижених до $0.90/$3.15, при листовій $1.40/$4.40. Беремо
 * $0.70/$2.20 — типовий рядок без знижки. Це вибір медіани, а не факт: під
 * Nitro чи Exacto маршрут піде дорожчим провайдером.
 */
const OPENROUTER_PRICES: Record<string, Price> = {
  "deepseek/deepseek-v4-flash": {
    input: 0.09,
    output: 0.18,
    cacheWrite: 0,
    cacheRead: 0,
    source: "каталог OpenRouter, 2026-08-06",
  },
  "z-ai/glm-5.2": {
    input: 0.7,
    output: 2.2,
    cacheWrite: 0,
    cacheRead: 0,
    source: "каталог OpenRouter, 2026-08-06 (медіана провайдерів)",
  },
};

/**
 * Ціна моделі. Спершу продова Anthropic-таблиця (prefix-match, як у
 * `pickAnthropicPricing`), далі — OpenRouter-таблиця вище.
 *
 * `null` = моделі немає в жодній таблиці. Для звіту це не «нуль», а «ми не
 * знаємо» — і рівно цей стан у проді означає, що бюджетний гвард сліпий.
 */
export function priceFor(model: string): Price | null {
  for (const [prefix, p] of Object.entries(ANTHROPIC_PRICING_USD_PER_MTOK)) {
    if (model.startsWith(prefix))
      return { ...toPrice(p), source: "aiPricing.ts" };
  }
  return OPENROUTER_PRICES[model] ?? null;
}

function toPrice(p: AnthropicModelPricing): Omit<Price, "source"> {
  return {
    input: p.input,
    output: p.output,
    cacheWrite: p.cacheWrite,
    cacheRead: p.cacheRead,
  };
}

/** Чи знає репо ціну цієї моделі (= чи рухає вона лічильник бюджету). */
export function isBudgetVisible(model: string): boolean {
  for (const prefix of Object.keys(ANTHROPIC_PRICING_USD_PER_MTOK)) {
    if (model.startsWith(prefix)) return true;
  }
  return false;
}

// ── Вартість одного виклику ──────────────────────────────────────────

export interface CallShape {
  model: string;
  /** Стабільний префікс (tools + системний промпт), однаковий на кожному турі. */
  prefixTokens: number;
  /** Змінна частина входу: клієнтський контекст, репліка, tool_result. */
  freshTokens: number;
  outputTokens: number;
  /** Кеш працює лише на прямому Anthropic І якщо префікс > мінімуму моделі. */
  cached: boolean;
  /** Скільки повідомлень у сесії ділять один кешований запис (TTL=1h). */
  sessionMessages?: number;
}

/**
 * Мінімальна довжина кешованого префікса, токени. Нижче порогу Anthropic
 * мовчки не створює запис (`cache_creation_input_tokens: 0`) — не помилка,
 * але й не економія. Джерело: `promptCache.ts` § перший абзац.
 */
export const MIN_CACHEABLE_TOKENS: Record<string, number> = {
  "claude-haiku-4-5": 4096,
  "claude-sonnet-4-6": 2048,
};

export function minCacheable(model: string): number | null {
  for (const [prefix, min] of Object.entries(MIN_CACHEABLE_TOKENS)) {
    if (model.startsWith(prefix)) return min;
  }
  return null;
}

/** Сумарний множник на кешований префікс за N повідомлень (TTL=1h). */
export function cachedPrefixMultiplier(messages: number): number {
  return 2 + 0.1 * (Math.max(1, messages) - 1);
}

/** USD за один виклик. `null` — ціни моделі не знає ані код, ані ця модель. */
export function callCostUsd(shape: CallShape): number | null {
  const price = priceFor(shape.model);
  if (!price) return null;

  const min = minCacheable(shape.model);
  const cacheActive = shape.cached && min !== null && shape.prefixTokens >= min;

  const prefixCost = cacheActive
    ? (shape.prefixTokens *
        cachedPrefixMultiplier(shape.sessionMessages ?? 1) *
        price.input) /
      (shape.sessionMessages ?? 1)
    : shape.prefixTokens * price.input;

  return (
    (prefixCost +
      shape.freshTokens * price.input +
      shape.outputTokens * price.output) /
    1e6
  );
}
