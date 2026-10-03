/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "./Tooltip";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * Tooltip звіряє `:focus-visible` на елементі, що отримав фокус. Евристика
 * `:focus-visible` у jsdom залежить від стану (попередні фокуси й клавіші),
 * тож тести підміняють відповідь `matches` детерміновано й лише тоді
 * справді фокусують елемент.
 *
 * - `keyboard` — Tab: браузер вважає фокус видимим.
 * - `pointer` — тап/клік і програмний restore після нього: не видимий.
 * - `unsupported` — рушій без `:focus-visible` кидає SyntaxError.
 */
function focusAs(
  el: HTMLElement,
  mode: "keyboard" | "pointer" | "unsupported",
) {
  const original = el.matches.bind(el);
  el.matches = ((selector: string) => {
    if (selector !== ":focus-visible") return original(selector);
    if (mode === "unsupported") {
      throw new SyntaxError(`'${selector}' is not a valid selector`);
    }
    return mode === "keyboard";
  }) as typeof el.matches;
  act(() => {
    el.focus();
  });
}

function keyboardFocus(el: HTMLElement) {
  focusAs(el, "keyboard");
}

function hoverMouse(el: HTMLElement) {
  fireEvent.pointerEnter(el, { pointerType: "mouse" });
}

/**
 * Contract tests for the Tooltip primitive. The panel is portaled to
 * document.body, so we use `screen.*` queries — they walk the full
 * document, whereas the render-returned helpers are scoped to the
 * RTL container.
 */
describe("Tooltip", () => {
  it("does not render the tooltip panel when closed", () => {
    render(
      <Tooltip content="Щоденний ліміт">
        <button type="button">Ліміт</button>
      </Tooltip>,
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on focus after the open delay and exposes aria-describedby", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Щоденний ліміт" openDelay={150}>
        <button type="button">Ліміт</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button") as HTMLButtonElement;

    keyboardFocus(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const panel = screen.getByRole("tooltip");
    expect(panel).not.toBeNull();
    expect(panel.textContent).toBe("Щоденний ліміт");
    expect(btn.getAttribute("aria-describedby")).toBe(panel.id);
  });

  it("opens on mouse pointerenter, closes on pointerleave", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Help" openDelay={100}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button") as HTMLButtonElement;

    hoverMouse(btn);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    fireEvent.pointerLeave(btn, { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  describe("touch / pointer-type guards", () => {
    it("does not open on a touch pointerenter (tap is not a hover)", () => {
      vi.useFakeTimers();
      render(
        <Tooltip content="Help" openDelay={50}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );
      const btn = screen.getByRole("button");

      fireEvent.pointerEnter(btn, { pointerType: "touch" });
      fireEvent.pointerEnter(btn, { pointerType: "pen" });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("ignores the compat mouseenter that iOS emits after a tap", () => {
      vi.useFakeTimers();
      render(
        <Tooltip content="Help" openDelay={50}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );
      const btn = screen.getByRole("button");

      // iOS: pointer-події touch, далі сумісні mouse-події без mouseleave.
      fireEvent.pointerEnter(btn, { pointerType: "touch" });
      fireEvent.pointerDown(btn, { pointerType: "touch" });
      fireEvent.mouseEnter(btn);
      fireEvent.mouseOver(btn);
      fireEvent.mouseDown(btn);
      fireEvent.click(btn);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("closes immediately on pointerdown on the trigger", () => {
      vi.useFakeTimers();
      render(
        <Tooltip content="Help" openDelay={50}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );
      const btn = screen.getByRole("button");

      hoverMouse(btn);
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(screen.queryByRole("tooltip")).not.toBeNull();

      fireEvent.pointerDown(btn, { pointerType: "mouse" });
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("pointerdown cancels a pending (not yet shown) open", () => {
      vi.useFakeTimers();
      render(
        <Tooltip content="Help" openDelay={100}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );
      const btn = screen.getByRole("button");

      hoverMouse(btn);
      act(() => {
        vi.advanceTimersByTime(40);
      });
      fireEvent.pointerDown(btn, { pointerType: "mouse" });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.queryByRole("tooltip")).toBeNull();
    });
  });

  describe("focus-visible gate", () => {
    it("does not open on focus that is not :focus-visible (tap / focus restore)", () => {
      vi.useFakeTimers();
      render(
        <Tooltip content="Help" openDelay={50}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );

      focusAs(screen.getByRole("button"), "pointer");
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("still opens on keyboard (:focus-visible) focus", () => {
      vi.useFakeTimers();
      render(
        <Tooltip content="Help" openDelay={50}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );

      keyboardFocus(screen.getByRole("button"));
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(screen.queryByRole("tooltip")).not.toBeNull();
    });

    it("falls back to opening when :focus-visible is unsupported (selector throws)", () => {
      vi.useFakeTimers();
      render(
        <Tooltip content="Help" openDelay={50}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );
      focusAs(screen.getByRole("button"), "unsupported");
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(screen.queryByRole("tooltip")).not.toBeNull();
    });

    it("opens on a real Tab focus (unmocked :focus-visible)", async () => {
      const user = userEvent.setup();
      render(
        <Tooltip content="Help" openDelay={0}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );

      await user.tab();
      expect(await screen.findByRole("tooltip")).toBeTruthy();
    });

    it("closes on blur", () => {
      vi.useFakeTimers();
      render(
        <Tooltip content="Help" openDelay={50}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );
      const btn = screen.getByRole("button") as HTMLButtonElement;

      keyboardFocus(btn);
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(screen.queryByRole("tooltip")).not.toBeNull();

      act(() => {
        btn.blur();
      });
      expect(screen.queryByRole("tooltip")).toBeNull();
    });
  });

  it("closes on Escape key from the trigger", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Help" openDelay={50}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button") as HTMLButtonElement;

    keyboardFocus(btn);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    fireEvent.keyDown(btn, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("closes on outside mousedown", () => {
    vi.useFakeTimers();
    render(
      <div>
        <Tooltip content="Help" openDelay={50}>
          <button type="button">Trigger</button>
        </Tooltip>
        <button type="button" data-testid="outside">
          Outside
        </button>
      </div>,
    );
    keyboardFocus(screen.getByText("Trigger"));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not open when disabled=true", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Help" disabled openDelay={50}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    keyboardFocus(screen.getByRole("button"));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("preserves trigger's existing onClick / onKeyDown handlers", () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn();
    render(
      <Tooltip content="Help">
        <button type="button" onClick={onClick} onKeyDown={onKeyDown}>
          Trigger
        </button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button") as HTMLButtonElement;
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it("size='md' applies larger padding + body-typescale classes", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Detail" size="md" openDelay={0}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    keyboardFocus(screen.getByRole("button"));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    const panel = screen.getByRole("tooltip");
    expect(panel.className).toContain("text-style-body");
    expect(panel.className).toContain("px-3");
    expect(panel.className).toContain("py-2");
  });

  it("accepts legacy `top-center` placement as an alias", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Help" placement="top-center" openDelay={0}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    keyboardFocus(screen.getByRole("button"));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });
});
