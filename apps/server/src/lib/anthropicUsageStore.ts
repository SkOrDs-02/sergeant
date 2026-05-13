/**
 * PR-12 (initiative 0019 AI cost tracking) — DB-ledger для Anthropic-викликів.
 *
 * Кожен успішний Anthropic-виклик ми вже інкрементуємо у Prometheus
 * (`recordAnthropicUsage` у `lib/anthropic.ts`); цей модуль додає
 * паралельний persistent-ledger у `ai_usage_daily`. Чому окремий sink:
 *   1. Grafana counter — short-term observability, потребує scrape.
 *   2. DB — джерело істини для cost-dashboard (PR-13) і
 *      budget-alert-у (PR-14), щоб ці консьюмери НЕ залежали від
 *      доступності Prometheus у Railway.
 *
 * Storage shape (див. міграцію 059):
 *   PK   `(subject_key, usage_day, bucket)`
 *   bucket = `anthropic:<model>`
 *   subject_key = `provider:anthropic` (provider-level aggregate,
 *               не per-user — для PR-12 cost-tracking
 *               нам потрібен global usage view, per-user-ліміти
 *               вже окремо обчислюються у `aiQuota.ts`).
 *   request_count    += 1
 *   input_tokens     += response.usage.input_tokens
 *   output_tokens    += response.usage.output_tokens
 *   total_tokens     += input + output
 *   est_cost_usd     += estimateAnthropicCostUsd(model, usage)
 *
 * Fail-open: ВСІ помилки DB глушаться через `logger.warn`. Anthropic
 * response клієнт уже отримав; ламати successful-call через ledger-failure
 * нелогічно (та й контрпродуктивно — payment уже зроблений Anthropic-у).
 * Pattern взято з PR-33 transcribe `recordTranscribeUsdSpend()`.
 *
 * Kyiv day boundary за Domain invariants (Europe/Kyiv) — щоб межа дня
 * співпадала з cost-dashboard-ом і budget-alert-ом, які теж агрегують
 * по Kyiv-добі.
 */

import pool from "../db.js";
import { logger } from "../obs/logger.js";
import {
  estimateAnthropicCostUsd,
  type AnthropicUsageTokens,
} from "./aiPricing.js";

/** Стале значення subject_key для provider-level Anthropic aggregate. */
export const ANTHROPIC_PROVIDER_SUBJECT = "provider:anthropic";

/** Префікс bucket-у — узгоджений із CHECK-constraint-ом у міграції 059. */
const ANTHROPIC_BUCKET_PREFIX = "anthropic:";

function todayKyiv(): string {
  // sv-SE locale → yyyy-mm-dd; той самий патерн, що у `transcribe/usdCap.ts`
  // (єдиний централізований Kyiv-helper-а у репо ще немає — PR-12 не
  // розширює scope).
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Kyiv",
  });
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value > 0 ? Math.floor(value) : 0;
}

function bucketFor(model: string): string {
  return `${ANTHROPIC_BUCKET_PREFIX}${model}`;
}

/**
 * Записує usage одного Anthropic-виклику у `ai_usage_daily`. Викликається
 * з `recordUsage` (non-streaming) і `recordAnthropicUsage` (streaming —
 * через `chat.ts` SSE message_start path).
 *
 * NEVER throws — будь-який збій логується і ковтається. Це advisory-фіча;
 * Anthropic-виклик уже успішно повернув response до моменту виклику цього
 * helper-а.
 *
 * `await`-итись цей helper не зобов'язаний (fire-and-forget). Але ми все
 * одно повертаємо `Promise<void>`, щоб caller-и, які мокають у тестах
 * (інтеграційні), могли дочекатися завершення INSERT-у.
 */
export async function recordAnthropicUsageToDb(
  model: string,
  usage: AnthropicUsageTokens | null | undefined,
): Promise<void> {
  if (!usage) return;
  if (!model || model === "unknown") return;

  const inTok = toNonNegativeInt(usage.input_tokens);
  const outTok = toNonNegativeInt(usage.output_tokens);
  const cwTok = toNonNegativeInt(usage.cache_creation_input_tokens);
  const crTok = toNonNegativeInt(usage.cache_read_input_tokens);
  const totalTok = inTok + outTok + cwTok + crTok;
  if (totalTok === 0) return;

  // estimateAnthropicCostUsd → null коли pricing невідомий: токени все
  // одно пишемо (для діагностики usage), просто est_cost_usd лишається
  // у DEFAULT 0.
  const estCost = estimateAnthropicCostUsd(model, usage) ?? 0;

  const day = todayKyiv();
  const bucket = bucketFor(model);

  try {
    await pool.query(
      `INSERT INTO ai_usage_daily (
         subject_key,
         usage_day,
         bucket,
         request_count,
         input_tokens,
         output_tokens,
         total_tokens,
         est_cost_usd
       )
       VALUES ($1, $2::date, $3, 1, $4, $5, $6, $7)
       ON CONFLICT (subject_key, usage_day, bucket) DO UPDATE SET
         request_count = ai_usage_daily.request_count + 1,
         input_tokens  = ai_usage_daily.input_tokens  + EXCLUDED.input_tokens,
         output_tokens = ai_usage_daily.output_tokens + EXCLUDED.output_tokens,
         total_tokens  = ai_usage_daily.total_tokens  + EXCLUDED.total_tokens,
         est_cost_usd  = ai_usage_daily.est_cost_usd  + EXCLUDED.est_cost_usd`,
      [
        ANTHROPIC_PROVIDER_SUBJECT,
        day,
        bucket,
        inTok + crTok + cwTok,
        outTok,
        totalTok,
        estCost,
      ],
    );
  } catch (err) {
    logger.warn({
      msg: "anthropic_usage_ledger_failed",
      err: err instanceof Error ? err.message : String(err),
      model,
      day,
      bucket,
    });
  }
}

/** Експорти для тестів (без зміни public surface). */
export const __testing = {
  todayKyiv,
  bucketFor,
  ANTHROPIC_BUCKET_PREFIX,
};
