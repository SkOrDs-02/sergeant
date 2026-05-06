/**
 * Render-layer tests for `useRoutineReminders`.
 *
 * Covers the five scenarios called out by the Phase 5 / PR 6 spec:
 *
 *  1. Permission not-yet-requested — the hook reports `undetermined`
 *     and never schedules anything on mount.
 *  2. Grant path — after `requestPermission()` resolves to `granted`,
 *     the hook schedules one `Notifications.scheduleNotificationAsync`
 *     call per habit × weekday × reminder time.
 *  3. Deny path — after `requestPermission()` resolves to `denied`,
 *     no scheduling happens and `permission` flips to "denied".
 *  4. Cancel on habit delete — removing a habit from the list cancels
 *     the previously-scheduled notification ids for that habit.
 *  5. Re-schedule on reminder toggle — flipping `reminderTimes` on an
 *     existing habit calls cancel + schedule for the new times.
 */

import { act, render } from "@testing-library/react-native";
import { useEffect } from "react";
import { Text } from "react-native";

import { _getMMKVInstance } from "@/lib/storage";
import {
  defaultRoutineState,
  type Habit,
  type RoutineState,
} from "@sergeant/routine-domain";

jest.mock("expo-notifications", () => {
  const getPermissionsAsync = jest.fn();
  const requestPermissionsAsync = jest.fn();
  const scheduleNotificationAsync = jest.fn();
  const cancelScheduledNotificationAsync = jest.fn();
  return {
    __esModule: true,
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    // Mirror the runtime enum value (`SchedulableTriggerInputTypes.WEEKLY = "weekly"`).
    // The hook reads `Notifications.SchedulableTriggerInputTypes.WEEKLY` to
    // build the typed `WeeklyTriggerInput` discriminator at the call site.
    SchedulableTriggerInputTypes: {
      CALENDAR: "calendar",
      DAILY: "daily",
      WEEKLY: "weekly",
      MONTHLY: "monthly",
      YEARLY: "yearly",
      DATE: "date",
      TIME_INTERVAL: "timeInterval",
    },
    getPermissionsAsync,
    requestPermissionsAsync,
    scheduleNotificationAsync,
    cancelScheduledNotificationAsync,
  };
});

import * as Notifications from "expo-notifications";

import {
  SCHEDULED_MAP_KEY,
  useRoutineReminders,
  type UseRoutineRemindersApi,
} from "./useRoutineReminders";

const mockedGetPerms = Notifications.getPermissionsAsync as jest.Mock;
const mockedRequestPerms = Notifications.requestPermissionsAsync as jest.Mock;
const mockedSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockedCancel =
  Notifications.cancelScheduledNotificationAsync as jest.Mock;

function makeHabit(overrides: Partial<Habit> & { id: string }): Habit {
  return {
    id: overrides.id,
    name: overrides.name ?? "Habit",
    emoji: overrides.emoji ?? "✓",
    recurrence: overrides.recurrence ?? "daily",
    reminderTimes: overrides.reminderTimes ?? ["08:00"],
    weekdays: overrides.weekdays,
    archived: overrides.archived,
  };
}

function makeState(habits: Habit[]): RoutineState {
  const base = defaultRoutineState();
  return {
    ...base,
    habits,
    prefs: { ...base.prefs, routineRemindersEnabled: true },
  };
}

interface HarnessProps {
  state: RoutineState;
  onApi?: (api: UseRoutineRemindersApi) => void;
}

function Harness({ state, onApi }: HarnessProps) {
  const api = useRoutineReminders(state);
  useEffect(() => {
    onApi?.(api);
  }, [api, onApi]);
  return <Text testID="permission">{api.permission}</Text>;
}

/**
 * Let every pending microtask + the 250ms debounce timer settle.
 *
 * Two passes: the first drains microtasks (so state updates from
 * `getPermissionsAsync` / `requestPermissionsAsync` commit and the
 * debounce effect queues its setTimeout); the second advances past
 * the 250ms debounce and drains the reschedule's async work.
 */
