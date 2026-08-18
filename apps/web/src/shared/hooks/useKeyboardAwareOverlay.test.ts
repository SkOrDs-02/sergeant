// @vitest-environment jsdom
/**
 * Last validated: 2026-08-16
 * Status: Active
 *
 * Tests for `useKeyboardAwareOverlay` — компенсація iOS-пану visual
 * viewport під софт-клавіатуру + утримання сфокусованого поля у
 * видимій зоні аркуша.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardAwareOverlay } from "./useKeyboardAwareOverlay";

interface FakeVV {
  height: number;
  offsetTop: number;
  scale: number;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  _fire: (type: string) => void;
}

function installVisualViewport(height: number): FakeVV {
  const listeners: Record<string, Array<() => void>> = {};
  const vv: FakeVV = {
    height,
    offsetTop: 0,
    scale: 1,
    addEventListener: vi.fn((type: string, cb: () => void) => {
      (listeners[type] ??= []).push(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter((fn) => fn !== cb);
    }),
    _fire: (type: string) => {
      for (const cb of [...(listeners[type] ?? [])]) cb();
    },
  };
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    writable: true,
    value: vv,
  });
  return vv;
}

/** Оверлей + поле всередині — мінімальна копія структури `Sheet`. */
function mountOverlay(): { overlay: HTMLDivElement; input: HTMLInputElement } {
  const overlay = document.createElement("div");
  const input = document.createElement("input");
  overlay.appendChild(input);
  document.body.appendChild(overlay);
  return { overlay, input };
}

