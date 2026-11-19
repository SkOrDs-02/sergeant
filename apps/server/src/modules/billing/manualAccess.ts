/**
 * Ручний Premium за запитом із пейволу (спека
 * `docs/work/specs/manual-premium-request.md`, О-3 (а), П-24..П-26).
 *
 * До запуску оплати людина, що вперлась у ліміт Free, просить Premium одним
 * натиском. Запит стає рядком `feedback_entries` з категорією
 * `premium_request` (пише лише цей модуль, клієнтська схема фідбеку такої
 * категорії не має), а founder отримує в Telegram повідомлення з кнопкою
 * «Видати на 30 днів». Тап по кнопці викликає {@link grantManualAccess}.
 *
 * Механізм діє лише доки оплата вимкнена (`!isBillingEnforced()`) і бот
 * вейтліста налаштований повністю: без секрету вебхука тап по кнопці не
 * дійде до сервера, і запит згнив би в таблиці.
 *
 * Hard Rule #21: у лог не йдуть `user_id`, email, токен чи текст
 * повідомлення Telegram. Слід - номер запиту і HTTP-статус Telegram.
 */
import type { Pool, PoolClient } from "pg";
import type {
  BillingManualAccess,
  ManualAccessConflictCode,
  PaywallSurface,
} from "@sergeant/shared";
import { env } from "../../env/env.js";
import { logger } from "../../obs/logger.js";
import { AppError } from "../../obs/errors.js";
import type { TelegramApiClient } from "../alerts/telegramShipper.js";
import {
  accessStateOf,
  getUserPlan,
  GRACE_FALLBACK_DAYS,
} from "./getUserPlan.js";
import { isBillingEnforced } from "./provider.js";

/**
 * Скільки днів діє ручний Premium. Число назвав founder (П-25, розбір
 * 2026-11-17 § 11.9); «безстроково» відкинуто. Поруч із
 * `REVERSE_TRIAL_DAYS` (`./reverseTrial.ts`).
 */
export const MANUAL_PREMIUM_DAYS = 30;

/** Префікс `callback_data` кнопки видачі: `mp:grant:<feedback_entries.id>`. */
export const MANUAL_GRANT_CALLBACK_PREFIX = "mp:grant:";

export interface ManualAccessConfig {
  billingEnforced: boolean;
  botToken: string;
  adminChatId: string;
  webhookSecret: string;
}

/** Поточна конфігурація з env. Окремою функцією, щоб тести її підміняли. */
export function manualAccessConfig(): ManualAccessConfig {
  return {
    billingEnforced: isBillingEnforced(),
    botToken: env.TELEGRAM_WAITLIST_BOT_TOKEN,
    adminChatId: env.TELEGRAM_WAITLIST_ADMIN_CHAT_ID,
    webhookSecret: env.TELEGRAM_WAITLIST_WEBHOOK_SECRET,
  };
}

/** Механізм відкритий: оплата вимкнена і всі три змінні бота задані. */
export function isManualAccessAvailable(cfg: ManualAccessConfig): boolean {
  return (
    !cfg.billingEnforced &&
    cfg.botToken.trim() !== "" &&
    cfg.adminChatId.trim() !== "" &&
    cfg.webhookSecret.trim() !== ""
  );
}

function conflict(code: ManualAccessConflictCode, message: string): AppError {
  return new AppError(message, { status: 409, code });
}

/** Стан запиту для знімка доступу (`/api/billing/status`). */
export async function manualAccessStatus(
  pool: Pool,
  userId: string,
  cfg: ManualAccessConfig = manualAccessConfig(),
): Promise<BillingManualAccess> {
  const { rows } = await pool.query<{ created_at?: Date | null }>(
    `SELECT created_at
       FROM feedback_entries
      WHERE user_id = $1 AND category = 'premium_request'
      LIMIT 1`,
    [userId],
  );
  const createdAt = rows[0]?.created_at;
  return {
    available: isManualAccessAvailable(cfg),
    requestedAt: createdAt instanceof Date ? createdAt.toISOString() : null,
  };
}

