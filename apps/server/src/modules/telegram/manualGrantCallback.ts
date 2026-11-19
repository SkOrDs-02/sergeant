/**
 * Кнопка «Видати на 30 днів» під запитом ручного Premium (спека
 * `docs/work/specs/manual-premium-request.md`).
 *
 * Окремий модуль, а не гілка в `waitlistBot.ts`: там уже ~615 рядків
 * (Hard Rule #18). Роут `routes/telegram-webhook.ts` перевіряє секрет і
 * відсіює ботів, далі віддає сюди апдейт ДО `parseCommand`.
 *
 * Прийом лише за трьох умов: приватний чат, `chat.id` і `from.id` обидва
 * дорівнюють `TELEGRAM_WAITLIST_ADMIN_CHAT_ID`. Інакше тиша (200 без дії),
 * як `/stats` для чужих: сама відмова підтверджувала б, що кнопка існує.
 *
 * Hard Rule #21: `callback_data` і тексти повідомлень у лог не йдуть.
 */
import type { Pool } from "pg";
import type { TelegramApiClient } from "../alerts/telegramShipper.js";
import {
  grantManualAccess,
  type GrantManualAccessResult,
} from "../billing/manualAccess.js";
import { logger } from "../../obs/logger.js";
import type { TelegramUpdate } from "./waitlistBot.js";

/**
 * Суворий розбір: номер запиту - BIGSERIAL без нуля попереду, до 18 цифр.
 * Префікс дзеркалить `MANUAL_GRANT_CALLBACK_PREFIX` з `billing/manualAccess`.
 */
const GRANT_DATA_RE = /^mp:grant:([1-9]\d{0,17})$/;

export interface ManualGrantCallback {
  requestId: string;
  callbackQueryId: string;
  chatId: number | null;
  chatType: string | null;
  fromId: number | null;
  messageId: number | null;
}

/**
 * `null` - апдейт не про видачу (далі звичайний `parseCommand`);
 * `"ignore"` - префікс `mp:` є, але дані биті: тиша без дії;
 * інакше розібраний callback.
 */
export function parseManualGrantCallback(
  update: TelegramUpdate,
): ManualGrantCallback | "ignore" | null {
  const cb = update.callback_query;
  const data = cb?.data;
  if (!cb || typeof data !== "string" || !data.startsWith("mp:")) return null;
  const match = GRANT_DATA_RE.exec(data);
  if (!match?.[1] || typeof cb.id !== "string" || cb.id === "") {
    return "ignore";
  }
  return {
    requestId: match[1],
    callbackQueryId: cb.id,
    chatId: cb.message?.chat?.id ?? null,
    chatType: cb.message?.chat?.type ?? null,
    fromId: cb.from?.id ?? null,
    messageId: cb.message?.message_id ?? null,
  };
}

/** Натиснув founder у своєму приватному чаті з ботом. */
export function isAdminGrantCallback(
  cb: ManualGrantCallback,
  adminChatId: string,
): boolean {
  if (adminChatId.trim() === "") return false;
  return (
    cb.chatType === "private" &&
    cb.chatId !== null &&
    cb.fromId !== null &&
    String(cb.chatId) === adminChatId &&
    String(cb.fromId) === adminChatId
  );
}

/** Дата кінця за Києвом (AGENTS.md § Domain invariants: відображення). */
export function formatKyivDate(d: Date): string {
  return d.toLocaleDateString("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function grantedMessageText(requestId: string, end: Date): string {
  return `Запит Premium #${requestId} · видано до ${formatKyivDate(end)}`;
}

/** Спливашка на кнопці для кожного результату ядра. */
export function grantToastText(result: GrantManualAccessResult): string {
  if (result.ok) return `Видано до ${formatKyivDate(result.currentPeriodEnd)}`;
  switch (result.reason) {
    case "ALREADY_GRANTED":
      return "Уже видано";
    case "ALREADY_PREMIUM":
      return "У людини вже є Premium";
    case "REQUEST_NOT_FOUND":
      return "Запит не знайдено";
    case "USER_GONE":
      return "Акаунт видалено";
  }
}

/**
 * Видача + квитанція + редагування. Порядок як в опитуванні: спершу БД,
 * далі `answerCallbackQuery` (без нього годинник на кнопці ~30 с), і лише
 * після успішної видачі редагування тексту. `editMessageText` без
 * `reply_markup` прибирає inline-клавіатуру.
 *
 * Кидає лише помилку БД (тоді роут віддає 500, і Telegram ретраїть).
 */
export async function handleManualGrantCallback(
  pool: Pool,
  client: TelegramApiClient,
  cb: ManualGrantCallback,
  grant: typeof grantManualAccess = grantManualAccess,
): Promise<void> {
  const result = await grant(pool, cb.requestId);
  try {
    await client.answerCallbackQuery({
      callbackQueryId: cb.callbackQueryId,
      text: grantToastText(result),
    });
    if (result.ok && cb.chatId !== null && cb.messageId !== null) {
      await client.editMessageText({
        chatId: String(cb.chatId),
        messageId: cb.messageId,
        text: grantedMessageText(cb.requestId, result.currentPeriodEnd),
      });
    }
  } catch (err) {
    logger.warn({
      msg: "telegram_manual_grant_ack_failed",
      requestId: cb.requestId,
      err: { name: err instanceof Error ? err.name : "unknown" },
    });
  }
  logger.info({
    msg: "telegram_manual_grant_handled",
    requestId: cb.requestId,
    outcome: result.ok ? "granted" : result.reason,
  });
}
