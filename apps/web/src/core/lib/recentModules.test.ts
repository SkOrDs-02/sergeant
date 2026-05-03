// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_AGE_MS,
  RECENT_MODULES_KEY,
  getRecentModules,
  recordModuleOpen,
} from "./recentModules";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("recordModuleOpen / getRecentModules", () => {
  it("повертає [] коли нічого не записано", () => {
    expect(getRecentModules()).toEqual([]);
  });

  it("записує open і повертає його при наступному read", () => {
    const now = 1_000_000_000_000;
    recordModuleOpen("finyk", now);
    expect(getRecentModules(now)).toEqual(["finyk"]);
  });

  it("сортує по recency (DESC)", () => {
    recordModuleOpen("fizruk", 100);
    recordModuleOpen("finyk", 200);
    recordModuleOpen("nutrition", 300);
    expect(getRecentModules(300)).toEqual(["nutrition", "finyk", "fizruk"]);
  });

  it("дедуплікує: повторний open оновлює timestamp без дублікатів", () => {
    recordModuleOpen("finyk", 100);
    recordModuleOpen("fizruk", 200);
    recordModuleOpen("finyk", 300); // оновили finyk → має йти першим
    expect(getRecentModules(300)).toEqual(["finyk", "fizruk"]);
  });

  it("обрізає entries старші за MAX_AGE_MS (7 днів)", () => {
    const now = 10_000_000_000;
    recordModuleOpen("finyk", now - MAX_AGE_MS - 1);
    recordModuleOpen("fizruk", now - 1000);
    expect(getRecentModules(now)).toEqual(["fizruk"]);
  });

  it("ігнорує невалідні id (захист від попсованої LS)", () => {
    recordModuleOpen("invalid", 100);
    recordModuleOpen("", 200);
    recordModuleOpen(null, 300);
    expect(getRecentModules(300)).toEqual([]);
    recordModuleOpen("routine", 400);
    expect(getRecentModules(400)).toEqual(["routine"]);
  });

  it("кепить на MAX_ENTRIES=4 (всі модулі поміщаються)", () => {
    recordModuleOpen("finyk", 100);
    recordModuleOpen("fizruk", 200);
    recordModuleOpen("routine", 300);
    recordModuleOpen("nutrition", 400);
    const list = getRecentModules(400);
    expect(list).toHaveLength(4);
    expect(new Set(list)).toEqual(
      new Set(["finyk", "fizruk", "routine", "nutrition"]),
    );
  });

  it("ігнорує попсовані entries у JSON (масив, але елементи невалідні)", () => {
    localStorage.setItem(
      RECENT_MODULES_KEY,
      JSON.stringify([
        { id: "rogue", ts: 100 },
        { id: "finyk", ts: "not-a-number" },
        { id: "fizruk", ts: 500 },
        "garbage",
        null,
      ]),
    );
    expect(getRecentModules(1000)).toEqual(["fizruk"]);
  });

  it("ігнорує не-масив payload без падіння", () => {
    localStorage.setItem(
      RECENT_MODULES_KEY,
      JSON.stringify({ not: "an array" }),
    );
    expect(getRecentModules()).toEqual([]);
  });

  it("recordModuleOpen no-op для невалідного id (нічого не зберігається)", () => {
    recordModuleOpen("not-a-module", 100);
    expect(localStorage.getItem(RECENT_MODULES_KEY)).toBeNull();
  });

  it("recordModuleOpen no-op для null/undefined", () => {
    recordModuleOpen(undefined, 100);
    recordModuleOpen(null, 200);
    expect(localStorage.getItem(RECENT_MODULES_KEY)).toBeNull();
  });
});
