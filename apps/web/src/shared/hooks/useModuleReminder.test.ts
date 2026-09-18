// @vitest-environment jsdom
/**
 * Tests for the shared `useModuleReminder` hook (ADR-0067 step 3).
 *
 * Key invariant under test: `onMinuteTick` receives **Kyiv-local** `dayKey`
 * and `hm`, NOT host-local values. We exercise this with a clock fixed at a
 * UTC instant where host-UTC and Kyiv disagree on the hour (and potentially
 * the day near midnight), which would have caused the old fizruk/nutrition
 * hooks to fire at the wrong time for a traveller abroad.
 *
 * Also verifies the permission guard: the tick must NOT fire when
 * Notification.permission is not "granted".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ModuleReminderTick } from "./useModuleReminder";

// Silence the logger used inside showReminderNotification.
vi.mock("@shared/lib", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { useModuleReminder } from "./useModuleReminder";

// ── Clock fixtures ──────────────────────────────────────────────────────────
// 2026-06-04T19:30:00Z = 2026-06-04T22:30:00 EEST (Kyiv UTC+3).
// Host UTC: 19:30 on June 4. Kyiv: 22:30 on June 4.
// This is the "same day" case — but hour differs (19 vs 22).
const UTC_NOW = new Date("2026-06-04T19:30:00Z");
const KYIV_HM = "22:30";
const KYIV_DAY = "2026-06-04";

// 2026-06-04T21:30:00Z = 2026-06-05T00:30:00 EEST — Kyiv is next day.
// Host UTC: still June 4 at 21:30. Kyiv: June 5 at 00:30.
const UTC_MIDNIGHT_BOUNDARY = new Date("2026-06-04T21:30:00Z");
const KYIV_MIDNIGHT_HM = "00:30";
const KYIV_MIDNIGHT_DAY = "2026-06-05";

// ── Notification stub helpers ────────────────────────────────────────────────
function installGrantedNotification(): void {
  const NotificationStub = function () {} as unknown as typeof Notification;
  Object.defineProperty(NotificationStub, "permission", {
    configurable: true,
    value: "granted",
  });
  vi.stubGlobal("Notification", NotificationStub);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        showNotification: vi.fn().mockResolvedValue(undefined),
      }),
      controller: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
}

function installDeniedNotification(): void {
  const NotificationStub = function () {} as unknown as typeof Notification;
  Object.defineProperty(NotificationStub, "permission", {
    configurable: true,
    value: "default",
  });
  vi.stubGlobal("Notification", NotificationStub);
}

// ── Test suite ───────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useModuleReminder — Kyiv-time invariant", () => {
  it("passes Kyiv-local hm to onMinuteTick, not host-UTC hm", () => {
    installGrantedNotification();
    vi.setSystemTime(UTC_NOW);

    const ticks: ModuleReminderTick[] = [];
    renderHook(() =>
      useModuleReminder({
        enabled: true,
        onMinuteTick: (t) => ticks.push(t),
      }),
    );

    // Hook fires immediately on mount.
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.hm).toBe(KYIV_HM); // Kyiv 22:30, not UTC 19:30
    expect(ticks[0]?.dayKey).toBe(KYIV_DAY);
  });

  it("passes Kyiv next-day key near midnight when UTC is still the previous day", () => {
    installGrantedNotification();
    vi.setSystemTime(UTC_MIDNIGHT_BOUNDARY);

    const ticks: ModuleReminderTick[] = [];
    renderHook(() =>
      useModuleReminder({
        enabled: true,
        onMinuteTick: (t) => ticks.push(t),
      }),
    );

    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.hm).toBe(KYIV_MIDNIGHT_HM); // 00:30 Kyiv
    expect(ticks[0]?.dayKey).toBe(KYIV_MIDNIGHT_DAY); // June 5 Kyiv, not June 4 UTC
  });

  it("does NOT fire onMinuteTick when Notification.permission is not granted", () => {
    installDeniedNotification();
    vi.setSystemTime(UTC_NOW);

    const ticks: ModuleReminderTick[] = [];
    renderHook(() =>
      useModuleReminder({
        enabled: true,
        onMinuteTick: (t) => ticks.push(t),
      }),
    );

    expect(ticks).toHaveLength(0);
  });

  it("does NOT fire onMinuteTick when enabled is false", () => {
    installGrantedNotification();
    vi.setSystemTime(UTC_NOW);

    const ticks: ModuleReminderTick[] = [];
    renderHook(() =>
      useModuleReminder({
        enabled: false,
        onMinuteTick: (t) => ticks.push(t),
      }),
    );

    expect(ticks).toHaveLength(0);
  });

  it("fires again on the next minute via the self-rescheduling timer", () => {
    installGrantedNotification();
    // Set to exactly the top of a minute (seconds = 0).
    vi.setSystemTime(new Date("2026-06-04T19:30:00.000Z"));

    const ticks: ModuleReminderTick[] = [];
    renderHook(() =>
      useModuleReminder({
        enabled: true,
        onMinuteTick: (t) => ticks.push(t),
      }),
    );

    expect(ticks).toHaveLength(1); // immediate fire on mount

    // Advance past one minute: scheduleNext computes ~60_050ms to next top.
    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });
});
