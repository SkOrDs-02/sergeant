// @vitest-environment jsdom
/**
 * Characterization tests for RestTimerProvider + useRestTimer.
 *
 * Key scenarios:
 *  1. Provider supplies initial null state.
 *  2. setRestTimer starts the countdown.
 *  3. Countdown ticks down once per second.
 *  4. Cancel (setRestTimer(null) mid-run) → does NOT fire the end-cue.
 *  5. Countdown reaches zero naturally → fires the end-cue (AudioContext).
 *  6. Overlay renders at provider level and disappears when timer is null.
 *  7. Cross-route survival: Workouts page unmounts mid-rest; overlay stays
 *     visible at provider level; end-cue still fires when time expires.
 *  8. useRestTimer throws when used outside provider.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import {
  render,
  renderHook,
  act,
  screen,
  cleanup,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { RestTimerProvider } from "./RestTimerProvider";
import { useRestTimer } from "./RestTimerContext";
import { RestTimerOverlay } from "../components/workouts/RestTimerOverlay";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: ReactNode }) {
  return <RestTimerProvider>{children}</RestTimerProvider>;
}

/** Mirrors what RestTimerOverlayConnected does at FizrukApp level. */
function ConnectedOverlay() {
  const { restTimer, setRestTimer } = useRestTimer();
  return (
    <RestTimerOverlay
      restTimer={restTimer}
      onCancel={() => setRestTimer(null)}
    />
  );
}

/**
 * Simulates the Workouts page — calls setRestTimer but renders nothing
 * visible so we can unmount it independently of the provider.
 */
function WorkoutsPageSimulator({
  onMount,
}: {
  onMount: (api: ReturnType<typeof useRestTimer>) => void;
}) {
  const api = useRestTimer();
  // Single fire on mount to hand the API to the test.
  const firedRef = { current: false };
  if (!firedRef.current) {
    firedRef.current = true;
    onMount(api);
  }
  return null;
}

