/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { SwipeToAction } from "./SwipeToAction";

/**
 * Знаходить внутрішній контейнер із touch-хендлерами. Він — прямий
 * нащадок кореневого оверлея і містить children. Пошук по елементу з
 * inline-стилем `transform: translateX(...)` найменш крихкий.
 */
function getTouchTarget(container: HTMLElement): HTMLDivElement {
  const root = container.firstChild as HTMLElement;
  const candidates = Array.from(root.querySelectorAll<HTMLDivElement>("div"));
  const target = candidates.find((el) =>
    (el.getAttribute("style") || "").includes("translateX("),
  );
  if (!target) throw new Error("Не знайшов touch-контейнер SwipeToAction");
  return target;
}

function touches(x: number, y: number) {
  // React тягне Touch[] з e.touches; для jsdom достатньо масива, що індексується.
  return [{ clientX: x, clientY: y }] as unknown as TouchList;
}

describe("SwipeToAction — mobile gesture regressions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("горизонтальний свайп за threshold викликає onSwipeLeft рівно один раз", () => {
    const onSwipeLeft = vi.fn();
    const { container } = render(
      <SwipeToAction onSwipeLeft={onSwipeLeft}>
        <div>tx</div>
      </SwipeToAction>,
    );
    const target = getTouchTarget(container);

    fireEvent.touchStart(target, { touches: touches(200, 50) });
    fireEvent.touchMove(target, { touches: touches(100, 50) }); // dx = -100
    fireEvent.touchEnd(target);
    act(() => {
      vi.advanceTimersByTime(500); // commit timeout (200ms) + запас
    });

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
  });

  it("подвійний свайп у межах commit-таймаута не дублює дію", () => {
    const onSwipeLeft = vi.fn();
    const { container } = render(
      <SwipeToAction onSwipeLeft={onSwipeLeft}>
        <div>tx</div>
      </SwipeToAction>,
    );
    const target = getTouchTarget(container);

    // 1-й свайп
    fireEvent.touchStart(target, { touches: touches(200, 50) });
    fireEvent.touchMove(target, { touches: touches(100, 50) });
    fireEvent.touchEnd(target);

    // 2-й свайп ДО того як commit-таймаут добіг (200ms)
    fireEvent.touchStart(target, { touches: touches(200, 50) });
    fireEvent.touchMove(target, { touches: touches(100, 50) });
    fireEvent.touchEnd(target);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
  });

  it("вертикальний рух (dy > dx) не триггерить swipe навіть якщо потім dx великий", () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { container } = render(
      <SwipeToAction onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight}>
        <div>tx</div>
      </SwipeToAction>,
    );
    const target = getTouchTarget(container);

    fireEvent.touchStart(target, { touches: touches(100, 100) });
    // Перший значимий рух — явно вертикальний. isHorizontal = false на
    // весь drag, подальші горизонтальні рухи ігноруються.
    fireEvent.touchMove(target, { touches: touches(102, 150) });
    fireEvent.touchMove(target, { touches: touches(0, 150) }); // dx = -100
    fireEvent.touchEnd(target);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("tap без переміщення (dx=dy<5) не тригерить свайп", () => {
    const onSwipeLeft = vi.fn();
    const { container } = render(
      <SwipeToAction onSwipeLeft={onSwipeLeft}>
        <div>tx</div>
      </SwipeToAction>,
    );
    const target = getTouchTarget(container);

    fireEvent.touchStart(target, { touches: touches(100, 100) });
    fireEvent.touchMove(target, { touches: touches(102, 101) }); // dx=2 dy=1
    fireEvent.touchEnd(target);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it("свайп НЕ за threshold повертає елемент у вихідне положення (offset=0)", () => {
    const onSwipeLeft = vi.fn();
    const { container } = render(
      <SwipeToAction onSwipeLeft={onSwipeLeft}>
        <div>tx</div>
      </SwipeToAction>,
    );
    const target = getTouchTarget(container);

    fireEvent.touchStart(target, { touches: touches(200, 50) });
    fireEvent.touchMove(target, { touches: touches(160, 50) }); // dx = -40, < 60
    fireEvent.touchEnd(target);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
    // Офсет скидається — transform повертається до 0px
    expect(target.getAttribute("style") || "").toMatch(/translateX\(0px\)/);
  });

  it("disabled — touchStart ігнорується і action не тригериться", () => {
    const onSwipeLeft = vi.fn();
    const { container } = render(
      <SwipeToAction onSwipeLeft={onSwipeLeft} disabled>
        <div>tx</div>
      </SwipeToAction>,
    );
    const target = getTouchTarget(container);

    fireEvent.touchStart(target, { touches: touches(200, 50) });
    fireEvent.touchMove(target, { touches: touches(50, 50) });
    fireEvent.touchEnd(target);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it("multitouch (2 пальці) ігнорується: pinch-zoom не повинен тригерити свайп", () => {
    const onSwipeLeft = vi.fn();
    const { container } = render(
      <SwipeToAction onSwipeLeft={onSwipeLeft}>
        <div>tx</div>
      </SwipeToAction>,
    );
    const target = getTouchTarget(container);

    // touchstart з двома точками (pinch) — гаситься на старті.
    fireEvent.touchStart(target, {
      touches: [
        { clientX: 200, clientY: 50 },
        { clientX: 150, clientY: 60 },
      ] as unknown as TouchList,
    });
    fireEvent.touchMove(target, { touches: touches(50, 50) });
    fireEvent.touchEnd(target);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it("скидає активний drag, якщо під час руху зʼявляється другий дотик", () => {
    const onSwipeLeft = vi.fn();
    const { container } = render(
      <SwipeToAction onSwipeLeft={onSwipeLeft}>
        <div>tx</div>
      </SwipeToAction>,
    );
    const target = getTouchTarget(container);

    fireEvent.touchStart(target, { touches: touches(200, 50) });
    fireEvent.touchMove(target, { touches: touches(150, 50) });
    fireEvent.touchMove(target, {
      touches: [
        { clientX: 120, clientY: 50 },
        { clientX: 100, clientY: 60 },
      ] as unknown as TouchList,
    });
    fireEvent.touchEnd(target);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(target.getAttribute("style") || "").toMatch(/translateX\(0px\)/);
  });

  it("touchCancel у середині drag повертає offset у 0 та не викликає action", () => {
    const onSwipeLeft = vi.fn();
    const { container } = render(
      <SwipeToAction onSwipeLeft={onSwipeLeft}>
        <div>tx</div>
      </SwipeToAction>,
    );
    const target = getTouchTarget(container);

    fireEvent.touchStart(target, { touches: touches(200, 50) });
    fireEvent.touchMove(target, { touches: touches(120, 50) }); // dx = -80
    fireEvent.touchCancel(target);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(target.getAttribute("style") || "").toMatch(/translateX\(0px\)/);
  });

  it("swipe у напрямку без хендлера (onSwipeLeft відсутній) не фризить offset", () => {
    const onSwipeRight = vi.fn();
    const { container } = render(
      <SwipeToAction onSwipeRight={onSwipeRight}>
        <div>tx</div>
      </SwipeToAction>,
    );
    const target = getTouchTarget(container);

    fireEvent.touchStart(target, { touches: touches(200, 50) });
    fireEvent.touchMove(target, { touches: touches(100, 50) }); // вліво
    fireEvent.touchEnd(target);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSwipeRight).not.toHaveBeenCalled();
    expect(target.getAttribute("style") || "").toMatch(/translateX\(0px\)/);
  });

  it("правий свайп за threshold викликає onSwipeRight", () => {
    const onSwipeRight = vi.fn();
    const { container } = render(
      <SwipeToAction onSwipeRight={onSwipeRight}>
        <div>tx</div>
      </SwipeToAction>,
    );
    const target = getTouchTarget(container);

    fireEvent.touchStart(target, { touches: touches(100, 50) });
    fireEvent.touchMove(target, { touches: touches(190, 50) });
    fireEvent.touchEnd(target);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it("показує first-use hint із кастомним текстом і ховає його таймером", () => {
    const { queryByText } = render(
      <SwipeToAction onSwipeLeft={vi.fn()} showHint hintText="Потягни картку">
        <div>tx</div>
      </SwipeToAction>,
    );

    expect(queryByText("Потягни картку")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(queryByText("Потягни картку")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(queryByText("Потягни картку")).toBeNull();
  });
});