async function flushScheduler(): Promise<void> {
  // Several passes of `advanceTimersByTimeAsync` + microtask drain.
  // The hook's state machine has two "settling" stages per externally
  // observable change:
  //   (a) `getPermissionsAsync` / `requestPermissionsAsync` resolves
  //       → `setPermissionState` → React re-render;
  //   (b) the debounce effect sees the new deps and queues a fresh
  //       `setTimeout(250)`;
  // so each observable change costs one timer advance plus a batch of
  // microtask drains. Three passes are plenty for our test cases.
  for (let round = 0; round < 3; round++) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
  }
}

// CI runners are noticeably slower than local machines — give every
// test a generous budget for mounting react-native + expo mocks.
jest.setTimeout(20_000);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  _getMMKVInstance().clearAll();
  mockedGetPerms.mockReset();
  mockedRequestPerms.mockReset();
  mockedSchedule.mockReset();
  mockedCancel.mockReset();

  mockedGetPerms.mockResolvedValue({ granted: false, status: "undetermined" });
  mockedRequestPerms.mockResolvedValue({
    granted: false,
    status: "undetermined",
  });

  let seq = 0;
  mockedSchedule.mockImplementation(async () => `notif-${++seq}`);
  mockedCancel.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useRoutineReminders", () => {
  it("reports 'undetermined' and does not schedule on mount when permission is not yet requested", async () => {
    const state = makeState([makeHabit({ id: "h1", name: "Drink water" })]);

    const { getByTestId } = render(<Harness state={state} />);

    // Flush initial `getPermissionsAsync` microtasks + debounce window.
    // Using `waitFor` here would burn the 5s Jest timeout on CI since
    // fake timers + polling don't advance each other automatically.
    await flushScheduler();

    expect(getByTestId("permission").props.children).toBe("undetermined");

    // No schedule call fires until permission is explicitly granted.
    expect(mockedSchedule).not.toHaveBeenCalled();
    // Nothing persisted either.
    expect(_getMMKVInstance().getString(SCHEDULED_MAP_KEY)).toBeUndefined();
  });

  it("schedules weekly notifications after permission is granted via requestPermission()", async () => {
    const state = makeState([
      makeHabit({
        id: "h1",
        name: "Drink water",
        recurrence: "weekly",
        weekdays: [0, 2], // Mon, Wed in routine's 0=Mon convention.
        reminderTimes: ["08:00", "20:30"],
      }),
    ]);

    let api: UseRoutineRemindersApi | null = null;
    render(<Harness state={state} onApi={(a) => (api = a)} />);

    // Later calls to getPermissionsAsync (inside requestPermission) reflect
    // the "undetermined" state up until the native prompt resolves.
    mockedGetPerms.mockResolvedValue({
      granted: false,
      status: "undetermined",
    });
    mockedRequestPerms.mockResolvedValueOnce({
      granted: true,
      status: "granted",
    });

    // Flush the initial getPermissionsAsync from mount.
    await flushScheduler();

    await act(async () => {
      await api!.requestPermission();
    });
    await flushScheduler();

    // 2 weekdays × 2 times = 4 scheduled notifications.
    expect(mockedSchedule).toHaveBeenCalledTimes(4);

    // Sanity-check one of the schedule payloads — routine Mon (0)
    // should map to Expo weekday 2 at 08:00.
    const firstCall = mockedSchedule.mock.calls.find(
      ([arg]) => arg?.trigger?.weekday === 2 && arg?.trigger?.hour === 8,
    );
    expect(firstCall).toBeTruthy();
    expect(firstCall![0].trigger).toMatchObject({
      type: "weekly",
      weekday: 2,
      hour: 8,
      minute: 0,
    });
    expect(firstCall![0].content).toMatchObject({
      title: "✓ Drink water",
    });

    // Persisted map contains 4 ids under the single habit.
    const persisted = _getMMKVInstance().getString(SCHEDULED_MAP_KEY);
    expect(persisted).toBeTruthy();
    expect(JSON.parse(persisted as string)).toEqual({
      h1: ["notif-1", "notif-2", "notif-3", "notif-4"],
    });
  });

  it("does not schedule when the user denies the permission prompt", async () => {
    const state = makeState([makeHabit({ id: "h1", name: "Drink water" })]);

    let api: UseRoutineRemindersApi | null = null;
    const { getByTestId } = render(
      <Harness state={state} onApi={(a) => (api = a)} />,
    );
    await flushScheduler();

    mockedRequestPerms.mockResolvedValueOnce({
      granted: false,
      status: "denied",
    });

    await act(async () => {
      await api!.requestPermission();
    });
    await flushScheduler();

    expect(mockedSchedule).not.toHaveBeenCalled();
    expect(getByTestId("permission").props.children).toBe("denied");
  });

  it("cancels previously-scheduled reminders when a habit is removed from the list", async () => {
    const initial = makeState([
      makeHabit({
        id: "h1",
        recurrence: "daily",
        reminderTimes: ["08:00"],
      }),
      makeHabit({
        id: "h2",
        recurrence: "daily",
        reminderTimes: ["09:00"],
      }),
    ]);

    mockedGetPerms.mockResolvedValue({
      granted: true,
      status: "granted",
    });

    let api: UseRoutineRemindersApi | null = null;
    const { rerender } = render(
      <Harness state={initial} onApi={(a) => (api = a)} />,
    );
    await flushScheduler();

    // Each habit fires on 7 weekdays × 1 time = 7 schedules → 14 total.
    expect(mockedSchedule).toHaveBeenCalledTimes(14);
    const firstScheduleCount = mockedSchedule.mock.calls.length;
    mockedCancel.mockClear();

    // Drop h1, keep h2 with the same reminder times.
    const afterDelete = makeState([
      makeHabit({
        id: "h2",
        recurrence: "daily",
        reminderTimes: ["09:00"],
      }),
    ]);

    rerender(<Harness state={afterDelete} onApi={(a) => (api = a)} />);
    await flushScheduler();

    // All previous ids (14) were cancelled before rescheduling.
    expect(mockedCancel).toHaveBeenCalledTimes(firstScheduleCount);
    // h2 was re-scheduled for 7 weekdays.
    expect(mockedSchedule.mock.calls.length).toBe(firstScheduleCount + 7);

    // Persisted map drops h1 entirely.
    const persisted = JSON.parse(
      _getMMKVInstance().getString(SCHEDULED_MAP_KEY) as string,
    );
    expect(Object.keys(persisted)).toEqual(["h2"]);
    expect(api!.permission).toBe("granted");
  });

  it("re-schedules when `reminderTimes` toggles on an existing habit", async () => {
    const initial = makeState([
      makeHabit({
        id: "h1",
        recurrence: "daily",
        reminderTimes: ["08:00"],
      }),
    ]);

    mockedGetPerms.mockResolvedValue({
      granted: true,
      status: "granted",
    });

    const { rerender } = render(<Harness state={initial} />);
    await flushScheduler();

    expect(mockedSchedule).toHaveBeenCalledTimes(7); // one per weekday
    const initialCount = mockedSchedule.mock.calls.length;
    mockedCancel.mockClear();

    // Flip from a single time to two times on the same habit.
    const toggled = makeState([
      makeHabit({
        id: "h1",
        recurrence: "daily",
        reminderTimes: ["08:00", "20:00"],
      }),
    ]);

    rerender(<Harness state={toggled} />);
    await flushScheduler();

    // Previous 7 ids cancelled, new 14 ids scheduled (7 weekdays × 2 times).
    expect(mockedCancel).toHaveBeenCalledTimes(initialCount);
    expect(mockedSchedule.mock.calls.length).toBe(initialCount + 14);
  });

  it("survives when `expo-notifications.requestPermissionsAsync` is not a function (non-Expo env)", async () => {
    // Exercise the Phase-5 requirement: the hook must not throw if the
    // module surface is incomplete (e.g. bare RN test runner).
    const module = Notifications as unknown as Record<string, unknown>;
    const originalRequest = module.requestPermissionsAsync;
    module.requestPermissionsAsync = undefined;

    try {
      const state = makeState([
        makeHabit({ id: "h1", reminderTimes: ["08:00"] }),
      ]);
      let api: UseRoutineRemindersApi | null = null;
      render(<Harness state={state} onApi={(a) => (api = a)} />);
      await flushScheduler();

      await act(async () => {
        await api!.requestPermission();
      });
      await flushScheduler();

      // Nothing scheduled, nothing persisted, no throw.
      expect(mockedSchedule).not.toHaveBeenCalled();
    } finally {
      module.requestPermissionsAsync = originalRequest;
    }
  });
});
