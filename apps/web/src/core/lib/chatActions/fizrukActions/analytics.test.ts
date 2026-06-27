import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./shared", () => ({
  readFizrukDailyLog: vi.fn(),
  readFizrukWorkouts: vi.fn(),
}));

import { readFizrukDailyLog, readFizrukWorkouts } from "./shared";
import { compareProgress, suggestWorkout, weightChart } from "./analytics";

const mockReadWorkouts = vi.mocked(readFizrukWorkouts);
const mockReadLog = vi.mocked(readFizrukDailyLog);

const RECENT = new Date(Date.now() - 1000 * 60 * 60).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  mockReadWorkouts.mockReturnValue([]);
  mockReadLog.mockReturnValue([]);
});

// ─── suggestWorkout ───────────────────────────────────────────────────────────

describe("suggestWorkout", () => {
  it("returns beginner recommendation when no history", () => {
    const result = suggestWorkout({ name: "suggest_workout", input: {} });
    expect(result).toContain("full-body");
  });

  it("includes focus when provided with no history", () => {
    const result = suggestWorkout({
      name: "suggest_workout",
      input: { focus: "спина" },
    }) as string;
    expect(result).toContain("спина");
  });

  it("returns muscle analysis when workouts exist", () => {
    mockReadWorkouts.mockReturnValue([
      {
        startedAt: RECENT,
        endedAt: RECENT,
        items: [
          {
            nameUk: "Присідання",
            musclesPrimary: ["ноги"],
            musclesSecondary: [],
            sets: [],
          },
        ],
      },
    ] as unknown as ReturnType<typeof readFizrukWorkouts>);
    const result = suggestWorkout({
      name: "suggest_workout",
      input: {},
    }) as string;
    expect(result).toContain("Всього завершених: 1");
  });

  it("skips ongoing workouts (no endedAt)", () => {
    mockReadWorkouts.mockReturnValue([
      { startedAt: RECENT, endedAt: null, items: [] },
    ] as unknown as ReturnType<typeof readFizrukWorkouts>);
    const result = suggestWorkout({ name: "suggest_workout", input: {} });
    expect(result).toContain("full-body");
  });
});

// ─── compareProgress ──────────────────────────────────────────────────────────

describe("compareProgress", () => {
  it("returns error when no completed workouts", () => {
    const result = compareProgress({ name: "compare_progress", input: {} });
    expect(result).toContain("Немає завершених");
  });

  it("returns progress report with volume and max weight", () => {
    const old = new Date(Date.now() - 20 * 86400000).toISOString();
    const recent = new Date(Date.now() - 5 * 86400000).toISOString();
    mockReadWorkouts.mockReturnValue([
      {
        startedAt: old,
        endedAt: old,
        items: [
          {
            nameUk: "Жим",
            musclesPrimary: ["груди"],
            musclesSecondary: [],
            sets: [{ weightKg: 80, reps: 5 }],
          },
        ],
      },
      {
        startedAt: recent,
        endedAt: recent,
        items: [
          {
            nameUk: "Жим",
            musclesPrimary: ["груди"],
            musclesSecondary: [],
            sets: [{ weightKg: 90, reps: 5 }],
          },
        ],
      },
    ] as unknown as ReturnType<typeof readFizrukWorkouts>);
    const result = compareProgress({
      name: "compare_progress",
      input: { period_days: 30 },
    }) as string;
    expect(result).toContain("Прогрес");
    expect(result).toContain("Об'єм");
  });
});

// ─── weightChart ──────────────────────────────────────────────────────────────

describe("weightChart", () => {
  it("returns no-data message when no entries", () => {
    const result = weightChart({ name: "weight_chart", input: {} });
    expect(result).toContain("Немає записів ваги");
  });

  it("returns weight summary with first/last/min/max", () => {
    const recent = new Date(Date.now() - 3600 * 1000).toISOString();
    const recent2 = new Date(Date.now() - 7200 * 1000).toISOString();
    mockReadLog.mockReturnValue([
      { id: "d1", at: recent2, weightKg: 78 },
      { id: "d2", at: recent, weightKg: 77 },
    ] as unknown as ReturnType<typeof readFizrukDailyLog>);
    const result = weightChart({
      name: "weight_chart",
      input: { period_days: 30 },
    }) as string;
    expect(result).toContain("Вага за 30 днів");
    expect(result).toContain("Мін:");
    expect(result).toContain("Макс:");
  });
});
