import { describe, it, expect } from "vitest";
import {
  FIRST_ENTRY_CELEBRATIONS,
  getFirstEntryCelebrationCopy,
} from "./onboardingCelebrations";
import { DASHBOARD_MODULE_IDS } from "./dashboard";

describe("onboardingCelebrations", () => {
  it("provides distinct headlines per module + default", () => {
    const headlines = new Set<string>();
    for (const id of [...DASHBOARD_MODULE_IDS, "default"] as const) {
      headlines.add(FIRST_ENTRY_CELEBRATIONS[id].headline);
    }
    // 4 modules + default = 5 distinct headlines (no copy collapse).
    expect(headlines.size).toBe(5);
  });

  it("does not brag about engineering speed", () => {
    // Audit guard: the previous copy was «Готово за {N} с!» /
    // «Блискавично!» — both reframe the celebration to be about app
    // performance instead of the user's action. Reject any copy that
    // reintroduces speed-language at review time.
    const banned = [/блискавично/i, /за\s*\d/i, /\d\s*сек/i, /швидко/i];
    for (const id of [...DASHBOARD_MODULE_IDS, "default"] as const) {
      const { headline, subtext } = FIRST_ENTRY_CELEBRATIONS[id];
      for (const pattern of banned) {
        expect(headline).not.toMatch(pattern);
        expect(subtext).not.toMatch(pattern);
      }
    }
  });

  it("getFirstEntryCelebrationCopy returns module copy when given an id", () => {
    expect(getFirstEntryCelebrationCopy("finyk")).toEqual(
      FIRST_ENTRY_CELEBRATIONS.finyk,
    );
    expect(getFirstEntryCelebrationCopy("nutrition")).toEqual(
      FIRST_ENTRY_CELEBRATIONS.nutrition,
    );
  });

  it("getFirstEntryCelebrationCopy falls back to default on null", () => {
    expect(getFirstEntryCelebrationCopy(null)).toEqual(
      FIRST_ENTRY_CELEBRATIONS.default,
    );
  });
});
