import { describe, expect, it } from "vitest";

import { DASHBOARD_MODULE_IDS } from "./dashboard";
import { createMemoryKVStore } from "../test-utils";
import {
  ONBOARDING_COMPLETED_FIRED_KEY,
  ONBOARDING_DONE_KEY,
  ONBOARDING_EXISTING_DATA_SOURCES,
  ONBOARDING_MODULE_DESCRIPTIONS,
  ONBOARDING_STEP_COUNT,
  ONBOARDING_STEPS,
  ONBOARDING_VIBE_CHIP_ORDER,
  ONBOARDING_VIBE_ICONS,
  ONBOARDING_VIBE_TEASERS,
  buildFinalPicks,
  clearOnboardingCompletedFired,
  clearOnboardingDone,
  hasExistingData,
  isOnboardingCompletedFired,
  isOnboardingDone,
  markOnboardingCompletedFired,
  markOnboardingDone,
  shouldShowOnboarding,
} from "./onboarding";

describe("onboarding — chip taxonomy", () => {
  it("chip order matches the canonical module order", () => {
    expect([...ONBOARDING_VIBE_CHIP_ORDER]).toEqual([...DASHBOARD_MODULE_IDS]);
  });

  it("every module has an icon + teaser", () => {
    for (const id of DASHBOARD_MODULE_IDS) {
      expect(ONBOARDING_VIBE_ICONS[id]).toBeTruthy();
      expect(ONBOARDING_VIBE_TEASERS[id]).toBeTruthy();
    }
  });
});

describe("onboarding — done flag", () => {
  it("is false on a fresh store", () => {
    const store = createMemoryKVStore();
    expect(isOnboardingDone(store)).toBe(false);
  });

  it("round-trips through markOnboardingDone / clearOnboardingDone", () => {
    const store = createMemoryKVStore();
    markOnboardingDone(store);
    expect(isOnboardingDone(store)).toBe(true);
    expect(store.getString(ONBOARDING_DONE_KEY)).toBe("1");
    clearOnboardingDone(store);
    expect(isOnboardingDone(store)).toBe(false);
  });
});

describe("onboarding — onboarding_completed fired flag (PR-07)", () => {
  it("uses the canonical hub_*_v1 storage key", () => {
    // Pin the on-disk name so a rename surfaces at PR-time: the
    // WF-60 funnel + any other dashboard consuming the event lean on
    // the assumption that the idempotency flag is stable.
    expect(ONBOARDING_COMPLETED_FIRED_KEY).toBe("hub_onboarding_completed_v1");
  });

  it("is false on a fresh store", () => {
    const store = createMemoryKVStore();
    expect(isOnboardingCompletedFired(store)).toBe(false);
  });

  it("round-trips through mark / clear", () => {
    const store = createMemoryKVStore();
    markOnboardingCompletedFired(store);
    expect(isOnboardingCompletedFired(store)).toBe(true);
    expect(store.getString(ONBOARDING_COMPLETED_FIRED_KEY)).toBe("1");
    clearOnboardingCompletedFired(store);
    expect(isOnboardingCompletedFired(store)).toBe(false);
  });

  it("is independent of the onboarding done flag — marking one does not flip the other", () => {
    // The two flags answer different questions:
    //   `ONBOARDING_DONE_KEY`           — should the splash render again?
    //   `ONBOARDING_COMPLETED_FIRED_KEY`— has the PostHog event fired?
    // `shouldShowOnboarding` eagerly flips the done flag when it
    // detects pre-existing data, which must NOT trick the event-fired
    // guard into suppressing a future legitimate fire.
    const store = createMemoryKVStore();
    markOnboardingDone(store);
    expect(isOnboardingDone(store)).toBe(true);
    expect(isOnboardingCompletedFired(store)).toBe(false);

    clearOnboardingDone(store);
    markOnboardingCompletedFired(store);
    expect(isOnboardingDone(store)).toBe(false);
    expect(isOnboardingCompletedFired(store)).toBe(true);
  });
});

