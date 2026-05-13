// Pure reducers (state-in → state-out) для Routine-модуля.
// Покриваємо тег/категорію CRUD (`applyCreateTag`, `applyCreateCategory`,
// `applyUpdateTag`, `applyUpdateCategory`, `applyDeleteTag`,
// `applyDeleteCategory`), habit-операції (`applyCreateHabit`,
// `applyUpdateHabit`, `applySetHabitArchived`, `applyDeleteHabit`,
// `snapshotHabit`, `applyRestoreHabit`), completion-операції
// (`applyToggleHabitCompletion`, `applyMarkAllScheduledHabitsComplete`,
// `applySetCompletionNote`), порядок
// (`applyMoveHabitInOrder`, `applySetHabitOrder`) і інші
// (`applySetPref`, `applyAddPushupReps`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyAddPushupReps,
  applyCreateCategory,
  applyCreateHabit,
  applyCreateTag,
  applyDeleteCategory,
  applyDeleteHabit,
  applyDeleteTag,
  applyMarkAllScheduledHabitsComplete,
  applyMoveHabitInOrder,
  applyRestoreHabit,
  applySetCompletionNote,
  applySetHabitArchived,
  applySetHabitOrder,
  applySetPref,
  applyToggleHabitCompletion,
  applyUpdateCategory,
  applyUpdateHabit,
  applyUpdateTag,
  snapshotHabit,
} from "./reducers.js";
import { defaultRoutineState, normalizeHabit } from "./storage.js";
import type { Habit, RoutineState } from "./types.js";

function baseState(): RoutineState {
  return defaultRoutineState();
}

function makeHabit(partial: Partial<Habit> & { id: string }): Habit {
  return normalizeHabit({
    name: partial.id,
    emoji: "✓",
    archived: false,
    recurrence: "daily",
    startDate: "2026-01-01",
    endDate: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    ...partial,
  });
}

function stateWithHabits(habits: Habit[]): RoutineState {
  return {
    ...baseState(),
    habits,
    habitOrder: habits.filter((h) => !h.archived).map((h) => h.id),
  };
}

