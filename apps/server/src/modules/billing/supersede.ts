/**
 * Заміна живої рекурентки новою (аудит 2026-10-01, data-21).
 *
 * Слот `subscriptions_user_active_idx` один на користувача, тож активація
 * другої платної підписки (інший провайдер АБО інший `provider_subscription_id`
 * того ж провайдера) раніше просто перезаписувала `provider` і id у тому самому
 * рядку. Перша підписка лишалась жива в провайдера, і її вже нічим не можна було
 * скасувати: застосунок знає лише про поточний id. Гроші списувались двічі.
 *
 * Активація працює у чотири кроки (outbox-патерн):
 *   1. {@link findSupersededRecurrence} - ДО upsert-у читає живий рядок і
 *      вирішує, чи є що замінювати (в транзакції викликача);
 *   2. upsert нового рядка (викликач; скидає `cancel_at_period_end`);
 *   3. {@link recordSupersededRecurrence} - у ТІЙ САМІЙ транзакції записує
 *      намір скасувати стару рекурентку (`billing_pending_cancellation`) і
 *      позначає її "замінену нами";
 *   4. {@link settleSupersededRecurrence} - ПІСЛЯ COMMIT скасовує стару на боці
 *      її провайдера. Ніколи не кидає.
 *
 * Чому скасування НЕ відкочує активацію (рев'ю 2026-10-10). Нова підписка вже
 * оплачена: відкат лишав людину, яка заплатила, без Pro, а Plata-звірка B після
 * години й callback-ретраї LiqPay закінчувались, тож B не активувалась ніколи
 * (стара могла бути вже мертвою: період і grace минули, `order_not_found`,
 * монобанк 400/404, провайдер вимкнений). Тепер активація комітиться завжди, а
 * невдале скасування лишається в черзі: {@link retryPendingCancellations}
 * добиває його ретрай-полер, а вичерпання спроб лунає error-логом і метрикою
 * `billing_supersede_cancel_total{result="abandoned"}`.
 *
 * Не вважається заміною: `manual` (reverse trial, гранти - рекурентки нема),
 * рядок без `provider_subscription_id`, той самий провайдер з тим самим id
 * (звичайні поновлення).
 */
import type { Pool, PoolClient } from "pg";
import { logger } from "../../obs/logger.js";
import { billingSupersedeCancelTotal } from "../../obs/metrics.js";
import {
  BillingConfigurationError,
  ProviderSubscriptionGoneError,
  type ProviderId,
} from "./provider.js";
import { unsubscribeLiqPayOrder } from "./liqpayRemote.js";
import { cancelPlataRemoteSubscription } from "./plataRemote.js";
import { cancelStripeRemoteSubscription } from "./stripeRemote.js";

type Queryable = Pick<Pool | PoolClient, "query">;

/** Скільки разів намагаємось скасувати замінену підписку, перш ніж здатись. */
export const MAX_CANCEL_ATTEMPTS = 24;
/** Мінімальна пауза між спробами для ретрай-полера. */
const RETRY_SPACING_MINUTES = 30;

export interface PreviousRecurrence {
  provider: string;
  subscriptionId: string;
  /** Скасування вже підтверджене провайдером (`cancel_at_period_end`) - вдруге не смикаємо. */
  alreadyCanceling: boolean;
}

export interface NextRecurrence {
  provider: ProviderId;
  /** `null` = активація не несе id (Stripe checkout без subscription): id лишається поточним. */
  subscriptionId: string | null;
}

/**
 * Живий рядок користувача, який нова активація витісняє, або `null`.
 * `FOR UPDATE` серіалізує дві одночасні активації одного користувача, коли
 * виклик іде в транзакції (поза нею блокування знімається одразу - нешкідливо).
 */
