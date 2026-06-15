// @vitest-environment jsdom
/**
 * Tests for the routine reminders hook + its cleanup helper
 * (page-audit-09 F19).
 *
 * Two surfaces are exercised:
 *
 *   1. `cleanupStaleRoutineNotifyKeys` — the day-bucketed dedup-key GC.
 *      Notify-keys are stored as Kyiv day-keys, so the cutoff must also be
 *      computed in Europe/Kyiv (F21). We freeze the clock at a Kyiv instant
 *      that is a *different* calendar day in UTC (23:30 Kyiv = next-day UTC
 *      only near midnight; here we pick an offset that makes the host/UTC
 *      vs Kyiv distinction observable) and assert the cutoff lands on the
 *      Kyiv civil date.
 *
 *   2. `useRoutineReminders` — the per-minute scheduler. We fake
 *      `Notification`, `navigator.serviceWorker`, and the storage layer,
 *      then assert the hook fires exactly one notification per due habit,
 *      writes a one-shot dedup key, never double-fires, and honours the
 *      `routineReminderPrivacy` opt-out (F9).
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
import { defaultRoutineState } from "@sergeant/routine-domain";
import type { Habit, RoutineState } from "../lib/types";

// ── Mock the storage layer so dedup-key reads/writes are deterministic ──────
const store = new Map<string, string>();
vi.mock("@shared/lib/storage/storage", () => ({
  safeListLSKeys: () => [...store.keys()],
  safeReadStringLS: (key: string, fallback: string | null = null) =>
    store.has(key) ? (store.get(key) as string) : fallback,
  safeWriteLS: (key: string, value: unknown) => {
    store.set(key, String(value));
    return true;
  },
  safeRemoveLS: (key: string) => {
    store.delete(key);
    return true;
  },
}));

// Silence the observability logger (the hook warns on SW failures).
vi.mock("@shared/lib", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  ROUTINE_NOTIFY_PREFIX,
  cleanupStaleRoutineNotifyKeys,
  useRoutineReminders,
} from "./useRoutineReminders";

// ── Kyiv clock fixture ──────────────────────────────────────────────────────
// 2026-06-04T20:30:00Z = 2026-06-04T23:30:00 EEST (Kyiv UTC+3).
// Both UTC and Kyiv agree on the calendar day here (2026-06-04), which is
// what we want for the scheduler tests: the due habit fires on the Kyiv day.
const KYIV_NOW = new Date("2026-06-04T20:30:00Z"); // 23:30 Kyiv
const KYIV_TODAY = "2026-06-04";
const KYIV_HM = "23:30";

// A boundary instant where UTC and Kyiv DISAGREE on the day, to prove the
// cleanup cutoff is computed in Kyiv, not UTC.
// 2026-06-03T22:30:00Z = 2026-06-04T01:30 Kyiv → Kyiv day is 2026-06-04.
const KYIV_BOUNDARY = new Date("2026-06-03T22:30:00Z");

// ── SW + Notification fakes ─────────────────────────────────────────────────
let showNotificationMock: Mock;

function installNotificationApi(permission: NotificationPermission): void {
  showNotificationMock = vi.fn().mockResolvedValue(undefined);
  const registration = { showNotification: showNotificationMock };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve(registration),
      controller: null,
      // No-op for the Permissions API path inside useNotificationPermission.
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  const NotificationStub = function () {} as unknown as typeof Notification;
  Object.defineProperty(NotificationStub, "permission", {
    configurable: true,
    value: permission,
  });
  vi.stubGlobal("Notification", NotificationStub);
}

// ── helpers ─────────────────────────────────────────────────────────────────
function makeHabit(overrides: Partial<Habit> & { id: string }): Habit {
  return {
    name: "Звичка",
    recurrence: "daily",
    reminderTimes: [KYIV_HM],
    ...overrides,
  };
}

function makeState(
  habits: Habit[],
  prefsOverrides: RoutineState["prefs"] = {},
): RoutineState {
  const base = defaultRoutineState();
  return {
    ...base,
    habits,
    prefs: {
      ...base.prefs,
      routineRemindersEnabled: true,
      ...prefsOverrides,
    },
  };
}

/**
 * Drain the pending microtask queue without advancing the recursive
 * `scheduleNext()` timer (which would re-enter `fireAndSchedule` forever
 * under fake timers). The hook fires its first notification synchronously
 * on mount via `showNotification`, which only awaits the already-resolved
 * `navigator.serviceWorker.ready` promise — a few microtask turns settle it.
 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(KYIV_NOW);
});

afterEach(() => {
  // Drop the recursive scheduler timer so it can't leak into the next test.
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("cleanupStaleRoutineNotifyKeys", () => {
  it("removes keys older than the Kyiv-offset cutoff and keeps fresh ones", () => {
    vi.setSystemTime(KYIV_BOUNDARY); // 2026-06-04 in Kyiv, 2026-06-03 in UTC
    // maxAgeDays=45 → cutoff is 45 Kyiv-days before 2026-06-04 = 2026-04-20.
    const stale = `${ROUTINE_NOTIFY_PREFIX}h1_08:00_2026-04-19`; // < cutoff
    const fresh = `${ROUTINE_NOTIFY_PREFIX}h1_08:00_2026-06-03`; // > cutoff
    const unrelated = "some_other_key_2000-01-01";
    store.set(stale, "1");
    store.set(fresh, "1");
    store.set(unrelated, "1");

    cleanupStaleRoutineNotifyKeys(45);

    expect(store.has(stale)).toBe(false);
    expect(store.has(fresh)).toBe(true);
    // Non-notify keys are never touched.
    expect(store.has(unrelated)).toBe(true);
  });

  it("computes the cutoff against the Kyiv civil day, not the UTC day", () => {
    // At KYIV_BOUNDARY the UTC date is 2026-06-03 but the Kyiv date is
    // 2026-06-04. A key dated for the Kyiv "yesterday" (2026-06-03) must
    // survive a maxAgeDays=1 cutoff; a UTC-derived cutoff would mis-bucket.
    vi.setSystemTime(KYIV_BOUNDARY);
    const yesterdayKyiv = `${ROUTINE_NOTIFY_PREFIX}h1_08:00_2026-06-03`;
    const twoDaysAgo = `${ROUTINE_NOTIFY_PREFIX}h1_08:00_2026-06-01`;
    store.set(yesterdayKyiv, "1");
    store.set(twoDaysAgo, "1");

    cleanupStaleRoutineNotifyKeys(1); // cutoff = 2026-06-03 (Kyiv)

    // cutoff key is 2026-06-03; comparison is strict `<`, so the
    // same-day key is retained and the 2-day-old key is purged.
    expect(store.has(yesterdayKyiv)).toBe(true);
    expect(store.has(twoDaysAgo)).toBe(false);
  });
});

describe("useRoutineReminders — scheduler", () => {
  it("fires one notification per due habit and writes a one-shot dedup key", async () => {
    installNotificationApi("granted");
    const state = makeState([
      makeHabit({ id: "h1", name: "Біг", emoji: "🏃" }),
    ]);

    renderHook(() => useRoutineReminders(state));
    await flushMicrotasks();

    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    const [title, options] = showNotificationMock.mock.calls[0]!;
    expect(title).toBe("🏃 Біг");
    expect(options.body).toBe("Нагадування про звичку");

    const dedupKey = `${ROUTINE_NOTIFY_PREFIX}h1_${KYIV_HM}_${KYIV_TODAY}`;
    expect(store.get(dedupKey)).toBe("1");
  });

  it("does not re-fire when the dedup key already exists", async () => {
    installNotificationApi("granted");
    const dedupKey = `${ROUTINE_NOTIFY_PREFIX}h1_${KYIV_HM}_${KYIV_TODAY}`;
    store.set(dedupKey, "1");
    const state = makeState([makeHabit({ id: "h1" })]);

    renderHook(() => useRoutineReminders(state));
    await flushMicrotasks();

    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it("withholds the habit name when routineReminderPrivacy is 'minimal' (F9)", async () => {
    installNotificationApi("granted");
    const state = makeState(
      [makeHabit({ id: "h1", name: "Терапія", emoji: "🧠" })],
      { routineReminderPrivacy: "minimal" },
    );

    renderHook(() => useRoutineReminders(state));
    await flushMicrotasks();

    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    const [title, options] = showNotificationMock.mock.calls[0]!;
    expect(title).toBe("Нагадування");
    expect(title).not.toContain("Терапія");
    expect(options.body).toBe("Час для запланованої звички");
    expect(options.body).not.toContain("Терапія");
  });

  it("does not fire when permission is not granted", async () => {
    installNotificationApi("default");
    const state = makeState([makeHabit({ id: "h1" })]);

    renderHook(() => useRoutineReminders(state));
    await flushMicrotasks();

    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it("does not fire when reminders are disabled in prefs", async () => {
    installNotificationApi("granted");
    const state = makeState([makeHabit({ id: "h1" })], {
      routineRemindersEnabled: false,
    });

    renderHook(() => useRoutineReminders(state));
    await flushMicrotasks();

    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it("does not fire for a completed habit", async () => {
    installNotificationApi("granted");
    const base = makeState([makeHabit({ id: "h1" })]);
    const state: RoutineState = {
      ...base,
      completions: { h1: [KYIV_TODAY] },
    };

    renderHook(() => useRoutineReminders(state));
    await flushMicrotasks();

    expect(showNotificationMock).not.toHaveBeenCalled();
  });
});
