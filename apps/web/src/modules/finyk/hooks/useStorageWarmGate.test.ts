// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  STORAGE_WARM_GATE_TIMEOUT_MS,
  useStorageWarmGate,
} from "./useStorageWarmGate";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useStorageWarmGate", () => {
  it("тримає гейт, поки сховище холодне, і знімає, щойно воно прогрілось", () => {
    const { result, rerender } = renderHook(
      ({ ready }) => useStorageWarmGate(ready),
      { initialProps: { ready: false as boolean | undefined } },
    );
    expect(result.current).toBe(true);
    rerender({ ready: true });
    expect(result.current).toBe(false);
  });

  it("не блокує, коли поле storageReady відсутнє", () => {
    const { result } = renderHook(() => useStorageWarmGate(undefined));
    expect(result.current).toBe(false);
  });

  it("знімає блокування за таймаутом, якщо кеш так і не прогрівся", () => {
    const { result } = renderHook(() => useStorageWarmGate(false));
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(STORAGE_WARM_GATE_TIMEOUT_MS + 1);
    });
    expect(result.current).toBe(false);
  });
});
