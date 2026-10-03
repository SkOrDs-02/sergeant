import { describe, it, expect } from "vitest";

import { calcRoutineDayProgress } from "./dayProgress.js";
import type { Habit } from "./types.js";

const daily: Habit = {
  id: "a",
  name: "Вода",
  recurrence: "daily",
  startDate: "2026-01-01",
};

const once: Habit = {
  id: "b",
  name: "Стоматолог",
  recurrence: "once",
  startDate: "2026-07-15",
};

describe("calcRoutineDayProgress", () => {
  it("counts a day other than today (finding 1.19a — focusedDay ≠ todayKey)", () => {
    const completions = { a: [] };
    const progress = calcRoutineDayProgress(
      [daily],
      completions,
      "2026-07-16", // "завтра"
      "2026-07-15", // today
    );
    expect(progress).toMatchObject({ completed: 0, scheduled: 1 });
  });

  it("includes once-habits in the checklist count (finding 1.19b)", () => {
    const completions = { a: ["2026-07-15"], b: ["2026-07-15"] };
    const progress = calcRoutineDayProgress(
      [daily, once],
      completions,
      "2026-07-15",
      "2026-07-15",
    );
    expect(progress).toMatchObject({ completed: 2, scheduled: 2 });
  });

  it("freezes the past against a pause set today, even when focused on a past day", () => {
    const paused: Habit = { ...daily, id: "c", paused: true };
    const progress = calcRoutineDayProgress(
      [paused],
      {},
      "2026-07-10", // focused day is in the past
      "2026-07-15", // pause set today
    );
    // `pausedFrom` is always todayKey, not focusedDay — the past day stays
    // scheduled even though the habit is paused as of today.
    expect(progress.scheduled).toBe(1);
  });

  it("excludes a skipped day from the denominator", () => {
    const skips = { a: { "2026-07-15": { reason: "sick" as const, at: "" } } };
    const progress = calcRoutineDayProgress(
      [daily],
      { a: [] },
      "2026-07-15",
      "2026-07-15",
      skips,
    );
    expect(progress).toMatchObject({ completed: 0, scheduled: 0 });
  });
});
