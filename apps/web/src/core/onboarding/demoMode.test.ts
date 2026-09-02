/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEMO_FLAG_KEY, ROUTINE_STATE_KEY } from "./seedDemoData/keys";
import { SEEDED_KEYS, isDemoMode, resetDemoData } from "./demoMode";

vi.mock("../observability/analytics", () => ({
  trackEvent: vi.fn(),
  ANALYTICS_EVENTS: { DEMO_TO_WIZARD_CONFIRMED: "demo_to_wizard_confirmed" },
}));

describe("demoMode (легкі хелпери поза seedDemoData)", () => {
  afterEach(() => localStorage.clear());

  it("isDemoMode читає прапорець синхронно", () => {
    expect(isDemoMode()).toBe(false);
    localStorage.setItem(DEMO_FLAG_KEY, "1");
    expect(isDemoMode()).toBe(true);
  });

  it("resetDemoData прибирає всі сідерні ключі", () => {
    localStorage.setItem(DEMO_FLAG_KEY, "1");
    localStorage.setItem(ROUTINE_STATE_KEY, "{}");
    resetDemoData();
    expect(isDemoMode()).toBe(false);
    for (const k of SEEDED_KEYS) expect(localStorage.getItem(k)).toBeNull();
  });

  it("не тягне сідери в eager-граф (CI-5)", async () => {
    // Якщо `demoMode` колись знову імпортує `seedDemoData` (а з ним усі
    // `seed*`), цей мок кине ще на етапі імпорту.
    vi.doMock("./seedDemoData/seedFinyk", () => {
      throw new Error("demoMode must not import the seeders");
    });
    vi.resetModules();
    await expect(import("./demoMode")).resolves.toBeDefined();
    vi.doUnmock("./seedDemoData/seedFinyk");
  });
});