// ---------------------------------------------------------------------------
// AudioContext mock factory
// ---------------------------------------------------------------------------
function makeAudioCtxMock() {
  return {
    state: "running" as AudioContextState,
    currentTime: 0,
    destination: {} as AudioDestinationNode,
    createOscillator: vi.fn(() => ({
      connect: vi.fn(),
      type: "sine" as OscillatorType,
      frequency: { setValueAtTime: vi.fn() },
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RestTimerProvider", () => {
  let audioCtxSpy: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();

    // Stub AudioContext so JSDOM doesn't throw and we can detect beep calls.
    const MockAudioContext = vi
      .fn()
      .mockImplementation(() => makeAudioCtxMock());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).AudioContext = MockAudioContext;
    audioCtxSpy = MockAudioContext;

    // Define navigator.vibrate as a no-op if missing (jsdom doesn't include it).
    // The haptic adapter guards on `typeof navigator.vibrate === "function"`
    // so just defining a stub is sufficient to prevent errors.
    if (!("vibrate" in navigator)) {
      Object.defineProperty(navigator, "vibrate", {
        value: vi.fn(() => true),
        configurable: true,
        writable: true,
      });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).AudioContext;
  });

  // -------------------------------------------------------------------------
  it("provides null restTimer initially", () => {
    const { result } = renderHook(() => useRestTimer(), { wrapper });
    expect(result.current.restTimer).toBeNull();
  });

  // -------------------------------------------------------------------------
  it("setRestTimer starts the countdown state", () => {
    const { result } = renderHook(() => useRestTimer(), { wrapper });

    act(() => {
      result.current.setRestTimer({ remaining: 30, total: 30 });
    });

    expect(result.current.restTimer).toEqual({ remaining: 30, total: 30 });
  });

  // -------------------------------------------------------------------------
  it("countdown ticks down each second", () => {
    const { result } = renderHook(() => useRestTimer(), { wrapper });

    act(() => {
      result.current.setRestTimer({ remaining: 5, total: 5 });
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.restTimer?.remaining).toBe(3);
  });

  // -------------------------------------------------------------------------
  it("cancelling mid-rest clears the timer without firing end-cue", () => {
    const { result } = renderHook(() => useRestTimer(), { wrapper });

    act(() => {
      result.current.setRestTimer({ remaining: 10, total: 10 });
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Cancel before reaching zero.
    act(() => {
      result.current.setRestTimer(null);
    });

    // AudioContext should NOT have been instantiated (no beep).
    expect(audioCtxSpy).not.toHaveBeenCalled();
    expect(result.current.restTimer).toBeNull();
  });

  // -------------------------------------------------------------------------
  it("end-cue fires (AudioContext constructed) when timer reaches zero naturally", () => {
    const { result } = renderHook(() => useRestTimer(), { wrapper });

    act(() => {
      result.current.setRestTimer({ remaining: 3, total: 3 });
    });

    // Let all 3 ticks fire.
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.restTimer).toBeNull();
    expect(audioCtxSpy).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it("overlay renders at provider level and is visible when timer is active", () => {
    // Use renderHook inside the same provider tree by combining the hook
    // result with a rendered overlay — the overlay consumes the same context.
    const { result: hookResult } = renderHook(() => useRestTimer(), {
      wrapper({ children }) {
        return (
          <RestTimerProvider>
            <ConnectedOverlay />
            {children}
          </RestTimerProvider>
        );
      },
    });

    // Initially no overlay (restTimer is null).
    expect(screen.queryByRole("timer")).toBeNull();

    act(() => {
      hookResult.current.setRestTimer({ remaining: 15, total: 30 });
    });

    expect(screen.getByRole("timer")).toBeTruthy();
    // formatRestClock renders with leading zeros: "00:15"
    expect(screen.getByText("00:15")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  it("overlay stays visible at provider level after Workouts page unmounts (audit-06 F3)", () => {
    // This test proves the fix: starting the timer on the Workouts page,
    // unmounting the page, and advancing the clock should still keep the
    // overlay rendered (provider owns the timer, not the page).

    let workoutsApi: ReturnType<typeof useRestTimer>;

    function AppShell({ showWorkouts }: { showWorkouts: boolean }) {
      return (
        <RestTimerProvider>
          <ConnectedOverlay />
          {showWorkouts && (
            <WorkoutsPageSimulator
              onMount={(api) => {
                workoutsApi = api;
              }}
            />
          )}
        </RestTimerProvider>
      );
    }

    const { rerender } = render(<AppShell showWorkouts={true} />);

    // Start the timer (simulating the user logging a set on the Workouts page).
    act(() => {
      workoutsApi!.setRestTimer({ remaining: 60, total: 60 });
    });

    expect(screen.getByRole("timer")).toBeTruthy();

    // Simulate navigating away — unmount the Workouts page.
    rerender(<AppShell showWorkouts={false} />);

    // Provider is still mounted; overlay should still be visible.
    expect(screen.getByRole("timer")).toBeTruthy();

    // Advance time by 30 s — countdown should have ticked.
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(screen.getByRole("timer")).toBeTruthy();
    // remaining should now be ~30 (60 - 30).
    const label = screen.getByRole("timer").getAttribute("aria-label") ?? "";
    expect(label).toContain("30");
  });

  // -------------------------------------------------------------------------
  it("end-cue fires after timer reaches zero even when Workouts page is unmounted", () => {
    // Core regression test for audit-06 F3.
    let workoutsApi: ReturnType<typeof useRestTimer>;

    function AppShell({ showWorkouts }: { showWorkouts: boolean }) {
      return (
        <RestTimerProvider>
          <ConnectedOverlay />
          {showWorkouts && (
            <WorkoutsPageSimulator
              onMount={(api) => {
                workoutsApi = api;
              }}
            />
          )}
        </RestTimerProvider>
      );
    }

    const { rerender } = render(<AppShell showWorkouts={true} />);

    act(() => {
      workoutsApi!.setRestTimer({ remaining: 3, total: 3 });
    });

    // Navigate away before the countdown finishes.
    rerender(<AppShell showWorkouts={false} />);

    // Let the countdown expire — 3 ticks.
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Overlay disappears when timer completes.
    expect(screen.queryByRole("timer")).toBeNull();

    // AudioContext was constructed → beep was played.
    expect(audioCtxSpy).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it("useRestTimer throws when used outside provider", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => {
      renderHook(() => useRestTimer());
    }).toThrow("useRestTimer must be used within <RestTimerProvider>");

    consoleSpy.mockRestore();
  });
});
