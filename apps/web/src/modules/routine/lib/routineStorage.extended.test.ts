// @vitest-environment jsdom
/**
 * Extended tests for routineStorage: covers creation/update/delete/toggle/move/order
 * logic (previously only load/save were tested).
 *
 * Stage 8 PR #057r-tombstone — the load/persist surface now reads
 * from the SQLite warm cache instead of localStorage, so the suite
 * resets the cache (not LS) between specs and seeds residual fixtures
 * via `__setRoutineSqliteStateCacheForTests`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadRoutineState,
  createHabit,
  updateHabit,
  deleteHabit,
  snapshotHabit,
  restoreHabit,
  toggleHabitCompletion,
  markAllScheduledHabitsComplete,
  setHabitArchived,
  addPushupReps,
  moveHabitInOrder,
  setHabitOrder,
  setCompletionNote,
  createTag,
  createCategory,
  updateTag,
  updateCategory,
  deleteTag,
  deleteCategory,
  buildRoutineBackupPayload,
  applyRoutineBackupPayload,
} from "./routineStorage";
import {
  __setRoutineSqliteStateCacheForTests,
  clearSqliteCompletionsCache,
  clearSqliteRoutineStateCache,
} from "./sqliteReader";
import { completionNoteKey } from "./completionNoteKey";

beforeEach(() => {
  localStorage.clear();
  clearSqliteCompletionsCache();
  clearSqliteRoutineStateCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
});
afterEach(() => {
  localStorage.clear();
  clearSqliteCompletionsCache();
  clearSqliteRoutineStateCache();
  vi.useRealTimers();
});

function fresh() {
  return loadRoutineState();
}

describe("createHabit", () => {
  it("додає нову звичку і habit_order", () => {
    const s1 = fresh();
    const s2 = createHabit(s1, { name: "Читати" });
    expect(s2.habits).toHaveLength(1);
    expect(s2.habits[0]!.name).toBe("Читати");
    expect(s2.habitOrder).toContain(s2.habits[0]!.id);
  });
  it("повертає оригінальний state коли name пустий", () => {
    const s1 = fresh();
    const s2 = createHabit(s1, { name: "   " });
    expect(s2).toBe(s1);
  });
  it("нормалізує weekdays — унікальні й відсортовані", () => {
    const s = createHabit(fresh(), {
      name: "Спорт",
      weekdays: [3, 1, 3, 5, 1],
    });
    expect(s.habits[0]!.weekdays).toEqual([1, 3, 5]);
  });
  it("файрить dual-write без запису у localStorage (томбстон)", () => {
    const s = createHabit(fresh(), { name: "X" });
    expect(s.habits).toHaveLength(1);
    expect(localStorage.getItem("hub_routine_v1")).toBe(null);
  });
});

describe("updateHabit", () => {
  it("застосовує patch до потрібної звички", () => {
    const s1 = createHabit(fresh(), { name: "Old" });
    const id = s1.habits[0]!.id;
    const s2 = updateHabit(s1, id, { name: "New" });
    expect(s2.habits[0]!.name).toBe("New");
  });
  it("ігнорує неіснуючий id", () => {
    const s1 = createHabit(fresh(), { name: "A" });
    const s2 = updateHabit(s1, "ghost", { name: "Z" });
    expect(s2.habits[0]!.name).toBe("A");
  });
});

describe("deleteHabit", () => {
  it("видаляє звичку, completions та order запис", () => {
    let s = createHabit(fresh(), { name: "A" });
    const id = s.habits[0]!.id;
    s = toggleHabitCompletion(s, id, "2024-06-15");
    expect(s.completions[id]).toContain("2024-06-15");
    s = deleteHabit(s, id);
    expect(s.habits).toHaveLength(0);
    expect(s.completions[id]).toBeUndefined();
    expect(s.habitOrder).not.toContain(id);
  });
});

describe("snapshotHabit + restoreHabit", () => {
  it("відновлює звичку, completions, notes та позицію в order", () => {
    let s = fresh();
    s = createHabit(s, { name: "A" });
    s = createHabit(s, { name: "B" });
    s = createHabit(s, { name: "C" });
    const [idA, idB, idC] = s.habits.map((h) => h.id);
    s = toggleHabitCompletion(s, idB!, "2024-06-15");
    s = setCompletionNote(s, idB!, "2024-06-15", "важливо");

    const snap = snapshotHabit(s, idB!);
    expect(snap).not.toBeNull();
    expect(snap?.habit.id).toBe(idB);
    expect(snap?.completions).toContain("2024-06-15");
    expect(Object.keys(snap?.notes || {})).toHaveLength(1);
    expect(snap?.orderIndex).toBe(1);

    s = deleteHabit(s, idB!);
    expect(s.habits.map((h) => h.id)).toEqual([idA, idC]);
    expect(s.completions[idB!]).toBeUndefined();

    s = restoreHabit(s, snap);
    // habits array перебудовується append-ом, порядок дає habitOrder
    expect(new Set(s.habits.map((h) => h.id))).toEqual(
      new Set([idA, idB, idC]),
    );
    expect(s.habitOrder).toEqual([idA, idB, idC]);
    expect(s.completions[idB!]).toContain("2024-06-15");
    expect(s.completionNotes[completionNoteKey(idB!, "2024-06-15")]).toBe(
      "важливо",
    );
  });

  it("ідемпотентно: повторний restore не дублює звичку", () => {
    let s = createHabit(fresh(), { name: "X" });
    const id = s.habits[0]!.id;
    const snap = snapshotHabit(s, id);
    s = deleteHabit(s, id);
    s = restoreHabit(s, snap);
    s = restoreHabit(s, snap);
    expect(s.habits).toHaveLength(1);
    expect(s.habitOrder).toEqual([id]);
  });

  it("snapshotHabit повертає null для неіснуючого id", () => {
    const s = createHabit(fresh(), { name: "A" });
    expect(snapshotHabit(s, "ghost")).toBeNull();
  });

  it("restoreHabit ігнорує null/undefined snapshot", () => {
    const s = createHabit(fresh(), { name: "A" });
    expect(restoreHabit(s, null)).toBe(s);
    expect(restoreHabit(s, undefined)).toBe(s);
  });
});

describe("toggleHabitCompletion", () => {
  it("позначає і знімає відмітку на запланованій даті", () => {
    let s = createHabit(fresh(), { name: "A" });
    const id = s.habits[0]!.id;
    s = toggleHabitCompletion(s, id, "2024-06-15");
    expect(s.completions[id]).toContain("2024-06-15");
    s = toggleHabitCompletion(s, id, "2024-06-15");
    expect(s.completions[id]).not.toContain("2024-06-15");
  });
  it("не додає відмітку на незаплановану дату (weekly recurrence)", () => {
    // weekdays = [0] (Mon ISO) для weekly-habit; 2024-06-15 — субота
    const s1 = createHabit(fresh(), {
      name: "Mon only",
      recurrence: "weekly",
      weekdays: [0],
    });
    const id = s1.habits[0]!.id;
    const s2 = toggleHabitCompletion(s1, id, "2024-06-15");
    expect(s2).toBe(s1);
  });
  it("дозволяє зняти попередньо збережену відмітку навіть якщо дата не запланована", () => {
    let s = createHabit(fresh(), { name: "A" });
    const id = s.habits[0]!.id;
    s = toggleHabitCompletion(s, id, "2024-06-15");
    s = updateHabit(s, id, { recurrence: "weekly", weekdays: [0] });
    s = toggleHabitCompletion(s, id, "2024-06-15");
    expect(s.completions[id] || []).not.toContain("2024-06-15");
  });
  it("нічого не робить для неіснуючої звички", () => {
    const s1 = fresh();
    const s2 = toggleHabitCompletion(s1, "ghost", "2024-06-15");
    expect(s2).toBe(s1);
  });
});

describe("markAllScheduledHabitsComplete", () => {
  it("відмічає всі активні заплановані, ігноруючи архівовані", () => {
    let s = fresh();
    s = createHabit(s, { name: "A" });
    s = createHabit(s, { name: "B" });
    s = createHabit(s, { name: "C" });
    const [a, b, c] = s.habits.map((h) => h.id);
    s = setHabitArchived(s, c!, true);
    s = markAllScheduledHabitsComplete(s, "2024-06-15");
    expect(s.completions[a!]).toContain("2024-06-15");
    expect(s.completions[b!]).toContain("2024-06-15");
    expect(s.completions[c!] || []).not.toContain("2024-06-15");
  });
  it("повертає same state коли нічого нового", () => {
    const s1 = fresh();
    const s2 = markAllScheduledHabitsComplete(s1, "2024-06-15");
    expect(s2).toBe(s1);
  });
});

describe("addPushupReps", () => {
  it("додає до лічильника за сьогодні", () => {
    let s = addPushupReps(fresh(), 10);
    expect(s.pushupsByDate["2024-06-15"]).toBe(10);
    s = addPushupReps(s, 5);
    expect(s.pushupsByDate["2024-06-15"]).toBe(15);
  });
  it("ігнорує невалідні reps", () => {
    const s1 = fresh();
    expect(addPushupReps(s1, 0)).toBe(s1);
    expect(addPushupReps(s1, -3)).toBe(s1);
    expect(addPushupReps(s1, "abc")).toBe(s1);
  });
});

describe("moveHabitInOrder", () => {
  it("міняє місцями сусідні елементи", () => {
    let s = fresh();
    s = createHabit(s, { name: "A" });
    s = createHabit(s, { name: "B" });
    s = createHabit(s, { name: "C" });
    const [a, b, _c] = s.habits.map((h) => h.id);
    s = moveHabitInOrder(s, b!, -1);
    expect(s.habitOrder[0]).toBe(b);
    expect(s.habitOrder[1]).toBe(a);
  });
  it("no-op за межами масиву", () => {
    let s = fresh();
    s = createHabit(s, { name: "A" });
    s = createHabit(s, { name: "B" });
    const [a] = s.habits.map((h) => h.id);
    const s2 = moveHabitInOrder(s, a!, -1);
    expect(s2.habitOrder).toEqual(s.habitOrder);
  });
});

describe("setHabitOrder", () => {
  it("застосовує порядок, залишаючи відсутні id у кінці", () => {
    let s = fresh();
    s = createHabit(s, { name: "A" });
    s = createHabit(s, { name: "B" });
    s = createHabit(s, { name: "C" });
    const [a, b, c] = s.habits.map((h) => h.id);
    s = setHabitOrder(s, [c!, a!]);
    expect(s.habitOrder[0]).toBe(c);
    expect(s.habitOrder[1]).toBe(a);
    expect(s.habitOrder).toContain(b);
  });
});

describe("setCompletionNote", () => {
  it("зберігає та очищує нотатку", () => {
    let s = createHabit(fresh(), { name: "A" });
    const id = s.habits[0]!.id;
    s = setCompletionNote(s, id, "2024-06-15", "Добре");
    const key = Object.keys(s.completionNotes)[0];
    expect(s.completionNotes[key!]).toBe("Добре");
    s = setCompletionNote(s, id, "2024-06-15", "  ");
    expect(Object.keys(s.completionNotes)).toHaveLength(0);
  });
  it("обрізає нотатку до 500 символів", () => {
    const long = "a".repeat(600);
    let s = createHabit(fresh(), { name: "A" });
    const id = s.habits[0]!.id;
    s = setCompletionNote(s, id, "2024-06-15", long);
    const key = Object.keys(s.completionNotes)[0];
    expect(s.completionNotes[key!]!.length).toBe(500);
  });
});

describe("tags and categories", () => {
  it("створення й оновлення тега", () => {
    let s = createTag(fresh(), "work");
    const t = s.tags[0];
    expect(t!.name!).toBe("work");
    s = updateTag(s, t!.id!, "home");
    expect(s.tags[0]!.name).toBe("home");
  });
  it("видалення тега видаляє посилання в habits", () => {
    let s = createTag(fresh(), "t1");
    const tid = s.tags[0]!.id;
    s = createHabit(s, { name: "A", tagIds: [tid] });
    s = deleteTag(s, tid);
    expect(s.tags).toHaveLength(0);
    expect(s.habits[0]!.tagIds).not.toContain(tid);
  });
  it("створення й оновлення категорії з емодзі", () => {
    let s = createCategory(fresh(), "Health", "💪");
    const c = s.categories[0];
    expect(c!.emoji!).toBe("💪");
    s = updateCategory(s, c!.id!, { name: "Wellness" });
    expect(s.categories[0]!.name).toBe("Wellness");
  });
  it("видалення категорії скидає categoryId в habits", () => {
    let s = createCategory(fresh(), "A");
    const cid = s.categories[0]!.id;
    s = createHabit(s, { name: "Habit A", categoryId: cid });
    s = deleteCategory(s, cid);
    expect(s.categories).toHaveLength(0);
    expect(s.habits[0]!.categoryId).toBeNull();
  });
});

describe("edge cases: double completion in one day", () => {
  it("повторний toggle після вже відміченого — знімає відмітку (off)", () => {
    let s = createHabit(fresh(), { name: "A" });
    const id = s.habits[0]!.id;
    s = toggleHabitCompletion(s, id, "2024-06-15");
    s = toggleHabitCompletion(s, id, "2024-06-15");
    expect(s.completions[id] || []).not.toContain("2024-06-15");
  });
  it("три послідовні toggle: on → off → on залишає рівно одну відмітку", () => {
    let s = createHabit(fresh(), { name: "A" });
    const id = s.habits[0]!.id;
    s = toggleHabitCompletion(s, id, "2024-06-15");
    s = toggleHabitCompletion(s, id, "2024-06-15");
    s = toggleHabitCompletion(s, id, "2024-06-15");
    const count = (s.completions[id] || []).filter(
      (k) => k === "2024-06-15",
    ).length;
    expect(count).toBe(1);
  });
  // The LS → normalize sanitization path moved out of `loadRoutineState`
  // in PR #057r-tombstone — it is now exercised by `residualImport.ts`
  // and `@sergeant/routine-domain`'s own `normalizeRoutineState` tests.
  it("markAllScheduledHabitsComplete стає no-op після дедуплікації", () => {
    let s = createHabit(fresh(), { name: "A" });
    const id = s.habits[0]!.id;
    s = toggleHabitCompletion(s, id, "2024-06-15");
    const s2 = markAllScheduledHabitsComplete(s, "2024-06-15");
    expect(s2).toBe(s);
  });
  it("toggleHabitCompletion дедуплікує передувало-дубльований масив", () => {
    // Симулюємо пошкоджений state з дублем прямо в пам'яті
    let s = createHabit(fresh(), { name: "A" });
    const id = s.habits[0]!.id;
    s = {
      ...s,
      completions: { ...s.completions, [id]: ["2024-06-15", "2024-06-15"] },
    };
    const s2 = toggleHabitCompletion(s, id, "2024-06-15");
    expect(s2.completions[id]).not.toContain("2024-06-15");
  });
});

describe("edge cases: reorder after delete", () => {
  it("видалення середньої звички зберігає порядок решти", () => {
    let s = fresh();
    s = createHabit(s, { name: "A" });
    s = createHabit(s, { name: "B" });
    s = createHabit(s, { name: "C" });
    const [a, b, c] = s.habits.map((h) => h.id);
    s = deleteHabit(s, b!);
    expect(s.habitOrder).toEqual([a, c]);
    expect(s.habitOrder).not.toContain(b);
  });
  it("moveHabitInOrder після delete не тягне видалений id назад", () => {
    let s = fresh();
    s = createHabit(s, { name: "A" });
    s = createHabit(s, { name: "B" });
    s = createHabit(s, { name: "C" });
    const [a, _b, c] = s.habits.map((h) => h.id);
    s = deleteHabit(s, _b!);
    s = moveHabitInOrder(s, c!, -1);
    expect(s.habitOrder).toEqual([c, a]);
  });
  it("setHabitOrder ігнорує id видаленої звички", () => {
    let s = fresh();
    s = createHabit(s, { name: "A" });
    s = createHabit(s, { name: "B" });
    const [a, b] = s.habits.map((h) => h.id);
    s = deleteHabit(s, a!);
    s = setHabitOrder(s, [a!, b!]);
    expect(s.habitOrder).toEqual([b]);
  });
});

describe("edge cases: archived habits isolation", () => {
  it("moveHabitInOrder не пересуває архівовану звичку", () => {
    let s = fresh();
    s = createHabit(s, { name: "A" });
    s = createHabit(s, { name: "B" });
    const [a] = s.habits.map((h) => h.id);
    const orderBefore = [...s.habitOrder];
    s = setHabitArchived(s, a!, true);
    // move has no effect for archived ids
    const s2 = moveHabitInOrder(s, a!, 1);
    expect(s2).toBe(s);
    expect(s2.habitOrder).toEqual(orderBefore);
  });
  it("markAllScheduledHabitsComplete пропускає архівовані", () => {
    let s = fresh();
    s = createHabit(s, { name: "A" });
    s = createHabit(s, { name: "B" });
    const [a, b] = s.habits.map((h) => h.id);
    s = setHabitArchived(s, b!, true);
    s = markAllScheduledHabitsComplete(s, "2024-06-15");
    expect(s.completions[a!]).toContain("2024-06-15");
    expect(s.completions[b!] || []).not.toContain("2024-06-15");
  });
  it("setHabitOrder відкидає архівовані id", () => {
    let s = fresh();
    s = createHabit(s, { name: "A" });
    s = createHabit(s, { name: "B" });
    const [a, b] = s.habits.map((h) => h.id);
    s = setHabitArchived(s, a!, true);
    s = setHabitOrder(s, [a!, b!]);
    expect(s.habitOrder).toEqual([b]);
  });
});

describe("edge cases: delete tag/category used in habits", () => {
  it("deleteTag видаляє посилання у кількох звичках", () => {
    let s = createTag(fresh(), "t1");
    const tid = s.tags[0]!.id;
    s = createHabit(s, { name: "A", tagIds: [tid] });
    s = createHabit(s, { name: "B", tagIds: [tid] });
    s = deleteTag(s, tid);
    for (const h of s.habits) {
      expect(h.tagIds).not.toContain(tid);
    }
  });
  it("deleteCategory скидає categoryId у всіх звичках, які її використовують", () => {
    let s = createCategory(fresh(), "C");
    const cid = s.categories[0]!.id;
    s = createHabit(s, { name: "A", categoryId: cid });
    s = createHabit(s, { name: "B", categoryId: cid });
    s = createHabit(s, { name: "C", categoryId: null });
    s = deleteCategory(s, cid);
    for (const h of s.habits) {
      expect(h.categoryId).toBeNull();
    }
  });
  it("deleteTag не чіпає теги інших звичок", () => {
    let s = createTag(fresh(), "t1");
    s = createTag(s, "t2");
    const [t1, t2] = s.tags.map((t) => t.id);
    s = createHabit(s, { name: "A", tagIds: [t1!, t2!] });
    s = deleteTag(s, t1!);
    expect(s.habits[0]!.tagIds).toEqual([t2]);
    expect(s.tags.map((t) => t.id)).toEqual([t2]);
  });
});

describe("edge cases: completion notes cleanup", () => {
  it("deleteHabit прибирає всі completionNotes для цієї звички", () => {
    let s = fresh();
    s = createHabit(s, { name: "A" });
    s = createHabit(s, { name: "B" });
    const [a, b] = s.habits.map((h) => h.id);
    s = setCompletionNote(s, a!, "2024-06-15", "note-a-1");
    s = setCompletionNote(s, a!, "2024-06-14", "note-a-2");
    s = setCompletionNote(s, b!, "2024-06-15", "note-b");
    s = deleteHabit(s, a!);
    const keys = Object.keys(s.completionNotes);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(completionNoteKey(b!, "2024-06-15"));
  });
  it("setCompletionNote не створює нотатку для неіснуючої звички", () => {
    const s1 = fresh();
    const s2 = setCompletionNote(s1, "ghost", "2024-06-15", "hi");
    expect(s2).toBe(s1);
    expect(Object.keys(s2.completionNotes || {})).toHaveLength(0);
  });
  it("setCompletionNote з порожнім текстом без існуючої нотатки — no-op", () => {
    let s = createHabit(fresh(), { name: "A" });
    const id = s.habits[0]!.id;
    const before = s;
    s = setCompletionNote(s, id, "2024-06-15", "");
    expect(s).toBe(before);
  });
  it("setCompletionNote чистить існуючу нотатку навіть для архівованої звички", () => {
    let s = createHabit(fresh(), { name: "A" });
    const id = s.habits[0]!.id;
    s = setCompletionNote(s, id, "2024-06-15", "note");
    s = setHabitArchived(s, id, true);
    s = setCompletionNote(s, id, "2024-06-15", "");
    expect(Object.keys(s.completionNotes)).toHaveLength(0);
  });
  it("toggle off → toggle on зберігає раніше записану нотатку (UX не змінюється)", () => {
    let s = createHabit(fresh(), { name: "A" });
    const id = s.habits[0]!.id;
    s = toggleHabitCompletion(s, id, "2024-06-15");
    s = setCompletionNote(s, id, "2024-06-15", "stay");
    s = toggleHabitCompletion(s, id, "2024-06-15"); // off
    s = toggleHabitCompletion(s, id, "2024-06-15"); // on
    const k = completionNoteKey(id, "2024-06-15");
    expect(s.completionNotes[k]).toBe("stay");
  });
});

describe("backup payload format", () => {
  it("buildRoutineBackupPayload повертає канонічний envelope", () => {
    const id = "h1";
    __setRoutineSqliteStateCacheForTests({
      habits: [
        {
          id,
          name: "Cached",
          archived: false,
          paused: false,
          recurrence: "daily",
          startDate: "2024-06-01",
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          reminderTimes: [],
          createdAt: "2024-06-01T00:00:00.000Z",
        },
      ],
      habitOrder: [id],
    });
    const payload = buildRoutineBackupPayload();
    expect(payload.kind).toBe("hub-routine-backup");
    expect(payload.data.habits).toHaveLength(1);
    expect(payload.data.habits[0]!.name).toBe("Cached");
  });
  it("applyRoutineBackupPayload кидає на невалідному payload", () => {
    expect(() => applyRoutineBackupPayload(null)).toThrow();
    expect(() => applyRoutineBackupPayload({ kind: "wrong" })).toThrow();
    expect(() =>
      applyRoutineBackupPayload({ kind: "hub-routine-backup", data: null }),
    ).toThrow();
  });
});
