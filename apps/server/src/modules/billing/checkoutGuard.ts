/**
 * Гейт `POST /api/billing/checkout` (аудит 2026-10-01, data-21).
 *
 * Роут раніше дивився лише на rate-limit: дві вкладки чи повернення назад до
 * оплати давали дві живі сторінки оплати, а з ними - оплату без Pro і/або
 * подвійні щомісячні списання. Тепер checkout відхиляється ДО звернення до
 * провайдера:
 *   - `409 ALREADY_SUBSCRIBED` - у користувача вже є діючий платний
 *     ентайтлмент (рядок не `manual`, період ще біжить / триває grace);
 *   - `409 CHECKOUT_PENDING` - є непідтверджений Plata-checkout, молодший за
 *     час життя `pageUrl`: його ще можуть оплатити в іншій вкладці.
 *
 * Reverse trial і ручні гранти (`provider = 'manual'`) НЕ блокують: перехід
 * trial -> платна підписка - це і є мета checkout-у.
 *
 * Предикат ентайтлменту дзеркалить {@link ./getUserPlan} (період ще біжить;
 * `past_due` - доки діє grace), але без founder-байпасу й без вимоги
 * `plan = 'pro'`: нас цікавить, чи є живе платіжне зобовʼязання.
 */
import type { Pool } from "pg";
import { AppError } from "../../obs/errors.js";
import { GRACE_FALLBACK_DAYS } from "./getUserPlan.js";
import { SUBSCRIPTION_VALIDITY_SECONDS } from "./plata.js";

export const ALREADY_SUBSCRIBED_CODE = "ALREADY_SUBSCRIBED";
export const CHECKOUT_PENDING_CODE = "CHECKOUT_PENDING";

/**
 * Кидає 409, якщо новий checkout створювати не можна. Нічого не робить, коли
 * можна. Пул - звичайний `pool.query` (read-only).
 */
export async function assertCheckoutAllowed(
  pool: Pool,
  userId: string,
): Promise<void> {
  const entitled = await pool.query(
    `SELECT 1
       FROM subscriptions
      WHERE user_id = $1
        AND provider <> 'manual'
        AND (
          (status IN ('active', 'trialing')
            AND (current_period_end IS NULL OR current_period_end > NOW()))
          OR (status = 'past_due'
            AND COALESCE(grace_period_ends_at,
                         current_period_end + make_interval(days => $2)) > NOW())
        )
      LIMIT 1`,
    [userId, GRACE_FALLBACK_DAYS],
  );
  if (entitled.rows.length > 0) {
    throw new AppError("User already has an active subscription", {
      status: 409,
      code: ALREADY_SUBSCRIBED_CODE,
    });
  }

  const pending = await pool.query(
    `SELECT 1
       FROM plata_subscription
      WHERE user_id = $1
        AND confirmed_at IS NULL
        AND superseded_at IS NULL
        AND created_at > NOW() - make_interval(secs => $2)
      LIMIT 1`,
    [userId, SUBSCRIPTION_VALIDITY_SECONDS],
  );
  if (pending.rows.length > 0) {
    throw new AppError("A checkout for this user is still pending", {
      status: 409,
      code: CHECKOUT_PENDING_CODE,
    });
  }
}
