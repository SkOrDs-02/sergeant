import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";

vi.mock("../../hubChatUtils", () => ({ ls: vi.fn() }));
vi.mock("../../../../modules/finyk/utils", () => ({
  getTxStatAmount: vi.fn((t: { amount: number }) => Math.abs(t.amount) / 100),
}));
vi.mock("../../../../modules/routine/lib/routineStorage", () => ({
  loadRoutineState: vi.fn(),
}));
vi.mock("../../../../modules/nutrition/lib/nutritionStorage", () => ({
  loadNutritionLog: vi.fn(),
}));
vi.mock("../fizrukActions/shared", () => ({
  readFizrukWorkouts: vi.fn(),
}));

import { ls } from "../../hubChatUtils";
import { loadRoutineState } from "../../../../modules/routine/lib/routineStorage";
import { loadNutritionLog } from "../../../../modules/nutrition/lib/nutritionStorage";
import { readFizrukWorkouts } from "../fizrukActions/shared";
import { morningBriefing, weeklySummary } from "./briefingHandlers";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockRoutine = vi.mocked(loadRoutineState);
const mockNutrition = vi.mocked(loadNutritionLog);
const mockWorkouts = vi.mocked(readFizrukWorkouts);

beforeEach(() => {
  vi.clearAllMocks();
  // Freeze to a fixed Kyiv midday so day-key assertions are deterministic
  // regardless of the wall-clock hour the suite runs at (no UTC/Kyiv
  // boundary flake — see domain invariant: day boundaries are Europe/Kyiv).
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00+03:00"));
  mockLs.mockReturnValue(null);
  mockRoutine.mockReturnValue({
    habits: [],
    completions: {},
  } as unknown as ReturnType<typeof loadRoutineState>);
  mockNutrition.mockReturnValue({} as ReturnType<typeof loadNutritionLog>);
  mockWorkouts.mockReturnValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── morningBriefing ──────────────────────────────────────────────────────────

describe("morningBriefing", () => {
  it("always starts with greeting", () => {
    const result = morningBriefing();
    expect(result).toContain("Доброго ранку");
  });

  it("shows habit completion when habits exist", () => {
    mockRoutine.mockReturnValue({
      habits: [{ id: "h1", name: "Медитація", archived: false }],
      completions: {},
    } as unknown as ReturnType<typeof loadRoutineState>);
    const result = morningBriefing();
    expect(result).toContain("Звички: 0/1");
  });

  it("shows completed habits for today", () => {
    const todayKey = getKyivDayKey();
    mockRoutine.mockReturnValue({
      habits: [{ id: "h1", name: "Медитація", archived: false }],
      completions: { h1: [todayKey] },
    } as unknown as ReturnType<typeof loadRoutineState>);
    const result = morningBriefing();
    expect(result).toContain("Звички: 1/1");
  });

  it("skips habits section when no habits", () => {
    const result = morningBriefing();
    expect(result).not.toContain("Звички:");
  });

  it("shows calories when today has meals", () => {
    const todayKey = getKyivDayKey();
    mockNutrition.mockReturnValue({
      [todayKey]: { meals: [{ macros: { kcal: 500 } }] },
    } as unknown as ReturnType<typeof loadNutritionLog>);
    const result = morningBriefing();
    expect(result).toContain("500 ккал");
  });
});

// ─── weeklySummary ────────────────────────────────────────────────────────────

describe("weeklySummary", () => {
  it("includes header", () => {
    const result = weeklySummary();
    expect(result).toContain("Тижневий підсумок");
  });

  it("shows workout count for the week", () => {
    const recent = new Date(Date.now() - 2 * 86400000).toISOString();
    mockWorkouts.mockReturnValue([
      { startedAt: recent, endedAt: recent, items: [] },
    ] as unknown as ReturnType<typeof readFizrukWorkouts>);
    const result = weeklySummary();
    expect(result).toContain("Тренувань: 1");
  });

  it("excludes ongoing workouts from weekly count", () => {
    const recent = new Date(Date.now() - 2 * 86400000).toISOString();
    mockWorkouts.mockReturnValue([
      { startedAt: recent, endedAt: null, items: [] },
    ] as unknown as ReturnType<typeof readFizrukWorkouts>);
    const result = weeklySummary();
    expect(result).toContain("Тренувань: 0");
  });
});
