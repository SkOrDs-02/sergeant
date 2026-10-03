/**
 * Спільні хелпери підписів для bar-chart-ів звітних карток HubReports
 * (ExpensesCard / FitnessCard / NutritionCard / RoutineCard).
 *
 * До витягання кожна картка тримала власну байт-ідентичну копію цих
 * функцій. `dateStr` — `YYYY-MM-DD` day-key; календарні частини читаємо в
 * Europe/Kyiv (kyivTime), а не host-local `getDay/getDate`, щоб підписи не
 * дрейфували на «роумінговому» годиннику (domain-invariants spec).
 */
import { getKyivDateParts, parseKyivDate } from "@shared/lib/time/kyivTime";
import { formatNumberUk } from "@sergeant/shared";

const DAY_NAMES_UK = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] as const;

/** Крок проріджування підписів осі X залежно від кількості стовпців. */
export function labelStep(count: number): number {
  if (count <= 7) return 1;
  if (count <= 15) return 2;
  return Math.ceil(count / 8);
}

/** Підпис стовпця: у тижневому режимі — день тижня, інакше — число місяця. */
export function formatChartLabel(dateStr: string, isWeek: boolean): string {
  const parts = getKyivDateParts(parseKyivDate(dateStr) ?? new Date(dateStr));
  if (isWeek) {
    return DAY_NAMES_UK[parts.weekday] ?? "";
  }
  return String(parts.day);
}

/** Тултіп `ДД.ММ: <значення><unit>` (значення — через `formatNumberUk`). */
export function formatChartTooltip(
  dateStr: string,
  value: number,
  unit = "",
): string {
  const parts = getKyivDateParts(parseKyivDate(dateStr) ?? new Date(dateStr));
  const day = String(parts.day).padStart(2, "0");
  const month = String(parts.month).padStart(2, "0");
  return `${day}.${month}: ${formatNumberUk(value)}${unit}`;
}
