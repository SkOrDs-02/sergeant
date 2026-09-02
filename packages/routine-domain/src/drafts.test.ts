import { describe, expect, it } from "vitest";

import {
  REMINDER_PRESETS,
  emptyHabitDraft,
  habitDraftToPatch,
  habitToDraft,
  isHabitDraftValid,
  matchReminderPreset,
  normalizeReminderTimes,
  routineTodayDate,
  validateHabitDraft,
} from "./drafts.js";
import type { Habit } from "./types.js";

describe("routine-domain/drafts", () => {
  it("normalizeReminderTimes uses reminderTimes if valid", () => {
    expect(normalizeReminderTimes({ reminderTimes: ["08:00", "xx"] })).toEqual([
      "08:00",
    ]);
  });

  it("normalizeReminderTimes falls back to legacy timeOfDay", () => {
    expect(normalizeReminderTimes({ timeOfDay: "13:00" })).toEqual(["13:00"]);
    expect(normalizeReminderTimes({ timeOfDay: "nope" })).toEqual([]);
    expect(normalizeReminderTimes({})).toEqual([]);
  });

  it("habitDraftToPatch normalizes times and endDate", () => {
    const p = habitDraftToPatch({
      name: "  Test  ",
      emoji: "",
      tagIds: ["t1"],
      categoryId: "",
      recurrence: "daily",
      startDate: "2026-01-01",
      endDate: " ",
      timeOfDay: "20:00",
      reminderTimes: [" 08:00 ", "bad", "13:00:00"],
      weekdays: [1, 2, 3],
      paused: false,
      weeklyTarget: 3,
      weeklyTargetHistory: [],
    });
    expect(p.name).toBe("Test");
    expect(p.emoji).toBe("check");
    expect(p.categoryId).toBe(null);
    expect(p.endDate).toBe(null);
    expect(p.reminderTimes).toEqual(["08:00", "13:00"]);
    expect(p.timeOfDay).toBe("08:00");
    expect(p.weekdays).toEqual([1, 2, 3]);
  });

  it("emptyHabitDraft returns today-normalised draft", () => {
    const draft = emptyHabitDraft();
    expect(draft.name).toBe("");
    expect(draft.emoji).toBe("check");
    expect(draft.recurrence).toBe("daily");
    expect(draft.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(draft.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("routineTodayDate pins noon", () => {
    const d = routineTodayDate();
    expect(d.getHours()).toBe(12);
    expect(d.getMinutes()).toBe(0);
  });

  it("REMINDER_PRESETS exposes 5 distinct presets", () => {
    expect(REMINDER_PRESETS).toHaveLength(5);
    const ids = new Set(REMINDER_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(5);
    for (const p of REMINDER_PRESETS) {
      expect(p.times.every((t) => /^\d{2}:\d{2}$/.test(t))).toBe(true);
    }
  });

  describe("habitToDraft", () => {
    it("populates every field from an existing habit", () => {
      const habit: Habit = {
        id: "h1",
        name: "Пити воду",
        emoji: "💧",
        tagIds: ["t1", "t2"],
        categoryId: "c1",
        recurrence: "weekly",
        startDate: "2026-01-01",
        endDate: "2026-02-01",
        timeOfDay: "08:00",
        reminderTimes: ["08:00", "13:00"],
        weekdays: [1, 3, 5],
      };
      const draft = habitToDraft(habit);
      expect(draft.name).toBe("Пити воду");
      // Легасі-emoji апгрейдиться до slug (`glyphs.ts`).
      expect(draft.emoji).toBe("droplet");
      expect(draft.tagIds).toEqual(["t1", "t2"]);
      expect(draft.categoryId).toBe("c1");
      expect(draft.recurrence).toBe("weekly");
      expect(draft.startDate).toBe("2026-01-01");
      expect(draft.endDate).toBe("2026-02-01");
      expect(draft.reminderTimes).toEqual(["08:00", "13:00"]);
      expect(draft.weekdays).toEqual([1, 3, 5]);
    });

    it("fills sensible defaults when the habit is sparse", () => {
      const draft = habitToDraft({ id: "h2", name: "" });
      expect(draft.name).toBe("");
      expect(draft.emoji).toBe("check");
      expect(draft.tagIds).toEqual([]);
      expect(draft.categoryId).toBe(null);
      expect(draft.recurrence).toBe("daily");
      expect(draft.endDate).toBe("");
      expect(draft.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(draft.reminderTimes).toEqual([]);
      expect(draft.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it("falls back to legacy timeOfDay when reminderTimes is empty", () => {
      const draft = habitToDraft({
        id: "h3",
        name: "Йога",
        timeOfDay: "07:30",
      });
      expect(draft.reminderTimes).toEqual(["07:30"]);
    });
  });

  describe("validateHabitDraft", () => {
    it("returns empty errors for a valid draft", () => {
      const draft = emptyHabitDraft();
      draft.name = "Пити воду";
      expect(validateHabitDraft(draft)).toEqual({});
      expect(isHabitDraftValid(draft)).toBe(true);
    });

    it("flags an empty name", () => {
      const draft = emptyHabitDraft();
      draft.name = "   ";
      const errors = validateHabitDraft(draft);
      expect(errors.name).toBe("Додай назву звички.");
      expect(errors.weekdays).toBeUndefined();
      expect(isHabitDraftValid(draft)).toBe(false);
    });

    it("flags weekly recurrence without any selected weekdays", () => {
      const draft = emptyHabitDraft();
      draft.name = "Спорт";
      draft.recurrence = "weekly";
      draft.weekdays = [];
      const errors = validateHabitDraft(draft);
      expect(errors.weekdays).toBe("Обери хоча б один день тижня.");
      expect(errors.name).toBeUndefined();
    });

    it("ignores empty weekdays for non-weekly recurrence", () => {
      const draft = emptyHabitDraft();
      draft.name = "Читати";
      draft.recurrence = "daily";
      draft.weekdays = [];
      expect(validateHabitDraft(draft)).toEqual({});
    });
  });

  describe("matchReminderPreset", () => {
    // Репорт тестера: правиш 08:00 на 11:00 — і підсвітка «Ранок» гасне.
    // «Якби вона стрибала на інший час доби, то ок; а так наче чогось не
    // вистачає, коли зовсім зникає.» Тому збіг — за частиною доби.
    it("тримає підсвітку, коли час лишився в тій самій частині доби", () => {
      expect(matchReminderPreset(["07:15"])?.id).toBe("morning");
      expect(matchReminderPreset(["21:30"])?.id).toBe("evening");
    });

    it("перестрибує на сусідній пресет, коли час перейшов межу", () => {
      // Рівно випадок зі скріншота: 08:00 → 11:00. 11:00 ближче до якоря
      // 13:00, ніж до 08:00, тож засвічується «День», а не порожнеча.
      expect(matchReminderPreset(["11:00"])?.id).toBe("afternoon");
    });

    it("точні часи пресетів матчаться самі на себе", () => {
      for (const preset of REMINDER_PRESETS) {
        expect(matchReminderPreset(preset.times)?.id).toBe(preset.id);
      }
    });

    it("рахує ніч як вечір, а не як ранок", () => {
      // 23:00 по колу ближче до 20:00 (3 год), ніж до 08:00 (9 год).
      expect(matchReminderPreset(["23:00"])?.id).toBe("evening");
    });

    it("тримає складені пресети при зсуві однієї з міток", () => {
      expect(matchReminderPreset(["07:30", "21:00"])?.id).toBe("twice");
      expect(matchReminderPreset(["07:30", "12:30", "21:00"])?.id).toBe(
        "thrice",
      );
    });

    it("два часи в одній частині доби — НЕ пресет", () => {
      // Інакше чип брехав би про поточний стан, а повторний клік по ньому
      // мовчки знищив би одне з двох нагадувань.
      expect(matchReminderPreset(["08:00", "09:00"])).toBeNull();
    });

    it("порожній список і сміття не матчаться", () => {
      expect(matchReminderPreset([])).toBeNull();
      expect(matchReminderPreset(["не-час"])).toBeNull();
      expect(matchReminderPreset(["25:00"])).toBeNull();
    });
  });
});