describe("routine-domain/reducers — теги і категорії", () => {
  describe("applyCreateTag", () => {
    it.each([
      ["порожнє імʼя", ""],
      ["лише пробіли", "   "],
    ])("повертає state без змін для %s", (_, name) => {
      const s = baseState();
      expect(applyCreateTag(s, name)).toBe(s);
    });

    it("додає тег з обрізаним іменем і scope='routine'", () => {
      const s = baseState();
      const next = applyCreateTag(s, "  Здоровʼя  ");
      expect(next.tags).toHaveLength(1);
      const tag = next.tags[0]!;
      expect(tag.name).toBe("Здоровʼя");
      expect(tag.scope).toBe("routine");
      expect(tag.id).toMatch(/^tag_/);
    });

    it("дописує до існуючих тегів, не мутуючи попередній масив", () => {
      const s = baseState();
      const first = applyCreateTag(s, "A");
      const second = applyCreateTag(first, "B");
      expect(second.tags.map((t) => t.name)).toEqual(["A", "B"]);
      expect(first.tags).toHaveLength(1);
    });
  });

  describe("applyCreateCategory", () => {
    it.each([
      ["порожнє імʼя", ""],
      ["лише пробіли", "   "],
    ])("повертає state без змін для %s", (_, name) => {
      const s = baseState();
      expect(applyCreateCategory(s, name)).toBe(s);
    });

    it("додає категорію без emoji коли emoji не задано", () => {
      const next = applyCreateCategory(baseState(), "  Спорт  ");
      const cat = next.categories[0]!;
      expect(cat.name).toBe("Спорт");
      expect(cat.emoji).toBeUndefined();
      expect(cat.id).toMatch(/^cat_/);
    });

    it("додає категорію з emoji", () => {
      const next = applyCreateCategory(baseState(), "Спорт", "🏋");
      expect(next.categories[0]!.emoji).toBe("🏋");
    });

    it("ігнорує порожній emoji (не додає поле)", () => {
      const next = applyCreateCategory(baseState(), "Спорт", "");
      expect(next.categories[0]!.emoji).toBeUndefined();
    });
  });

  describe("applyUpdateTag", () => {
    it("повертає state без змін для порожнього імені", () => {
      const s = applyCreateTag(baseState(), "A");
      const id = s.tags[0]!.id;
      expect(applyUpdateTag(s, id, "   ")).toBe(s);
    });

    it("перейменовує тег за id, інші не чіпає", () => {
      const a = applyCreateTag(baseState(), "A");
      const b = applyCreateTag(a, "B");
      const idA = b.tags[0]!.id;
      const next = applyUpdateTag(b, idA, "  A2  ");
      expect(next.tags.map((t) => t.name)).toEqual(["A2", "B"]);
      // Ідентифікатор зберігається
      expect(next.tags[0]!.id).toBe(idA);
    });

    it("no-op для невідомого id (масив рендериться, але без змін у вмісті)", () => {
      const s = applyCreateTag(baseState(), "A");
      const next = applyUpdateTag(s, "unknown", "B");
      expect(next.tags.map((t) => t.name)).toEqual(["A"]);
    });
  });

  describe("applyUpdateCategory", () => {
    it("оновлює name і emoji", () => {
      const s = applyCreateCategory(baseState(), "Old", "🥦");
      const id = s.categories[0]!.id;
      const next = applyUpdateCategory(s, id, { name: "New", emoji: "🍅" });
      expect(next.categories[0]!.name).toBe("New");
      expect(next.categories[0]!.emoji).toBe("🍅");
    });

    it("порожнє name зберігає попереднє", () => {
      const s = applyCreateCategory(baseState(), "Old");
      const id = s.categories[0]!.id;
      const next = applyUpdateCategory(s, id, { name: "  " });
      expect(next.categories[0]!.name).toBe("Old");
    });

    it("ігнорує порожній emoji у patch", () => {
      const s = applyCreateCategory(baseState(), "Old", "🥦");
      const id = s.categories[0]!.id;
      const next = applyUpdateCategory(s, id, { emoji: "" });
      expect(next.categories[0]!.emoji).toBe("🥦");
    });

    it("повертає неторкнуті категорії для невідомого id", () => {
      const s = applyCreateCategory(baseState(), "X", "❓");
      const next = applyUpdateCategory(s, "unknown", { name: "Y" });
      expect(next.categories[0]!.name).toBe("X");
    });
  });

  describe("applyDeleteCategory", () => {
    it("видаляє категорію і чистить categoryId у звичках", () => {
      const s0 = applyCreateCategory(baseState(), "Спорт");
      const catId = s0.categories[0]!.id;
      const s = {
        ...s0,
        habits: [
          makeHabit({ id: "h1", categoryId: catId }),
          makeHabit({ id: "h2", categoryId: "other" }),
        ],
      };
      const next = applyDeleteCategory(s, catId);
      expect(next.categories).toHaveLength(0);
      expect(next.habits[0]!.categoryId).toBeNull();
      expect(next.habits[1]!.categoryId).toBe("other");
    });
  });

  describe("applyDeleteTag", () => {
    it("видаляє тег і відфільтровує його з tagIds кожної звички", () => {
      const s = {
        ...baseState(),
        tags: [
          { id: "t1", name: "A", scope: "routine" },
          { id: "t2", name: "B", scope: "routine" },
        ],
        habits: [
          makeHabit({ id: "h1", tagIds: ["t1", "t2"] }),
          makeHabit({ id: "h2", tagIds: ["t2"] }),
          makeHabit({ id: "h3" }),
        ],
      };
      const next = applyDeleteTag(s, "t1");
      expect(next.tags.map((t) => t.id)).toEqual(["t2"]);
      expect(next.habits[0]!.tagIds).toEqual(["t2"]);
      expect(next.habits[1]!.tagIds).toEqual(["t2"]);
      expect(next.habits[2]!.tagIds).toEqual([]);
    });
  });
});

