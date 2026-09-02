import { describe, it, expect } from "vitest";
import { ALL_HUBCHAT_TOOL_NAMES } from "./toolNames";
import {
  TOOL_OUTCOME_CLASS,
  getToolOutcomeClass,
  isStateMutatingTool,
} from "./toolOutcomeClass";

describe("TOOL_OUTCOME_CLASS — AI-6 рішення 3 (single source of truth)", () => {
  it("every canonical tool name has a classification (drift gate)", () => {
    for (const name of ALL_HUBCHAT_TOOL_NAMES) {
      expect(
        TOOL_OUTCOME_CLASS[name],
        `missing outcome class for "${name}"`,
      ).toBeDefined();
      expect(["state-mutating", "advice"]).toContain(TOOL_OUTCOME_CLASS[name]);
    }
  });

  it("does not classify tools outside the canonical registry", () => {
    const registered = new Set(ALL_HUBCHAT_TOOL_NAMES as readonly string[]);
    for (const name of Object.keys(TOOL_OUTCOME_CLASS)) {
      expect(
        registered.has(name),
        `"${name}" is not in ALL_HUBCHAT_TOOL_NAMES`,
      ).toBe(true);
    }
  });

  it("getToolOutcomeClass falls back to advice for an unknown name", () => {
    expect(getToolOutcomeClass("не_існуючий_tool")).toBe("advice");
  });

  it("isStateMutatingTool matches the classification map", () => {
    expect(isStateMutatingTool("mark_habit_done")).toBe(true);
    expect(isStateMutatingTool("create_transaction")).toBe(true);
    expect(isStateMutatingTool("suggest_meal")).toBe(false);
    expect(isStateMutatingTool("query_transactions")).toBe(false);
  });

  // Прикордонні випадки з докстрінга — явно перевірені окремо, бо тут
  // легко помилитись за назвою (verb-looking, але без реальної персистенції).
  it("borderline names classify by actual persistence, not by verb-shaped name", () => {
    // Рахує й повертає текст-рекомендацію, не створює daily-plan запис.
    expect(getToolOutcomeClass("plan_meals_for_day")).toBe("advice");
    // Читає й форматує експорт, нічого не пише.
    expect(getToolOutcomeClass("export_report")).toBe("advice");
    expect(getToolOutcomeClass("export_module_data")).toBe("advice");
    // Пошук id для наступної дії — сам не мутує.
    expect(getToolOutcomeClass("find_transaction")).toBe("advice");
    // Справді мутує, попри "copy"-назву, що звучить як безпечне читання.
    expect(getToolOutcomeClass("copy_meal_from_date")).toBe("state-mutating");
    expect(getToolOutcomeClass("copy_workout")).toBe("state-mutating");
    expect(getToolOutcomeClass("reorder_habits")).toBe("state-mutating");
    expect(getToolOutcomeClass("set_goal")).toBe("state-mutating");
  });

  it("registry size matches the documented 78 canonical tools", () => {
    expect(ALL_HUBCHAT_TOOL_NAMES.length).toBe(78);
    expect(Object.keys(TOOL_OUTCOME_CLASS).length).toBe(78);
  });
});
