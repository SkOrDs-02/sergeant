/**
 * Заміна живої рекурентки новою (аудит 2026-10-01, data-21).
 *
 * Слот `subscriptions_user_active_idx` один на користувача, тож активація
 * другої платної підписки (інший провайдер АБО інший `provider_subscription_id`
 * того ж провайдера) раніше просто перезаписувала `provider` і id у тому самому
 * рядку. Перша підписка лишалась жива в провайдера, і її вже нічим не можна було
 * скасувати: застосунок знає лише про поточний id. Гроші списувались двічі.
 *
 * Тепер активація працює у три кроки (викликач тримає їх в одній транзакції
 * там, де вона є - LiqPay, Stripe, Plata):
 *   1. {@link findSupersededRecurrence} - ДО upsert-у читає живий рядок і
 *      вирішує, чи є що замінювати;
 *   2. upsert нового рядка (викликач; скидає `cancel_at_period_end`);
 *   3. {@link cancelSupersededRecurrence} - ОСТАННІМ кроком скасовує стару
 *      рекурентку на боці її провайдера. Відмова = `throw` -> ROLLBACK, і
 *      ретрай вебхука/звірки повторить усе: "не знаю" гірше за "ні".
 *
 * Не вважається заміною: `manual` (reverse trial, гранти - рекурентки нема),
 * рядок без `provider_subscription_id`, той самий провайдер з тим самим id
 * (звичайні поновлення).
 */
import type { Pool, PoolClient } from "pg";
import { logger } from "../../obs/logger.js";
import type { ProviderId } from "./provider.js";
import { unsubscribeLiqPayOrder } from "./liqpayRemote.js";
import { cancelPlataRemoteSubscription } from "./plataRemote.js";
import { cancelStripeRemoteSubscription } from "./stripeRemote.js";

type Queryable = Pick<Pool | PoolClient, "query">;

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
 * Скасовує витіснену рекурентку на боці її провайдера. Кидає при відмові.
 * Для Plata ще й ставить `superseded_at`: звірка такі рядки пропускає, інакше
 * запізнілий вебхук по старому id міг би знову "активувати" його поверх нової.
 */
export async function cancelSupersededRecurrence(
  db: Queryable,
  prev: PreviousRecurrence,
): Promise<void> {
  if (!prev.alreadyCanceling) {
    switch (prev.provider) {
      case "plata":
        await cancelPlataRemoteSubscription(prev.subscriptionId);
        break;
      case "liqpay":
        await unsubscribeLiqPayOrder(prev.subscriptionId);
        break;
      case "stripe":
        await cancelStripeRemoteSubscription(prev.subscriptionId);
        break;
      default:
        // apple/google: рекурентки там керує стор, скасувати звідси нічим.
        logger.warn({
          msg: "billing_supersede_provider_unsupported",
          provider: prev.provider,
        });
    }
  }
  if (prev.provider === "plata") {
    await db.query(
      `UPDATE plata_subscription
          SET superseded_at = COALESCE(superseded_at, NOW()), updated_at = NOW()
        WHERE subscription_id = $1`,
      [prev.subscriptionId],
    );
  }
  logger.info({
    msg: "billing_previous_recurrence_superseded",
    provider: prev.provider,
    alreadyCanceling: prev.alreadyCanceling,
  });
}
