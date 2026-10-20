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

import { useFlag, setFlag } from "../lib/featureFlags";
import {
  savePinHash,
  clearPinHash,
  hasPinSet,
  readLockStatus,
  MAX_FAILED_UNLOCK_ATTEMPTS,
  __seedAttemptStateForTests,
} from "./lockStorage";
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

  it("starts in 'checking' and settles to 'idle' when no PIN is stored", async () => {
    const { result } = renderHook(() => useAppLock());
    // Холодний старт: до завершення перевірки креденшела дані не показуємо.
    expect(result.current.state).toBe("checking");
    await waitFor(() => expect(result.current.state).toBe("idle"));
  });

  // priv-03: прапорець `app-lock-enabled` на холодному старті читається до
  // буту SQLite kv і може бути хибно `false` — блокування від нього не
  // залежить, бо `disablePin` стирає хеш (PIN є ⇒ блокування ввімкнене).
  it("locks on cold start when a PIN exists even if the flag reads false", async () => {
    await savePinHash("1234");
    mockUseFlag.mockReturnValue(false);
    const { result } = renderHook(() => useAppLock());
    expect(result.current.state).toBe("checking");
    await waitFor(() => expect(result.current.state).toBe("locked"));
  });

  it("locks again on visibilitychange when a PIN exists even if the flag reads false", async () => {
    mockUseFlag.mockReturnValue(false);
    const { result } = renderHook(() => useAppLock());
    await waitFor(() => expect(result.current.state).toBe("idle"));

    await savePinHash("1234");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(result.current.state).toBe("locked"));
  });

  it("stays in 'checking' while the session is still loading, then locks the user's PIN", async () => {
    await savePinHash("1234", "user-x");
    mockUseAuth.mockReturnValue({ user: null, status: "loading" });
    const { result, rerender } = renderHook(() => useAppLock());
    await act(async () => {});
    // userId ще невідомий: це не «анонім», перевіряти партицію `anon` рано.
    expect(result.current.state).toBe("checking");

    mockUseAuth.mockReturnValue({
      user: { id: "user-x" },
      status: "authenticated",
    });
    rerender();
    await waitFor(() => expect(result.current.state).toBe("locked"));
  });

  it("fails open ('idle') when IndexedDB is unavailable", async () => {
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;
    const { result } = renderHook(() => useAppLock());
    await waitFor(() => expect(result.current.state).toBe("idle"));
  });

  it("returns 'idle' when flag enabled but no PIN set", async () => {
    mockUseFlag.mockReturnValue(true);
    const { result } = renderHook(() => useAppLock());
    // hasPinSet() is async — `checking` settles to `idle`
    await waitFor(() => expect(result.current.state).toBe("idle"));
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

  // sec-12/priv-14: 10-та хибна спроба раніше стирала креденшел і ставила
  // `idle`, тобто відкривала застосунок. Тепер замок лишається.
  describe("sec-12/priv-14 — брутфорс PIN не знімає замок", () => {
    let nowMs: number;
    let dateNowSpy: MockInstance;
    beforeEach(() => {
      nowMs = 1_800_000_000_000;
      dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    });
    afterEach(() => {
      dateNowSpy.mockRestore();
    });

    async function renderLocked() {
      mockUseFlag.mockReturnValue(true);
      const hook = renderHook(() => useAppLock());
      await waitFor(() => expect(hook.result.current.state).toBe("locked"));
      return hook;
    }

    it("10 wrong PINs never reach 'idle' and end in 'lockedOut' (credential kept)", async () => {
      await savePinHash("9876");
      const { result } = await renderLocked();

      const seen: string[] = [];
      for (let i = 1; i <= MAX_FAILED_UNLOCK_ATTEMPTS; i++) {
        let ok = true;
        await act(async () => {
          ok = await result.current.unlock("0000");
        });
        expect(ok).toBe(false);
        seen.push(result.current.state);
        // Пережити паузу, щоб наступна спроба дійшла до перевірки PIN.
        if (result.current.retryAt) nowMs = result.current.retryAt;
      }

      expect(seen).not.toContain("idle");
      expect(seen.slice(0, 9).every((st) => st === "locked")).toBe(true);
      expect(result.current.state).toBe("lockedOut");
      expect(await hasPinSet()).toBe(true);
    }, 60_000);

    it("exposes retryAt after the 5th wrong PIN and refuses attempts during the delay", async () => {
      await savePinHash("9876");
      await __seedAttemptStateForTests(4);
      const { result } = await renderLocked();

      await act(async () => {
        await result.current.unlock("0000");
      });
      expect(result.current.state).toBe("locked");
      expect(result.current.retryAt).toBe(nowMs + 30_000);

      // Правильний PIN під час паузи теж відхиляється.
      let ok = true;
      await act(async () => {
        ok = await result.current.unlock("9876");
      });
      expect(ok).toBe(false);
      expect(result.current.state).toBe("locked");

      nowMs += 30_001;
      await act(async () => {
        ok = await result.current.unlock("9876");
      });
      expect(ok).toBe(true);
      expect(result.current.state).toBe("idle");
      expect(result.current.retryAt).toBeNull();
    }, 60_000);

    it("a throttled attempt does not emit app_lock_unlock_failed", async () => {
      await savePinHash("9876");
      await __seedAttemptStateForTests(5, nowMs + 30_000);
      const { result } = await renderLocked();
      capturePostHogEvent.mockClear();

      await act(async () => {
        await result.current.unlock("0000");
      });

      expect(capturePostHogEvent).not.toHaveBeenCalled();
    }, 30_000);

    it("cold start with an exhausted counter opens in 'lockedOut', not 'idle'", async () => {
      await savePinHash("9876");
      await __seedAttemptStateForTests(MAX_FAILED_UNLOCK_ATTEMPTS);
      const { result } = renderHook(() => useAppLock());
      await waitFor(() => expect(result.current.state).toBe("lockedOut"));
    }, 30_000);

    it("cold start during a delay restores retryAt", async () => {
      await savePinHash("9876");
      await __seedAttemptStateForTests(5, nowMs + 30_000);
      const { result } = renderHook(() => useAppLock());
      await waitFor(() => expect(result.current.state).toBe("locked"));
      expect(result.current.retryAt).toBe(nowMs + 30_000);
    }, 30_000);

    it("returning to the tab keeps 'lockedOut' (does not downgrade to 'locked')", async () => {
      await savePinHash("9876");
      await __seedAttemptStateForTests(MAX_FAILED_UNLOCK_ATTEMPTS);
      const { result } = renderHook(() => useAppLock());
      await waitFor(() => expect(result.current.state).toBe("lockedOut"));

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await waitFor(() => expect(result.current.state).toBe("lockedOut"));
    }, 30_000);

    describe("signOut()", () => {
      const logout = vi.fn();
      beforeEach(() => {
        logout.mockReset();
        mockUseAuth.mockReturnValue({
          user: { id: "user-x" },
          status: "authenticated",
          logout,
        });
      });

      async function renderLockedOut() {
        await savePinHash("9876", "user-x");
        await __seedAttemptStateForTests(
          MAX_FAILED_UNLOCK_ATTEMPTS,
          undefined,
          "user-x",
        );
        const hook = renderHook(() => useAppLock());
        await waitFor(() =>
          expect(hook.result.current.state).toBe("lockedOut"),
        );
        return hook;
      }

      /**
       * Справжній `logout()` завершується повним `location.assign`, який
       * вивантажує документ: IndexedDB-транзакція, запущена ПІСЛЯ повернення
       * з `logout()`, переривається. Мок відтворює це: виконує хук
       * `beforeNavigate` (як справжній), потім «навігує» — відрізає IDB.
       */
      function logoutThatNavigates() {
        const idbBeforeNavigation = (globalThis as { indexedDB?: IDBFactory })
          .indexedDB;
        const order: string[] = [];
        logout.mockImplementation(
          async (opts?: { beforeNavigate?: () => Promise<void> }) => {
            await opts?.beforeNavigate?.();
            order.push("navigate");
            (globalThis as { indexedDB?: unknown }).indexedDB = {
              open() {
                throw new Error("document unloaded");
              },
              deleteDatabase() {
                throw new Error("document unloaded");
              },
            };
            return true;
          },
        );
        return {
          order,
          restoreIdb() {
            (globalThis as { indexedDB?: unknown }).indexedDB =
              idbBeforeNavigation;
          },
        };
      }

      it("erases the credential BEFORE the logout navigation, so the next sign-in is not locked out again", async () => {
        const nav = logoutThatNavigates();
        const { result } = await renderLockedOut();

        let done = false;
        await act(async () => {
          done = await result.current.signOut();
        });
        nav.restoreIdb();

        expect(done).toBe(true);
        expect(logout).toHaveBeenCalledTimes(1);
        // Креденшел стертий ДО навігації, а не після неї (інакше IDB уже
        // вивантажена і запис `failed >= 10` вцілів би).
        expect(await hasPinSet("user-x")).toBe(false);
        expect(await readLockStatus("user-x")).toMatchObject({
          hasPin: false,
          lockedOut: false,
        });
        expect(result.current.state).toBe("idle");
      }, 30_000);

      it("turns the app-lock-enabled toggle off on a confirmed sign-out (L-11)", async () => {
        const nav = logoutThatNavigates();
        const { result } = await renderLockedOut();
        await act(async () => {
          await result.current.signOut();
        });
        nav.restoreIdb();
        expect(setFlag).toHaveBeenCalledWith("app-lock-enabled", false);
      }, 30_000);

      it("keeps the credential and the lock when the logout is cancelled", async () => {
        logout.mockResolvedValue(false);
        const { result } = await renderLockedOut();

        let done = true;
        await act(async () => {
          done = await result.current.signOut();
        });

        expect(done).toBe(false);
        expect(await hasPinSet("user-x")).toBe(true);
        expect(result.current.state).toBe("lockedOut");
      }, 30_000);

      it("keeps the credential and the lock when the logout throws", async () => {
        logout.mockRejectedValue(new Error("network"));
        const { result } = await renderLockedOut();

        await act(async () => {
          await expect(result.current.signOut()).rejects.toThrow("network");
        });

        expect(await hasPinSet("user-x")).toBe(true);
        expect(result.current.state).toBe("lockedOut");
      }, 30_000);
    });
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
      await waitFor(() => expect(result.current.state).toBe("idle"));
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
