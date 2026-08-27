// @vitest-environment jsdom
/**
 * Tests for `SwipePages` — спільна обгортка свайпу між вкладками модуля.
 *
 * jsdom не має справжнього `TouchEvent`, тож жест синтезується через
 * `fireEvent.touchStart/Move/End` зі структурними літералами — рівно ті
 * поля, які читає `useSwipeNavigation`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { SwipePages } from "./SwipePages";

const IDS = ["a", "b", "c"] as const;

function renderPages(
  activeId: string,
  onChange: (next: string) => void,
  ids: readonly string[] = IDS,
) {
  return render(
    <SwipePages ids={ids} activeId={activeId} onChange={onChange}>
      <p>сторінка {activeId}</p>
    </SwipePages>,
  );
}

/** Регіон, на якому висять тач-хендлери — зовнішній div обгортки. */
function swipeArea(container: HTMLElement): HTMLElement {
  return container.firstChild as HTMLElement;
}

function swipe(area: HTMLElement, fromX: number, toX: number): void {
  fireEvent.touchStart(area, { touches: [{ clientX: fromX, clientY: 100 }] });
  fireEvent.touchMove(area, { touches: [{ clientX: toX, clientY: 100 }] });
  fireEvent.touchEnd(area, {
    changedTouches: [{ clientX: toX, clientY: 100 }],
  });
}

describe("SwipePages", () => {
  it("renders its children", () => {
    renderPages("a", vi.fn());
    expect(screen.getByText("сторінка a")).toBeInTheDocument();
  });

  it("commits the next tab on a leftward swipe past threshold", () => {
    const onChange = vi.fn();
    const { container } = renderPages("a", onChange);
    swipe(swipeArea(container), 300, 200);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("commits the previous tab on a rightward swipe past threshold", () => {
    const onChange = vi.fn();
    const { container } = renderPages("b", onChange);
    swipe(swipeArea(container), 100, 220);
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("ignores a swipe shorter than the commit threshold", () => {
    const onChange = vi.fn();
    const { container } = renderPages("a", onChange);
    swipe(swipeArea(container), 300, 270);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not run past the ends of the tab list", () => {
    const onChange = vi.fn();
    const { container } = renderPages("c", onChange);
    swipe(swipeArea(container), 300, 200); // ще далі вправо нема куди
    expect(onChange).not.toHaveBeenCalled();
  });

  // Детальні екрани (напр. «Вправа» у Фізрука) не мають власної вкладки —
  // жест там має мовчати, а не тягнути в сусідній розділ.
  it("disables the gesture when the active page owns no tab", () => {
    const onChange = vi.fn();
    const { container } = renderPages("detail", onChange);
    swipe(swipeArea(container), 300, 200);
    expect(onChange).not.toHaveBeenCalled();
  });

  // Палець тягне сторінку 1:1 за вирахуванням мертвої зони гачка (12 px):
  // 300 → 260 це 40 px руху, тобто 28 px видимого зсуву, а не 40 і не 12.
  it("tracks the finger past the dead zone while dragging", () => {
    const { container } = renderPages("a", vi.fn());
    const area = swipeArea(container);
    fireEvent.touchStart(area, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchMove(area, { touches: [{ clientX: 260, clientY: 100 }] });
    const page = area.querySelector<HTMLElement>(":scope > div:last-child");
    expect(page?.style.transform).toBe("translate3d(-28px, 0, 0)");
  });

  it("returns to rest with `transform: none` after the gesture ends", () => {
    const { container } = renderPages("a", vi.fn());
    const area = swipeArea(container);
    fireEvent.touchStart(area, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchMove(area, { touches: [{ clientX: 260, clientY: 100 }] });
    fireEvent.touchEnd(area, {
      changedTouches: [{ clientX: 260, clientY: 100 }],
    });
    const page = area.querySelector<HTMLElement>(":scope > div:last-child");
    // AI-CONTEXT: саме `none`, а не identity-transform — інакше обгортка
    // стає containing block для `position: fixed` нащадків.
    expect(page?.style.transform).toBe("none");
  });

  // Нова вкладка вʼїжджає з того боку, куди вів палець: спершу стартовий
  // зсув без transition, наступним кадром — відпускання в нуль.
  it("seeds a directional enter offset when the active tab changes", () => {
    const { container, rerender } = renderPages("a", vi.fn());
    rerender(
      <SwipePages ids={IDS} activeId="b" onChange={vi.fn()}>
        <p>сторінка b</p>
      </SwipePages>,
    );
    const area = swipeArea(container);
    const page = area.querySelector<HTMLElement>(":scope > div:last-child");
    expect(page?.style.transform).toBe("translate3d(28px, 0, 0)");
  });

  it("enters from the opposite side when moving backwards", () => {
    const { container, rerender } = renderPages("c", vi.fn());
    rerender(
      <SwipePages ids={IDS} activeId="b" onChange={vi.fn()}>
        <p>сторінка b</p>
      </SwipePages>,
    );
    const page = swipeArea(container).querySelector<HTMLElement>(
      ":scope > div:last-child",
    );
    expect(page?.style.transform).toBe("translate3d(-28px, 0, 0)");
  });
});