describe("onboarding — hasExistingData", () => {
  it("returns false for a cold-start store", () => {
    const store = createMemoryKVStore();
    expect(hasExistingData(store)).toBe(false);
  });

  it("treats any finyk_tx_cache string as existing data", () => {
    const store = createMemoryKVStore({
      [ONBOARDING_EXISTING_DATA_SOURCES.FINYK_TX_CACHE]: "cached",
    });
    expect(hasExistingData(store)).toBe(true);
  });

  it("detects a non-empty finyk manual expenses array", () => {
    const store = createMemoryKVStore({
      [ONBOARDING_EXISTING_DATA_SOURCES.FINYK_MANUAL]: JSON.stringify([
        { amount: 10 },
      ]),
    });
    expect(hasExistingData(store)).toBe(true);
  });

  it("ignores an empty finyk manual expenses array", () => {
    const store = createMemoryKVStore({
      [ONBOARDING_EXISTING_DATA_SOURCES.FINYK_MANUAL]: JSON.stringify([]),
    });
    expect(hasExistingData(store)).toBe(false);
  });

  it("detects workouts in either array or {workouts: []} shape", () => {
    const arrayShape = createMemoryKVStore({
      [ONBOARDING_EXISTING_DATA_SOURCES.FIZRUK_WORKOUTS]: JSON.stringify([
        { id: "w1" },
      ]),
    });
    const objectShape = createMemoryKVStore({
      [ONBOARDING_EXISTING_DATA_SOURCES.FIZRUK_WORKOUTS]: JSON.stringify({
        workouts: [{ id: "w1" }],
      }),
    });
    expect(hasExistingData(arrayShape)).toBe(true);
    expect(hasExistingData(objectShape)).toBe(true);
  });

  it("detects a non-empty nutrition log object", () => {
    const store = createMemoryKVStore({
      [ONBOARDING_EXISTING_DATA_SOURCES.NUTRITION_LOG]: JSON.stringify({
        "2025-01-01": { meals: [] },
      }),
    });
    expect(hasExistingData(store)).toBe(true);
  });

  it("ignores an empty nutrition log object", () => {
    const store = createMemoryKVStore({
      [ONBOARDING_EXISTING_DATA_SOURCES.NUTRITION_LOG]: JSON.stringify({}),
    });
    expect(hasExistingData(store)).toBe(false);
  });

  it("detects routine habits array", () => {
    const store = createMemoryKVStore({
      [ONBOARDING_EXISTING_DATA_SOURCES.ROUTINE]: JSON.stringify({
        habits: [{ id: "h1" }],
      }),
    });
    expect(hasExistingData(store)).toBe(true);
  });

  it("ignores malformed JSON payloads", () => {
    const store = createMemoryKVStore({
      [ONBOARDING_EXISTING_DATA_SOURCES.FINYK_MANUAL]: "not-json",
      [ONBOARDING_EXISTING_DATA_SOURCES.ROUTINE]: "{",
    });
    expect(hasExistingData(store)).toBe(false);
  });
});

describe("onboarding — shouldShowOnboarding", () => {
  it("is true on a fresh store", () => {
    const store = createMemoryKVStore();
    expect(shouldShowOnboarding(store)).toBe(true);
  });

  it("is false when the done flag is set", () => {
    const store = createMemoryKVStore({ [ONBOARDING_DONE_KEY]: "1" });
    expect(shouldShowOnboarding(store)).toBe(false);
  });

  it("is false when existing data is detected and eagerly marks done", () => {
    const store = createMemoryKVStore({
      [ONBOARDING_EXISTING_DATA_SOURCES.FINYK_TX_CACHE]: "cached",
    });
    expect(shouldShowOnboarding(store)).toBe(false);
    expect(isOnboardingDone(store)).toBe(true);
  });

  it("does not mark done for a genuinely empty store", () => {
    const store = createMemoryKVStore();
    shouldShowOnboarding(store);
    expect(isOnboardingDone(store)).toBe(false);
  });
});

describe("onboarding — buildFinalPicks", () => {
  it("returns the sanitized picks when at least one is valid", () => {
    expect(buildFinalPicks(["finyk", "unknown", "routine"])).toEqual([
      "finyk",
      "routine",
    ]);
  });

  it("falls back to ALL_MODULES on an empty array", () => {
    expect(buildFinalPicks([])).toEqual([...DASHBOARD_MODULE_IDS]);
  });

  it("falls back to ALL_MODULES when every id is unknown", () => {
    expect(buildFinalPicks(["foo", "bar"])).toEqual([...DASHBOARD_MODULE_IDS]);
  });

  it("accepts a custom fallback", () => {
    expect(buildFinalPicks([], ["finyk"])).toEqual(["finyk"]);
  });

  it("de-duplicates while preserving caller order", () => {
    expect(buildFinalPicks(["routine", "finyk", "routine"])).toEqual([
      "routine",
      "finyk",
    ]);
  });
});

describe("onboarding — multi-step v2 types", () => {
  it("has exactly 3 steps", () => {
    expect(ONBOARDING_STEP_COUNT).toBe(3);
    expect(ONBOARDING_STEPS).toHaveLength(3);
  });

  it("steps are welcome → modules → goals", () => {
    expect(ONBOARDING_STEPS).toEqual(["welcome", "modules", "goals"]);
  });

  it("module descriptions cover every module id", () => {
    for (const id of DASHBOARD_MODULE_IDS) {
      expect(typeof ONBOARDING_MODULE_DESCRIPTIONS[id]).toBe("string");
      expect(ONBOARDING_MODULE_DESCRIPTIONS[id].length).toBeGreaterThan(0);
    }
  });
});
