// @vitest-environment jsdom
/**
 * Tests for the shared `useModuleReminder` hook (ADR-0067 step 3).
 *
 * Key invariant under test: `onMinuteTick` receives **device-local** `dayKey`
 * and `hm` (спека notifications-quiet-hours-and-device-time, ADR-0078), NOT
 * Kyiv. The device zone is switched via `process.env.TZ` (Node re-reads it
 * on the fly); the suite pins `TZ=UTC` in `vitest.config.js`.
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
// 2026-06-04T19:30:00Z: Kyiv 22:30 (EEST), New York 15:30 (EDT), UTC 19:30.
const UTC_NOW = new Date("2026-06-04T19:30:00Z");

// 2026-06-04T21:30:00Z: Kyiv is already June 5 (00:30), New York is still
// June 4 (17:30).
const UTC_MIDNIGHT_BOUNDARY = new Date("2026-06-04T21:30:00Z");

const ORIGINAL_TZ = process.env["TZ"];
function setDeviceZone(tz: string): void {
  process.env["TZ"] = tz;
}

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
  if (ORIGINAL_TZ === undefined) delete process.env["TZ"];
  else process.env["TZ"] = ORIGINAL_TZ;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useModuleReminder — device-time invariant", () => {
  it("passes device-local hm to onMinuteTick, not Kyiv hm", () => {
    installGrantedNotification();
    setDeviceZone("America/New_York");
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
    expect(ticks[0]?.hm).toBe("15:30"); // New York, not Kyiv 22:30
    expect(ticks[0]?.dayKey).toBe("2026-06-04");
  });

  it("keeps the device day near Kyiv midnight: Kyiv is already June 5", () => {
    installGrantedNotification();
    setDeviceZone("America/New_York");
    vi.setSystemTime(UTC_MIDNIGHT_BOUNDARY);

    const ticks: ModuleReminderTick[] = [];
    renderHook(() =>
      useModuleReminder({
        enabled: true,
        onMinuteTick: (t) => ticks.push(t),
      }),
    );

    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.hm).toBe("17:30");
    expect(ticks[0]?.dayKey).toBe("2026-06-04"); // device day, not Kyiv June 5
  });

  it("a device in Kyiv gets Kyiv hm and the next day after Kyiv midnight", () => {
    installGrantedNotification();
    setDeviceZone("Europe/Kyiv");
    vi.setSystemTime(UTC_MIDNIGHT_BOUNDARY);

    const ticks: ModuleReminderTick[] = [];
    renderHook(() =>
      useModuleReminder({
        enabled: true,
        onMinuteTick: (t) => ticks.push(t),
      }),
    );

    expect(ticks[0]?.hm).toBe("00:30");
    expect(ticks[0]?.dayKey).toBe("2026-06-05");
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
