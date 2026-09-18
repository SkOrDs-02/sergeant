// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { useRef } from "react";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { useStoryGestures } from "../hooks/useStoryGestures";
import type { TapZone } from "../types";

// jsdom ships with MouseEvent but not PointerEvent. We polyfill a minimal
// shim so React's pointer synthetic events receive `pointerId`.
class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

beforeAll(() => {
  if (!("PointerEvent" in globalThis)) {
    (
      globalThis as unknown as { PointerEvent: typeof FakePointerEvent }
    ).PointerEvent = FakePointerEvent;
  }
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
});

// Vitest 4 widened the default `Mock` to `Mock<Procedure | Constructable>`,
// so an unparameterised `vi.fn()` is no longer assignable to a plain
// `() => void` callback. We pin every spy to its concrete callback shape
// to keep `useStoryGestures(opts)` happy without per-handler casts.
interface HandlerSpies {
  onTap: ReturnType<typeof vi.fn<(zone: TapZone) => void>>;
  onHoldStart: ReturnType<typeof vi.fn<() => void>>;
  onHoldEnd: ReturnType<typeof vi.fn<() => void>>;
  onDragStart: ReturnType<typeof vi.fn<() => void>>;
  onDragEnd: ReturnType<typeof vi.fn<() => void>>;
  onSwipeDown: ReturnType<typeof vi.fn<() => void>>;
}

function Harness({ spies }: { spies: HandlerSpies }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const props = useStoryGestures({
    targetRef: ref,
    onTap: spies.onTap,
    onHoldStart: spies.onHoldStart,
    onHoldEnd: spies.onHoldEnd,
    onDragStart: spies.onDragStart,
    onDragEnd: spies.onDragEnd,
    onSwipeDown: spies.onSwipeDown,
  });
  return (
    <div
      ref={ref}
      data-testid="surface"
      style={{ width: 300, height: 600 }}
      {...props}
    >
      <button data-story-ui data-testid="chrome-btn" type="button">
        close
      </button>
    </div>
  );
}

function makeSpies(): HandlerSpies {
  return {
    onTap: vi.fn<(zone: TapZone) => void>(),
    onHoldStart: vi.fn<() => void>(),
    onHoldEnd: vi.fn<() => void>(),
    onDragStart: vi.fn<() => void>(),
    onDragEnd: vi.fn<() => void>(),
    onSwipeDown: vi.fn<() => void>(),
  };
}

// jsdom doesn't lay out elements; getBoundingClientRect returns 0×0. We
// stub the surface's rect so tap-zone math (x < width/3) has something
// to work with.
function stubRect(el: Element, width: number, height: number) {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height,
        x: 0,
        y: 0,
        toJSON() {
          return {};
        },
      }) as DOMRect,
  });
}

describe("useStoryGestures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("short tap on the right side calls onTap('next') exactly once", () => {
    const spies = makeSpies();
    const { getByTestId } = render(<Harness spies={spies} />);
    const surface = getByTestId("surface");
    stubRect(surface, 300, 600);

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 300,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 300,
    });

    expect(spies.onTap).toHaveBeenCalledTimes(1);
    expect(spies.onTap).toHaveBeenCalledWith("next");
    expect(spies.onHoldStart).not.toHaveBeenCalled();
  });

  it("short tap on the left third calls onTap('prev')", () => {
    const spies = makeSpies();
    const { getByTestId } = render(<Harness spies={spies} />);
    const surface = getByTestId("surface");
    stubRect(surface, 300, 600);

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 50, clientY: 300 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 50, clientY: 300 });
    expect(spies.onTap).toHaveBeenCalledWith("prev");
  });

  it("duplicate pointerup with the same id is ignored (single-tap regression guard)", () => {
    const spies = makeSpies();
    const { getByTestId } = render(<Harness spies={spies} />);
    const surface = getByTestId("surface");
    stubRect(surface, 300, 600);

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 300,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 300,
    });
    // Second synthesized pointerup — must NOT fire onTap again
    fireEvent.pointerUp(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 300,
    });
    expect(spies.onTap).toHaveBeenCalledTimes(1);
  });

  it("a second pointer mid-gesture is ignored", () => {
    const spies = makeSpies();
    const { getByTestId } = render(<Harness spies={spies} />);
    const surface = getByTestId("surface");
    stubRect(surface, 300, 600);

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 300,
    });
    // Second finger joins — should be dropped.
    fireEvent.pointerDown(surface, {
      pointerId: 2,
      clientX: 50,
      clientY: 300,
    });
    // Second finger lifts — must not trigger anything.
    fireEvent.pointerUp(surface, { pointerId: 2, clientX: 50, clientY: 300 });
    expect(spies.onTap).not.toHaveBeenCalled();
    // Original finger lifts — this one counts.
    fireEvent.pointerUp(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 300,
    });
    expect(spies.onTap).toHaveBeenCalledWith("next");
  });

  it("press-and-hold past threshold fires onHoldStart and suppresses tap", () => {
    const spies = makeSpies();
    const { getByTestId } = render(<Harness spies={spies} />);
    const surface = getByTestId("surface");
    stubRect(surface, 300, 600);

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 300,
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(spies.onHoldStart).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 300,
    });
    expect(spies.onHoldEnd).toHaveBeenCalledTimes(1);
    expect(spies.onTap).not.toHaveBeenCalled();
  });

  it("swipe down past threshold fires onSwipeDown and suppresses tap", () => {
    const spies = makeSpies();
    const { getByTestId } = render(<Harness spies={spies} />);
    const surface = getByTestId("surface");
    stubRect(surface, 300, 600);

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 250,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 250,
    });

    expect(spies.onSwipeDown).toHaveBeenCalledTimes(1);
    expect(spies.onTap).not.toHaveBeenCalled();
    expect(spies.onDragStart).toHaveBeenCalled();
    expect(spies.onDragEnd).toHaveBeenCalled();
  });

  it("partial downward drag below threshold resets without closing", () => {
    const spies = makeSpies();
    const { getByTestId } = render(<Harness spies={spies} />);
    const surface = getByTestId("surface");
    stubRect(surface, 300, 600);

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 140,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 140,
    });

    expect(spies.onSwipeDown).not.toHaveBeenCalled();
    expect(spies.onTap).not.toHaveBeenCalled();
    expect(spies.onDragEnd).toHaveBeenCalled();
  });

  it("pointercancel ends hold/drag without calling tap or swipe", () => {
    const spies = makeSpies();
    const { getByTestId } = render(<Harness spies={spies} />);
    const surface = getByTestId("surface");
    stubRect(surface, 300, 600);

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 300,
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerCancel(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 300,
    });
    expect(spies.onHoldEnd).toHaveBeenCalledTimes(1);
    expect(spies.onTap).not.toHaveBeenCalled();
    expect(spies.onSwipeDown).not.toHaveBeenCalled();
  });

  it("tap released on chrome element suppresses tap navigation", () => {
    const spies = makeSpies();
    const { getByTestId } = render(<Harness spies={spies} />);
    const surface = getByTestId("surface");
    const chrome = getByTestId("chrome-btn");
    stubRect(surface, 300, 600);

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 250,
      clientY: 300,
    });
    fireEvent.pointerUp(chrome, {
      pointerId: 1,
      clientX: 250,
      clientY: 300,
    });
    expect(spies.onTap).not.toHaveBeenCalled();
  });
});
