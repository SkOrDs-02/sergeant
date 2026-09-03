import { describe, expect, it } from "vitest";

import {
  completionNoteKey,
  habitSkipKey,
  parseHabitSkipKey,
} from "./completionNoteKey.js";

describe("routine-domain/completionNoteKey", () => {
  it("joins habitId + dateKey with '__' separator", () => {
    expect(completionNoteKey("habit-1", "2026-01-05")).toBe(
      "habit-1__2026-01-05",
    );
  });

  it("is a pure function", () => {
    expect(completionNoteKey("a", "2026-01-01")).toBe(
      completionNoteKey("a", "2026-01-01"),
    );
  });
});

/**
 * `skip_key` — половина первинного ключа `routine_habit_skips` на сервері,
 * тобто розбір цього рядка це не хелпер, а межа даних. До 2026-09-03 обидві
 * функції не мали жодного тесту.
 */
describe("routine-domain/habitSkipKey", () => {
  it("будує той самий формат, що й ключ нотатки", () => {
    expect(habitSkipKey("habit-1", "2026-01-05")).toBe(
      completionNoteKey("habit-1", "2026-01-05"),
    );
  });

  it("розбирається назад у ту саму пару", () => {
    expect(parseHabitSkipKey(habitSkipKey("h1", "2026-01-05"))).toEqual({
      habitId: "h1",
      dateKey: "2026-01-05",
    });
  });

  // Ядро вибору `lastIndexOf`: id звички цілком може містити роздільник, і
  // пошук ПЕРШОГО входження відрізав би id посередині.
  it("не ламається на id, який сам містить роздільник", () => {
    const key = habitSkipKey("legacy__import__7", "2026-02-29");
    expect(parseHabitSkipKey(key)).toEqual({
      habitId: "legacy__import__7",
      dateKey: "2026-02-29",
    });
  });

  it("відкидає биті ключі", () => {
    for (const bad of [
      "",
      "h1",
      "h1__",
      "h1__2026-1-5",
      "h1__не-дата",
      "__2026-01-05",
      "h1__2026-01-05__extra",
    ]) {
      expect(parseHabitSkipKey(bad), bad).toBeNull();
    }
  });
});
