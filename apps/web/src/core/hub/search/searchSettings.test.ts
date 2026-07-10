import { describe, expect, it } from "vitest";
import {
  SETTINGS_INDEX,
  searchAssistantTools,
  searchSettings,
} from "./searchSettings";

describe("searchSettings", () => {
  it("surfaces the Finyk settings section for a monobank token", () => {
    const hits = searchSettings(["monobank"]);
    expect(hits.some((h) => h.id === "settings_finyk")).toBe(true);
    const finyk = hits.find((h) => h.id === "settings_finyk");
    expect(finyk?.subtitle).toBe(
      SETTINGS_INDEX.find((s) => s.id === "finyk")?.description,
    );
  });

  it("limits settings hits to five results sorted by score", () => {
    const hits = searchSettings(["дашборд", "експорт", "фінік"]);
    expect(hits.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1]!._score).toBeGreaterThanOrEqual(hits[i]!._score);
    }
  });
});

describe("searchAssistantTools", () => {
  it("returns assistant capability hits for a matching keyword", () => {
    const hits = searchAssistantTools(["баланс"]);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.module === "assistant")).toBe(true);
  });

  it("shows only description and module label in the visible subtitle", () => {
    const hits = searchAssistantTools(["баланс"]);
    const first = hits[0];
    expect(first?.subtitle).not.toMatch(/\bexamples\b/i);
    expect(first?.subtitle).toContain("·");
  });
});
