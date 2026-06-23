// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the `useNutritionPwaAction` PWA-shell action effect.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNutritionPwaAction } from "./useNutritionPwaAction";

type Args = Parameters<typeof useNutritionPwaAction>[0];

function makeArgs(overrides: Partial<Args> = {}): Args {
  return {
    pwaAction: undefined,
    log: { setAddMealSheetOpen: vi.fn() } as unknown as Args["log"],
    photo: {
      fileRef: { current: { click: vi.fn() } },
    } as unknown as Args["photo"],
    setActivePageAndHash: vi.fn(),
    setPhotoCardForceOpen: vi.fn(),
    onPwaActionConsumed: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("useNutritionPwaAction", () => {
  it("does nothing for an undefined action", () => {
    const args = makeArgs();
    renderHook(() => useNutritionPwaAction(args));
    expect(args.setActivePageAndHash).not.toHaveBeenCalled();
    expect(args.onPwaActionConsumed).not.toHaveBeenCalled();
  });

  it("handles add_meal: routes to log and opens the sheet", () => {
    const args = makeArgs({ pwaAction: "add_meal" });
    renderHook(() => useNutritionPwaAction(args));
    expect(args.setActivePageAndHash).toHaveBeenCalledWith("log");
    expect(args.log.setAddMealSheetOpen).toHaveBeenCalledWith(true);
    expect(args.onPwaActionConsumed).toHaveBeenCalledTimes(1);
  });

  it("handles add_meal_photo: routes to start, forces card open, clicks picker", () => {
    const click = vi.fn();
    const args = makeArgs({
      pwaAction: "add_meal_photo",
      photo: {
        fileRef: { current: { click } },
      } as unknown as Args["photo"],
    });
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });

    renderHook(() => useNutritionPwaAction(args));
    expect(args.setActivePageAndHash).toHaveBeenCalledWith("start");
    expect(args.setPhotoCardForceOpen).toHaveBeenCalledWith(true);
    // RAF path fired one click immediately…
    expect(click).toHaveBeenCalledTimes(1);
    // …and the 80ms fallback fires a second click.
    vi.advanceTimersByTime(80);
    expect(click).toHaveBeenCalledTimes(2);
    expect(args.onPwaActionConsumed).toHaveBeenCalledTimes(1);
    raf.mockRestore();
  });

  it("swallows a throwing picker click", () => {
    const args = makeArgs({
      pwaAction: "add_meal_photo",
      photo: {
        fileRef: {
          current: {
            click: () => {
              throw new Error("blocked");
            },
          },
        },
      } as unknown as Args["photo"],
    });
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
    );
    expect(() => renderHook(() => useNutritionPwaAction(args))).not.toThrow();
    expect(() => vi.advanceTimersByTime(80)).not.toThrow();
  });
});
