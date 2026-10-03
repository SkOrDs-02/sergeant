// @vitest-environment jsdom
/**
 * Tests for `useNutritionReminders` (ADR-0067 step 3).
 *
 * Key invariants:
 *   - Reminder fires when Kyiv-local hour matches the configured `reminderHour`,
 *     NOT host-local time (bug fix: was using `new Date().getHours()`).
 *   - Single-fire-per-(day,hour) dedup via `nutrition_last_reminder_notif_key`.
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

import { useNutritionReminders } from "./useNutritionReminders";

// ── Clock fixtures ────────────────────────────────────────────────────────────
// 2026-06-04T09:00:00Z = 2026-06-04T12:00:00 EEST (Kyiv UTC+3).
// Host UTC hour is 9; Kyiv hour is 12. Reminder configured for 12.
const KYIV_NOON = new Date("2026-06-04T09:00:00Z");
const KYIV_NOON_DAY = "2026-06-04";

// Midnight-boundary fixture: UTC June 4, Kyiv June 5.
// 2026-06-04T21:00:00Z = 2026-06-05T00:00:00 EEST.
const KYIV_MIDNIGHT = new Date("2026-06-04T21:00:00Z");
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
  vi.setSystemTime(KYIV_NOON);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useNutritionReminders — Kyiv-time bug fix", () => {
  it("fires when Kyiv-local hour matches reminderHour (not host-UTC hour)", async () => {
    installGrantedNotification();

    // Clock: UTC 09:00, Kyiv 12:00. Reminder at hour 12.
    // Bug: old code checked `new Date().getHours() === 12` → would be 9 in UTC → MISS.
    // Fix: new code receives Kyiv hm "12:00" from useModuleReminder → HIT.
    renderHook(() =>
      useNutritionReminders({ reminderEnabled: true, reminderHour: 12 }),
    );
    await flushMicrotasks();

    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    const [title] = showNotificationMock.mock.calls[0]!;
    expect(title).toBe("Їжа");
  });

  it("fires anywhere within the target Kyiv hour, not only at HH:00", async () => {
    installGrantedNotification();
    // Kyiv 12:45 (UTC 09:45) — app opened mid-hour. The reminder is configured
    // for hour 12 and must still fire (regression guard: an exact `HH:00` match
    // would drop it for anyone not loading the app in the first minute).
    vi.setSystemTime(new Date("2026-06-04T09:45:00Z"));
    renderHook(() =>
      useNutritionReminders({ reminderEnabled: true, reminderHour: 12 }),
    );
    await flushMicrotasks();

    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    expect(store.get("nutrition_last_reminder_notif_key")).toBe(
      `${KYIV_NOON_DAY}-12`,
    );
  });

  it("does NOT fire when Kyiv hour does not match reminderHour", async () => {
    installGrantedNotification();
    // Kyiv is 12:00 but configured for 08:00.
    renderHook(() =>
      useNutritionReminders({ reminderEnabled: true, reminderHour: 8 }),
    );
    await flushMicrotasks();

    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it("deduplicates by Kyiv day+hour key — does not re-fire in the same window", async () => {
    installGrantedNotification();
    // Pre-seed: already fired at noon on this Kyiv day.
    store.set("nutrition_last_reminder_notif_key", `${KYIV_NOON_DAY}-12`);

    renderHook(() =>
      useNutritionReminders({ reminderEnabled: true, reminderHour: 12 }),
    );
    await flushMicrotasks();

    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it("uses Kyiv day key for dedup near midnight (UTC prev day, Kyiv next day)", async () => {
    installGrantedNotification();
    vi.setSystemTime(KYIV_MIDNIGHT);
    // UTC: June 4 21:00. Kyiv: June 5 00:00. Configured for hour 0.
    // Old dedup: `todayISODate()` → host-local or UTC June 4 → wrong key.
    // New dedup: dayKey from Kyiv → "2026-06-05" → correct key.
    // A June 4 key should NOT block the June 5 reminder.
    store.set("nutrition_last_reminder_notif_key", `${KYIV_NOON_DAY}-0`);

    renderHook(() =>
      useNutritionReminders({ reminderEnabled: true, reminderHour: 0 }),
    );
    await flushMicrotasks();

    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    expect(store.get("nutrition_last_reminder_notif_key")).toBe(
      `${KYIV_MIDNIGHT_DAY}-0`,
    );
  });

  it("does not fire when reminderEnabled is false", async () => {
    installGrantedNotification();
    renderHook(() =>
      useNutritionReminders({ reminderEnabled: false, reminderHour: 12 }),
    );
    await flushMicrotasks();

    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it("falls back to hour 12 when reminderHour is null", async () => {
    installGrantedNotification();
    renderHook(() =>
      useNutritionReminders({ reminderEnabled: true, reminderHour: null }),
    );
    await flushMicrotasks();

    // Kyiv is 12:00, default is 12 — should fire.
    expect(showNotificationMock).toHaveBeenCalledTimes(1);
  });
});
