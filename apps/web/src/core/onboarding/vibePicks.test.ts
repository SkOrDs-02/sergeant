/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MODULES,
  clearFirstActionPending,
  dismissSoftAuth,
  getFirstActionStartedAt,
  getSessionDays,
  getTimeToValueMs,
  getVibePicks,
  isFirstActionPending,
  isFirstRealEntryDone,
  isSoftAuthDismissed,
  markFirstActionPending,
  markFirstActionStartedAt,
  markFirstRealEntryDone,
  recordSessionDay,
  saveTimeToValueMs,
  saveVibePicks,
} from "./vibePicks";

describe("vibePicks web adapter", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("exposes the shared ALL_MODULES list", () => {
    expect(Array.isArray(ALL_MODULES)).toBe(true);
    expect(ALL_MODULES.length).toBeGreaterThan(0);
  });

  it("round-trips vibe picks", () => {
    expect(getVibePicks()).toEqual([]);
    saveVibePicks(["finyk", "routine"]);
    expect(getVibePicks()).toEqual(
      expect.arrayContaining(["finyk", "routine"]),
    );
  });

  it("tracks the first-action-pending flag", () => {
    expect(isFirstActionPending()).toBe(false);
    markFirstActionPending();
    expect(isFirstActionPending()).toBe(true);
    clearFirstActionPending();
    expect(isFirstActionPending()).toBe(false);
  });

  it("tracks the first-real-entry-done flag", () => {
    expect(isFirstRealEntryDone()).toBe(false);
    markFirstRealEntryDone();
    expect(isFirstRealEntryDone()).toBe(true);
  });

  it("tracks the soft-auth dismissed flag", () => {
    expect(isSoftAuthDismissed()).toBe(false);
    dismissSoftAuth();
    expect(isSoftAuthDismissed()).toBe(true);
  });

  it("records and reads the first-action start timestamp", () => {
    expect(getFirstActionStartedAt()).toBeNull();
    markFirstActionStartedAt();
    expect(typeof getFirstActionStartedAt()).toBe("number");
  });

  it("round-trips the time-to-value measurement", () => {
    expect(getTimeToValueMs()).toBeNull();
    saveTimeToValueMs(4321);
    expect(getTimeToValueMs()).toBe(4321);
  });

  it("counts distinct session days", () => {
    expect(getSessionDays()).toBe(0);
    const count = recordSessionDay();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(getSessionDays()).toBe(count);
  });
});
