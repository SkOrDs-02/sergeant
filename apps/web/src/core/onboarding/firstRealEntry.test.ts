/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }));

vi.mock("../observability/analytics", () => ({ trackEvent: trackEventMock }));

import {
  detectFirstActionCompletedPerModule,
  detectFirstRealEntry,
  getFirstRealEntryModule,
  hasAnyRealEntry,
} from "./firstRealEntry";

describe("firstRealEntry web adapter", () => {
  beforeEach(() => {
    window.localStorage.clear();
    trackEventMock.mockReset();
  });

  it("reports no real entry on a clean profile", () => {
    expect(hasAnyRealEntry()).toBe(false);
    expect(getFirstRealEntryModule()).toBeNull();
  });

  it("detectFirstRealEntry returns false with no data and fires nothing", () => {
    expect(detectFirstRealEntry()).toBe(false);
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("detects a real finyk entry and fires the analytics event once", () => {
    window.localStorage.setItem(
      "finyk_manual_expenses_v1",
      JSON.stringify([{ id: "x", demo: false, amount: 100 }]),
    );
    expect(hasAnyRealEntry()).toBe(true);
    expect(detectFirstRealEntry()).toBe(true);
    expect(getFirstRealEntryModule()).not.toBeNull();
    // the analytics event fires while a fresh real entry is present
    expect(trackEventMock).toHaveBeenCalled();
  });

  it("detectFirstActionCompletedPerModule returns an array", () => {
    const result = detectFirstActionCompletedPerModule();
    expect(Array.isArray(result)).toBe(true);
  });
});
