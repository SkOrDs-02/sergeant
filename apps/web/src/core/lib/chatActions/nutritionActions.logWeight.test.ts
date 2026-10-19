// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * data-23: `log_weight` мусить мати ту саму межу ваги, що `log_wellbeing` /
 * `log_measurement` (`MEASUREMENT_BOUNDS.weightKg`). Без неї 1000 кг
 * перезаписував профіль і КБЖВ-цілі, а сервер реджектив рядок щоденного логу.
 */
const persistFizrukDailyLog = vi.hoisted(() => vi.fn());
const recordBodyWeight = vi.hoisted(() => vi.fn());

vi.mock("./fizrukActions/shared", () => ({
  persistFizrukDailyLog,
  readFizrukDailyLog: vi.fn(() => []),
}));
vi.mock("../../profile/recordBodyWeight", () => ({ recordBodyWeight }));

import { handleNutritionAction } from "./nutritionActions";
import { logWellbeing } from "./fizrukActions/wellbeing";
import type { ChatAction } from "./types";

function logWeight(input: Record<string, unknown>): string {
  const out = handleNutritionAction({
    name: "log_weight",
    input,
  } as unknown as ChatAction);
  if (out == null) throw new Error("handler returned undefined");
  return typeof out === "string" ? out : out.result;
}

beforeEach(() => {
  persistFizrukDailyLog.mockClear();
  recordBodyWeight.mockClear();
});

describe("log_weight · межі ваги", () => {
  it.each([1000, 401, 19.9])(
    "weight_kg=%s → відмова, нічого не пишемо",
    (w) => {
      const out = logWeight({ weight_kg: w });
      expect(out).toContain("Вага має бути від 20 до 400 кг");
      expect(persistFizrukDailyLog).not.toHaveBeenCalled();
      expect(recordBodyWeight).not.toHaveBeenCalled();
    },
  );

  it("повідомлення збігається з log_wellbeing", () => {
    const wellbeing = logWellbeing({
      name: "log_wellbeing",
      input: { weight_kg: 1000 },
    });
    expect(logWeight({ weight_kg: 1000 })).toBe(wellbeing);
  });

  it("валідна вага (включно з межею) пишеться як і раніше", () => {
    expect(logWeight({ weight_kg: 82 })).toContain("Вагу записано");
    expect(logWeight({ weight_kg: 400 })).toContain("Вагу записано");
    expect(persistFizrukDailyLog).toHaveBeenCalledTimes(2);
    expect(recordBodyWeight).toHaveBeenCalledTimes(2);
  });

  it("недодатна вага — як раніше", () => {
    expect(logWeight({ weight_kg: -5 })).toContain("додатн");
  });
});
