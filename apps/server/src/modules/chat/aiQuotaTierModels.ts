/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * Яка модель відповідає якому тиру — і прапорці, що на це впливають.
 *
 * AI-CONTEXT: винесено з `aiQuota.ts` (Hard Rule #18 — той файл упирався в
 * стелю 600 рядків коду, і будь-яка нова гілка тирингу її пробивала). Це та
 * сама операція, якою з нього раніше вийшли `aiQuotaBudget.ts`,
 * `aiQuotaCircuitBreaker.ts` і `aiQuotaHealth.ts`. Межа проведена по змісту, а
 * не по рядках: тут лише «tier + endpoint → model-id» і прапорці, що це
 * рішення перемикають; облік відер і сам каскад лишились у `aiQuota.ts`.
 *
 * Усе читає `process.env` напряму, а не cached `env`-обʼєкт — щоб тести
 * фліпали прапорці в ран-таймі без ре-імпорту модуля, і щоб ops міг змінити
 * поведінку без редеплою.
 */
import type { Response } from "express";

import { defaultChatModel } from "../../env/chatModels.js";

/** Рівень моделі для Pro у поточну добу. */
export type ProTier = "premium" | "standard" | "floor";
/** Поверхня, що споживає tier (різні дефолтні моделі). */
export type ProEndpoint = "chat" | "coach";

export interface ProTierResult {
  tier: ProTier;
  /** Готовий model-id для caller-а (Anthropic id для chat, OpenRouter для coach). */
  model: string;
  /** Залишок premium/standard-запитів; `null` коли tiering не застосовано. */
  remaining: number | null;
  limit: number | null;
}

export function tieredProEnabled(): boolean {
  const v = process.env["AI_TIERED_PRO_ENABLED"];
  // Unset/empty → default ON, mirroring the zod `boolFromEnv(true)` default
  // declared in `env.ts` (AI_TIERED_PRO_ENABLED). Explicit "false"/"0" opts
  // out; any other explicit value falls back to the same default-true.
  if (v === undefined || v === "") return true;
  const lower = v.toLowerCase();
  return lower !== "0" && lower !== "false";
}

/**
 * Opt-in catastrophic-cost circuit-breaker. Коли увімкнено І денний глобальний
 * Anthropic-spend перевищив hard-поріг — `resolveProTier` деградує всіх
 * не-founder юзерів на floor-модель (див. `ANTHROPIC_BUDGET_HARD_DEGRADE_ALL`
 * у env.ts). Default off.
 */
export function hardBreachDegradeAllEnabled(): boolean {
  const v = process.env["ANTHROPIC_BUDGET_HARD_DEGRADE_ALL"]?.toLowerCase();
  return v === "1" || v === "true";
}

/**
 * Kill-switch назад на premium для Free/анона (стан до 2026-08-06). Default OFF.
 *
 * Існує, щоб відкотити без редеплою, якщо якість Free просяде сильніше за
 * очікуване: стенд глибини аналізу (докстрінг `env/chatModels.ts`) дає premium
 * 16/16 проти standard 13/16 на пастках із розбіжностями в числах.
 */
export function freeOnPremiumEnabled(): boolean {
  const v = process.env["AI_FREE_ON_PREMIUM"]?.toLowerCase();
  return v === "1" || v === "true";
}

function envStr(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

/**
 * Дефолтні моделі по (tier × endpoint). Premium reuse-ить наявні env.
 *
 * Chat-дефолти беруться з `defaultChatModel()` — того самого джерела, що й
 * zod-дефолти в `env/env.ts`. WHY не хардкод: під `CHAT_VIA_OPENROUTER=true`
 * чат ходить у шлюз і потребує OpenRouter-id (`z-ai/glm-5.2`,
 * `deepseek/deepseek-v4-flash`), під `false` — Claude-id, бо прямий Anthropic
 * на перші відповість 404. Розійдуться два списки — тиринг почне мовчки слати
 * модель не в той шлюз.
 */
const PRO_TIER_MODEL: Record<ProTier, Record<ProEndpoint, () => string>> = {
  premium: {
    chat: () => envStr("CHAT_MODEL_SYNTHESIS", defaultChatModel("synthesis")),
    // Sonnet, а не `openai/gpt-5.1` (стояло тут до 2026-08-07).
    //
    // Заміна зроблена за фактом, а не за прайс-листом. Замір за 12 днів у
    // проді показав, що з десяти викликів коуча девʼять обслуговував
    // `claude-sonnet-4-6` — тобто OpenRouter падав, і його мовчки підміняв
    // anthropic-фолбек (`FallbackProvider` у `lib/llm/provider.ts`). Тобто
    // gpt-5.1 фактично ніколи не працював, а обґрунтування «у коуча
    // НАЙБІЛЬШИЙ розрив у якості» в `aiQuota.ts::unpaid` спиралось на
    // модель, якої користувач не бачив.
    //
    // Найімовірніша причина падінь — 20-секундний таймаут у `coach.ts`
    // проти reasoning-моделі; каталог OpenRouter це підтверджує непрямо:
    // gpt-5.1 дешевший ЗА ТОКЕН ($1.25/$10 проти $3/$15), але вийшов
    // удвічі дорожчим ЗА ВИКЛИК ($20.2/1k проти $8.97/1k) — різницю дають
    // reasoning-токени, які й зʼїдають таймаут.
    //
    // Ставимо рівно ту модель, що вже обслуговує коуча, тільки через шлюз:
    // якість та сама, шлях один, вартість видно в одному місці.
    coach: () =>
      envStr("OPENROUTER_COACH_MODEL", "anthropic/claude-sonnet-4.6"),
  },
  standard: {
    chat: () =>
      envStr("AI_PRO_STANDARD_CHAT_MODEL", defaultChatModel("standard")),
    // `gemini-3.5-flash-lite`, а не `gemini-2.5-flash-lite` (стояло тут до
    // 2026-08-26). Рішення власника за виміром 2026-08-25: 8/8 на коуч-стенді,
    // НУЛЬ порушень голосу, 987 мс. Свідомо приймається зростання ціни втричі
    // за вхід і вшестеро за вихід ($0.16 → $0.64 на 1k викликів).
    //
    // AI-DANGER: НЕ став сюди `gemini-3.7-flash`, навіть попри те, що вона
    // стоїть на floor-тирі ЧАТУ. На коуч-стенді вона дала лише 3/8 — це різні
    // задачі, і «найкраща для чату» не означає «годиться для коуча».
    coach: () =>
      envStr("AI_PRO_STANDARD_COACH_MODEL", "google/gemini-3.5-flash-lite"),
  },
  floor: {
    chat: () => envStr("AI_PRO_FLOOR_CHAT_MODEL", defaultChatModel("floor")),
    coach: () =>
      envStr("AI_PRO_FLOOR_COACH_MODEL", "google/gemini-3.5-flash-lite"),
  },
};

export function tierModel(tier: ProTier, endpoint: ProEndpoint): string {
  return PRO_TIER_MODEL[tier][endpoint]();
}

export function setTierHeader(res: Response, tier: ProTier): void {
  try {
    res.setHeader("X-AI-Tier", tier);
  } catch {
    /* ignore */
  }
}