export interface ManualAccessRequestContext {
  surface: PaywallSurface;
  page: string | null;
  viewport: string | null;
  userAgent: string | null;
  appEnv: string | null;
}

/** Текст повідомлення founder-у: номер запиту і пейвол, без персональних даних. */
export function manualAccessTelegramText(
  requestId: string,
  surface: PaywallSurface,
): string {
  return `Запит Premium #${requestId} · пейвол: ${surface}`;
}

/**
 * Записує запит і шле founder-у повідомлення з кнопкою видачі.
 *
 * 409-и (стандартна форма `AppError`): `MANUAL_ACCESS_CLOSED`,
 * `MANUAL_ACCESS_NOT_NEEDED`, `MANUAL_ACCESS_ALREADY_REQUESTED`. «Один запит
 * на акаунт» тримає частковий унікальний індекс (міграція 169), тож друга
 * спроба не дає другого повідомлення.
 *
 * Telegram - після вставки (окремий autocommit-запит, тобто після COMMIT) і
 * fail-open: помилка доставки не перетворює 200 на помилку.
 */
export async function requestManualAccess(
  pool: Pool,
  userId: string,
  ctx: ManualAccessRequestContext,
  telegram: TelegramApiClient,
  cfg: ManualAccessConfig = manualAccessConfig(),
): Promise<{ requestedAt: string }> {
  if (!isManualAccessAvailable(cfg)) {
    throw conflict("MANUAL_ACCESS_CLOSED", "Manual access is closed");
  }

  const plan = await getUserPlan(pool, userId);
  if (accessStateOf(plan) !== "free") {
    throw conflict("MANUAL_ACCESS_NOT_NEEDED", "User already has access");
  }

  const inserted = await pool.query<{ id: string; created_at: Date }>(
    `INSERT INTO feedback_entries
       (category, message, page, viewport, user_id, user_agent, app_env)
     VALUES ('premium_request', $1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) WHERE category = 'premium_request' DO NOTHING
     RETURNING id, created_at`,
    [
      `Запит Premium з пейволу: ${ctx.surface}`,
      ctx.page,
      ctx.viewport,
      userId,
      ctx.userAgent ? ctx.userAgent.slice(0, 256) : null,
      ctx.appEnv,
    ],
  );
  const row = inserted.rows[0];
  if (!row) {
    throw conflict(
      "MANUAL_ACCESS_ALREADY_REQUESTED",
      "Manual access was already requested",
    );
  }
  // BIGSERIAL приїжджає рядком; номер лишаємо рядком (у тексті й callback).
  const requestId = String(row.id);

  await notifyFounder(telegram, cfg.adminChatId, requestId, ctx.surface);

  return { requestedAt: row.created_at.toISOString() };
}

async function notifyFounder(
  telegram: TelegramApiClient,
  adminChatId: string,
  requestId: string,
  surface: PaywallSurface,
): Promise<void> {
  try {
    const sent = await telegram.sendMessage({
      chatId: adminChatId,
      text: manualAccessTelegramText(requestId, surface),
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: `Видати на ${MANUAL_PREMIUM_DAYS} днів`,
              callback_data: `${MANUAL_GRANT_CALLBACK_PREFIX}${requestId}`,
            },
          ],
        ],
      },
    });
    if (!sent.ok) {
      logger.warn({
        msg: "billing_manual_access_notify_failed",
        requestId,
        httpStatus: sent.errorCode ?? null,
      });
    }
  } catch (err) {
    logger.warn({
      msg: "billing_manual_access_notify_failed",
      requestId,
      httpStatus: null,
      err: { name: err instanceof Error ? err.name : "unknown" },
    });
  }
}

export type GrantManualAccessResult =
  | { ok: true; currentPeriodEnd: Date }
  | {
      ok: false;
      reason:
        | "ALREADY_GRANTED"
        | "REQUEST_NOT_FOUND"
        | "ALREADY_PREMIUM"
        | "USER_GONE";
    };

