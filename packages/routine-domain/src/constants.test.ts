import { describe, expect, it } from "vitest";

import {
  RECURRENCE_OPTIONS,
  ROUTINE_TIME_MODES,
  WEEKDAY_LABELS,
} from "./constants.js";

describe("routine-domain/constants", () => {
  it("exports the four calendar time modes in UI order", () => {
    expect(ROUTINE_TIME_MODES.map((mode) => mode.id)).toEqual([
      "today",
      "tomorrow",
      "week",
      "month",
    ]);
    expect(ROUTINE_TIME_MODES.map((mode) => mode.label)).toEqual([
      "Сьогодні",
      "Завтра",
      "Тиждень",
      "Місяць",
    ]);
  });

  it("keeps recurrence options complete with compact labels where needed", () => {
    expect(RECURRENCE_OPTIONS.map((option) => option.value)).toEqual([
      "daily",
      "weekdays",
      "weekly",
      "monthly",
      "once",
    ]);
    expect(
      RECURRENCE_OPTIONS.filter((option) => option.shortLabel).map(
        (option) => option.shortLabel,
      ),
    ).toEqual(["Будні", "По тижню", "Щомісяця", "Одноразово"]);
  });

  it("exports Monday-first Ukrainian weekday labels", () => {
    expect(WEEKDAY_LABELS).toEqual(["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"]);
  });
});
