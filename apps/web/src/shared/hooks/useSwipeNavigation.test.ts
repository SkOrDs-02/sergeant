// @vitest-environment jsdom
/**
 * Tests for `useSwipeNavigation` — shared horizontal-swipe gesture.
 *
 * Touch events are synthesised as plain objects matching the bits the
 * hook reads (`touches`, `changedTouches`, `target`). jsdom doesn't ship
 * real `TouchEvent`, so we cast structural literals to the React handler
 * argument type.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSwipeNavigation } from "./useSwipeNavigation";

type TE = React.TouchEvent;

function touchStart(x: number, y: number, target?: EventTarget): TE {
  return {
    target: target ?? document.body,
    touches: [{ clientX: x, clientY: y }],
  } as unknown as TE;
}

function touchMove(x: number, y: number): TE {
  return {
    touches: [{ clientX: x, clientY: y }],
  } as unknown as TE;
}

function touchEnd(x: number, y: number): TE {
  return {
    changedTouches: [{ clientX: x, clientY: y }],
  } as unknown as TE;
}

describe("useSwipeNavigation", () => {
  let onSwipeLeft: ReturnType<typeof vi.fn>;
  let onSwipeRight: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSwipeLeft = vi.fn();
    onSwipeRight = vi.fn();
  });

  function setup(opts: Partial<Parameters<typeof useSwipeNavigation>[0]> = {}) {
    return renderHook(() =>
      useSwipeNavigation({
        onSwipeLeft: onSwipeLeft as () => void,
        onSwipeRight: onSwipeRight as () => void,
        ...opts,
      }),
    );
  }

  it("commits onSwipeLeft for a leftward (→ next) swipe past threshold", () => {
    const { result } = setup();
    act(() => result.current.onTouchStart(touchStart(300, 100)));
    act(() => result.current.onTouchEnd(touchEnd(200, 100)));
    // dx = startX - endX = 300 - 200 = 100 > 0 → onSwipeLeft
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("commits onSwipeRight for a rightward swipe past threshold", () => {
    const { result } = setup();
    act(() => result.current.onTouchStart(touchStart(100, 100)));
    act(() => result.current.onTouchEnd(touchEnd(220, 100)));
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it("ignores a swipe below the threshold distance", () => {
    const { result } = setup({ threshold: 60 });
    act(() => result.current.onTouchStart(touchStart(100, 100)));
    act(() => result.current.onTouchEnd(touchEnd(130, 100)));
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("ignores a primarily-vertical gesture", () => {
    const { result } = setup();
    act(() => result.current.onTouchStart(touchStart(100, 100)));
    act(() => result.current.onTouchEnd(touchEnd(180, 400)));
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("updates dragDx during a horizontal move and clamps to dragLimit", () => {
    const { result } = setup({ dragLimit: 50 });
    act(() => result.current.onTouchStart(touchStart(100, 100)));
    act(() => result.current.onTouchMove(touchMove(300, 105)));
    expect(result.current.dragDx).toBe(50); // clamped
    expect(result.current.isDragging).toBe(true);
  });

  it("does not drag while the gesture is still ambiguous (small dx)", () => {
    const { result } = setup();
    act(() => result.current.onTouchStart(touchStart(100, 100)));
    act(() => result.current.onTouchMove(touchMove(105, 100)));
    expect(result.current.dragDx).toBe(0);
  });

  it("suppresses leading-edge drag when atStart and pulling right", () => {
    const { result } = setup({ atStart: true });
    act(() => result.current.onTouchStart(touchStart(100, 100)));
    act(() => result.current.onTouchMove(touchMove(260, 100)));
    expect(result.current.dragDx).toBe(0);
  });

  it("suppresses trailing-edge drag when atEnd and pulling left", () => {
    const { result } = setup({ atEnd: true });
    act(() => result.current.onTouchStart(touchStart(300, 100)));
    act(() => result.current.onTouchMove(touchMove(140, 100)));
    expect(result.current.dragDx).toBe(0);
  });

  it("becomes a no-op when disabled", () => {
    const { result } = setup({ enabled: false });
    act(() => result.current.onTouchStart(touchStart(300, 100)));
    act(() => result.current.onTouchMove(touchMove(100, 100)));
    act(() => result.current.onTouchEnd(touchEnd(100, 100)));
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(result.current.dragDx).toBe(0);
  });

  it("opts out inside a [data-no-swipe] scroller", () => {
    const scroller = document.createElement("div");
    scroller.setAttribute("data-no-swipe", "");
    document.body.appendChild(scroller);
    const { result } = setup();
    act(() => result.current.onTouchStart(touchStart(300, 100, scroller)));
    act(() => result.current.onTouchEnd(touchEnd(100, 100)));
    expect(onSwipeLeft).not.toHaveBeenCalled();
    scroller.remove();
  });

  it("resets dragDx to 0 after touch end with no committed swipe", () => {
    const { result } = setup();
    act(() => result.current.onTouchStart(touchStart(100, 100)));
    act(() => result.current.onTouchMove(touchMove(140, 100)));
    expect(result.current.dragDx).not.toBe(0);
    act(() => result.current.onTouchEnd(touchEnd(140, 100)));
    expect(result.current.dragDx).toBe(0);
  });
});
