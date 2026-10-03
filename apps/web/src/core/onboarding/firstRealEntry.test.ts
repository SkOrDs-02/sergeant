/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }));

vi.mock("../observability/analytics", () => ({ trackEvent: trackEventMock }));

import {
  countRealEntries,
  detectFirstActionCompletedPerModule,
  detectFirstRealEntry,
  getFirstRealEntryModule,
  hasAnyRealEntry,
} from "./firstRealEntry";
import {
  clearRealEntryCounters,
  registerRealEntryCounter,
} from "./realEntryProbe";

describe("firstRealEntry web adapter", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearRealEntryCounters();
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

  // Регресія (звіт тестерки 2026-08-18): активна юзерка Фініка місяцями
  // бачила FTUX-пропозиції для новачків. Її витрати живуть у SQLite, а всі
  // пʼять legacy LS-ключів tombstone-нуті — тож детекція читала порожній
  // localStorage, `hasRealEntry` не флипався ніколи, і ні FTUX-герой, ні
  // замок на вкладці «Звіти» не знімались.
  describe("canonical (SQLite) entries with tombstoned LS keys", () => {
    it("sees a real entry through the registered module counter", () => {
      expect(hasAnyRealEntry()).toBe(false);

      registerRealEntryCounter("finyk", () => 12);

      expect(
        window.localStorage.getItem("finyk_manual_expenses_v1"),
      ).toBeNull();
      expect(hasAnyRealEntry()).toBe(true);
      expect(getFirstRealEntryModule()).toBe("finyk");
      expect(countRealEntries()).toBe(12);
      expect(detectFirstRealEntry()).toBe(true);
      expect(detectFirstActionCompletedPerModule()).toEqual(["finyk"]);
    });

    it("stays cold-safe: an unwarmed cache reports no entry", () => {
      registerRealEntryCounter("routine", () => 0);

      expect(hasAnyRealEntry()).toBe(false);
      expect(detectFirstRealEntry()).toBe(false);
      expect(trackEventMock).not.toHaveBeenCalled();
    });
  });
});
