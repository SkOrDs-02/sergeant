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
// `vi.hoisted` keeps the spy available BEFORE `vi.mock()` is hoisted to the
// top of the file — without it, the factory crashes with a TDZ ReferenceError
// ("Cannot access 'capturePostHogEvent' before initialization").
const { capturePostHogEvent } = vi.hoisted(() => ({
  capturePostHogEvent: vi.fn(),
}));
vi.mock("../observability/posthog", () => ({
  capturePostHogEvent,
}));

// Mock featureFlags — start with the flag disabled; individual tests override.
vi.mock("../lib/featureFlags", () => ({
  useFlag: vi.fn().mockReturnValue(false),
  setFlag: vi.fn(),
}));

// Mock auth — `useAppLock` reads `user?.id` to partition the credential
// store per user (audit F16). Default to signed-out (`anon`); individual
// tests override with a concrete user id.
const { useAuth } = vi.hoisted(() => ({
  useAuth: vi.fn().mockReturnValue({ user: null }),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth }));

import { useFlag } from "../lib/featureFlags";
import { savePinHash, clearPinHash } from "./lockStorage";
import { useAppLock } from "./useAppLock";

const mockUseFlag = useFlag as unknown as MockInstance;
const mockUseAuth = useAuth as unknown as MockInstance;

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

function installFakeIDB() {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
}

describe("useAppLock", () => {
  beforeEach(() => {
    installFakeIDB();
    mockUseFlag.mockReturnValue(false);
    mockUseAuth.mockReturnValue({ user: null });
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
    mockUseFlag.mockReturnValue(true);
    const { result } = renderHook(() => useAppLock());
    act(() => result.current.startSetup());
    expect(result.current.state).toBe("setup");
  });

  it("transitions to 'change' on startChange()", () => {
    mockUseFlag.mockReturnValue(true);
    const { result } = renderHook(() => useAppLock());
    act(() => result.current.startChange());
    expect(result.current.state).toBe("change");
  });

  it("transitions back to 'idle' on finishSetup()", () => {
    mockUseFlag.mockReturnValue(true);
    const { result } = renderHook(() => useAppLock());
    act(() => result.current.startSetup());
    act(() => result.current.finishSetup());
    expect(result.current.state).toBe("idle");
  });

  it("finishSetup() after startSetup emits mode:'setup'", () => {
    mockUseFlag.mockReturnValue(true);
    const { result } = renderHook(() => useAppLock());
    act(() => result.current.startSetup());
    act(() => result.current.finishSetup());
    const completedCall = capturePostHogEvent.mock.calls.find(
      ([name]) => name === "app_lock_setup_completed",
    );
    expect(completedCall?.[1]).toEqual({ mode: "setup" });
  });

  it("finishSetup() after startChange emits mode:'change'", () => {
    mockUseFlag.mockReturnValue(true);
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
    mockUseFlag.mockReturnValue(true);
    const { result } = renderHook(() => useAppLock());
    act(() => result.current.lock());
    expect(result.current.state).toBe("locked");
  });

  describe("F16 — per-user credential partitioning", () => {
    it("locks when the PIN belongs to the signed-in user", async () => {
      // PIN stored in user-x's partition...
      await savePinHash("1234", "user-x");
      mockUseAuth.mockReturnValue({ user: { id: "user-x" } });
      mockUseFlag.mockReturnValue(true);
      const { result } = renderHook(() => useAppLock());
      // ...and the hook bound to user-x sees it → locked.
      await waitFor(() => expect(result.current.state).toBe("locked"));
    });

    it("does NOT lock when the PIN belongs to a different user", async () => {
      await savePinHash("1234", "user-x");
      // A different user signed in — must not inherit user-x's lock.
      mockUseAuth.mockReturnValue({ user: { id: "user-y" } });
      mockUseFlag.mockReturnValue(true);
      const { result } = renderHook(() => useAppLock());
      await act(async () => {});
      expect(result.current.state).toBe("idle");
    });

    it("savePin / hasPin / disablePin round-trip the signed-in user's slot", async () => {
      mockUseAuth.mockReturnValue({ user: { id: "user-z" } });
      const { result } = renderHook(() => useAppLock());

      expect(await result.current.hasPin()).toBe(false);
      await result.current.savePin("4242");
      expect(await result.current.hasPin()).toBe(true);
      // The credential really landed in user-z's partition, not anon.
      const { hasPinSet } = await import("./lockStorage");
      expect(await hasPinSet("user-z")).toBe(true);
      expect(await hasPinSet(null)).toBe(false);

      await result.current.disablePin();
      expect(await result.current.hasPin()).toBe(false);
      expect(await hasPinSet("user-z")).toBe(false);
    }, 30_000);
  });
});