describe("routine-domain/reducers — звички CRUD", () => {
  describe("applyCreateHabit", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ["порожнє name", { name: "" }],
      ["whitespace name", { name: "   " }],
      ["без аргументів", undefined as never],
    ])("повертає state без змін: %s", (_, options) => {
      const s = baseState();
      expect(applyCreateHabit(s, options)).toBe(s);
    });

    it("створює звичку з дефолтами і додає id у habitOrder", () => {
      const next = applyCreateHabit(baseState(), { name: "  Йога  " });
      expect(next.habits).toHaveLength(1);
      const h = next.habits[0]!;
      expect(h.id).toMatch(/^hab_/);
      expect(h.name).toBe("Йога");
      expect(h.emoji).toBe("✓");
      expect(h.recurrence).toBe("daily");
      expect(h.endDate).toBeNull();
      expect(h.timeOfDay).toBe("");
      expect(h.reminderTimes).toEqual([]);
      expect(h.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(h.archived).toBe(false);
      expect(h.tagIds).toEqual([]);
      expect(h.categoryId).toBeNull();
      // startDate береться з today (зафіксований fake-timer)
      expect(h.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(next.habitOrder).toEqual([h.id]);
    });

    it("обрізає timeOfDay до 5 символів і відфільтровує невалідні reminderTimes", () => {
      const next = applyCreateHabit(baseState(), {
        name: "Test",
        timeOfDay: "  08:00:00  ",
        reminderTimes: ["07:30", "bad", "23:00"],
      });
      const h = next.habits[0]!;
      expect(h.timeOfDay).toBe("08:00");
      expect(h.reminderTimes).toEqual(["07:30", "23:00"]);
    });

    it("дедуплікує і сортує weekdays", () => {
      const next = applyCreateHabit(baseState(), {
        name: "Test",
        weekdays: [5, 1, 5, 3, 1],
      });
      expect(next.habits[0]!.weekdays).toEqual([1, 3, 5]);
    });

    it("fallback weekdays коли передано не-масив", () => {
      const next = applyCreateHabit(baseState(), {
        name: "Test",
        // @ts-expect-error — навмисно невалідний тип
        weekdays: null,
      });
      expect(next.habits[0]!.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it("tagIds=non-array нормалізуються в []", () => {
      const next = applyCreateHabit(baseState(), {
        name: "Test",
        // @ts-expect-error — навмисно невалідний тип
        tagIds: "nope",
      });
      expect(next.habits[0]!.tagIds).toEqual([]);
    });

    it("використовує переданий startDate і обрізає endDate", () => {
      const next = applyCreateHabit(baseState(), {
        name: "Test",
        startDate: "  2026-04-01  ",
        endDate: "  2026-05-01  ",
      });
      const h = next.habits[0]!;
      expect(h.startDate).toBe("2026-04-01");
      expect(h.endDate).toBe("2026-05-01");
    });

    it("порожній endDate (whitespace) → null", () => {
      const next = applyCreateHabit(baseState(), {
        name: "Test",
        endDate: "   ",
      });
      expect(next.habits[0]!.endDate).toBeNull();
    });

    it("дописує до існуючих звичок без втрати порядку", () => {
      let s = applyCreateHabit(baseState(), { name: "A" });
      s = applyCreateHabit(s, { name: "B" });
      expect(s.habits.map((h) => h.name)).toEqual(["A", "B"]);
      expect(s.habitOrder).toHaveLength(2);
    });
  });

  describe("applyUpdateHabit", () => {
    it("повертає state без змін для невідомого id", () => {
      const s = stateWithHabits([makeHabit({ id: "h1", name: "A" })]);
      expect(applyUpdateHabit(s, "missing", { name: "X" })).toBe(s);
    });

    it("повертає той самий state коли нормалізована версія ідентична", () => {
      const s = stateWithHabits([makeHabit({ id: "h1", name: "A" })]);
      // Патч не змінює жодне поле
      expect(applyUpdateHabit(s, "h1", {})).toBe(s);
    });

    it("оновлює лише вказану звичку", () => {
      const s = stateWithHabits([
        makeHabit({ id: "h1", name: "A" }),
        makeHabit({ id: "h2", name: "B" }),
      ]);
      const next = applyUpdateHabit(s, "h1", { name: "A-new", emoji: "🔥" });
      expect(next.habits[0]!.name).toBe("A-new");
      expect(next.habits[0]!.emoji).toBe("🔥");
      expect(next.habits[1]!.name).toBe("B");
    });
  });

  describe("applySetHabitArchived", () => {
    it("повертає state без змін для невідомого id", () => {
      const s = stateWithHabits([makeHabit({ id: "h1" })]);
      expect(applySetHabitArchived(s, "missing", true)).toBe(s);
    });

    it("повертає state без змін якщо archived вже таке саме", () => {
      const s = stateWithHabits([makeHabit({ id: "h1", archived: false })]);
      expect(applySetHabitArchived(s, "h1", false)).toBe(s);
    });

    it("архівує і розархівовує", () => {
      const s = stateWithHabits([makeHabit({ id: "h1", archived: false })]);
      const archived = applySetHabitArchived(s, "h1", true);
      expect(archived.habits[0]!.archived).toBe(true);
      const restored = applySetHabitArchived(archived, "h1", false);
      expect(restored.habits[0]!.archived).toBe(false);
    });
  });

  describe("applyDeleteHabit", () => {
    it("повертає state без змін для невідомого id", () => {
      const s = stateWithHabits([makeHabit({ id: "h1" })]);
      expect(applyDeleteHabit(s, "missing")).toBe(s);
    });

    it("видаляє звичку разом з completions, нотатками і порядком", () => {
      const s: RoutineState = {
        ...stateWithHabits([makeHabit({ id: "h1" }), makeHabit({ id: "h2" })]),
        completions: { h1: ["2026-01-01"], h2: ["2026-01-02"] },
        completionNotes: {
          "h1__2026-01-01": "note1",
          "h1__2026-01-02": "note2",
          "h2__2026-01-01": "keep",
        },
      };
      const next = applyDeleteHabit(s, "h1");
      expect(next.habits.map((h) => h.id)).toEqual(["h2"]);
      expect(next.completions).toEqual({ h2: ["2026-01-02"] });
      expect(next.completionNotes).toEqual({ "h2__2026-01-01": "keep" });
      expect(next.habitOrder).toEqual(["h2"]);
    });
  });
});

describe("routine-domain/reducers — snapshot/restore", () => {
  describe("snapshotHabit", () => {
    it("повертає null для невідомого id", () => {
      const s = stateWithHabits([makeHabit({ id: "h1" })]);
      expect(snapshotHabit(s, "missing")).toBeNull();
    });

    it("збирає повний знімок", () => {
      const habit = makeHabit({ id: "h1" });
      const s: RoutineState = {
        ...stateWithHabits([habit, makeHabit({ id: "h2" })]),
        completions: { h1: ["2026-01-01", "2026-01-02"] },
        completionNotes: {
          "h1__2026-01-01": "a",
          "h2__2026-01-01": "other",
        },
      };
      const snap = snapshotHabit(s, "h1");
      expect(snap).not.toBeNull();
      expect(snap!.habit.id).toBe("h1");
      expect(snap!.completions).toEqual(["2026-01-01", "2026-01-02"]);
      expect(snap!.notes).toEqual({ "h1__2026-01-01": "a" });
      expect(snap!.orderIndex).toBe(0);
    });

    it("повертає порожні completions/notes коли їх немає", () => {
      const s = stateWithHabits([makeHabit({ id: "h1" })]);
      const snap = snapshotHabit(s, "h1")!;
      expect(snap.completions).toEqual([]);
      expect(snap.notes).toEqual({});
    });
  });

  describe("applyRestoreHabit", () => {
    it("ігнорує null/undefined знімок", () => {
      const s = baseState();
      expect(applyRestoreHabit(s, null)).toBe(s);
      expect(applyRestoreHabit(s, undefined)).toBe(s);
    });

    it("ігнорує знімок без habit.id", () => {
      const s = baseState();
      const snap = {
        habit: { id: "", name: "" } as Habit,
        completions: [],
        notes: {},
        orderIndex: 0,
      };
      expect(applyRestoreHabit(s, snap)).toBe(s);
    });

    it("ігнорує знімок якщо звичка з таким id вже існує", () => {
      const habit = makeHabit({ id: "h1" });
      const s = stateWithHabits([habit]);
      const snap = {
        habit,
        completions: ["2026-01-01"],
        notes: {},
        orderIndex: 0,
      };
      expect(applyRestoreHabit(s, snap)).toBe(s);
    });

    it("відновлює звичку, completions, нотатки і вставляє за orderIndex", () => {
      const habit = makeHabit({ id: "restored" });
      const initial = stateWithHabits([
        makeHabit({ id: "h1" }),
        makeHabit({ id: "h2" }),
      ]);
      const snap = {
        habit,
        completions: ["2026-01-01"],
        notes: { "restored__2026-01-01": "note" },
        orderIndex: 1,
      };
      const next = applyRestoreHabit(initial, snap);
      expect(next.habits.map((h) => h.id)).toContain("restored");
      expect(next.completions["restored"]).toEqual(["2026-01-01"]);
      expect(next.completionNotes["restored__2026-01-01"]).toBe("note");
      expect(next.habitOrder).toEqual(["h1", "restored", "h2"]);
    });

    it("orderIndex > довжини → вставляє в кінець", () => {
      const habit = makeHabit({ id: "restored" });
      const initial = stateWithHabits([makeHabit({ id: "h1" })]);
      const snap = {
        habit,
        completions: [],
        notes: {},
        orderIndex: 99,
      };
      const next = applyRestoreHabit(initial, snap);
      expect(next.habitOrder).toEqual(["h1", "restored"]);
      // Порожні completions → ключ не додано
      expect(next.completions["restored"]).toBeUndefined();
    });

    it("orderIndex < 0 → вставляє в кінець", () => {
      const habit = makeHabit({ id: "restored" });
      const initial = stateWithHabits([makeHabit({ id: "h1" })]);
      const next = applyRestoreHabit(initial, {
        habit,
        completions: [],
        notes: {},
        orderIndex: -1,
      });
      expect(next.habitOrder).toEqual(["h1", "restored"]);
    });
  });
});

describe("routine-domain/reducers — completions і нотатки", () => {
  describe("applyToggleHabitCompletion", () => {
    it("повертає state без змін для невідомого habitId", () => {
      const s = stateWithHabits([makeHabit({ id: "h1" })]);
      expect(applyToggleHabitCompletion(s, "missing", "2026-01-05")).toBe(s);
    });

    it("додає відмітку коли звичка запланована і ще не позначена", () => {
      const s = stateWithHabits([makeHabit({ id: "h1" })]);
      const next = applyToggleHabitCompletion(s, "h1", "2026-01-05");
      expect(next.completions["h1"]).toEqual(["2026-01-05"]);
    });

    it("видаляє відмітку коли вже позначена (навіть якщо тепер не запланована)", () => {
      const habit = makeHabit({
        id: "h1",
        recurrence: "once",
        startDate: "2026-01-01",
      });
      const s: RoutineState = {
        ...stateWithHabits([habit]),
        completions: { h1: ["2026-01-05"] },
      };
      const next = applyToggleHabitCompletion(s, "h1", "2026-01-05");
      expect(next.completions["h1"]).toEqual([]);
    });

    it("повертає state без змін коли не запланована і ще не позначена", () => {
      const habit = makeHabit({
        id: "h1",
        recurrence: "once",
        startDate: "2026-01-01",
      });
      const s = stateWithHabits([habit]);
      expect(applyToggleHabitCompletion(s, "h1", "2026-01-05")).toBe(s);
    });

    it("результат сортується і дедуплікується", () => {
      const s: RoutineState = {
        ...stateWithHabits([makeHabit({ id: "h1" })]),
        completions: { h1: ["2026-01-05", "2026-01-03"] },
      };
      const next = applyToggleHabitCompletion(s, "h1", "2026-01-04");
      expect(next.completions["h1"]).toEqual([
        "2026-01-03",
        "2026-01-04",
        "2026-01-05",
      ]);
    });
  });

  describe("applyMarkAllScheduledHabitsComplete", () => {
    it("позначає всі активні заплановані звички, пропускає archived", () => {
      const s: RoutineState = {
        ...baseState(),
        habits: [
          makeHabit({ id: "h1" }),
          makeHabit({ id: "h2" }),
          makeHabit({ id: "h3", archived: true }),
        ],
        habitOrder: ["h1", "h2"],
      };
      const next = applyMarkAllScheduledHabitsComplete(s, "2026-01-05");
      expect(next.completions["h1"]).toEqual(["2026-01-05"]);
      expect(next.completions["h2"]).toEqual(["2026-01-05"]);
      expect(next.completions["h3"]).toBeUndefined();
    });

    it("пропускає вже позначені звички і повертає той самий state коли нічого не змінилось", () => {
      const s: RoutineState = {
        ...stateWithHabits([makeHabit({ id: "h1" })]),
        completions: { h1: ["2026-01-05"] },
      };
      expect(applyMarkAllScheduledHabitsComplete(s, "2026-01-05")).toBe(s);
    });

    it("пропускає звички що не заплановані на дату", () => {
      const habit = makeHabit({
        id: "h1",
        recurrence: "once",
        startDate: "2026-01-01",
      });
      const s = stateWithHabits([habit]);
      expect(applyMarkAllScheduledHabitsComplete(s, "2026-01-05")).toBe(s);
    });
  });

  describe("applySetCompletionNote", () => {
    it("порожній текст і нотатки немає → state без змін", () => {
      const s = stateWithHabits([makeHabit({ id: "h1" })]);
      expect(applySetCompletionNote(s, "h1", "2026-01-05", "  ")).toBe(s);
    });

    it("порожній текст видаляє існуючу нотатку", () => {
      const s: RoutineState = {
        ...stateWithHabits([makeHabit({ id: "h1" })]),
        completionNotes: { "h1__2026-01-05": "old" },
      };
      const next = applySetCompletionNote(s, "h1", "2026-01-05", "");
      expect(next.completionNotes["h1__2026-01-05"]).toBeUndefined();
    });

    it("повертає state без змін коли звичка не існує", () => {
      const s = stateWithHabits([makeHabit({ id: "h1" })]);
      expect(applySetCompletionNote(s, "missing", "2026-01-05", "x")).toBe(s);
    });

    it("записує обрізаний текст, обмежений 500 символами", () => {
      const s = stateWithHabits([makeHabit({ id: "h1" })]);
      const long = "x".repeat(600);
      const next = applySetCompletionNote(s, "h1", "2026-01-05", `  ${long}  `);
      const stored = next.completionNotes["h1__2026-01-05"]!;
      expect(stored.length).toBe(500);
      expect(stored).toBe("x".repeat(500));
    });
  });
});

describe("routine-domain/reducers — порядок і pref-и", () => {
  describe("applyMoveHabitInOrder", () => {
    it("повертає state без змін коли habitId не знайдено серед активних", () => {
      const s = stateWithHabits([
        makeHabit({ id: "h1" }),
        makeHabit({ id: "h2", archived: true }),
      ]);
      // h2 архівована → не входить у обчислений порядок
      expect(applyMoveHabitInOrder(s, "h2", -1)).toBe(s);
      expect(applyMoveHabitInOrder(s, "missing", 1)).toBe(s);
    });

    it("повертає state без змін коли delta виходить за межі", () => {
      const s = stateWithHabits([
        makeHabit({ id: "h1" }),
        makeHabit({ id: "h2" }),
      ]);
      expect(applyMoveHabitInOrder(s, "h1", -1)).toBe(s);
      expect(applyMoveHabitInOrder(s, "h2", 1)).toBe(s);
    });

    it("міняє місцями сусідів з delta=±1", () => {
      const s = stateWithHabits([
        makeHabit({ id: "h1" }),
        makeHabit({ id: "h2" }),
        makeHabit({ id: "h3" }),
      ]);
      const down = applyMoveHabitInOrder(s, "h1", 1);
      expect(down.habitOrder).toEqual(["h2", "h1", "h3"]);
      const up = applyMoveHabitInOrder(down, "h3", -1);
      expect(up.habitOrder).toEqual(["h2", "h3", "h1"]);
    });

    it("автоматично додає відсутні активні id перед обчисленням", () => {
      const s: RoutineState = {
        ...baseState(),
        habits: [makeHabit({ id: "h1" }), makeHabit({ id: "h2" })],
        // habitOrder містить лише h1 — h2 буде дописано
        habitOrder: ["h1"],
      };
      const next = applyMoveHabitInOrder(s, "h2", -1);
      expect(next.habitOrder).toEqual(["h2", "h1"]);
    });
  });

  describe("applySetHabitOrder", () => {
    it("повертає state без змін коли результат співпадає з поточним порядком", () => {
      const s = stateWithHabits([
        makeHabit({ id: "h1" }),
        makeHabit({ id: "h2" }),
      ]);
      expect(applySetHabitOrder(s, ["h1", "h2"])).toBe(s);
    });

    it("ігнорує невідомі id і дедуплікує дублікати", () => {
      const s = stateWithHabits([
        makeHabit({ id: "h1" }),
        makeHabit({ id: "h2" }),
        makeHabit({ id: "h3" }),
      ]);
      const next = applySetHabitOrder(s, ["h3", "h1", "h3", "ghost"]);
      // h3, h1 за вхідним порядком; h2 дописано в кінець
      expect(next.habitOrder).toEqual(["h3", "h1", "h2"]);
    });

    it("ігнорує архівовані id у вхідних даних", () => {
      const s = stateWithHabits([
        makeHabit({ id: "h1" }),
        makeHabit({ id: "h2", archived: true }),
      ]);
      const next = applySetHabitOrder(s, ["h2", "h1"]);
      // h2 архівована → виключена; h1 залишається
      expect(next.habitOrder).toEqual(["h1"]);
    });
  });

  describe("applySetPref", () => {
    it("додає новий ключ у prefs", () => {
      const next = applySetPref(baseState(), "showFizrukInCalendar", false);
      expect(next.prefs.showFizrukInCalendar).toBe(false);
    });

    it("замінює існуючий і не зачіпає інші ключі", () => {
      const s = applySetPref(baseState(), "foo", 1);
      expect(s.prefs["foo"]).toBe(1);
      const next = applySetPref(s, "foo", 2);
      expect(next.prefs["foo"]).toBe(2);
      expect(next.prefs.showFizrukInCalendar).toBe(true);
    });
  });

  describe("applyAddPushupReps", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ["NaN", "abc"],
      ["нуль", 0],
      ["відʼємне", -5],
      ["Infinity", Infinity],
    ])("повертає state без змін для %s", (_, reps) => {
      const s = baseState();
      expect(applyAddPushupReps(s, reps)).toBe(s);
    });

    it("додає reps до сьогоднішнього ключа, акумулює існуюче значення", () => {
      const today = "2026-03-15";
      const s = baseState();
      const first = applyAddPushupReps(s, 10);
      expect(first.pushupsByDate[today]).toBe(10);
      const second = applyAddPushupReps(first, 5);
      expect(second.pushupsByDate[today]).toBe(15);
    });

    it("приймає reps як рядок-число", () => {
      const next = applyAddPushupReps(baseState(), "7");
      expect(next.pushupsByDate["2026-03-15"]).toBe(7);
    });
  });
});
