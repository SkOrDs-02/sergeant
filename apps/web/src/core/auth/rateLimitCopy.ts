import { messages } from "@shared/i18n/uk";

/**
 * Текст для 429 на формах входу. Сервер каже українською, скільки саме
 * чекати («Спробуй через 891 секунду») — тоді показуємо його слова, бо
 * клієнтська «хвилина» брехала б при вікні в 15 хв. Без числа чи без
 * кирилиці лишається клієнтський текст.
 */
export function rateLimitCopy(serverMessage: string): string {
  return /[а-яіїєґ]/i.test(serverMessage) && /\d/.test(serverMessage)
    ? serverMessage
    : messages.auth.rateLimited;
}
