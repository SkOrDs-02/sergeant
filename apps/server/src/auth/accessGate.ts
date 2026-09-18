import { env } from "../env/env.js";

/**
 * Рубильник закритого доступу: продукт відкритий лише для перелічених
 * `userId`.
 *
 * AI-LEGACY: expires 2026-11-30 — тимчасова заміна справжньому гейту
 * запрошень. Знімається разом із виходом на magic-link із Telegram-бота
 * (черга вже живе в `telegram_waitlist`, але вона знає `chat_id`, не пошту).
 *
 * AI-CONTEXT: чому список `userId`, а не пошт. Гейт вмикається тоді, коли
 * потрібні акаунти ВЖЕ існують, тож id відомий і його видно в
 * `AI_QUOTA_FOUNDER_IDS` поруч. Головне ж — `session.create.before` отримує
 * саме `userId` і не мусить ходити в БД за поштою на кожен логін.
 *
 * Порожня змінна = гейт вимкнено. Це навмисний напрямок за замовчуванням:
 * dev, CI та E2E реєструють користувачів пачками, і забута змінна має
 * лишати їх працездатними, а не мовчки валити кожен sign-up.
 */
function allowedUserIds(): string[] {
  const raw = env.ACCESS_ALLOWLIST_USER_IDS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
}

/** Гейт активний, коли в списку є бодай один id. */
export function isAccessGateEnabled(): boolean {
  return allowedUserIds().length > 0;
}

/** Чи має цей користувач право створити сесію. */
export function isAccessAllowed(userId: string): boolean {
  const ids = allowedUserIds();
  if (ids.length === 0) return true;
  return ids.includes(userId);
}
