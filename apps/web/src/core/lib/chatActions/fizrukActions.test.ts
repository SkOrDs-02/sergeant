// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleFizrukAction } from "./fizrukActions";
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
  const out = handleFizrukAction(action);
  if (out == null) {
    throw new Error(`handler returned ${typeof out}, expected string|object`);
  }
  return typeof out === "string" ? out : out.result;
}

// ---------------------------------------------------------------------------
// plan_workout
// ---------------------------------------------------------------------------
describe("plan_workout", () => {
  it("happy: plans workout with exercises", () => {
    const out = call({
      name: "plan_workout",
      input: {
        date: "2026-04-23",
        time: "10:00",
        note: "Ранок",
        exercises: [{ name: "Присідання", sets: 3, reps: 10, weight: 60 }],
      },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("2026-04-23");
    expect(out).toContain("10:00");
    expect(out).toContain("1 вправа");
  });

  it("happy: plans workout without exercises", () => {
    const out = call({
      name: "plan_workout",
      input: {},
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("заплановано");
    expect(out).toContain("0 вправ");
  });

  it("shape: result contains workout id", () => {
    const out = call({
      name: "plan_workout",
      input: { note: "Тест" },
    });
    expect(out).toMatch(/id:w_/);
  });
});

// ---------------------------------------------------------------------------
// log_set
// ---------------------------------------------------------------------------
describe("log_set", () => {
  it("happy: logs set to active workout", () => {
    const out = call({
      name: "log_set",
      input: { exercise_name: "Жим лежачи", weight_kg: 80, reps: 8 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Жим лежачи");
    expect(out).toContain("80");
    expect(out).toContain("8");
  });

  it("error: missing exercise name returns error", () => {
    const out = call({
      name: "log_set",
      input: { exercise_name: "", reps: 10 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("назв");
  });

  it("error: invalid reps returns error", () => {
    const out = call({
      name: "log_set",
      input: { exercise_name: "Тяга", reps: 0 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("повторень");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({
      name: "log_set",
      input: { exercise_name: "Підтягування", reps: 12, weight_kg: 0 },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// start_workout
// ---------------------------------------------------------------------------
describe("start_workout", () => {
  it("happy: starts a new workout", () => {
    const out = call({
      name: "start_workout",
      input: { note: "Push day" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("розпочато");
    expect(out).toMatch(/id:w_/);
  });

  it("error: cannot start when active workout exists", () => {
    call({ name: "start_workout", input: {} });
    const out = call({ name: "start_workout", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("активне тренування");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({ name: "start_workout", input: {} });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// finish_workout
// ---------------------------------------------------------------------------
describe("finish_workout", () => {
  it("happy: finishes active workout", () => {
    call({ name: "start_workout", input: {} });
    const out = call({ name: "finish_workout", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("завершено");
  });

  it("error: no active workout returns error", () => {
    const out = call({ name: "finish_workout", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("Немає");
  });

  it("shape: result is a string with sets count", () => {
    call({ name: "start_workout", input: {} });
    call({
      name: "log_set",
      input: { exercise_name: "Жим", reps: 5, weight_kg: 50 },
    });
    const out = call({ name: "finish_workout", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toMatch(/підходів/);
  });
});

// ---------------------------------------------------------------------------
// log_measurement
// ---------------------------------------------------------------------------
describe("log_measurement", () => {
  it("happy: logs body measurements", () => {
    const out = call({
      name: "log_measurement",
      input: { weight_kg: 85, chest_cm: 100, waist_cm: 82 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Заміри записано");
  });

  it("error: no valid fields returns error", () => {
    const out = call({
      name: "log_measurement",
      input: {},
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("жодного");
  });

  it("shape: result lists changed fields", () => {
    const out = call({
      name: "log_measurement",
      input: { weight_kg: 80 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("weightKg=80");
  });
});

// ---------------------------------------------------------------------------
// add_program_day
// ---------------------------------------------------------------------------
describe("add_program_day", () => {
  it("happy: adds program day", () => {
    const out = call({
      name: "add_program_day",
      input: {
        weekday: 1,
        name: "Push",
        exercises: [{ name: "Жим лежачи", sets: 3, reps: 8, weight: 80 }],
      },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Push");
    expect(out).toContain("1 вправ");
  });

  it("error: invalid weekday returns error", () => {
    const out = call({
      name: "add_program_day",
      input: { weekday: 10, name: "Bad" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("weekday");
  });

  it("error: empty name returns error", () => {
    const out = call({
      name: "add_program_day",
      input: { weekday: 1, name: "" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("назва");
  });

  it("shape: result is a string", () => {
    const out = call({
      name: "add_program_day",
      input: { weekday: 0, name: "Rest" },
    });
    expect(typeof out).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// log_wellbeing
// ---------------------------------------------------------------------------
describe("log_wellbeing", () => {
  it("happy: logs wellbeing entries", () => {
    const out = call({
      name: "log_wellbeing",
      input: { weight_kg: 82, sleep_hours: 7, energy_level: 4, mood_score: 5 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Самопочуття записано");
    expect(out).toContain("82");
  });

  it("error: no valid fields returns error", () => {
    const out = call({
      name: "log_wellbeing",
      input: {},
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("жодного");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({
      name: "log_wellbeing",
      input: { sleep_hours: 8 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("сон 8 год");
  });
});

// ---------------------------------------------------------------------------
// suggest_workout
// ---------------------------------------------------------------------------
describe("suggest_workout", () => {
  it("happy: returns suggestion with no history", () => {
    const out = call({
      name: "suggest_workout",
      input: {},
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("full-body");
  });

  it("happy: includes focus when provided", () => {
    const out = call({
      name: "suggest_workout",
      input: { focus: "ноги" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("ноги");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({ name: "suggest_workout", input: {} });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// copy_workout
// ---------------------------------------------------------------------------
describe("copy_workout", () => {
  it("happy: copies last completed workout", () => {
    localStorage.setItem(
      "fizruk_workouts_v1",
      JSON.stringify({
        schemaVersion: 1,
        workouts: [
          {
            id: "w_src",
            startedAt: "2026-04-20T10:00:00.000Z",
            endedAt: "2026-04-20T11:00:00.000Z",
            items: [
              {
                id: "i_1",
                nameUk: "Присідання",
                type: "strength",
                musclesPrimary: [],
                musclesSecondary: [],
                sets: [{ weightKg: 60, reps: 10 }],
                durationSec: 0,
                distanceM: 0,
              },
            ],
            groups: [],
            warmup: null,
            cooldown: null,
            note: "",
            planned: false,
          },
        ],
      }),
    );
    const out = call({ name: "copy_workout", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("скопійовано");
    expect(out).toContain("1 вправ");
  });

  it("error: no completed workouts returns error", () => {
    const out = call({ name: "copy_workout", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("Немає");
  });

  it("shape: result contains workout id", () => {
    localStorage.setItem(
      "fizruk_workouts_v1",
      JSON.stringify({
        schemaVersion: 1,
        workouts: [
          {
            id: "w_x",
            startedAt: "2026-04-20T10:00:00.000Z",
            endedAt: "2026-04-20T11:00:00.000Z",
            items: [],
            groups: [],
            warmup: null,
            cooldown: null,
            note: "",
            planned: false,
          },
        ],
      }),
    );
    const out = call({ name: "copy_workout", input: {} });
    expect(out).toMatch(/id:w_/);
  });
});

// ---------------------------------------------------------------------------
// compare_progress
// ---------------------------------------------------------------------------
describe("compare_progress", () => {
  it("happy: returns progress when workouts exist", () => {
    localStorage.setItem(
      "fizruk_workouts_v1",
      JSON.stringify({
        schemaVersion: 1,
        workouts: [
          {
            id: "w1",
            startedAt: "2026-04-10T10:00:00.000Z",
            endedAt: "2026-04-10T11:00:00.000Z",
            items: [
              {
                id: "i1",
                nameUk: "Жим",
                type: "strength",
                musclesPrimary: ["chest"],
                musclesSecondary: [],
                sets: [{ weightKg: 60, reps: 8 }],
                durationSec: 0,
                distanceM: 0,
              },
            ],
            groups: [],
            warmup: null,
            cooldown: null,
            note: "",
            planned: false,
          },
        ],
      }),
    );
    const out = call({
      name: "compare_progress",
      input: { exercise_name: "Жим", period_days: 30 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Прогрес");
  });

  it("error: no completed workouts returns error", () => {
    const out = call({ name: "compare_progress", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("Немає");
  });

  it("shape: result is a non-empty string", () => {
    localStorage.setItem(
      "fizruk_workouts_v1",
      JSON.stringify({
        schemaVersion: 1,
        workouts: [
          {
            id: "w2",
            startedAt: "2026-04-15T10:00:00.000Z",
            endedAt: "2026-04-15T11:00:00.000Z",
            items: [],
            groups: [],
            warmup: null,
            cooldown: null,
            note: "",
            planned: false,
          },
        ],
      }),
    );
    const out = call({ name: "compare_progress", input: {} });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// weight_chart
// ---------------------------------------------------------------------------
describe("weight_chart", () => {
  it("happy: returns chart when entries exist", () => {
    localStorage.setItem(
      "fizruk_daily_log_v1",
      JSON.stringify([
        { at: "2026-04-20T08:00:00.000Z", weightKg: 82 },
        { at: "2026-04-21T08:00:00.000Z", weightKg: 81.5 },
      ]),
    );
    const out = call({ name: "weight_chart", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("Вага");
    expect(out).toContain("82");
  });

  it("error: no entries returns informative string", () => {
    const out = call({ name: "weight_chart", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("Немає");
  });

  it("shape: result is a non-empty string", () => {
    localStorage.setItem(
      "fizruk_daily_log_v1",
      JSON.stringify([{ at: "2026-04-22T08:00:00.000Z", weightKg: 80 }]),
    );
    const out = call({ name: "weight_chart", input: { period_days: 7 } });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// calculate_1rm
// ---------------------------------------------------------------------------
describe("calculate_1rm", () => {
  it("happy: calculates 1RM from weight and reps", () => {
    const out = call({
      name: "calculate_1rm",
      input: { weight_kg: 100, reps: 5 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("1RM");
    expect(out).toContain("100");
  });

  it("error: invalid weight returns error", () => {
    const out = call({
      name: "calculate_1rm",
      input: { weight_kg: -10, reps: 5 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("додатн");
  });

  it("error: invalid reps returns error", () => {
    const out = call({
      name: "calculate_1rm",
      input: { weight_kg: 100, reps: 0 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("цілим числом");
  });

  it("shape: single rep returns identity", () => {
    const out = call({
      name: "calculate_1rm",
      input: { weight_kg: 120, reps: 1 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("120");
    expect(out).toContain("максимум");
  });
});

// ---------------------------------------------------------------------------
// log_wellbeing · undo
// ---------------------------------------------------------------------------
describe("log_wellbeing · undo", () => {
  it("повертає {undo} який видаляє щойно додану entry за id", () => {
    const out = handleFizrukAction({
      name: "log_wellbeing",
      input: { weight_kg: 75, sleep_hours: 7, energy_level: 4, mood_score: 4 },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");

    const before = JSON.parse(
      localStorage.getItem("fizruk_daily_log_v1") || "[]",
    );
    expect(before).toHaveLength(1);

    out.undo();
    const after = JSON.parse(
      localStorage.getItem("fizruk_daily_log_v1") || "[]",
    );
    expect(after).toHaveLength(0);
  });
});
