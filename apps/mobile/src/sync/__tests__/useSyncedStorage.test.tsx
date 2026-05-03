/**
 * Behavioural tests for `useSyncedStorage`.
 *
 * Verifies that:
 *  - reads/writes go through the same MMKV slot as raw `useLocalStorage`
 *  - every `setValue` call (incl. updater form) triggers exactly one
 *    `enqueueChange(key)` after the write lands
 *  - `remove` triggers `enqueueChange(key)` and resets to the fallback
 *  - the key argument is forwarded verbatim
 *
 * Only `@/sync/enqueue` is mocked. The real `useLocalStorage` + the
 * in-memory MMKV shim from `jest.setup.js` handle persistence so we
 * exercise the actual integration the production hook uses.
 */
import { act, renderHook } from "@testing-library/react-native";

import { _getMMKVInstance, safeReadLS } from "@/lib/storage";

const mockEnqueueChange = jest.fn();

jest.mock("@/sync/enqueue", () => ({
  enqueueChange: (...args: unknown[]) => mockEnqueueChange(...args),
}));

import { useSyncedStorage } from "../useSyncedStorage";

// `useSyncedStorage` is a generic key/value hook that doesn't validate
// against SYNC_MODULES — picking any string LS key works. We use the
// retired `fizruk_measurements_v1` slot here on purpose to assert that
// PR #030 cleanup did NOT regress the underlying read/write/remove
// pipeline for legacy MMKV keys still living on user devices.
const KEY = "fizruk_measurements_v1";

beforeEach(() => {
  _getMMKVInstance().clearAll();
  mockEnqueueChange.mockClear();
});

describe("useSyncedStorage", () => {
  it("returns the fallback when nothing is persisted yet", () => {
    const { result } = renderHook(() => useSyncedStorage<number[]>(KEY, []));
    expect(result.current[0]).toEqual([]);
    expect(mockEnqueueChange).not.toHaveBeenCalled();
  });

  it("persists writes through MMKV and enqueues exactly one sync per call", () => {
    const { result } = renderHook(() => useSyncedStorage<number[]>(KEY, []));

    act(() => {
      result.current[1]([1, 2, 3]);
    });

    expect(result.current[0]).toEqual([1, 2, 3]);
    expect(safeReadLS<number[]>(KEY, [])).toEqual([1, 2, 3]);
    expect(mockEnqueueChange).toHaveBeenCalledTimes(1);
    expect(mockEnqueueChange).toHaveBeenCalledWith(KEY);
  });

  it("supports the (prev) => next updater form and still enqueues once", () => {
    const { result } = renderHook(() => useSyncedStorage<number[]>(KEY, []));

    act(() => {
      result.current[1]([1]);
    });
    mockEnqueueChange.mockClear();

    act(() => {
      result.current[1]((prev) => [...prev, 2]);
    });

    expect(result.current[0]).toEqual([1, 2]);
    expect(mockEnqueueChange).toHaveBeenCalledTimes(1);
    expect(mockEnqueueChange).toHaveBeenCalledWith(KEY);
  });

  it("remove() clears the slot, resets to fallback, and enqueues once", () => {
    const { result } = renderHook(() => useSyncedStorage<number[]>(KEY, []));

    act(() => {
      result.current[1]([1, 2]);
    });
    mockEnqueueChange.mockClear();

    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toEqual([]);
    expect(safeReadLS<number[]>(KEY, null)).toBeNull();
    expect(mockEnqueueChange).toHaveBeenCalledTimes(1);
    expect(mockEnqueueChange).toHaveBeenCalledWith(KEY);
  });

  it("forwards the exact key string to enqueueChange", () => {
    const customKey = "nutrition_log_v1";
    const { result } = renderHook(() =>
      useSyncedStorage<{ kcal: number }>(customKey, { kcal: 0 }),
    );

    act(() => {
      result.current[1]({ kcal: 250 });
    });

    expect(mockEnqueueChange).toHaveBeenCalledWith(customKey);
  });
});
