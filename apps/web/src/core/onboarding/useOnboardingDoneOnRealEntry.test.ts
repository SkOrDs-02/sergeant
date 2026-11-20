// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emitHubBus, __resetHubBusForTests } from "@shared/lib/modules/hubBus";
import {
  clearRealEntryCounters,
  registerRealEntryCounter,
} from "./realEntryProbe";
import { isOnboardingDone, shouldShowOnboarding } from "./onboardingGate";
import {
  markOnboardingDoneIfRealEntry,
  useOnboardingDoneOnRealEntry,
} from "./useOnboardingDoneOnRealEntry";

describe("онбординг закривається першим справжнім записом (FULL-20261119-UX-1)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearRealEntryCounters();
    __resetHubBusForTests();
  });
  afterEach(() => {
    clearRealEntryCounters();
    __resetHubBusForTests();
  });

  it("без записів онбординг лишається", () => {
    registerRealEntryCounter("routine", () => 0);
    expect(markOnboardingDoneIfRealEntry("routine")).toBe(false);
    expect(shouldShowOnboarding()).toBe(true);
  });

  it("запис у SQLite-кеші модуля закриває онбординг одразу на маунті", () => {
    registerRealEntryCounter("finyk", () => 1);
    renderHook(() => useOnboardingDoneOnRealEntry("finyk"));
    expect(isOnboardingDone()).toBe(true);
    expect(shouldShowOnboarding()).toBe(false);
  });

  it("запис, зроблений пізніше, закриває онбординг на storageUpdated", () => {
    let habits = 0;
    registerRealEntryCounter("routine", () => habits);
    renderHook(() => useOnboardingDoneOnRealEntry("routine"));
    expect(isOnboardingDone()).toBe(false);
    habits = 1;
    emitHubBus("storageUpdated", undefined);
    expect(isOnboardingDone()).toBe(true);
  });
});
