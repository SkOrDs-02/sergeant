/**
 * Phase 5 / CloudSync wiring — verifies that every routineStore
 * mutator notifies the sync engine via `enqueueChange` after
 * persisting state, and is a no-op when the underlying reducer
 * returns the same state reference (`next === prev`).
 *
 * Both `enqueueChange` and the storage layer (`safeReadLS` /
 * `safeWriteLS`, the primitives `saveRoutineState` and
 * `loadRoutineState` use) are mocked out so the suite stays pure —
 * we only assert on the sync wiring, never on real MMKV writes.
 */
import { act, renderHook } from "@testing-library/react-native";
import { ROUTINE_STORAGE_KEY, dateKeyFromDate } from "@sergeant/routine-domain";

const mockEnqueueChange = jest.fn();
const mockSafeReadLS = jest.fn();
const mockSafeWriteLS = jest.fn();
const mockMmkvListener = jest.fn().mockReturnValue({ remove: jest.fn() });

jest.mock("@/sync/enqueue", () => ({
  enqueueChange: (...args: unknown[]) => mockEnqueueChange(...args),
}));

// Mocks the storage primitives that `saveRoutineState` /
// `loadRoutineState` call into. This keeps the tests free of MMKV
// side effects and isolates the wiring under test.
jest.mock("@/lib/storage", () => ({
  safeReadLS: (...args: unknown[]) => mockSafeReadLS(...args),
  safeWriteLS: (...args: unknown[]) => mockSafeWriteLS(...args),
  _getMMKVInstance: () => ({
    addOnValueChangedListener: (...args: unknown[]) =>
      mockMmkvListener(...args),
  }),
}));

import { useRoutineStore } from "../routineStore";
import { defaultRoutineState } from "@sergeant/routine-domain";

beforeEach(() => {
  mockEnqueueChange.mockClear();
  mockSafeReadLS.mockReset().mockReturnValue(null);
  mockSafeWriteLS.mockReset().mockReturnValue(true);
  mockMmkvListener.mockClear();
});

function firstHabitId(routine: ReturnType<typeof defaultRoutineState>): string {
  const id = routine.habits[0]?.id;
  if (!id) throw new Error("expected at least one habit");
  return id;
}

/**
 * Today's date-key (`YYYY-MM-DD` in local tz). Use this for any
 * "toggle a fresh habit for date X" assertion — `habitScheduledOnDate`
 * rejects dates before `habit.startDate || habit.createdAt`, and a
 * habit created inside `act()` always has `createdAt = today`. A
 * hard-coded key would silently break on whichever calendar day the
 * CI host happens to run on.
 *
 * Must go through `dateKeyFromDate` (the same helper `applyCreateHabit`
 * uses internally) rather than `toISOString().slice(0, 10)`. The latter
 * yields the UTC date, which drifts one day ahead of the habit's
 * local-tz `startDate` in positive-UTC offsets after local midnight but
 * before UTC midnight (e.g. Europe/Kyiv = UTC+2/+3).
 */
const TODAY_KEY = dateKeyFromDate(new Date());

