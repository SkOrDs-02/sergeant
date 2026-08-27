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

/**
 * Календарний день `YYYY-MM-DD` у жорсткому вікні. Мʼяке вікно (±5 років /
 * +1 рік) навмисно НЕ перевіряється на сервері — це попередження в UI, а
 * не помилка: «вчорашній чек» і «звичка на наступний місяць» легітимні.
 */
export const boundedDayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата має бути у форматі YYYY-MM-DD")
  .refine(
    (v) => v >= HARD_MIN_DAY_KEY && v <= HARD_MAX_DAY_KEY,
    "Дата поза допустимим діапазоном",
  );

/** Назва / короткий опис — не довше 200 символів. */
export const nameTextSchema = z.string().max(NAME_MAX_LEN);

/** Вільний текст (нотатки/опис) — не довше 1000 символів. */
export const noteTextSchema = z.string().max(NOTE_MAX_LEN);
