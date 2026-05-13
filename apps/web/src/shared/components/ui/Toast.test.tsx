/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { ToastContainer } from "./Toast";

/**
 * Тестова обгортка — рендерить `<ToastContainer>` всередині `<ToastProvider>`
 * і exposes `useToast()` API через `apiRef` так, щоб тести могли стрілятися
 * toast-ами через `act(() => api.show(...))` без додаткового UI.
 */
function renderHarness(): {
  api: ReturnType<typeof useToast>;
} {
  const apiRef: { current: ReturnType<typeof useToast> | null } = {
    current: null,
  };
  function ApiBridge() {
    const api = useToast();
    apiRef.current = api;
    return null;
  }
  render(
    <ToastProvider>
      <ApiBridge />
      <ToastContainer />
    </ToastProvider>,
  );
  if (!apiRef.current) throw new Error("ApiBridge not mounted");
  return { api: apiRef.current };
}

function touches(x: number, y = 0) {
  return [{ clientX: x, clientY: y }] as unknown as TouchList;
}

function getToastRoot(): HTMLElement {
  const el = document.querySelector<HTMLElement>("[data-toast-id]");
  if (!el) throw new Error("Toast row not rendered");
  return el;
}

describe("Toast — a11y", () => {
  beforeEach(() => {
    navigator.vibrate = vi.fn();
  });

  it("info-toast має role=status + aria-live=polite", () => {
    const { api } = renderHarness();
    act(() => {
      api.info("Інфо");
    });
    const row = getToastRoot();
    expect(row.getAttribute("role")).toBe("status");
    expect(row.getAttribute("aria-live")).toBe("polite");
  });

  it("error-toast має role=alert + aria-live=assertive", () => {
    const { api } = renderHarness();
    act(() => {
      api.error("Помилка");
    });
    const row = getToastRoot();
    expect(row.getAttribute("role")).toBe("alert");
    expect(row.getAttribute("aria-live")).toBe("assertive");
  });

  it("toast з undo-action (через showUndoToast) — assertive", () => {
    // 5-секундне undo-вікно мусить бути проголошене screen reader-ом одразу,
    // а не чекати, поки polite-queue звільниться (інакше юзер не встигне).
    const { api } = renderHarness();
    act(() => {
      showUndoToast(api, { msg: "Видалено", onUndo: () => {} });
    });
    const row = getToastRoot();
    expect(row.getAttribute("role")).toBe("alert");
    expect(row.getAttribute("aria-live")).toBe("assertive");
  });

  it("Esc на focused toast викликає dismiss", () => {
    vi.useFakeTimers();
    try {
      const { api } = renderHarness();
      act(() => {
        api.info("Інфо", 10_000);
      });
      const row = getToastRoot();
      fireEvent.keyDown(row, { key: "Escape" });
      // dismiss → 200 ms exit animation → remove from DOM
      act(() => {
        vi.advanceTimersByTime(220);
      });
      expect(document.querySelector("[data-toast-id]")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Toast — auto-dismiss pause/resume", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigator.vibrate = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hover паузить auto-dismiss; mouseleave продовжує таймер з остачі", () => {
    const { api } = renderHarness();
    act(() => {
      api.info("Pinned", 2000);
    });
    const row = getToastRoot();

    // Лишаємо таймеру повчитися 500 ms — після pause очікуємо ~1500 ms remaining.
    act(() => {
      vi.advanceTimersByTime(500);
    });

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(5000); // hover тримає → ніяких dismiss-ів
    });
    expect(document.querySelector("[data-toast-id]")).not.toBeNull();

    fireEvent.mouseLeave(row);
    // Після resume чекаємо ~1500 ms перед natural dismiss.
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(document.querySelector("[data-toast-id]")).not.toBeNull();
    act(() => {
      // 1500 ms remaining повністю минулі + 200 ms exit animation.
      vi.advanceTimersByTime(2 + 220);
    });
    expect(document.querySelector("[data-toast-id]")).toBeNull();
  });

  it("focus паузить таймер так само як hover", () => {
    const { api } = renderHarness();
    act(() => {
      api.success("Saved", 1500);
    });
    const row = getToastRoot();

    fireEvent.focus(row);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(document.querySelector("[data-toast-id]")).not.toBeNull();
  });

  it("countdown-bar для undo-toast має animationDuration=5000ms і paused під час hover", () => {
    const { api } = renderHarness();
    act(() => {
      showUndoToast(api, { msg: "Видалено", onUndo: () => {} });
    });
    const row = getToastRoot();
    const bar = row.querySelector<HTMLElement>("[data-toast-countdown]");
    expect(bar).not.toBeNull();
    // Inline duration виставляється з `toast.duration` (5000ms default
    // для undo-toast — спадає з @sergeant/shared).
    expect(bar?.style.animationDuration).toBe("5000ms");
    expect(bar?.getAttribute("data-toast-paused")).toBe("false");

    fireEvent.mouseEnter(row);
    expect(bar?.getAttribute("data-toast-paused")).toBe("true");

    fireEvent.mouseLeave(row);
    expect(bar?.getAttribute("data-toast-paused")).toBe("false");
  });
});

describe("Toast — swipe-to-dismiss (touch-only)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigator.vibrate = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("горизонтальний swipe ≥ 64 px dismiss-ить toast", () => {
    const { api } = renderHarness();
    act(() => {
      api.info("Swipeable", 10_000);
    });
    const row = getToastRoot();

    fireEvent.touchStart(row, { touches: touches(200, 50) });
    fireEvent.touchMove(row, { touches: touches(300, 50) }); // dx = +100
    fireEvent.touchEnd(row);

    act(() => {
      vi.advanceTimersByTime(220); // exit animation
    });
    expect(document.querySelector("[data-toast-id]")).toBeNull();
  });

  it("undo-toast: swipe не викликає onUndo (=consume undo-window)", () => {
    // Це той самий ефект, як expired timeout — snapshot drop, не restore.
    const onUndo = vi.fn();
    const { api } = renderHarness();
    act(() => {
      showUndoToast(api, { msg: "Видалено", onUndo });
    });
    const row = getToastRoot();

    fireEvent.touchStart(row, { touches: touches(100, 50) });
    fireEvent.touchMove(row, { touches: touches(20, 50) }); // dx = -80
    fireEvent.touchEnd(row);

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(onUndo).not.toHaveBeenCalled();
    expect(document.querySelector("[data-toast-id]")).toBeNull();
  });

  it("короткий swipe < 64 px не dismiss-ить — toast лишається", () => {
    const { api } = renderHarness();
    act(() => {
      api.info("Sticky-ish", 10_000);
    });
    const row = getToastRoot();

    fireEvent.touchStart(row, { touches: touches(200, 50) });
    fireEvent.touchMove(row, { touches: touches(230, 50) }); // dx = +30
    fireEvent.touchEnd(row);

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(document.querySelector("[data-toast-id]")).not.toBeNull();
  });
});

describe("Toast — undo-action", () => {
  beforeEach(() => {
    navigator.vibrate = vi.fn();
  });

  it("клік на undo-кнопці викликає onUndo і dismiss-ить toast", () => {
    vi.useFakeTimers();
    try {
      const onUndo = vi.fn();
      const { api } = renderHarness();
      act(() => {
        showUndoToast(api, { msg: "Видалено", onUndo });
      });
      const button = screen.getByRole("button", { name: "Повернути" });
      fireEvent.click(button);
      expect(onUndo).toHaveBeenCalledTimes(1);
      act(() => {
        vi.advanceTimersByTime(220);
      });
      expect(document.querySelector("[data-toast-id]")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
