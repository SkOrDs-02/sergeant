/**
 * Спільні zod-примітиви меж для сум, дат і вільного тексту.
 *
 * Клієнтські межі (`apps/web/src/shared/lib/format/amount.ts`,
 * `.../time/dateBounds.ts`, `.../text/limits.ts`) обходяться через `curl`,
 * тож кожен endpoint, який приймає суму, дату або текст, валідує їх ще раз
 * тут. Числа мусять збігатися з клієнтськими — при зміні правити обидва
 * місця (спека `beta-input-boundaries`).
 */
import { z } from "zod";

/** 0.01 ₴ у мінорних одиницях. */
export const AMOUNT_MINOR_MIN = 1;
/** 10 000 000.00 ₴ у мінорних одиницях. */
export const AMOUNT_MINOR_MAX = 1_000_000_000;

export const HARD_MIN_DAY_KEY = "1970-01-01";
export const HARD_MAX_DAY_KEY = "2100-01-01";

/** Назви й короткі описи. */
export const NAME_MAX_LEN = 200;

/**
 * Пошуковий запит по базі продуктів.
 *
 * AI-DANGER: це число мусить стояти і на полі вводу. Поле пошуку продуктів
 * було обмежене `NAME_MAX_LEN` (200), а сервер приймає 120 — тож усе, що
 * людина набирала між 121 і 200 символами, поверталось як 400. Клієнт
 * помилку не показував (див. `useFoodSearch`), тож на екрані це виглядало
 * як «нічого не знайдено» — тобто відповідь про порожню базу замість
 * відповіді про завеликий запит (browser-QA 2026-09-02). Один імпорт з
 * обох боків замість двох чисел, які розійшлись.
 */
export const SEARCH_QUERY_MAX_LEN = 120;

/**
 * Довші вільні тексти (нотатки, описи комори). Дзеркалить
 * `apps/web/src/shared/lib/text/limits.ts::NOTE_MAX_LEN` — клієнт цю
 * константу не імпортує звідси (web поза скоупом цієї зміни), тож при
 * зміні одного значення звір і друге вручну.
 */
export const NOTE_MAX_LEN = 1000;

/**
 * Сума в копійках: ціле число в `[1; 1 000 000 000]`. `.int()` уже
 * відкидає `NaN`, `±Infinity` і дробові значення.
 */
export const amountMinorSchema = z
  .number()
  .int()
  .min(AMOUNT_MINOR_MIN)
  .max(AMOUNT_MINOR_MAX);

/** Формат `YYYY-MM-DD`; цей самий pattern іде в OpenAPI. */
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Чи існує такий день у календарі: `2024-02-29` так, `2024-02-30` і
 * `2024-13-45` ні. Round-trip через `Date.UTC`: JS мовчки переносить
 * переповнення (`02-30` → `03-01`), тож розбіжність компонентів означає
 * неіснуючу дату. Рядок не у форматі `YYYY-MM-DD` → `false`.
 *
 * AI-CONTEXT: без цієї перевірки «30 лютого» проходило схему, лягало в jsonb
 * і на першій справжній `date`-колонці падало з 22008 (data-55).
 */
export function isCalendarDayKey(value: string): boolean {
  if (!DAY_KEY_RE.test(value)) return false;
  const y = Number(value.slice(0, 4));
  const mo = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Календарний день `YYYY-MM-DD` у жорсткому вікні. Мʼяке вікно (±5 років /
 * +1 рік) навмисно НЕ перевіряється на сервері — це попередження в UI, а
 * не помилка: «вчорашній чек» і «звичка на наступний місяць» легітимні.
 * Неіснуючий день (`2024-02-30`) відхиляється окремою помилкою.
 */
export const boundedDayKeySchema = z
  .string()
  .regex(DAY_KEY_RE, "Дата має бути у форматі YYYY-MM-DD")
  // Неправильний формат уже дав помилку regex — другу не додаємо.
  .refine(
    (v) => !DAY_KEY_RE.test(v) || isCalendarDayKey(v),
    "Такої дати немає в календарі",
  )
  .refine(
    (v) => v >= HARD_MIN_DAY_KEY && v <= HARD_MAX_DAY_KEY,
    "Дата поза допустимим діапазоном",
  );

/** Назва / короткий опис — не довше 200 символів. */
export const nameTextSchema = z.string().max(NAME_MAX_LEN);

/** Вільний текст (нотатки/опис) — не довше 1000 символів. */
export const noteTextSchema = z.string().max(NOTE_MAX_LEN);
