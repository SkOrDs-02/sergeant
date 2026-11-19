// @vitest-environment jsdom
/**
 * Last validated: 2026-11-19
 * Status: Active
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEdgeSwipeBack } from "./useEdgeSwipeBack";

afterEach(cleanup);

function Harness({
  onBack,
  standalone,
}: {
  onBack: () => void;
  standalone: boolean;
}) {
  const handlers = useEdgeSwipeBack(onBack, { standalone });
  return (
    <div data-testid="page" {...handlers}>
      page
    </div>
  );
}

function swipe(
  el: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  fireEvent.touchStart(el, {
    touches: [{ clientX: from.x, clientY: from.y }],
  });
  fireEvent.touchEnd(el, {
    changedTouches: [{ clientX: to.x, clientY: to.y }],
  });
}

describe("useEdgeSwipeBack", () => {
  it("свайп від лівого краю в standalone веде назад", () => {
    const onBack = vi.fn();
    render(<Harness onBack={onBack} standalone />);
    swipe(screen.getByTestId("page"), { x: 8, y: 300 }, { x: 120, y: 310 });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("свайп, що почався не біля краю, ігнорується", () => {
    const onBack = vi.fn();
    render(<Harness onBack={onBack} standalone />);
    swipe(screen.getByTestId("page"), { x: 80, y: 300 }, { x: 220, y: 300 });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("переважно вертикальний рух біля краю — це скрол, не «назад»", () => {
    const onBack = vi.fn();
    render(<Harness onBack={onBack} standalone />);
    swipe(screen.getByTestId("page"), { x: 8, y: 300 }, { x: 90, y: 500 });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("закороткий свайп не комітиться", () => {
    const onBack = vi.fn();
    render(<Harness onBack={onBack} standalone />);
    swipe(screen.getByTestId("page"), { x: 8, y: 300 }, { x: 50, y: 300 });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("у браузерній вкладці жест вимкнено: там свій системний «назад»", () => {
    const onBack = vi.fn();
    render(<Harness onBack={onBack} standalone={false} />);
    swipe(screen.getByTestId("page"), { x: 8, y: 300 }, { x: 160, y: 300 });
    expect(onBack).not.toHaveBeenCalled();
  });
});
