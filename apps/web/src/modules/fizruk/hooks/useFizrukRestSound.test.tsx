// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFizrukRestSound, type RestTimerState } from "./useFizrukRestSound";

vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticPattern: (...a: unknown[]) => mockHaptic(...a),
}));
const mockHaptic = vi.fn();

const createOscillator = vi.fn(() => ({
  connect: vi.fn(),
  type: "",
  frequency: { setValueAtTime: vi.fn() },
  start: vi.fn(),
  stop: vi.fn(),
}));
const createGain = vi.fn(() => ({
  connect: vi.fn(),
  gain: {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  },
}));

class MockAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  createOscillator = createOscillator;
  createGain = createGain;
  resume = vi.fn();
}

describe("useFizrukRestSound", () => {
  beforeEach(() => {
    mockHaptic.mockReset();
    createOscillator.mockClear();
    createGain.mockClear();
    vi.stubGlobal("AudioContext", MockAudioContext);
    (window as unknown as { AudioContext: unknown }).AudioContext =
      MockAudioContext;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not beep when timer clears without natural completion (cancel path)", () => {
    const { rerender } = renderHook(
      ({ timer }: { timer: RestTimerState | null }) =>
        useFizrukRestSound(timer),
      {
        initialProps: { timer: { remaining: 5, total: 10 } } as {
          timer: RestTimerState | null;
        },
      },
    );
    act(() => rerender({ timer: null }));
    expect(createOscillator).not.toHaveBeenCalled();
    expect(mockHaptic).not.toHaveBeenCalled();
  });

  it("beeps + vibrates when the timer completes naturally then clears", () => {
    const { result, rerender } = renderHook(
      ({ timer }: { timer: RestTimerState | null }) =>
        useFizrukRestSound(timer),
      {
        initialProps: { timer: { remaining: 1, total: 10 } } as {
          timer: RestTimerState | null;
        },
      },
    );
    act(() => {
      result.current.markCompletedNaturally();
    });
    act(() => rerender({ timer: null }));
    expect(createOscillator).toHaveBeenCalled();
    expect(mockHaptic).toHaveBeenCalledWith([200, 100, 200]);
  });

  it("resets the natural-completion flag after firing once", () => {
    const { result, rerender } = renderHook(
      ({ timer }: { timer: RestTimerState | null }) =>
        useFizrukRestSound(timer),
      {
        initialProps: { timer: { remaining: 1, total: 10 } } as {
          timer: RestTimerState | null;
        },
      },
    );
    act(() => result.current.markCompletedNaturally());
    act(() => rerender({ timer: null }));
    mockHaptic.mockClear();
    // restart and clear without re-marking → no second beep
    act(() => rerender({ timer: { remaining: 3, total: 10 } }));
    act(() => rerender({ timer: null }));
    expect(mockHaptic).not.toHaveBeenCalled();
  });
});
