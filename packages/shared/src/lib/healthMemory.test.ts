import { describe, expect, it } from "vitest";
import {
  HEALTH_MEMORY_CATEGORIES,
  HEALTH_MEMORY_CATEGORY_LABELS,
  WEIGHT_GOAL_CONTEXT_LABEL,
  isGoalProfileLabel,
  isHealthMemoryCategory,
  isHealthMemoryEntry,
  isHealthProfileLabel,
  isWeightGoalFact,
} from "./healthMemory";

describe("healthMemory", () => {
  it("кожна health-категорія розпізнається (trim + регістр)", () => {
    for (const c of HEALTH_MEMORY_CATEGORIES) {
      expect(isHealthMemoryCategory(c)).toBe(true);
      expect(isHealthMemoryCategory(` ${c.toUpperCase()} `)).toBe(true);
      expect(isHealthMemoryEntry(c)).toBe(true);
    }
  });

  it("нейтральні й невідомі категорії — ні", () => {
    for (const c of ["preference", "other", "goal", "", undefined, 5, null]) {
      expect(isHealthMemoryCategory(c)).toBe(false);
    }
  });

  it("підписи health-категорій і вагових цілей розпізнаються, апостроф байдужий", () => {
    for (const label of Object.values(HEALTH_MEMORY_CATEGORY_LABELS)) {
      expect(isHealthProfileLabel(label)).toBe(true);
    }
    expect(isHealthProfileLabel("Здоров'я")).toBe(true);
    expect(isHealthProfileLabel("Здоровʼя")).toBe(true);
    expect(isHealthProfileLabel("Здоров’я")).toBe(true);
    expect(isHealthProfileLabel(WEIGHT_GOAL_CONTEXT_LABEL)).toBe(true);
    expect(isHealthProfileLabel("Уподобання")).toBe(false);
    expect(isHealthProfileLabel("Цілі")).toBe(false);
    expect(isGoalProfileLabel("Цілі")).toBe(true);
  });

  it.each([
    "схуднути до 70 кг",
    "хочу набрати вагу",
    "Вага 82кг",
    "Lose weight",
    "знизити ІМТ",
    "я вагітна",
    "2000 ккал на день",
  ])("ціль про вагу/тіло: %s", (fact) => {
    expect(isWeightGoalFact(fact)).toBe(true);
    expect(isHealthMemoryEntry("goal", fact)).toBe(true);
  });

  it.each([
    "накопичити на відпустку",
    "вивчити Rust",
    "купити вагон",
    "кгб",
    "",
  ])("ціль без ваги: %s", (fact) => {
    expect(isWeightGoalFact(fact)).toBe(false);
    expect(isHealthMemoryEntry("goal", fact)).toBe(false);
  });

  it("вага в нейтральній категорії не робить її health", () => {
    expect(isHealthMemoryEntry("preference", "вага 70 кг")).toBe(false);
  });
});
