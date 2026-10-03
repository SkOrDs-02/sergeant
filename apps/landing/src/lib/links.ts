// Зовнішні лінки лендінга в одному місці.
//
// Раніше `t.me/sergeant_app` був захардкоджений у трьох файлах – і жодного
// такого акаунта не існує. Одне джерело + `deepLink()` не дають лінку
// розповзтись і тихо протухнути вдруге.

/**
 * Юзернейм бота вейтліста. Перевизначається через `VITE_TELEGRAM_BOT`, щоб
 * превʼю чи майбутній ребренд не вимагали релізу коду.
 */
const BOT =
  (import.meta.env["VITE_TELEGRAM_BOT"] as string | undefined) || "serg_qa_bot";

/**
 * Голий лінк на бота, без payload-а атрибуції. Потрібен там, де адресу
 * читає не людина, а машина: `contactPoint` у schema.org. Класти туди
 * `?start=<placement>_<ref>` означало б віддати агентам токен однієї
 * конкретної сесії як постійну адресу підтримки.
 */
export const TELEGRAM_BOT_URL = `https://t.me/${BOT}`;

/**
 * Deep link на бота. `payload` приїжджає в `/start <payload>` і дає атрибуцію
 * каналу без жодного трекера: видно, з якої кнопки прийшла людина.
 * Обмеження Telegram – до 64 символів, тільки `A-Za-z0-9_-`.
 */
export function telegramStartLink(payload: string): string {
  return `https://t.me/${BOT}?start=${payload}`;
}

/**
 * Публічний профіль у Threads. Одне джерело для футера, /about і `sameAs`
 * в Organization-розмітці: до цього футер і /about тримали дві різні
 * адреси (threads.com / threads.net) одного й того самого акаунта.
 */
export const THREADS_URL = "https://www.threads.com/@sergeant.app";
