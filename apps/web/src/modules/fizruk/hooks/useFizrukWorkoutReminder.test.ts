// @vitest-environment jsdom
/**
 * Tests for `useFizrukWorkoutReminder` (ADR-0067 step 3).
 *
 * Key invariants:
 *   - Reminder fires when Kyiv-local HH:MM matches the configured hour:minute,
 *     NOT host-local time (bug fix: was using `new Date().getHours()`).
 *   - A user abroad (clock in UTC/US-Eastern) still gets the reminder at the
 *     configured "Kyiv" time.
 *   - Single-fire-per-day dedup via `fizruk_last_reminder_notif_day`.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { renderHook } from "@testing-library/react";

// ── Storage mock ─────────────────────────────────────────────────────────────
const store = new Map<string, string>();
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadStringLS: (key: string, fallback: string | null = null) =>
    store.has(key) ? (store.get(key) as string) : fallback,
  safeWriteLS: (key: string, value: unknown) => {
    store.set(key, String(value));
    return true;
  },
}));

vi.mock("@shared/lib", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { useFizrukWorkoutReminder } from "./useFizrukWorkoutReminder";

// ── Clock fixture ─────────────────────────────────────────────────────────────
// 2026-06-04T19:30:00Z = 2026-06-04T22:30:00 EEST (Kyiv UTC+3).
// Host UTC hour is 19; Kyiv hour is 22. Reminder configured for 22:30 Kyiv.
const KYIV_NOW = new Date("2026-06-04T19:30:00Z");
const KYIV_DAY = "2026-06-04";

// Midnight-boundary fixture: UTC is still June 4, Kyiv is June 5.
// 2026-06-04T21:05:00Z = 2026-06-05T00:05:00 EEST (Kyiv UTC+3).
const KYIV_MIDNIGHT = new Date("2026-06-04T21:05:00Z");
const KYIV_MIDNIGHT_DAY = "2026-06-05";

let showNotificationMock: Mock;

function installGrantedNotification(): void {
  showNotificationMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({ showNotification: showNotificationMock }),
      controller: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  const NotificationStub = function () {} as unknown as typeof Notification;
  Object.defineProperty(NotificationStub, "permission", {
    configurable: true,
    value: "granted",
  });
  vi.stubGlobal("Notification", NotificationStub);
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(KYIV_NOW);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useFizrukWorkoutReminder — Kyiv-time bug fix", () => {
  it("fires when Kyiv-local time matches configured hour:minute (not host-UTC)", async () => {
    installGrantedNotification();

    // Clock: UTC 19:30, Kyiv 22:30. Configured reminder: 22:30.
    // Bug: old code checked `new Date().getHours() === 22` → would be 19 in UTC → MISS.
    // Fix: new code receives Kyiv hm "22:30" from useModuleReminder → HIT.
    renderHook(() =>
      useFizrukWorkoutReminder({
        enabled: true,
        reminderHour: 22,
        reminderMinute: 30,
        reminderEnabled: true,
        days: { [KYIV_DAY]: {} },
      }),
    );
    await flushMicrotasks();

    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    const [title] = showNotificationMock.mock.calls[0]!;
    expect(title).toBe("Фізрук — тренування");
  });

  it("does NOT fire when Kyiv HH:MM does not match the configured time", async () => {
    installGrantedNotification();
    // Kyiv is 22:30 but configured for 08:00.
    renderHook(() =>
      useFizrukWorkoutReminder({
        enabled: true,
        reminderHour: 8,
        reminderMinute: 0,
        reminderEnabled: true,
        days: { [KYIV_DAY]: {} },
      }),
    );
    await flushMicrotasks();

    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it("deduplicates by Kyiv day key — does not re-fire the same Kyiv day", async () => {
    installGrantedNotification();
    // Pre-seed dedup key for today's Kyiv day.
    store.set("fizruk_last_reminder_notif_day", KYIV_DAY);

    renderHook(() =>
      useFizrukWorkoutReminder({
        enabled: true,
        reminderHour: 22,
        reminderMinute: 30,
        reminderEnabled: true,
        days: { [KYIV_DAY]: {} },
      }),
    );
    await flushMicrotasks();

    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it("uses Kyiv day key for dedup near midnight when UTC is still the previous day", async () => {
    installGrantedNotification();
    vi.setSystemTime(KYIV_MIDNIGHT);
    // UTC: June 4 21:05. Kyiv: June 5 00:05. Configured for 00:05.
    // Old dedup: `getFullYear()-getMonth()-getDate()` → "2026-06-04" (wrong).
    // New dedup: dayKey from Kyiv → "2026-06-05" (correct).
    // June 4 key should NOT block June 5's reminder.
    store.set("fizruk_last_reminder_notif_day", "2026-06-04");

    renderHook(() =>
      useFizrukWorkoutReminder({
        enabled: true,
        reminderHour: 0,
        reminderMinute: 5,
        reminderEnabled: true,
        days: { [KYIV_MIDNIGHT_DAY]: {} },
      }),
    );
    await flushMicrotasks();

    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    // Dedup key should be updated to the Kyiv day.
    expect(store.get("fizruk_last_reminder_notif_day")).toBe(KYIV_MIDNIGHT_DAY);
  });

  it("does not fire when reminderEnabled is false", async () => {
    installGrantedNotification();
    renderHook(() =>
      useFizrukWorkoutReminder({
        enabled: true,
        reminderHour: 22,
        reminderMinute: 30,
        reminderEnabled: false,
        days: {},
      }),
    );
    await flushMicrotasks();

    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it("does not fire when enabled is false (no workout today)", async () => {
    installGrantedNotification();
    renderHook(() =>
      useFizrukWorkoutReminder({
        enabled: false,
        reminderHour: 22,
        reminderMinute: 30,
        reminderEnabled: true,
        days: {},
      }),
    );
    await flushMicrotasks();

    expect(showNotificationMock).not.toHaveBeenCalled();
  });
});
