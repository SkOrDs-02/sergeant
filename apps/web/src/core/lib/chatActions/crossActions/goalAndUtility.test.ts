import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hubChatUtils", () => ({
  ls: vi.fn(),
  lsSet: vi.fn(),
}));
vi.mock("@nutrition/lib/nutritionStorage", () => ({
  loadNutritionPrefs: vi.fn(() => ({})),
  persistNutritionPrefs: vi.fn(),
}));

import { ls, lsSet } from "../../hubChatUtils";
import { loadNutritionPrefs, persistNutritionPrefs } from "@nutrition/lib/nutritionStorage";
import { convertUnits, setGoal } from "./goalAndUtility";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockLsSet = vi.mocked(lsSet);
const mockPersistNutrition = vi.mocked(persistNutritionPrefs);
const mockLoadNutrition = vi.mocked(loadNutritionPrefs);

beforeEach(() => {
  vi.clearAllMocks();
  mockLs.mockReturnValue([]);
  mockLoadNutrition.mockReturnValue({});
});

// ─── setGoal ──────────────────────────────────────────────────────────────────

describe("setGoal", () => {
  it("returns error for empty description", () => {
    expect(setGoal({ type: "set_goal", input: { description: "" } }))
      .toContain("Потрібен опис");
  });

  it("creates goal with description", () => {
    const result = setGoal({ type: "set_goal", input: { description: "Схуднути на 5 кг" } });
    expect(result).toContain("Схуднути на 5 кг");
    expect(mockLsSet).toHaveBeenCalledWith("hub_goals_v1", expect.arrayContaining([
      expect.objectContaining({ description: "Схуднути на 5 кг" }),
    ]));
  });

  it("includes target weight when valid", () => {
    const result = setGoal({ type: "set_goal", input: { description: "Ціль", target_weight_kg: 70 } });
    expect(result).toContain("70 кг");
  });

  it("includes target date when valid format", () => {
    const result = setGoal({ type: "set_goal", input: { description: "Ціль", target_date: "2026-12-31" } });
    expect(result).toContain("2026-12-31");
  });

  it("ignores invalid date format", () => {
    const result = setGoal({ type: "set_goal", input: { description: "Ціль", target_date: "31.12.2026" } });
    expect(result).not.toContain("дедлайн:");
  });

  it("persists kcal target to nutrition store", () => {
    setGoal({ type: "set_goal", input: { description: "Дієта", daily_kcal: 1800 } });
    expect(mockPersistNutrition).toHaveBeenCalledWith(expect.objectContaining({ dailyTargetKcal: 1800 }));
  });

  it("includes workouts per week", () => {
    const result = setGoal({ type: "set_goal", input: { description: "Ціль", workouts_per_week: 4 } });
    expect(result).toContain("тренувань/тиждень: 4");
  });

  it("appends to existing goals", () => {
    mockLs.mockReturnValue([{ id: "g1", description: "Old", createdAt: "2026-01-01" }]);
    setGoal({ type: "set_goal", input: { description: "New" } });
    const saved = mockLsSet.mock.calls[0]![1] as unknown[];
    expect(saved).toHaveLength(2);
  });

  it("returns string with goal id", () => {
    const result = setGoal({ type: "set_goal", input: { description: "Ціль" } });
    expect(result).toContain("id:goal_");
  });
});

// ─── convertUnits ─────────────────────────────────────────────────────────────

describe("convertUnits", () => {
  it("returns error for non-numeric value", () => {
    expect(convertUnits({ type: "convert_units", input: { value: "abc", from: "kg", to: "lb" } }))
      .toContain("числом");
  });

  it("returns error for unknown conversion", () => {
    expect(convertUnits({ type: "convert_units", input: { value: 10, from: "kg", to: "oz" } }))
      .toContain("Невідома конвертація");
  });

  it("converts kg to lb correctly", () => {
    const result = convertUnits({ type: "convert_units", input: { value: 100, from: "kg", to: "lb" } });
    expect(result).toContain("220.46");
  });

  it("converts lb to kg correctly", () => {
    const result = convertUnits({ type: "convert_units", input: { value: 220.46, from: "lb", to: "kg" } });
    expect(result).toContain("100");
  });

  it("converts celsius to fahrenheit", () => {
    const result = convertUnits({ type: "convert_units", input: { value: 0, from: "c", to: "f" } });
    expect(result).toContain("32 f");
  });

  it("converts km to mi", () => {
    const result = convertUnits({ type: "convert_units", input: { value: 10, from: "km", to: "mi" } });
    expect(result).toContain("6.21");
  });

  it("converts kcal to kj", () => {
    const result = convertUnits({ type: "convert_units", input: { value: 100, from: "kcal", to: "kj" } });
    expect(result).toContain("418.4");
  });
});
