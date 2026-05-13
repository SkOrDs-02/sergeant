/**
 * Sergeant Routine — Calendar string constants (UA).
 *
 * Ukrainian month + weekday labels for the mobile calendar UI.
 * Kept as a plain module so unit tests can assert against them
 * without rendering React.
 */

export const WEEK_HEADERS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"] as const;

export const MONTH_NAMES_UK = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
] as const;
