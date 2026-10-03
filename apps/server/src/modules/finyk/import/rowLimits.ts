import {
  AMOUNT_MINOR_MAX,
  AMOUNT_MINOR_MIN,
  HARD_MAX_DAY_KEY,
  HARD_MIN_DAY_KEY,
} from "@sergeant/shared";

/**
 * Межі рядка імпорту (скрін і превʼю виписки), які сервер мусить виконати
 * САМ до `...ResponseSchema.parse`: хендлери валідують усю відповідь одним
 * `.parse()`, тож один рядок поза схемою (опис на 420 символів, сума понад
 * 10 млн грн, галюцинація року) раніше давав 500 на весь файл. Тепер такий
 * рядок або обрізається (текст), або йде у skipped/dropped (сума, дата).
 * Дзеркалить `receipts/analyze.ts` (там теж обрізання + клемп).
 */

/**
 * Обрізає текст до `max` UTF-16 code unit-ів (саме так рахує `z.string().max`).
 * Не лишає на кінці половину сурогатної пари (емодзі в описі) — інакше
 * хвіст став би биттям символом.
 */
export function truncateImportText(value: string, max: number): string {
  if (value.length <= max) return value;
  let end = max;
  const last = value.charCodeAt(end - 1);
  // Старший сурогат наприкінці зрізу = пара розірвана → відкидаємо його.
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return value.slice(0, end);
}

/** Чи вкладається день-ключ `YYYY-MM-DD` у жорстке вікно схеми
 * (`boundedDayKeySchema`). Лексикографічне порівняння коректне для ISO-ключів. */
export function isDayKeyInBounds(dayKey: string): boolean {
  return dayKey >= HARD_MIN_DAY_KEY && dayKey <= HARD_MAX_DAY_KEY;
}

/** Чи є сума ЦІЛИМИ копійками в `[AMOUNT_MINOR_MIN; AMOUNT_MINOR_MAX]`
 * (`importAmountKopiykasSchema`). `Number.isInteger` відсікає також `NaN` і
 * `±Infinity`. */
export function isAmountKopiykasInBounds(amount: number): boolean {
  return (
    Number.isInteger(amount) &&
    amount >= AMOUNT_MINOR_MIN &&
    amount <= AMOUNT_MINOR_MAX
  );
}
