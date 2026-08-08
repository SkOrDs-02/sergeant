/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { FIZRUK_NAV, fizrukNavActiveId } from "./fizrukNav";
import { FIZRUK_PAGES, type FizrukPage } from "./fizrukRoute";

describe("FIZRUK_NAV", () => {
  it("has dashboard as the first tab with the unified «Огляд» label (UX roast 2026-Q2 C1)", () => {
    const first = FIZRUK_NAV[0];
    expect(first?.id).toBe("dashboard");
    expect(first?.label).toBe("Огляд");
  });

  it("preserves remaining tab order: workouts → progress → body (Plan tab dissolved)", () => {
    expect(FIZRUK_NAV.map((item) => item.id)).toEqual([
      "dashboard",
      "workouts",
      "progress",
      "body",
    ]);
  });
});

describe("fizrukNavActiveId (V-7 chrome audit)", () => {
  const NAV_TAB_IDS = new Set(FIZRUK_NAV.map((item) => item.id));

  it("resolves every FizrukPage to a real FIZRUK_NAV tab id", () => {
    // Guards against the exact V-7 defect: `activeId={page}` used to pass
    // pages like "measurements" straight through, and none of the four
    // FIZRUK_NAV items has that id, so the nav showed no active state at
    // all. Every page — including detail routes with no tab of their
    // own — must now resolve to one that exists.
    for (const page of FIZRUK_PAGES) {
      expect(NAV_TAB_IDS.has(fizrukNavActiveId(page))).toBe(true);
    }
  });

  it("highlights «Прогрес і заміри» while on the Заміри page", () => {
    // The specific V-7 regression: Заміри is a full page but not its own
    // tab — it lives under «Прогрес і заміри» (fizrukNav.tsx FIZRUK_NAV).
    expect(fizrukNavActiveId("measurements")).toBe("progress");
  });

  it("highlights the parent section for the two detail-style routes", () => {
    // Атлас is opened from «Моє тіло»; Вправа is opened from a workout or
    // from Прогрес's PR board — both read as «Тренування» in the nav.
    expect(fizrukNavActiveId("atlas")).toBe("body");
    expect(fizrukNavActiveId("exercise")).toBe("workouts");
  });

  it("maps a page it owns onto itself (identity for the four tab pages)", () => {
    const identityPages: readonly FizrukPage[] = [
      "dashboard",
      "workouts",
      "progress",
      "body",
    ];
    for (const page of identityPages) {
      expect(fizrukNavActiveId(page)).toBe(page);
    }
  });
});