describe("useKeyboardAwareOverlay", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });
    // jsdom не реалізує `scrollIntoView`.
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("компенсує пан visual viewport трансформом на оверлеї", () => {
    const { overlay, input } = mountOverlay();
    const vv = installVisualViewport(500); // гап 300 → клавіатура
    input.focus();
    const ref = { current: overlay };
    renderHook(() => useKeyboardAwareOverlay(true, ref));
    expect(overlay.style.transform).toBe("");

    act(() => {
      vv.offsetTop = 52;
      vv._fire("scroll");
    });
    expect(overlay.style.transform).toBe("translate3d(0, 52px, 0)");
  });

  it("знімає компенсацію, коли пан повертається в нуль", () => {
    const { overlay, input } = mountOverlay();
    const vv = installVisualViewport(500);
    input.focus();
    renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));

    act(() => {
      vv.offsetTop = 52;
      vv._fire("scroll");
    });
    act(() => {
      vv.offsetTop = 0;
      vv._fire("scroll");
    });
    expect(overlay.style.transform).toBe("");
  });

  it("не чіпає пан без клавіатури — гап замалий (browser chrome)", () => {
    const { overlay, input } = mountOverlay();
    const vv = installVisualViewport(760); // гап 40 ≤ 56
    input.focus();
    renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));

    act(() => {
      vv.offsetTop = 40;
      vv._fire("scroll");
    });
    expect(overlay.style.transform).toBe("");
  });

  it("не чіпає пан від pinch-zoom — це свідома дія людини", () => {
    const { overlay, input } = mountOverlay();
    const vv = installVisualViewport(500);
    input.focus();
    renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));

    act(() => {
      vv.scale = 2.5;
      vv.offsetTop = 120;
      vv._fire("scroll");
    });
    expect(overlay.style.transform).toBe("");
  });

  it("підтягує щойно сфокусоване поле, коли клавіатура вже відкрита", () => {
    const { overlay, input } = mountOverlay();
    const second = document.createElement("input");
    overlay.appendChild(second);
    installVisualViewport(500);
    input.focus(); // клавіатура вже піднята першим полем
    renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));

    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    scrollIntoView.mockClear();
    act(() => {
      second.focus();
    });
    // `center`, не `nearest` — запас з обох боків, щоб дожимання
    // геометрії не ховало поле знову (бета-фідбек №4).
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("доскролює активне поле після того, як resize-и клавіатури вщухли", () => {
    // Бета-фідбек №4: перший скрол їде по геометрії ще ДО стискання
    // панелі — доскрол по фінальній геометрії робить таймер тиші після
    // останнього `resize`.
    vi.useFakeTimers();
    try {
      const { overlay, input } = mountOverlay();
      const vv = installVisualViewport(800); // клавіатури ще немає
      input.focus();
      renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));

      const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
      scrollIntoView.mockClear();
      act(() => {
        vv.height = 520; // transition почався
        vv._fire("resize");
      });
      act(() => {
        vi.advanceTimersByTime(100); // менше за таймер тиші (150)
        vv.height = 500; // другий resize того ж transition-у
        vv._fire("resize");
      });
      // Другий resize СКИНУВ таймер першого: на t=200 від першого (тобто
      // 100 від другого) скролу ще немає — якби скидання не було, перший
      // таймер уже згорів би на t=150.
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(scrollIntoView).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(60); // 160 від другого — тиша настала
      });
      // Рівно ОДИН доскрол на весь transition, не по одному на resize.
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("НЕ доскролює після resize, якщо клавіатура закрилась (гап 0)", () => {
    vi.useFakeTimers();
    try {
      const { overlay, input } = mountOverlay();
      const vv = installVisualViewport(500); // клавіатура відкрита
      input.focus();
      renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));

      const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
      scrollIntoView.mockClear();
      act(() => {
        vv.height = 800; // клавіатура зникла — гап 0
        vv._fire("resize");
        vi.runAllTimers();
      });
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("не скролить поле під pinch-zoom — гап висот там неоднозначний", () => {
    // Зум стискає visual viewport так само, як клавіатура, тож гап сам
    // по собі каже «клавіатура» і під зумом теж. Смикати скрол-контейнер
    // під людиною, яка свідомо зазумила конкретне місце, не можна — той
    // самий мотив, що й у гейта компенсації пану.
    const { overlay, input } = mountOverlay();
    const second = document.createElement("input");
    overlay.appendChild(second);
    const vv = installVisualViewport(500);
    input.focus();
    renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));

    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    scrollIntoView.mockClear();
    act(() => {
      vv.scale = 2.5;
      second.focus();
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("не скролить нічого, поки клавіатури немає (це кейс H2-фолбека)", () => {
    const { overlay, input } = mountOverlay();
    installVisualViewport(800); // гап 0
    renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));

    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    scrollIntoView.mockClear();
    act(() => {
      input.focus();
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("не вішає слухачів, поки неактивний", () => {
    const { overlay } = mountOverlay();
    const vv = installVisualViewport(500);
    renderHook(() => useKeyboardAwareOverlay(false, { current: overlay }));
    expect(vv.addEventListener).not.toHaveBeenCalled();
  });

  it("знімає слухачів і трансформ при розмонтуванні", () => {
    const { overlay, input } = mountOverlay();
    const vv = installVisualViewport(500);
    input.focus();
    const { unmount } = renderHook(() =>
      useKeyboardAwareOverlay(true, { current: overlay }),
    );
    act(() => {
      vv.offsetTop = 52;
      vv._fire("scroll");
    });
    expect(overlay.style.transform).toBe("translate3d(0, 52px, 0)");

    unmount();
    expect(overlay.style.transform).toBe("");
    const listenedTypes = vv.removeEventListener.mock.calls.map((c) => c[0]);
    expect(listenedTypes).toEqual(
      expect.arrayContaining(["scroll", "resize"]) as unknown as string[],
    );
  });

  it("перераховує компенсацію і на `resize`, не лише на `scroll`", () => {
    // Клавіатура закривається без окремого `scroll`: тоді єдиний сигнал —
    // `resize`. Без цього слухача трансформ лишився б висіти назавжди.
    const { overlay, input } = mountOverlay();
    const vv = installVisualViewport(500);
    input.focus();
    renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));

    act(() => {
      vv.offsetTop = 52;
      vv._fire("scroll");
    });
    expect(overlay.style.transform).toBe("translate3d(0, 52px, 0)");

    act(() => {
      vv.height = 800; // гап 0 — клавіатура зникла
      vv._fire("resize");
    });
    expect(overlay.style.transform).toBe("");
  });

  it("є no-op без visualViewport", () => {
    const { overlay } = mountOverlay();
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(() =>
      renderHook(() => useKeyboardAwareOverlay(true, { current: overlay })),
    ).not.toThrow();
    expect(overlay.style.transform).toBe("");
  });
});
