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
 * Deep link на бота. `payload` приїжджає в `/start <payload>` і дає атрибуцію
 * каналу без жодного трекера: видно, з якої кнопки прийшла людина.
 * Обмеження Telegram – до 64 символів, тільки `A-Za-z0-9_-`.
 */
export function telegramStartLink(payload: string): string {
  return `https://t.me/${BOT}?start=${payload}`;
}
