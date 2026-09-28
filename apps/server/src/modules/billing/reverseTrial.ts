import type { Pool } from "pg";
import { env } from "../../env/env.js";
import { logger } from "../../obs/logger.js";

export const REVERSE_TRIAL_DAYS = 7;

/**
 * Reverse trial для НОВОГО акаунта (спека `docs/work/specs/access-tiers.md`):
 * рядок `trialing` на 7 днів. Cron спливання не потрібен: `getUserPlan`
 * вважає `trialing` активним, лише доки `current_period_end > now()`, тож на
 * 8-й день людина сама стає Free. Один trial на акаунт гарантує те, що
 * рядок пишеться тільки з хука створення користувача.
 *
 * AI-CONTEXT: за прапорцем `BILLING_REVERSE_TRIAL_ENABLED` (дефолт false).
 * AI-квоти діють у проді незалежно від білінгу, тож trial без прапорця дав
 * би кожному новому акаунту тиждень AI без ліміту ще до запуску Premium.
 *
 * Помилка вставки не валить реєстрацію: логуємо і йдемо далі.
 */
export async function grantReverseTrial(
  pool: Pool,
  userId: string,
  enabled: boolean = env.BILLING_REVERSE_TRIAL_ENABLED,
): Promise<boolean> {
  if (!enabled) return false;
  try {
    const r = await pool.query(
      `INSERT INTO subscriptions
         (user_id, plan, status, provider, trial_ends_at, current_period_end)
       VALUES ($1, 'pro', 'trialing', 'manual',
               NOW() + make_interval(days => $2),
               NOW() + make_interval(days => $2))
       ON CONFLICT DO NOTHING`,
      [userId, REVERSE_TRIAL_DAYS],
    );
    return (r.rowCount ?? 0) > 0;
  } catch (err) {
    logger.warn(
      {
        event: "billing.reverse_trial.insert_failed",
        err: err instanceof Error ? err.message : String(err),
      },
      "reverse trial insert failed, signup continues without trial",
    );
    return false;
  }
}
