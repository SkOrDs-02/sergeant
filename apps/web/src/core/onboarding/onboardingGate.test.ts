// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub the SQLite-backed KV store — behave like a fresh install with no
// active SQLite cache so reads/writes fall back to plain localStorage.
vi.mock("../db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

import {
  shouldShowOnboarding,
  markOnboardingDone,
  isOnboardingDone,
  hasExistingData,
  markOnboardingCompletedFired,
  isOnboardingCompletedFired,
  buildFinalPicks,
} from "./onboardingGate";

beforeEach(() => {
  localStorage.clear();
});

describe("onboardingGate", () => {
  it("isOnboardingDone is false before markOnboardingDone is called", () => {
    expect(isOnboardingDone()).toBe(false);
  });

  it("markOnboardingDone persists the done flag", () => {
    markOnboardingDone();
    expect(isOnboardingDone()).toBe(true);
  });

  it("shouldShowOnboarding is false once onboarding is already done", () => {
    markOnboardingDone();
    expect(shouldShowOnboarding()).toBe(false);
  });

  it("hasExistingData is false with a clean localStorage", () => {
    expect(hasExistingData()).toBe(false);
  });

  it("hasExistingData is true when a tracked domain key is present", () => {
    localStorage.setItem("finyk_tx_cache", "[]");
    expect(hasExistingData()).toBe(true);
  });

  it("shouldShowOnboarding returns true for a fresh install with no data", () => {
    expect(shouldShowOnboarding()).toBe(true);
  });

  it("shouldShowOnboarding closes the gate as a side effect when existing data is found", () => {
    localStorage.setItem(
      "hub_routine_v1",
      JSON.stringify({ habits: [{ id: "water" }] }),
    );
    expect(shouldShowOnboarding()).toBe(false);
    // The side effect durably marks onboarding done so a reload doesn't
    // reopen the splash while the domain data finishes loading.
    expect(isOnboardingDone()).toBe(true);
  });

  it("markOnboardingCompletedFired / isOnboardingCompletedFired round-trip", () => {
    expect(isOnboardingCompletedFired()).toBe(false);
    markOnboardingCompletedFired();
    expect(isOnboardingCompletedFired()).toBe(true);
  });

  it("re-exports buildFinalPicks from @sergeant/shared", () => {
    expect(typeof buildFinalPicks).toBe("function");
  });
});
