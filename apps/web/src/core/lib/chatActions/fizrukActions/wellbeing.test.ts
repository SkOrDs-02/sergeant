import { describe, it, expect, vi, beforeEach } from "vitest";
import { logWellbeing } from "./wellbeing";
import type { LogWellbeingAction } from "../types.fizruk";

vi.mock("../../../profile/biometrics", () => ({
  mirrorWeightToBiometrics: vi.fn(),
}));
vi.mock("./shared", () => ({
  persistFizrukDailyLog: vi.fn(),
  readFizrukDailyLog: vi.fn(() => []),
  deleteFizrukDailyLogEntry: vi.fn(),
}));

function makeAction(input: LogWellbeingAction["input"]): LogWellbeingAction {
  return { name: "log_wellbeing", input };
}

describe("logWellbeing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns error when no valid fields provided", () => {
    expect(logWellbeing(makeAction({}))).toBe(
      "Немає жодного валідного поля для самопочуття.",
    );
  });

  it("rejects weight 0", () => {
    expect(logWellbeing(makeAction({ weight_kg: 0 }))).toContain("Немає");
  });

  it("rejects negative weight", () => {
    expect(logWellbeing(makeAction({ weight_kg: -5 }))).toContain("Немає");
  });

  it("accepts valid weight", () => {
    const result = logWellbeing(makeAction({ weight_kg: 75 }));
    expect(result).toMatchObject({
      result: expect.stringContaining("вага 75"),
    });
  });

  it("rejects sleep_hours > 24", () => {
    expect(logWellbeing(makeAction({ sleep_hours: 25 }))).toContain("Немає");
  });

  it("accepts sleep_hours 0", () => {
    const result = logWellbeing(makeAction({ sleep_hours: 0 }));
    expect(result).toMatchObject({ result: expect.stringContaining("сон 0") });
  });

  it("accepts valid sleep_hours", () => {
    const result = logWellbeing(makeAction({ sleep_hours: 7.5 }));
    expect(result).toMatchObject({
      result: expect.stringContaining("сон 7.5"),
    });
  });

  it("rejects energy_level < 1", () => {
    expect(logWellbeing(makeAction({ energy_level: 0 }))).toContain("Немає");
  });

  it("rejects energy_level > 5", () => {
    expect(logWellbeing(makeAction({ energy_level: 6 }))).toContain("Немає");
  });

  it("accepts valid energy_level and rounds it", () => {
    const result = logWellbeing(makeAction({ energy_level: 4.7 }));
    expect(result).toMatchObject({
      result: expect.stringContaining("енергія 5/5"),
    });
  });

  it("accepts valid mood_score", () => {
    const result = logWellbeing(makeAction({ mood_score: 3 }));
    expect(result).toMatchObject({
      result: expect.stringContaining("настрій 3/5"),
    });
  });

  it("note alone counts as valid entry", () => {
    const result = logWellbeing(makeAction({ note: "Добре почуваюсь" }));
    expect(result).toMatchObject({
      result: expect.stringContaining("Самопочуття записано"),
    });
  });

  it("truncates note to 500 chars", () => {
    const long = "а".repeat(600);
    const result = logWellbeing(makeAction({ note: long }));
    expect(result).toMatchObject({ result: expect.any(String) });
  });

  it("returns an undo function", () => {
    const result = logWellbeing(makeAction({ weight_kg: 80 }));
    expect(typeof result).toBe("object");
    expect(typeof (result as { undo: () => void }).undo).toBe("function");
  });

  it("combines multiple fields in result message", () => {
    const result = logWellbeing(
      makeAction({ weight_kg: 70, sleep_hours: 8, mood_score: 4 }),
    );
    expect(result).toMatchObject({
      result: expect.stringContaining("вага 70"),
    });
    expect((result as { result: string }).result).toContain("сон 8");
    expect((result as { result: string }).result).toContain("настрій 4/5");
  });

  // Канонічна межа MEASUREMENT_BOUNDS.weightKg = {20, 400} (ADR-0080) —
  // fizruk дзеркалить вагу в профіль через `recordBodyWeight`, тож без
  // цієї межі биті числа з голосового вводу тихо псували TDEE-цілі.
  describe("weight_kg canonical bound (MEASUREMENT_BOUNDS.weightKg)", () => {
    it("rejects weight just under the lower bound", () => {
      const result = logWellbeing(makeAction({ weight_kg: 19 }));
      expect(result).toBe(
        "Вага має бути від 20 до 400 кг. Перевір число і спробуй ще раз.",
      );
    });

    it("rejects weight just above the upper bound", () => {
      const result = logWellbeing(makeAction({ weight_kg: 401 }));
      expect(result).toBe(
        "Вага має бути від 20 до 400 кг. Перевір число і спробуй ще раз.",
      );
    });

    it("accepts weight exactly at the lower boundary", () => {
      const result = logWellbeing(makeAction({ weight_kg: 20 }));
      expect(result).toMatchObject({
        result: expect.stringContaining("вага 20"),
      });
    });

    it("accepts weight exactly at the upper boundary", () => {
      const result = logWellbeing(makeAction({ weight_kg: 400 }));
      expect(result).toMatchObject({
        result: expect.stringContaining("вага 400"),
      });
    });

    it("out-of-bound weight blocks the whole entry, even with other valid fields", () => {
      const result = logWellbeing(
        makeAction({ weight_kg: 900, sleep_hours: 8 }),
      );
      expect(result).toBe(
        "Вага має бути від 20 до 400 кг. Перевір число і спробуй ще раз.",
      );
    });

    it("still rejects NaN weight via the existing finite check (no bound message)", () => {
      const result = logWellbeing(makeAction({ weight_kg: NaN }));
      expect(result).toBe("Немає жодного валідного поля для самопочуття.");
    });

    it("still rejects negative weight via the existing positivity check (no bound message)", () => {
      const result = logWellbeing(makeAction({ weight_kg: -5 }));
      expect(result).toBe("Немає жодного валідного поля для самопочуття.");
    });
  });
});