describe("routineStore — enqueueChange wiring", () => {
  it("setRoutine fires enqueueChange with the routine key", () => {
    const { result } = renderHook(() => useRoutineStore());
    act(() => {
      result.current.setRoutine(defaultRoutineState());
    });
    expect(mockEnqueueChange).toHaveBeenCalledWith(ROUTINE_STORAGE_KEY);
    expect(mockEnqueueChange).toHaveBeenCalledTimes(1);
  });

  it("createHabit fires enqueueChange when a habit is created", () => {
    const { result } = renderHook(() => useRoutineStore());

    act(() => {
      result.current.createHabit({ name: "Read 10 pages" });
    });

    expect(mockEnqueueChange).toHaveBeenCalledWith(ROUTINE_STORAGE_KEY);
    expect(mockEnqueueChange).toHaveBeenCalledTimes(1);
    expect(result.current.routine.habits).toHaveLength(1);
  });

  it("createHabit is a no-op when the name is empty (next === prev)", () => {
    const { result } = renderHook(() => useRoutineStore());

    act(() => {
      result.current.createHabit({ name: "   " });
    });

    expect(mockEnqueueChange).not.toHaveBeenCalled();
    expect(result.current.routine.habits).toHaveLength(0);
  });

  it("toggleHabit fires enqueueChange after a real state change", () => {
    const { result } = renderHook(() => useRoutineStore());

    act(() => {
      result.current.createHabit({ name: "Drink water" });
    });
    const habitId = firstHabitId(result.current.routine);
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.toggleHabit(habitId, TODAY_KEY);
    });

    expect(mockEnqueueChange).toHaveBeenCalledWith(ROUTINE_STORAGE_KEY);
    expect(mockEnqueueChange).toHaveBeenCalledTimes(1);
  });

  it("toggleHabit is a no-op when the habit id does not exist (next === prev)", () => {
    const { result } = renderHook(() => useRoutineStore());
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.toggleHabit("non-existent-habit", TODAY_KEY);
    });

    expect(mockEnqueueChange).not.toHaveBeenCalled();
  });

  it("bulkMarkDay is a no-op when there are no scheduled habits (next === prev)", () => {
    const { result } = renderHook(() => useRoutineStore());
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.bulkMarkDay(TODAY_KEY);
    });

    expect(mockEnqueueChange).not.toHaveBeenCalled();
  });

  it("bulkMarkDay fires enqueueChange when at least one scheduled habit is marked", () => {
    const { result } = renderHook(() => useRoutineStore());
    act(() => {
      result.current.createHabit({ name: "Stretch" });
    });
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.bulkMarkDay(TODAY_KEY);
    });

    expect(mockEnqueueChange).toHaveBeenCalledWith(ROUTINE_STORAGE_KEY);
  });

  it("setCompletionNote is a no-op for an unknown habit (next === prev)", () => {
    const { result } = renderHook(() => useRoutineStore());
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.setCompletionNote("missing", TODAY_KEY, "note");
    });

    expect(mockEnqueueChange).not.toHaveBeenCalled();
  });

  it("setCompletionNote fires enqueueChange when the note is persisted", () => {
    const { result } = renderHook(() => useRoutineStore());
    act(() => {
      result.current.createHabit({ name: "Journal" });
    });
    const id = firstHabitId(result.current.routine);
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.setCompletionNote(id, TODAY_KEY, "felt great");
    });

    expect(mockEnqueueChange).toHaveBeenCalledWith(ROUTINE_STORAGE_KEY);
  });

  it("updateHabit fires enqueueChange", () => {
    const { result } = renderHook(() => useRoutineStore());
    act(() => {
      result.current.createHabit({ name: "Stretch" });
    });
    const id = firstHabitId(result.current.routine);
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.updateHabit(id, { name: "Stretch 5 min" });
    });

    expect(mockEnqueueChange).toHaveBeenCalledWith(ROUTINE_STORAGE_KEY);
  });

  it("updateHabit is a no-op for an unknown id (next === prev)", () => {
    const { result } = renderHook(() => useRoutineStore());
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.updateHabit("unknown", { name: "x" });
    });
    expect(mockEnqueueChange).not.toHaveBeenCalled();
  });

  it("updateHabit is a no-op when the patch doesn't change any values (next === prev)", () => {
    const { result } = renderHook(() => useRoutineStore());
    act(() => {
      result.current.createHabit({ name: "Stretch" });
    });
    const id = firstHabitId(result.current.routine);
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.updateHabit(id, { name: "Stretch" });
    });
    expect(mockEnqueueChange).not.toHaveBeenCalled();
  });

  it("setHabitArchived fires enqueueChange", () => {
    const { result } = renderHook(() => useRoutineStore());
    act(() => {
      result.current.createHabit({ name: "Meditate" });
    });
    const id = firstHabitId(result.current.routine);
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.setHabitArchived(id, true);
    });
    expect(mockEnqueueChange).toHaveBeenCalledWith(ROUTINE_STORAGE_KEY);
  });

  it("setHabitArchived is a no-op when the flag is unchanged (next === prev)", () => {
    const { result } = renderHook(() => useRoutineStore());
    act(() => {
      result.current.createHabit({ name: "Stretch" });
    });
    const id = firstHabitId(result.current.routine);
    act(() => {
      result.current.setHabitArchived(id, true);
    });
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.setHabitArchived(id, true);
    });
    expect(mockEnqueueChange).not.toHaveBeenCalled();
  });

  it("deleteHabit fires enqueueChange", () => {
    const { result } = renderHook(() => useRoutineStore());
    act(() => {
      result.current.createHabit({ name: "Walk" });
    });
    const id = firstHabitId(result.current.routine);
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.deleteHabit(id);
    });
    expect(mockEnqueueChange).toHaveBeenCalledWith(ROUTINE_STORAGE_KEY);
  });

  it("deleteHabit is a no-op for an unknown id (next === prev)", () => {
    const { result } = renderHook(() => useRoutineStore());
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.deleteHabit("unknown");
    });
    expect(mockEnqueueChange).not.toHaveBeenCalled();
  });

  it("moveHabitInOrder is a no-op when the habit is not in the order (next === prev)", () => {
    const { result } = renderHook(() => useRoutineStore());
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.moveHabitInOrder("none", -1);
    });
    expect(mockEnqueueChange).not.toHaveBeenCalled();
  });

  it("moveHabitInOrder fires enqueueChange when the order actually changes", () => {
    const { result } = renderHook(() => useRoutineStore());
    act(() => {
      result.current.createHabit({ name: "A" });
    });
    act(() => {
      result.current.createHabit({ name: "B" });
    });
    const ids = result.current.routine.habitOrder;
    expect(ids.length).toBeGreaterThanOrEqual(2);
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.moveHabitInOrder(ids[0]!, 1);
    });
    expect(mockEnqueueChange).toHaveBeenCalledWith(ROUTINE_STORAGE_KEY);
  });

  it("setHabitOrder is a no-op when the order is identical (next === prev)", () => {
    const { result } = renderHook(() => useRoutineStore());
    act(() => {
      result.current.createHabit({ name: "Solo" });
    });
    const order = result.current.routine.habitOrder;
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.setHabitOrder([...order]);
    });
    expect(mockEnqueueChange).not.toHaveBeenCalled();
  });

  it("setHabitOrder fires enqueueChange when the order actually changes", () => {
    const { result } = renderHook(() => useRoutineStore());
    act(() => {
      result.current.createHabit({ name: "Alpha" });
    });
    act(() => {
      result.current.createHabit({ name: "Beta" });
    });
    const order = result.current.routine.habitOrder;
    expect(order.length).toBeGreaterThanOrEqual(2);
    mockEnqueueChange.mockClear();

    act(() => {
      result.current.setHabitOrder([...order].reverse());
    });
    expect(mockEnqueueChange).toHaveBeenCalledWith(ROUTINE_STORAGE_KEY);
  });
});