/**
 * Ядро видачі - одна транзакція (спека, § Технічні, «Ядро видачі»):
 *   1. позначити запит виданим (ідемпотентність прив'язана до запиту:
 *      стара кнопка після 30 днів доступ не продовжує, П-26);
 *   2. під `FOR UPDATE` перевірити, чи немає чинного ентайтлменту за
 *      предикатом `getUserPlan` (тоді ROLLBACK і `ALREADY_PREMIUM`);
 *   3. прострочені `active`/`trialing`/`past_due` перевести в `canceled`:
 *      частковий унікальний індекс `subscriptions_user_active_idx`
 *      (міграція 056) інакше не пустить новий рядок, а прострочений trial
 *      лишається `trialing` назавжди;
 *   4. вставити `pro/active/manual` на {@link MANUAL_PREMIUM_DAYS} днів.
 *      `trial_ends_at` = NULL (міграція 073: «trial не було»).
 */
export async function grantManualAccess(
  pool: Pool,
  requestId: string,
): Promise<GrantManualAccessResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await grantInTransaction(client, requestId);
    await client.query(result.ok ? "COMMIT" : "ROLLBACK");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((err as { code?: unknown } | null)?.code === "23503") {
      // Рядок фідбеку без FK пережив видалення акаунта.
      return { ok: false, reason: "USER_GONE" };
    }
    throw err;
  } finally {
    client.release();
  }
}

async function grantInTransaction(
  client: PoolClient,
  requestId: string,
): Promise<GrantManualAccessResult> {
  const marked = await client.query<{ user_id: string }>(
    `UPDATE feedback_entries
        SET premium_granted_at = NOW()
      WHERE id = $1
        AND category = 'premium_request'
        AND premium_granted_at IS NULL
      RETURNING user_id`,
    [requestId],
  );
  const userId = marked.rows[0]?.user_id;
  if (!userId) {
    const exists = await client.query(
      `SELECT 1 FROM feedback_entries
        WHERE id = $1 AND category = 'premium_request'`,
      [requestId],
    );
    return {
      ok: false,
      reason: exists.rows.length > 0 ? "ALREADY_GRANTED" : "REQUEST_NOT_FOUND",
    };
  }

  // Предикат - дослівно WHERE з `getUserPlan` (без founder-байпасу: founder
  // не просить, бо його стан і так `pro`). Без фільтра по `plan`: живий
  // рядок будь-якого плану не скасовуємо, а відповідаємо `ALREADY_PREMIUM`.
  const subs = await client.query<{ entitled: boolean }>(
    `SELECT (
              (status IN ('active', 'trialing')
                AND (current_period_end IS NULL OR current_period_end > NOW()))
              OR (status = 'past_due'
                AND COALESCE(grace_period_ends_at,
                             current_period_end + make_interval(days => $2)) > NOW())
            ) AS entitled
       FROM subscriptions
      WHERE user_id = $1
      FOR UPDATE`,
    [userId, GRACE_FALLBACK_DAYS],
  );
  if (subs.rows.some((r) => r.entitled)) {
    return { ok: false, reason: "ALREADY_PREMIUM" };
  }

  // Крок 3: прострочені рядки з «активним» статусом звільняють частковий
  // унікальний індекс (міграція 056). Без цього прострочений trial давав
  // 23505 на вставці нижче, і видача такому акаунту не працювала.
  await client.query(
    `UPDATE subscriptions
        SET status = 'canceled', updated_at = NOW()
      WHERE user_id = $1
        AND status IN ('active', 'trialing', 'past_due')`,
    [userId],
  );

  const inserted = await client.query<{ current_period_end: Date }>(
    `INSERT INTO subscriptions
       (user_id, plan, status, provider, current_period_end)
     VALUES ($1, 'pro', 'active', 'manual',
             NOW() + make_interval(days => $2))
     RETURNING current_period_end`,
    [userId, MANUAL_PREMIUM_DAYS],
  );
  const end = inserted.rows[0]?.current_period_end;
  if (!(end instanceof Date)) {
    throw new Error("manual grant insert returned no period end");
  }
  return { ok: true, currentPeriodEnd: end };
}
