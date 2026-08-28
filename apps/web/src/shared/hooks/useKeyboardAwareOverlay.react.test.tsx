// @vitest-environment jsdom
/**
 * Last validated: 2026-08-16
 * Status: Active
 *
 * Регресійні тести на найкрихкіше місце `useKeyboardAwareOverlay`:
 * компенсуючий `transform` пишеться в DOM **повз React**, а React на
 * тому самому вузлі керує атрибутом `style`. Тримається це на тому, що
 * React патчить лише ті властивості, які змінились між рендерами, і не
 * чіпає `transform`, якого немає в жодному з двох style-обʼєктів.
 *
 * Це не декларована гарантія, а деталь реалізації react-dom — тож вона
 * має бути під тестом. Якщо React колись почне переписувати `style`
 * цілком (або хтось додасть `transform` у style-проп цих оверлеїв),
 * компенсація почне зникати на кожному ре-рендері, а баг повернеться
 * рівно у вигляді «аркуш підскакує вгору» зі звіту тестера 2026-08-16.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useRef, useState, type CSSProperties } from "react";
import { useKeyboardAwareOverlay } from "./useKeyboardAwareOverlay";
import { Sheet } from "../components/ui/Sheet";

const listeners: Record<string, Array<() => void>> = {};

function installVisualViewport(height: number) {
  const vv = {
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

/** Мінімальна копія call-site: fixed-оверлей із полем і мінливим `style`. */
function Overlay({ extraStyle }: { extraStyle: CSSProperties }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={overlayRef}
      data-testid="overlay"
      style={{ zIndex: 200, ...extraStyle }}
    >
      <input data-testid="field" />
      <KeyboardAnchor overlayRef={overlayRef} />
    </div>
  );
}

function KeyboardAnchor({
  overlayRef,
}: {
  overlayRef: React.RefObject<HTMLDivElement | null>;
}) {
  useKeyboardAwareOverlay(true, overlayRef);
  return null;
}

describe("useKeyboardAwareOverlay × React re-render", () => {
  beforeEach(() => {
    for (const key of Object.keys(listeners)) delete listeners[key];
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    vi.restoreAllMocks();
  });

  it("не втрачає компенсацію, коли React перезаписує інший inline-стиль", () => {
    const vv = installVisualViewport(500);

    function Harness() {
      const [pad, setPad] = useState(0);
      return (
        <>
          <button data-testid="bump" onClick={() => setPad(300)}>
            bump
          </button>
          <Overlay extraStyle={{ paddingBottom: pad }} />
        </>
      );
    }

    const { getByTestId } = render(<Harness />);
    act(() => {
      (getByTestId("field") as HTMLInputElement).focus();
    });
    act(() => {
      vv.offsetTop = 52;
      vv._fire("scroll");
    });

    const overlay = getByTestId("overlay");
    expect(overlay.style.transform).toBe("translate3d(0, 52px, 0)");

    // Саме те, що робить keyboard-інсет на реальних call-site-ах:
    // `paddingBottom` контейнера змінюється, коли відкривається клавіатура.
    act(() => {
      (getByTestId("bump") as HTMLButtonElement).click();
    });
    expect(overlay.style.paddingBottom).toBe("300px");
    expect(overlay.style.transform).toBe("translate3d(0, 52px, 0)");
  });

  it("Sheet: компенсація переживає ре-рендер аркуша", () => {
    const vv = installVisualViewport(500);

    function Harness() {
      const [n, setN] = useState(0);
      return (
        <Sheet open onClose={() => {}} title={`Витрата ${n}`}>
          <input data-testid="amount" />
          <button data-testid="rerender" onClick={() => setN((v) => v + 1)}>
            rerender
          </button>
        </Sheet>
      );
    }

    const { getByTestId } = render(<Harness />);
    act(() => {
      (getByTestId("amount") as HTMLInputElement).focus();
    });
    const overlay = document.querySelector<HTMLElement>("div.fixed.inset-0");
    expect(overlay).not.toBeNull();

    act(() => {
      vv.offsetTop = 52;
      vv._fire("scroll");
    });
    expect(overlay?.style.transform).toBe("translate3d(0, 52px, 0)");

    act(() => {
      (getByTestId("rerender") as HTMLButtonElement).click();
    });
    expect(overlay?.style.transform).toBe("translate3d(0, 52px, 0)");
  });
});
