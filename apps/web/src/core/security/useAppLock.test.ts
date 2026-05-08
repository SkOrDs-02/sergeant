// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";

// Mock the posthog transport so tests don't need a real PostHog key.
const capturePostHogEvent = vi.fn();
vi.mock("../observability/posthog", () => ({
  capturePostHogEvent,
}));

// Mock featureFlags — start with the flag disabled; individual tests override.
vi.mock("../lib/featureFlags", () => ({
  useFlag: vi.fn().mockReturnValue(false),
  setFlag: vi.fn(),
}));

import { useFlag } from "../lib/featureFlags";
import { savePinHash, clearPinHash } from "./lockStorage";
import { useAppLock } from "./useAppLock";

const mockUseFlag = useFlag as unknown as MockInstance;

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

function installFakeIDB() {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
}

describe("useAppLock", () => {
  beforeEach(() => {
    installFakeIDB();
    mockUseFlag.mockReturnValue(false);
  });

  afterEach(async () => {
    await clearPinHash().catch(() => {});
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
    vi.clearAllMocks();
  });

  it("returns 'idle' when flag is disabled", () => {
    const { result } = renderHook(() => useAppLock());
    expect(result.current.state).toBe("idle");
  });

  it("returns 'idle' when flag enabled but no PIN set", async () => {
    mockUseFlag.mockReturnValue(true);
    const { result } = renderHook(() => useAppLock());
    // hasPinSet() is async — give it a tick
    await act(async () => {});
    expect(result.current.state).toBe("idle");
  });

  it("returns 'locked' when flag enabled and PIN is stored", async () => {
    await savePinHash("1234");
    mockUseFlag.mockReturnValue(true);
    const { result } = renderHook(() => useAppLock());
    await waitFor(() => expect(result.current.state).toBe("locked"));
  });

  it("transitions to 'setup' on startSetup()", () => {
    const { result } = renderHook(() => useAppLock());
    act(() => result.current.startSetup());
    expect(result.current.state).toBe("setup");
  });

  it("transitions to 'change' on startChange()", () => {
    const { result } = renderHook(() => useAppLock());
    act(() => result.current.startChange());
    expect(result.current.state).toBe("change");
  });

  it("transitions back to 'idle' on finishSetup()", () => {
    const { result } = renderHook(() => useAppLock());
    act(() => result.current.startSetup());
    act(() => result.current.finishSetup());
    expect(result.current.state).toBe("idle");
  });

  it("finishSetup() after startSetup emits mode:'setup'", () => {
    const { result } = renderHook(() => useAppLock());
    act(() => result.current.startSetup());
    act(() => result.current.finishSetup());
    const completedCall = capturePostHogEvent.mock.calls.find(
      ([name]) => name === "app_lock_setup_completed",
    );
    expect(completedCall?.[1]).toEqual({ mode: "setup" });
  });

  it("finishSetup() after startChange emits mode:'change'", () => {
    const { result } = renderHook(() => useAppLock());
    act(() => result.current.startChange());
    act(() => result.current.finishSetup());
    const completedCall = capturePostHogEvent.mock.calls.find(
      ([name]) => name === "app_lock_setup_completed",
    );
    expect(completedCall?.[1]).toEqual({ mode: "change" });
  });

  it("unlock() with correct PIN transitions to 'idle' and returns true", async () => {
    await savePinHash("9876");
    mockUseFlag.mockReturnValue(true);
    const { result } = renderHook(() => useAppLock());
    await waitFor(() => expect(result.current.state).toBe("locked"));

    let ok = false;
    await act(async () => {
      ok = await result.current.unlock("9876");
    });
    expect(ok).toBe(true);
    expect(result.current.state).toBe("idle");
  });

  it("unlock() with wrong PIN keeps 'locked' and returns false", async () => {
    await savePinHash("9876");
    mockUseFlag.mockReturnValue(true);
    const { result } = renderHook(() => useAppLock());
    await waitFor(() => expect(result.current.state).toBe("locked"));

    let ok = true;
    await act(async () => {
      ok = await result.current.unlock("0000");
    });
    expect(ok).toBe(false);
    expect(result.current.state).toBe("locked");
  });

  it("lock() forces state to 'locked'", async () => {
    const { result } = renderHook(() => useAppLock());
    act(() => result.current.lock());
    expect(result.current.state).toBe("locked");
  });
});
