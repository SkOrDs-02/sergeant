import { describe, it, expect } from "vitest";
import {
  MODULE_PRIMARY_ACTION,
  getModulePrimaryAction,
} from "./moduleQuickActions";

describe("MODULE_PRIMARY_ACTION", () => {
  it("defines actions for all four modules", () => {
    expect(Object.keys(MODULE_PRIMARY_ACTION)).toEqual(
      expect.arrayContaining(["finyk", "fizruk", "routine", "nutrition"]),
    );
  });

  it("each entry has label, shortLabel, and action", () => {
    for (const entry of Object.values(MODULE_PRIMARY_ACTION)) {
      expect(typeof entry.label).toBe("string");
      expect(entry.label.length).toBeGreaterThan(0);
      expect(typeof entry.shortLabel).toBe("string");
      expect(entry.shortLabel.length).toBeGreaterThan(0);
      expect(typeof entry.action).toBe("string");
    }
  });

  it("finyk action is add_expense", () => {
    expect(MODULE_PRIMARY_ACTION.finyk.action).toBe("add_expense");
  });

  it("fizruk action is start_workout", () => {
    expect(MODULE_PRIMARY_ACTION.fizruk.action).toBe("start_workout");
  });

  it("routine action is add_habit", () => {
    expect(MODULE_PRIMARY_ACTION.routine.action).toBe("add_habit");
  });

  it("nutrition action is add_meal", () => {
    expect(MODULE_PRIMARY_ACTION.nutrition.action).toBe("add_meal");
  });
});

describe("getModulePrimaryAction", () => {
  it("returns correct action for known module", () => {
    const action = getModulePrimaryAction("finyk");
    expect(action).not.toBeNull();
    expect(action?.action).toBe("add_expense");
  });

  it("returns null for unknown module", () => {
    expect(getModulePrimaryAction("unknown_module")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getModulePrimaryAction("")).toBeNull();
  });

  it("returns same object as MODULE_PRIMARY_ACTION", () => {
    expect(getModulePrimaryAction("routine")).toEqual(
      MODULE_PRIMARY_ACTION.routine,
    );
  });
});