export async function findSupersededRecurrence(
  db: Queryable,
  userId: string,
  next: NextRecurrence,
): Promise<PreviousRecurrence | null> {
  const { rows } = await db.query<{
    provider: string;
    provider_subscription_id: string | null;
    cancel_at_period_end: boolean;
  }>(
    `SELECT provider, provider_subscription_id, cancel_at_period_end
       FROM subscriptions
      WHERE user_id = $1 AND status IN ('active', 'trialing', 'past_due')
      LIMIT 1
      FOR UPDATE`,
    [userId],
  );
  const prev = rows[0];
  if (!prev || prev.provider === "manual") return null;
  const prevId = prev.provider_subscription_id;
  if (!prevId) return null;
  if (
    prev.provider === next.provider &&
    (next.subscriptionId === null || next.subscriptionId === prevId)
  ) {
    return null;
  }
  return {
    provider: prev.provider,
    subscriptionId: prevId,
    alreadyCanceling: prev.cancel_at_period_end === true,
  };
}

/**
 * Чи ми самі замінили цю рекурентку новою. Запізнілий callback/вебхук по ній
 * не має ані активуватись, ані гасити нову підписку.
 */
export async function isSupersededRecurrence(
  db: Queryable,
  provider: string,
  subscriptionId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM billing_pending_cancellation
      WHERE provider = $1 AND provider_subscription_id = $2
      LIMIT 1`,
    [provider, subscriptionId],
  );
  return rows.length > 0;
}

/**
 * Крок 3: у транзакції активації записує намір скасувати стару рекурентку.
 * Для Plata ще й ставить `superseded_at`: звірка такі рядки пропускає, інакше
 * запізнілий вебхук по старому id міг би знову "активувати" його поверх нової.
 *
 * @returns що саме треба скасувати у провайдера ПІСЛЯ COMMIT
 *   ({@link settleSupersededRecurrence}), або `null`, коли скасування вже
 *   підтверджене раніше (`alreadyCanceling`) і провайдера смикати не треба.
 */
export async function recordSupersededRecurrence(
  db: Queryable,
  userId: string,
  prev: PreviousRecurrence,
): Promise<PreviousRecurrence | null> {
  if (prev.provider === "plata") {
    await db.query(
      `UPDATE plata_subscription
          SET superseded_at = COALESCE(superseded_at, NOW()), updated_at = NOW()
        WHERE subscription_id = $1`,
      [prev.subscriptionId],
    );
  }
  if (prev.alreadyCanceling) {
    // Слід "замінено нами" потрібен і тут (ігнорування запізнілих callback-ів),
    // але вже resolved: провайдер скасування підтвердив раніше.
    await db.query(
      `INSERT INTO billing_pending_cancellation
         (provider, provider_subscription_id, user_id, resolved_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (provider, provider_subscription_id) DO NOTHING`,
      [prev.provider, prev.subscriptionId, userId],
    );
    logger.info({
      msg: "billing_previous_recurrence_superseded",
      provider: prev.provider,
      alreadyCanceling: true,
    });
    return null;
  }
  // Повторна заміна тієї ж підписки (resolved -> знову відкрита) скидає лічильник.
  await db.query(
    `INSERT INTO billing_pending_cancellation
       (provider, provider_subscription_id, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider, provider_subscription_id) DO UPDATE SET
       resolved_at = NULL, attempts = 0, last_attempt_at = NULL`,
    [prev.provider, prev.subscriptionId, userId],
  );
  logger.info({
    msg: "billing_previous_recurrence_superseded",
    provider: prev.provider,
    alreadyCanceling: false,
  });
  return prev;
}

type RemoteOutcome = "cancelled" | "gone" | "unsupported";

/** Віддалене скасування: успіх, "підписки вже нема" або `throw`. */
async function cancelAtProvider(
  provider: string,
  subscriptionId: string,
): Promise<RemoteOutcome> {
  try {
    switch (provider) {
      case "plata":
        await cancelPlataRemoteSubscription(subscriptionId);
        return "cancelled";
      case "liqpay":
        await unsubscribeLiqPayOrder(subscriptionId);
        return "cancelled";
      case "stripe":
        if (!(await cancelStripeRemoteSubscription(subscriptionId))) {
          throw new BillingConfigurationError("STRIPE_SECRET_KEY is not set");
        }
        return "cancelled";
      default:
        // apple/google: рекурентки там керує стор, скасувати звідси нічим.
        return "unsupported";
    }
  } catch (err) {
    if (err instanceof ProviderSubscriptionGoneError) return "gone";
    throw err;
  }
}

/**
 * Крок 4 (і одиниця ретраю): одна спроба скасувати замінену рекурентку у
 * провайдера. Ніколи не кидає - викликається після COMMIT активації, яку
 * відкотити вже не можна. Помилка лишає рядок відкритим для наступної спроби.
 */
export async function settleSupersededRecurrence(
  pool: Queryable,
  prev: Pick<PreviousRecurrence, "provider" | "subscriptionId">,
): Promise<void> {
  const { provider, subscriptionId } = prev;
  try {
    // Заявка на спробу: інкремент до виклику, щоб креш посеред нього теж
    // рахувався. Нічого не повернулось - уже закрито (або рядка нема).
    const claim = await pool.query<{ attempts: number }>(
      `UPDATE billing_pending_cancellation
          SET attempts = attempts + 1, last_attempt_at = NOW()
        WHERE provider = $1 AND provider_subscription_id = $2
          AND resolved_at IS NULL
        RETURNING attempts`,
      [provider, subscriptionId],
    );
    const attempts = claim.rows[0]?.attempts;
    if (attempts === undefined) return;

    let outcome: RemoteOutcome;
    try {
      outcome = await cancelAtProvider(provider, subscriptionId);
    } catch (err) {
      const abandoned = attempts >= MAX_CANCEL_ATTEMPTS;
      billingSupersedeCancelTotal.inc({
        provider,
        result: abandoned ? "abandoned" : "failed",
      });
      // Алерт: стара рекурентка може й далі списувати гроші. Текст відповіді
      // провайдера не логуємо (Hard Rule #21) - лише наше повідомлення зі статусом.
      logger.error({
        msg: abandoned
          ? "billing_supersede_cancel_abandoned"
          : "billing_supersede_cancel_failed",
        provider,
        attempts,
        err: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    await pool.query(
      `UPDATE billing_pending_cancellation
          SET resolved_at = NOW()
        WHERE provider = $1 AND provider_subscription_id = $2`,
      [provider, subscriptionId],
    );
    if (outcome === "unsupported") {
      logger.warn({ msg: "billing_supersede_provider_unsupported", provider });
      return;
    }
    billingSupersedeCancelTotal.inc({ provider, result: outcome });
    logger.info({ msg: "billing_supersede_cancel_settled", provider, outcome });
  } catch (err) {
    // БД лягла посеред розрахунку: рядок лишився відкритим, добʼє ретрай.
    logger.error({
      msg: "billing_supersede_settle_error",
      provider,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Добиває відкриті скасування (креш між COMMIT і викликом провайдера,
 * тимчасова відмова). Рядки, що вичерпали {@link MAX_CANCEL_ATTEMPTS}, лишаються
 * відкритими для ручного розбору (error-лог + метрика `abandoned` уже були).
 */
export async function retryPendingCancellations(
  pool: Pool,
  limit = 20,
): Promise<{ processed: number }> {
  const { rows } = await pool.query<{
    provider: string;
    provider_subscription_id: string;
  }>(
    `SELECT provider, provider_subscription_id
       FROM billing_pending_cancellation
      WHERE resolved_at IS NULL
        AND attempts < $1
        AND (last_attempt_at IS NULL
             OR last_attempt_at < NOW() - make_interval(mins => $2))
      ORDER BY created_at
      LIMIT $3`,
    [MAX_CANCEL_ATTEMPTS, RETRY_SPACING_MINUTES, limit],
  );
  for (const row of rows) {
    await settleSupersededRecurrence(pool, {
      provider: row.provider,
      subscriptionId: row.provider_subscription_id,
    });
  }
  return { processed: rows.length };
}
