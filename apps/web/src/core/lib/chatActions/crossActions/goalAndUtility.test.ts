import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hubChatUtils", () => ({
  ls: vi.fn(),
  lsSet: vi.fn(),
}));
vi.mock("@nutrition/lib/nutritionStorage", () => ({
  loadNutritionPrefs: vi.fn(() => ({})),
  patchNutritionPrefs: vi.fn(() => true),
}));

import { ls, lsSet } from "../../hubChatUtils";
import {
  loadNutritionPrefs,
  patchNutritionPrefs,
} from "@nutrition/lib/nutritionStorage";
import { convertUnits, setGoal } from "./goalAndUtility";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockLsSet = vi.mocked(lsSet);
const mockPersistNutrition = vi.mocked(patchNutritionPrefs);
const mockLoadNutrition = vi.mocked(loadNutritionPrefs);

beforeEach(() => {
  vi.clearAllMocks();
  mockLs.mockReturnValue([]);
  mockLoadNutrition.mockReturnValue(
    {} as unknown as ReturnType<typeof loadNutritionPrefs>,
  );
});

// ─── setGoal ──────────────────────────────────────────────────────────────────

describe("setGoal", () => {
  it("rel-16: ціль без ккал — чесна відмова, нічого не пишеться", () => {
    const result = setGoal({
      name: "set_goal",
      input: { description: "Схуднути на 5 кг", target_weight_kg: 70 },
    });
    expect(result).toMatch(/^Не вдалося/);
    expect(result).toContain("лише денну норму калорій");
    expect(mockLsSet).not.toHaveBeenCalled();
    expect(mockPersistNutrition).not.toHaveBeenCalled();
  });

  it("rel-16: невалідні ккал — відмова", () => {
    const result = setGoal({
      name: "set_goal",
      input: { description: "Ціль", daily_kcal: -5 },
    });
    expect(result).toMatch(/^Не вдалося/);
    expect(mockPersistNutrition).not.toHaveBeenCalled();
  });

  it("rel-16: ккал пишуться в сховище Харчування, а не в hub_goals_v1", () => {
    const result = setGoal({
      name: "set_goal",
      input: { description: "Дієта", daily_kcal: 1800 },
    });
    // data-04: лише поле цілі — решту prefs бере з кешу `patchNutritionPrefs`.
    expect(mockPersistNutrition).toHaveBeenCalledWith({
      dailyTargetKcal: 1800,
    });
    expect(mockLsSet).not.toHaveBeenCalled();
    expect(result).toContain("1\u00A0800 ккал/день");
    expect(result).not.toMatch(/^Не вдалося/);
  });

  it("rel-16: разом із ккал вага/дедлайн/тренування чесно названі незбереженими", () => {
    const result = setGoal({
      name: "set_goal",
      input: {
        description: "Дієта",
        daily_kcal: 2000,
        target_weight_kg: 70,
        target_date: "2026-12-31",
        workouts_per_week: 3,
      },
    });
    expect(result).toContain("цільову вагу");
    expect(result).toContain("дедлайн");
    expect(result).toContain("кількість тренувань");
    expect(result).toContain("не збережено");
  });

  it("data-04: Їжа ще не гідратована — відмова, а не успіх", () => {
    mockPersistNutrition.mockReturnValueOnce(false);
    const result = setGoal({
      name: "set_goal",
      input: { description: "Дієта", daily_kcal: 1800 },
    });
    expect(result).toMatch(/^Не вдалося/);
    expect(result).toContain("ще завантажуються");
  });
});

// ─── convertUnits ─────────────────────────────────────────────────────────────

describe("convertUnits", () => {
  it("returns error for non-numeric value", () => {
    expect(
      convertUnits({
        name: "convert_units",
        input: { value: "abc", from: "kg", to: "lb" },
      }),
    ).toContain("числом");
  });

  it("returns error for unknown conversion", () => {
    expect(
      convertUnits({
        name: "convert_units",
        input: { value: 10, from: "kg", to: "oz" },
      }),
    ).toContain("Невідома конвертація");
  });

  it("converts kg to lb correctly", () => {
    const result = convertUnits({
      name: "convert_units",
      input: { value: 100, from: "kg", to: "lb" },
    });
    expect(result).toContain("220,46");
  });

  it("converts lb to kg correctly", () => {
    const result = convertUnits({
      name: "convert_units",
      input: { value: 220.46, from: "lb", to: "kg" },
    });
    expect(result).toContain("100");
  });

  it("converts celsius to fahrenheit", () => {
    const result = convertUnits({
      name: "convert_units",
      input: { value: 0, from: "c", to: "f" },
    });
    expect(result).toContain("32 f");
  });

  it("converts km to mi", () => {
    const result = convertUnits({
      name: "convert_units",
      input: { value: 10, from: "km", to: "mi" },
    });
    expect(result).toContain("6,21");
  });

  it("converts kcal to kj", () => {
    const result = convertUnits({
      name: "convert_units",
      input: { value: 100, from: "kcal", to: "kj" },
    });
    expect(result).toContain("418,4");
  });
});
