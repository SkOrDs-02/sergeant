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

  describe("петля «пан ↔ компенсація» (бета-фідбек №5)", () => {
    /** Оверлей зі скрол-контейнером усередині — як у `Sheet`. */
    function mountSheetLike(): {
      overlay: HTMLDivElement;
      body: HTMLDivElement;
      input: HTMLInputElement;
    } {
      const overlay = document.createElement("div");
      const body = document.createElement("div");
      const input = document.createElement("input");
      body.appendChild(input);
      overlay.appendChild(body);
      document.body.appendChild(overlay);
      return { overlay, body, input };
    }

    /** jsdom не рахує layout — підставляємо геометрію поля самі. */
    function setRect(el: HTMLElement, top: number, height: number): void {
      el.getBoundingClientRect = () =>
        ({
          top,
          bottom: top + height,
          height,
          left: 0,
          right: 320,
          width: 320,
          x: 0,
          y: top,
          toJSON: () => ({}),
        }) as DOMRect;
    }

    it("на пан дає полю просвіт скролом контейнера — рівно раз на серію", () => {
      const { overlay, input } = mountSheetLike();
      const vv = installVisualViewport(500); // гап 300 → клавіатура
      input.focus();
      setRect(input, 430, 44); // поле видно, але притиснуте до низу
      renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));

      const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
      scrollIntoView.mockClear();

      act(() => {
        vv.offsetTop = 12; // WebKit просить просвіт
        vv._fire("scroll");
      });
      expect(overlay.style.transform).toBe("translate3d(0, 12px, 0)");
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });

      // Наступні кадри тієї ж серії реваншу не повторюють — інакше
      // тремтіння просто змінилось би на скрол-шторм.
      act(() => {
        vv.offsetTop = 24;
        vv._fire("scroll");
      });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      // Пан упав до нуля — петля обірвалась, реванш знову озброєний.
      act(() => {
        vv.offsetTop = 0;
        vv._fire("scroll");
      });
      act(() => {
        vv.offsetTop = 16;
        vv._fire("scroll");
      });
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
    });

    it("не тягне назад поле, яке користувач відкрутив із видимої зони", () => {
      // Це перший симптом зі звіту тестерки — «не можу проскролити
      // нижче, щоб обрати категорію». Компенсацію пану лишаємо, скрол — ні.
      const { overlay, input } = mountSheetLike();
      const vv = installVisualViewport(500);
      input.focus();
      setRect(input, 620, 44); // повністю під клавіатурою
      renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));

      const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
      scrollIntoView.mockClear();
      act(() => {
        vv.offsetTop = 12;
        vv._fire("scroll");
      });
      expect(overlay.style.transform).toBe("translate3d(0, 12px, 0)");
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it("скрол пальцем, що ховає поле, відпускає клавіатуру", () => {
      const { overlay, body, input } = mountSheetLike();
      installVisualViewport(500);
      input.focus();
      setRect(input, 620, 44); // від'їхало під клавіатуру
      renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));
      const blur = vi.spyOn(input, "blur");

      act(() => {
        overlay.dispatchEvent(new Event("touchmove"));
        body.dispatchEvent(new Event("scroll")); // `scroll` не спливає
      });
      expect(blur).toHaveBeenCalled();
    });

    it("не чіпає фокус, поки поле ще видно", () => {
      const { overlay, body, input } = mountSheetLike();
      installVisualViewport(500);
      input.focus();
      setRect(input, 430, 44);
      renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));
      const blur = vi.spyOn(input, "blur");

      act(() => {
        overlay.dispatchEvent(new Event("touchmove"));
        body.dispatchEvent(new Event("scroll"));
      });
      expect(blur).not.toHaveBeenCalled();
    });

    it("не відпускає клавіатуру на скролі без дотику (клац верстки)", () => {
      // Стискання панелі під клавіатуру саме совгає скрол-контейнер;
      // якби ми рахували це жестом, клавіатура закривалась би одразу
      // після відкриття.
      const { overlay, body, input } = mountSheetLike();
      installVisualViewport(500);
      input.focus();
      setRect(input, 620, 44);
      renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));
      const blur = vi.spyOn(input, "blur");

      act(() => {
        body.dispatchEvent(new Event("scroll"));
      });
      expect(blur).not.toHaveBeenCalled();
    });

    it("не відпускає клавіатуру на власному доскролі", () => {
      // `focusin` → наш `scrollIntoView` → скрол-подія від нього ж.
      // Приймати її за жест не можна: поле щойно перевели у фокус.
      const { overlay, body, input } = mountSheetLike();
      const second = document.createElement("input");
      body.appendChild(second);
      installVisualViewport(500);
      input.focus();
      renderHook(() => useKeyboardAwareOverlay(true, { current: overlay }));
      const blur = vi.spyOn(second, "blur");

      act(() => {
        overlay.dispatchEvent(new Event("touchmove"));
        second.focus();
        setRect(second, 620, 44); // ще не доскролилось
        body.dispatchEvent(new Event("scroll"));
      });
      expect(blur).not.toHaveBeenCalled();
    });

    it("знімає слухачі скролу й дотику при розмонтуванні", () => {
      const { overlay, body, input } = mountSheetLike();
      installVisualViewport(500);
      input.focus();
      setRect(input, 620, 44);
      const { unmount } = renderHook(() =>
        useKeyboardAwareOverlay(true, { current: overlay }),
      );
      const blur = vi.spyOn(input, "blur");
      unmount();

      act(() => {
        overlay.dispatchEvent(new Event("touchmove"));
        body.dispatchEvent(new Event("scroll"));
      });
      expect(blur).not.toHaveBeenCalled();
    });
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
