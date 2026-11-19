/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Людський підпис розкладу звички для хіта Рутини в пошуку хаба. Тут лише
 * форма підпису: назви варіантів (`RECURRENCE_OPTIONS`), днів
 * (`WEEKDAY_LABELS`) і чинна ціль гнучкої звички (`weeklyTargetForDate`)
 * беруться з публічного експорту `@sergeant/routine-domain`, тими самими
 * правилами, що в картці звички Рутини (`HabitDetailSheet`). Невідомий ключ
 * розкладу Рутина трактує як щоденний (`schedule.ts`), тож і підпис «Щодня».
 */
import {
  RECURRENCE_OPTIONS,
  WEEKDAY_LABELS,
  weeklyTargetForDate,
  type Habit,
} from "@sergeant/routine-domain";
import { pluralTimes } from "@sergeant/shared";
import { coreMessages } from "@shared/i18n/uk.core";

type ScheduleFields = Pick<
  Habit,
  "recurrence" | "weekdays" | "weeklyTargetHistory"
>;

const optionLabel = (value: string): string | undefined =>
  RECURRENCE_OPTIONS.find((o) => o.value === value)?.label;

export function habitScheduleLabel(
  habit: ScheduleFields,
  todayKey: string,
): string {
  const daily = optionLabel("daily") ?? "";
  const recurrence = habit.recurrence || "daily";
  if (recurrence === "flexible") {
    const count = weeklyTargetForDate(habit, todayKey);
    return coreMessages.hub.searchHabitWeeklyTarget
      .replace("{count}", String(count))
      .replace("{unit}", pluralTimes(count));
  }
  if (recurrence === "weekly" && habit.weekdays && habit.weekdays.length > 0) {
    return habit.weekdays
      .map((i) => WEEKDAY_LABELS[i])
      .filter(Boolean)
      .join(", ");
  }
  return optionLabel(recurrence) ?? daily;
}
