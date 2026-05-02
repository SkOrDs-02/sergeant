// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleRoutineAction } from "./routineActions";
import type { ChatAction } from "./types";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-22T12:00:00"));
});
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

function call(action: ChatAction): string {
  const out = handleRoutineAction(action);
  if (out == null) {
    throw new Error(`handler returned ${typeof out}, expected string|object`);
  }
  return typeof out === "string" ? out : out.result;
}

function seedHabit(id: string, name: string, extra?: Record<string, unknown>) {
  const state = JSON.parse(
    localStorage.getItem("hub_routine_v1") || '{"habits":[],"completions":{}}',
  );
  state.habits.push({ id, name, emoji: "✓", ...extra });
  localStorage.setItem("hub_routine_v1", JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// mark_habit_done
// ---------------------------------------------------------------------------
describe("mark_habit_done", () => {
  it("happy: marks habit done for today", () => {
    seedHabit("h1", "Вода");
    const out = call({
      name: "mark_habit_done",
      input: { habit_id: "h1" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Вода");
    expect(out).toContain("виконану");
    expect(out).toContain("2026-04-22");
  });

  it("happy: marks habit done for specific date", () => {
    seedHabit("h2", "Читання");
    const out = call({
      name: "mark_habit_done",
      input: { habit_id: "h2", date: "2026-04-20" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("2026-04-20");
  });

  it("shape: result is a non-empty string", () => {
    seedHabit("h3", "Медитація");
    const out = call({ name: "mark_habit_done", input: { habit_id: "h3" } });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// create_habit
// ---------------------------------------------------------------------------
describe("create_habit", () => {
  it("happy: creates daily habit", () => {
    const out = call({
      name: "create_habit",
      input: { name: "Зарядка", emoji: "🏃" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Зарядка");
    expect(out).toContain("щодня");
  });

  it("error: empty name returns error", () => {
    const out = call({
      name: "create_habit",
      input: { name: "" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("без назви");
  });

  it("shape: result contains habit id", () => {
    const out = call({
      name: "create_habit",
      input: { name: "Тест" },
    });
    expect(typeof out).toBe("string");
    expect(out).toMatch(/id:/);
  });
});

// ---------------------------------------------------------------------------
// create_reminder
// ---------------------------------------------------------------------------
describe("create_reminder", () => {
  it("happy: adds reminder to habit", () => {
    seedHabit("h1", "Вода");
    const out = call({
      name: "create_reminder",
      input: { habit_id: "h1", time: "09:00" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("09:00");
    expect(out).toContain("Вода");
  });

  it("error: invalid time format returns error", () => {
    seedHabit("h1", "Вода");
    const out = call({
      name: "create_reminder",
      input: { habit_id: "h1", time: "bad" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("HH:MM");
  });

  it("error: missing habit_id returns error", () => {
    const out = call({
      name: "create_reminder",
      input: { habit_id: "", time: "09:00" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("habit_id");
  });

  it("error: habit not found returns error", () => {
    const out = call({
      name: "create_reminder",
      input: { habit_id: "nonexistent", time: "09:00" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("не знайдено");
  });

  it("shape: result is a non-empty string", () => {
    seedHabit("h2", "Сон");
    const out = call({
      name: "create_reminder",
      input: { habit_id: "h2", time: "22:00" },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// complete_habit_for_date
// ---------------------------------------------------------------------------
describe("complete_habit_for_date", () => {
  it("happy: marks habit done for specific date", () => {
    seedHabit("h1", "Вода");
    const out = call({
      name: "complete_habit_for_date",
      input: { habit_id: "h1", date: "2026-04-21" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("відмічено");
  });

  it("happy: uncompletes habit (completed=false)", () => {
    seedHabit("h1", "Вода");
    call({
      name: "complete_habit_for_date",
      input: { habit_id: "h1", date: "2026-04-21" },
    });
    const out = call({
      name: "complete_habit_for_date",
      input: { habit_id: "h1", date: "2026-04-21", completed: false },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("знято");
  });

  it("error: invalid date returns error", () => {
    seedHabit("h1", "Вода");
    const out = call({
      name: "complete_habit_for_date",
      input: { habit_id: "h1", date: "bad-date" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("YYYY-MM-DD");
  });

  it("error: habit not found returns error", () => {
    const out = call({
      name: "complete_habit_for_date",
      input: { habit_id: "missing", date: "2026-04-22" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("не знайдено");
  });

  it("shape: result is a non-empty string", () => {
    seedHabit("h1", "Тест");
    const out = call({
      name: "complete_habit_for_date",
      input: { habit_id: "h1", date: "2026-04-22" },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// archive_habit (RISKY_TOOL)
// ---------------------------------------------------------------------------
describe("archive_habit", () => {
  it("happy: archives habit", () => {
    seedHabit("h1", "Зарядка");
    const out = call({
      name: "archive_habit",
      input: { habit_id: "h1" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("заархівовано");
  });

  it("happy: unarchives habit", () => {
    seedHabit("h1", "Зарядка", { archived: true });
    const out = call({
      name: "archive_habit",
      input: { habit_id: "h1", archived: false },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("повернуто");
  });

  it("error: missing habit_id returns error", () => {
    const out = call({
      name: "archive_habit",
      input: { habit_id: "" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("habit_id");
  });

  it("error: habit not found returns error", () => {
    const out = call({
      name: "archive_habit",
      input: { habit_id: "missing" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("не знайдено");
  });

  it("shape: already archived returns idempotent message", () => {
    seedHabit("h1", "Зарядка", { archived: true });
    const out = call({
      name: "archive_habit",
      input: { habit_id: "h1", archived: true },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("вже");
  });
});

// ---------------------------------------------------------------------------
// add_calendar_event
// ---------------------------------------------------------------------------
describe("add_calendar_event", () => {
  it("happy: adds calendar event", () => {
    const out = call({
      name: "add_calendar_event",
      input: { name: "Зустріч", date: "2026-05-01", time: "14:00" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Зустріч");
    expect(out).toContain("2026-05-01");
  });

  it("error: empty name returns error", () => {
    const out = call({
      name: "add_calendar_event",
      input: { name: "", date: "2026-05-01" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("назва");
  });

  it("error: invalid date returns error", () => {
    const out = call({
      name: "add_calendar_event",
      input: { name: "X", date: "bad" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("YYYY-MM-DD");
  });

  it("shape: result contains event id", () => {
    const out = call({
      name: "add_calendar_event",
      input: { name: "Тест", date: "2026-05-10" },
    });
    expect(typeof out).toBe("string");
    expect(out).toMatch(/id:/);
  });
});

// ---------------------------------------------------------------------------
// edit_habit
// ---------------------------------------------------------------------------
describe("edit_habit", () => {
  it("happy: edits habit name", () => {
    seedHabit("h1", "Старе");
    const out = call({
      name: "edit_habit",
      input: { habit_id: "h1", name: "Нове" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Нове");
    expect(out).toContain("оновлено");
  });

  it("error: missing habit_id returns error", () => {
    const out = call({
      name: "edit_habit",
      input: { habit_id: "" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("habit_id");
  });

  it("error: no changes returns error", () => {
    seedHabit("h1", "Тест");
    const out = call({
      name: "edit_habit",
      input: { habit_id: "h1" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Немає");
  });

  it("shape: result is a non-empty string", () => {
    seedHabit("h1", "A");
    const out = call({
      name: "edit_habit",
      input: { habit_id: "h1", emoji: "🔥" },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// set_habit_schedule
// ---------------------------------------------------------------------------
describe("set_habit_schedule", () => {
  it("happy: sets weekly schedule", () => {
    seedHabit("h1", "Біг");
    const out = call({
      name: "set_habit_schedule",
      input: { habit_id: "h1", days: ["mon", "wed", "fri"] },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Пн");
    expect(out).toContain("Ср");
    expect(out).toContain("Пт");
  });

  it("error: empty days returns error", () => {
    seedHabit("h1", "X");
    const out = call({
      name: "set_habit_schedule",
      input: { habit_id: "h1", days: [] },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("непорожній");
  });

  it("error: unrecognized day names returns error", () => {
    seedHabit("h1", "X");
    const out = call({
      name: "set_habit_schedule",
      input: { habit_id: "h1", days: ["funday"] },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("розпізнати");
  });

  it("shape: result is a non-empty string", () => {
    seedHabit("h1", "X");
    const out = call({
      name: "set_habit_schedule",
      input: { habit_id: "h1", days: ["пн"] },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// pause_habit
// ---------------------------------------------------------------------------
describe("pause_habit", () => {
  it("happy: pauses habit", () => {
    seedHabit("h1", "Вода");
    const out = call({
      name: "pause_habit",
      input: { habit_id: "h1" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("паузу");
  });

  it("happy: unpauses habit", () => {
    seedHabit("h1", "Вода", { paused: true });
    const out = call({
      name: "pause_habit",
      input: { habit_id: "h1", paused: false },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("знято з паузи");
  });

  it("error: habit not found returns error", () => {
    const out = call({
      name: "pause_habit",
      input: { habit_id: "missing" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("не знайдено");
  });

  it("shape: already paused returns idempotent message", () => {
    seedHabit("h1", "X", { paused: true });
    const out = call({
      name: "pause_habit",
      input: { habit_id: "h1", paused: true },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("вже");
  });
});

// ---------------------------------------------------------------------------
// reorder_habits
// ---------------------------------------------------------------------------
describe("reorder_habits", () => {
  it("happy: reorders habits", () => {
    seedHabit("h1", "A");
    seedHabit("h2", "B");
    const out = call({
      name: "reorder_habits",
      input: { habit_ids: ["h2", "h1"] },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("оновлено");
  });

  it("error: empty array returns error", () => {
    const out = call({
      name: "reorder_habits",
      input: { habit_ids: [] },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("масив");
  });

  it("shape: result is a non-empty string", () => {
    seedHabit("h1", "X");
    const out = call({
      name: "reorder_habits",
      input: { habit_ids: ["h1"] },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// habit_stats
// ---------------------------------------------------------------------------
describe("habit_stats", () => {
  it("happy: returns stats for existing habit", () => {
    seedHabit("h1", "Вода");
    const state = JSON.parse(localStorage.getItem("hub_routine_v1")!);
    state.completions = { h1: ["2026-04-22", "2026-04-21"] };
    localStorage.setItem("hub_routine_v1", JSON.stringify(state));
    const out = call({
      name: "habit_stats",
      input: { habit_id: "h1", period_days: 7 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Статистика");
    expect(out).toContain("Вода");
  });

  it("error: missing habit_id returns error", () => {
    const out = call({
      name: "habit_stats",
      input: { habit_id: "" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("habit_id");
  });

  it("error: habit not found returns error", () => {
    const out = call({
      name: "habit_stats",
      input: { habit_id: "missing" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("не знайдено");
  });

  it("shape: result is a multiline string with stats", () => {
    seedHabit("h1", "X");
    const out = call({
      name: "habit_stats",
      input: { habit_id: "h1" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Виконано");
    expect(out).toContain("серія");
  });
});

// ---------------------------------------------------------------------------
// habit_trend
// ---------------------------------------------------------------------------
describe("habit_trend", () => {
  it("happy: returns trend for all habits", () => {
    seedHabit("h1", "A");
    const out = call({
      name: "habit_trend",
      input: {},
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Тренд");
  });

  it("error: no habits returns error", () => {
    const out = call({
      name: "habit_trend",
      input: {},
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Немає");
  });

  it("error: specific habit not found returns error", () => {
    seedHabit("h1", "A");
    const out = call({
      name: "habit_trend",
      input: { habit_id: "nonexistent" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("не знайдено");
  });

  it("shape: result is a non-empty string", () => {
    seedHabit("h1", "X");
    const out = call({ name: "habit_trend", input: { period_days: 14 } });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// create_habit · undo
// ---------------------------------------------------------------------------
describe("create_habit · undo", () => {
  it("повертає {undo} що видаляє створену звичку", () => {
    const out = handleRoutineAction({
      name: "create_habit",
      input: { name: "Біг" },
    });
    if (typeof out === "string" || out == null) {
      throw new Error(`expected undoable result, got ${typeof out}`);
    }
    expect(out.result).toContain("Біг");
    const before = JSON.parse(localStorage.getItem("hub_routine_v1") || "{}");
    expect(before.habits).toHaveLength(1);
    const createdId = before.habits[0].id;

    out.undo();

    const after = JSON.parse(localStorage.getItem("hub_routine_v1") || "{}");
    expect(
      after.habits.find((h: { id: string }) => h.id === createdId),
    ).toBeUndefined();
  });

  it("undo прибирає completions для видаленої звички (cleanup)", () => {
    const out = handleRoutineAction({
      name: "create_habit",
      input: { name: "Йога" },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");

    // Додаємо completion вручну, щоб перевірити що undo чистить його теж.
    const state = JSON.parse(localStorage.getItem("hub_routine_v1")!);
    const createdId = state.habits[0].id;
    state.completions = {
      ...(state.completions || {}),
      [createdId]: ["2024-06-15"],
    };
    localStorage.setItem("hub_routine_v1", JSON.stringify(state));

    out.undo();

    const after = JSON.parse(localStorage.getItem("hub_routine_v1") || "{}");
    expect(after.completions[createdId]).toBeUndefined();
  });

  it("error path (порожня назва) повертає string без undo", () => {
    const out = handleRoutineAction({
      name: "create_habit",
      input: { name: "   " },
    });
    expect(typeof out).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// mark_habit_done · undo
// ---------------------------------------------------------------------------
describe("mark_habit_done · undo", () => {
  it("повертає {undo} що прибирає completion для дати", () => {
    seedHabit("h1", "Вода");
    const out = handleRoutineAction({
      name: "mark_habit_done",
      input: { habit_id: "h1", date: "2024-06-15" },
    });
    if (typeof out === "string" || out == null) {
      throw new Error(`expected undoable result, got ${typeof out}`);
    }
    const before = JSON.parse(localStorage.getItem("hub_routine_v1")!);
    expect(before.completions.h1).toContain("2024-06-15");

    out.undo();

    const after = JSON.parse(localStorage.getItem("hub_routine_v1")!);
    expect(after.completions.h1 ?? []).not.toContain("2024-06-15");
  });

  it("якщо дата вже була виконана — повертає string без undo (no-op)", () => {
    seedHabit("h1", "Вода");
    // Перший виклик — вставляємо completion
    const first = handleRoutineAction({
      name: "mark_habit_done",
      input: { habit_id: "h1", date: "2024-06-15" },
    });
    expect(typeof first).toBe("object");

    // Другий виклик з тією ж датою — completion вже є, undo не потрібен
    const second = handleRoutineAction({
      name: "mark_habit_done",
      input: { habit_id: "h1", date: "2024-06-15" },
    });
    expect(typeof second).toBe("string");
  });

  it("undo не зачіпає інші дати того ж habit-а", () => {
    seedHabit("h1", "Вода");
    handleRoutineAction({
      name: "mark_habit_done",
      input: { habit_id: "h1", date: "2024-06-13" },
    });
    const out = handleRoutineAction({
      name: "mark_habit_done",
      input: { habit_id: "h1", date: "2024-06-15" },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");

    out.undo();

    const after = JSON.parse(localStorage.getItem("hub_routine_v1")!);
    expect(after.completions.h1).toContain("2024-06-13");
    expect(after.completions.h1).not.toContain("2024-06-15");
  });
});

// ---------------------------------------------------------------------------
// create_reminder · undo
// ---------------------------------------------------------------------------
describe("create_reminder · undo", () => {
  it("повертає {undo} який видаляє щойно додане нагадування", () => {
    localStorage.setItem(
      "hub_routine_v1",
      JSON.stringify({
        habits: [{ id: "h1", name: "Йога", reminderTimes: [] }],
        completions: {},
      }),
    );
    const out = handleRoutineAction({
      name: "create_reminder",
      input: { habit_id: "h1", time: "08:00" },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");

    const before = JSON.parse(localStorage.getItem("hub_routine_v1") || "{}");
    expect(before.habits[0].reminderTimes).toEqual(["08:00"]);

    out.undo();
    const after = JSON.parse(localStorage.getItem("hub_routine_v1") || "{}");
    expect(after.habits[0].reminderTimes).toEqual([]);
  });

  it("якщо час уже існує — return string (no-op, без undo)", () => {
    localStorage.setItem(
      "hub_routine_v1",
      JSON.stringify({
        habits: [{ id: "h1", name: "Йога", reminderTimes: ["08:00"] }],
        completions: {},
      }),
    );
    const out = handleRoutineAction({
      name: "create_reminder",
      input: { habit_id: "h1", time: "08:00" },
    });
    expect(typeof out).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// complete_habit_for_date · undo
// ---------------------------------------------------------------------------
describe("complete_habit_for_date · undo", () => {
  it("undo на mark-complete видаляє ту дату; інші дати залишаються", () => {
    localStorage.setItem(
      "hub_routine_v1",
      JSON.stringify({
        habits: [{ id: "h1", name: "Йога" }],
        completions: { h1: ["2025-01-01"] },
      }),
    );
    const out = handleRoutineAction({
      name: "complete_habit_for_date",
      input: { habit_id: "h1", date: "2025-01-02" },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");

    out.undo();
    const after = JSON.parse(localStorage.getItem("hub_routine_v1") || "{}");
    expect(after.completions.h1).toEqual(["2025-01-01"]);
  });

  it("повторне виставлення дати: вже виконано → return string без undo", () => {
    localStorage.setItem(
      "hub_routine_v1",
      JSON.stringify({
        habits: [{ id: "h1" }],
        completions: { h1: ["2025-01-02"] },
      }),
    );
    const out = handleRoutineAction({
      name: "complete_habit_for_date",
      input: { habit_id: "h1", date: "2025-01-02" },
    });
    expect(typeof out).toBe("string");
  });

  it("undo на uncheck (completed:false) повертає дату назад", () => {
    localStorage.setItem(
      "hub_routine_v1",
      JSON.stringify({
        habits: [{ id: "h1" }],
        completions: { h1: ["2025-01-02"] },
      }),
    );
    const out = handleRoutineAction({
      name: "complete_habit_for_date",
      input: { habit_id: "h1", date: "2025-01-02", completed: false },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");

    out.undo();
    const after = JSON.parse(localStorage.getItem("hub_routine_v1") || "{}");
    expect(after.completions.h1).toContain("2025-01-02");
  });
});
