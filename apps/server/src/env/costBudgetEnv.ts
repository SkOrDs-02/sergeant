import {
  floatFromEnv,
  intFromEnv,
  strictBoolFromEnv,
  strictFloatFromEnv,
  stringWithDefault,
} from "./envHelpers.js";

/**
 * Поля вартості й бюджету AI — винесені з `env.ts` тим самим прийомом, що
 * `aiMemoryEnv.ts` і `pgEnv.ts` (Hard Rule #18, `max-lines: 600`).
 *
 * Стелі бюджету (`*_BUDGET_*`) парсить `strictFloatFromEnv`, прапорці
 * `ANTHROPIC_BUDGET_*` — `strictBoolFromEnv`: битий конфіг валить старт, а не
 * вимикає алярм мовчки (аудит ai-pipeline B15/B16). `*_MONTHLY_COST_USD` —
 * лише довідкові числа для дашборду, тож лишились на `floatFromEnv`.
 */
export const costBudgetEnvShape = {
  HETZNER_MONTHLY_COST_USD: floatFromEnv(0),

  HETZNER_PLAN: stringWithDefault("cx23"),

  VERCEL_MONTHLY_COST_USD: floatFromEnv(0),

  VERCEL_PLAN: stringWithDefault("hobby"),

  POSTHOG_MONTHLY_COST_USD: floatFromEnv(0),

  POSTHOG_PLAN: stringWithDefault("free"),

  SENTRY_MONTHLY_COST_USD: floatFromEnv(0),

  SENTRY_PLAN: stringWithDefault("developer"),

  ANTHROPIC_MONTHLY_BUDGET_USD: strictFloatFromEnv(
    "ANTHROPIC_MONTHLY_BUDGET_USD",
    0,
  ),

  ANTHROPIC_PLAN: stringWithDefault("usage"),

  VOYAGE_MONTHLY_BUDGET_USD: strictFloatFromEnv("VOYAGE_MONTHLY_BUDGET_USD", 0),

  VOYAGE_PLAN: stringWithDefault("usage"),

  VOYAGE_DAILY_BUDGET_USD: strictFloatFromEnv("VOYAGE_DAILY_BUDGET_USD", 0),

  ANTHROPIC_BUDGET_SOFT_USD: strictFloatFromEnv("ANTHROPIC_BUDGET_SOFT_USD", 3),
  ANTHROPIC_BUDGET_HARD_USD: strictFloatFromEnv("ANTHROPIC_BUDGET_HARD_USD", 5),

  ANTHROPIC_BUDGET_CHECK_INTERVAL_MS: intFromEnv(300_000),

  ANTHROPIC_BUDGET_ALERT_ENABLED: strictBoolFromEnv(
    "ANTHROPIC_BUDGET_ALERT_ENABLED",
    true,
  ),

  ANTHROPIC_BUDGET_HARD_DEGRADE_ALL: strictBoolFromEnv(
    "ANTHROPIC_BUDGET_HARD_DEGRADE_ALL",
    false,
  ),

  VOYAGE_DAILY_BUDGET_USD_SOFT: strictFloatFromEnv(
    "VOYAGE_DAILY_BUDGET_USD_SOFT",
    1,
  ),

  VOYAGE_DAILY_BUDGET_USD_HARD: strictFloatFromEnv(
    "VOYAGE_DAILY_BUDGET_USD_HARD",
    5,
  ),
};
