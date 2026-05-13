/**
 * Per-day cost budget enforcement для OpenClaw (ADR-0031 §7).
 *
 * Pre-call check: caller (tools/openclaw DM-handler) запитує цей модуль
 * "чи можу я зробити ще один Claude-call?" — модуль читає `getDailyCostUsd`
 * + порівнює з `OPENCLAW_DAILY_USD_BUDGET`. Якщо ratio > threshold (default
 * 0.95 — 5% buffer для current call) — fail-closed.
 *
 * Чому 5% buffer: типовий call ~$0.05 (~5K input + 1K output для Sonnet
 * 4.6 при ~$3/$15 per 1M tokens). Приблизно 1% від $5 cap. Залишаємо 5%
 * щоб точно навіть з max-iter-call-ом не overshoot-ити.
 */

import type { Pool } from "pg";
import { env } from "../../env.js";
import { getDailyCostUsd } from "./store.js";

export interface BudgetCheckResult {
  allowed: boolean;
  spentUsd: number;
  budgetUsd: number;
  /** Headroom (USD), лишається сьогодні. >= 0 для allowed=true. */
  remainingUsd: number;
  /** Reason для fail (якщо allowed=false). */
  reason?: "budget_exceeded";
}

/**
 * Перевіряє, чи дозволений черговий виклик. Реальний ціновий аккаунтинг
 * відбувається пост-фактум (`finalizeInvocation` пише `cost_usd`).
 *
 * `tzName` — IANA TZ для day-boundary. Default з env-у
 * `OPENCLAW_DAILY_MORNING_AT` rfc-парсив-би TZ; для простоти Phase 1
 * хардкодим `Europe/Kyiv` нижче (override-иться через `tzName`-arg для
 * тестів).
 */
export async function checkDailyBudget(
  pool: Pool,
  founderUserId: string,
  tzName: string = "Europe/Kyiv",
): Promise<BudgetCheckResult> {
  const budgetUsd = parseFloat(env.OPENCLAW_DAILY_USD_BUDGET);
  const safeBudget =
    Number.isFinite(budgetUsd) && budgetUsd > 0 ? budgetUsd : 5;

  const spentUsd = await getDailyCostUsd(pool, founderUserId, tzName);
  const remainingUsd = safeBudget - spentUsd;

  // 95% threshold — лишаємо 5% headroom на поточний виклик.
  const threshold = safeBudget * 0.95;
  if (spentUsd >= threshold) {
    return {
      allowed: false,
      spentUsd,
      budgetUsd: safeBudget,
      remainingUsd,
      reason: "budget_exceeded",
    };
  }

  return {
    allowed: true,
    spentUsd,
    budgetUsd: safeBudget,
    remainingUsd,
  };
}

/**
 * Оцінка cost для Anthropic-call-у з input/output token-counts. Sonnet
 * 4.6 pricing: $3 / 1M input, $15 / 1M output. Cache-write x1.25, cache-read
 * x0.1 — caller сам передає cached/uncached breakdown якщо потрібно.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreateTokens?: number;
}

export function estimateClaudeSonnetCostUsd(usage: TokenUsage): number {
  const INPUT_PER_MTOK = 3.0;
  const OUTPUT_PER_MTOK = 15.0;
  const CACHE_READ_PER_MTOK = 0.3;
  const CACHE_CREATE_PER_MTOK = 3.75;

  const million = 1_000_000;
  const input = (usage.inputTokens * INPUT_PER_MTOK) / million;
  const output = (usage.outputTokens * OUTPUT_PER_MTOK) / million;
  const cacheRead =
    ((usage.cacheReadTokens ?? 0) * CACHE_READ_PER_MTOK) / million;
  const cacheCreate =
    ((usage.cacheCreateTokens ?? 0) * CACHE_CREATE_PER_MTOK) / million;

  // Округлюємо до 4-х знаків (NUMERIC(10,4) у Postgres).
  const total = input + output + cacheRead + cacheCreate;
  return Math.round(total * 10_000) / 10_000;
}
