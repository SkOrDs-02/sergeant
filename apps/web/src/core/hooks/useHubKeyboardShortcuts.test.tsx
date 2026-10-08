/** @vitest-environment jsdom */
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHubKeyboardShortcuts } from "./useHubKeyboardShortcuts";

describe("useHubKeyboardShortcuts", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("opens Hub Search on Ctrl+K", () => {
    const onOpenSearch = vi.fn();
    const onOpenShortcuts = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({ onOpenSearch, onOpenShortcuts }),
    );

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(onOpenSearch).toHaveBeenCalledTimes(1);
    expect(onOpenShortcuts).not.toHaveBeenCalled();
  });

  it("opens keyboard shortcuts on ?", () => {
    const onOpenSearch = vi.fn();
    const onOpenShortcuts = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({ onOpenSearch, onOpenShortcuts }),
    );

    fireEvent.keyDown(window, { key: "?", shiftKey: true });

    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).not.toHaveBeenCalled();
  });

  it("does not steal shortcuts from editable fields", () => {
    const onOpenSearch = vi.fn();
    const onOpenShortcuts = vi.fn();
    const input = document.createElement("input");
    document.body.append(input);
    renderHook(() =>
      useHubKeyboardShortcuts({ onOpenSearch, onOpenShortcuts }),
    );

    fireEvent.keyDown(input, { key: "k", ctrlKey: true });
    fireEvent.keyDown(input, { key: "?", shiftKey: true });

    expect(onOpenSearch).not.toHaveBeenCalled();
    expect(onOpenShortcuts).not.toHaveBeenCalled();
  });

  // ── Cmd+/ — AI assistant drawer ────────────────────────────────────────────

  it("opens AI assistant on Cmd+/", () => {
    const onOpenSearch = vi.fn();
    const onOpenShortcuts = vi.fn();
    const onOpenAssistant = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch,
        onOpenShortcuts,
        onOpenAssistant,
      }),
    );

    fireEvent.keyDown(window, { key: "/", metaKey: true });

    expect(onOpenAssistant).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).not.toHaveBeenCalled();
  });

  it("opens AI assistant on Ctrl+/ (non-Mac)", () => {
    const onOpenSearch = vi.fn();
    const onOpenShortcuts = vi.fn();
    const onOpenAssistant = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch,
        onOpenShortcuts,
        onOpenAssistant,
      }),
    );

    fireEvent.keyDown(window, { key: "/", ctrlKey: true });

    expect(onOpenAssistant).toHaveBeenCalledTimes(1);
  });

  it("does not open AI assistant from editable field", () => {
    const onOpenAssistant = vi.fn();
    const input = document.createElement("input");
    document.body.append(input);
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onOpenAssistant,
      }),
    );

    fireEvent.keyDown(input, { key: "/", metaKey: true });

    expect(onOpenAssistant).not.toHaveBeenCalled();
  });

  it("is a no-op when onOpenAssistant is not provided", () => {
    // Should not throw even if the callback is not provided.
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
      }),
    );
    expect(() =>
      fireEvent.keyDown(window, { key: "/", metaKey: true }),
    ).not.toThrow();
  });

  it("on the /chat page Cmd+/ focuses the chat input instead of opening the overlay", () => {
    const onOpenAssistant = vi.fn();
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Повідомлення Сержанту");
    document.body.appendChild(input);
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onOpenAssistant,
        assistantPageActive: true,
      }),
    );

    fireEvent.keyDown(window, { key: "/", metaKey: true });

    expect(onOpenAssistant).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  // ── Cmd+S — context-aware save (R6) ────────────────────────────────────────

  it("Cmd+S calls requestSubmit on nearest form when focus is inside a form", () => {
    const form = document.createElement("form");
    const input = document.createElement("input");
    form.append(input);
    document.body.append(form);
    const requestSubmit = vi
      .spyOn(form, "requestSubmit")
      .mockImplementation(() => {});

    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
      }),
    );

    fireEvent.keyDown(input, { key: "s", metaKey: true });

    // requestSubmit not called — isEditableTarget guard prevents action
    // for INPUT elements even inside a form.
    expect(requestSubmit).not.toHaveBeenCalled();
  });

  it("Cmd+S on a non-editable element inside a form submits the form", () => {
    const form = document.createElement("form");
    const div = document.createElement("div");
    form.append(div);
    document.body.append(form);
    const requestSubmit = vi
      .spyOn(form, "requestSubmit")
      .mockImplementation(() => {});

    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
      }),
    );

    fireEvent.keyDown(div, { key: "s", metaKey: true });

    expect(requestSubmit).toHaveBeenCalledTimes(1);
  });

  it("Cmd+S outside a form does not call any action (no-op, browser default preserved)", () => {
    const div = document.createElement("div");
    document.body.append(div);

    const onOpenSearch = vi.fn();
    const onOpenShortcuts = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({ onOpenSearch, onOpenShortcuts }),
    );

    const event = new KeyboardEvent("keydown", {
      key: "s",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    // We check that preventDefault was NOT called for out-of-form context.
    let defaultPrevented = false;
    event.preventDefault = () => {
      defaultPrevented = true;
    };
    div.dispatchEvent(event);

    expect(defaultPrevented).toBe(false);
    expect(onOpenSearch).not.toHaveBeenCalled();
    expect(onOpenShortcuts).not.toHaveBeenCalled();
  });

  // ── G+<letter> navigation chord ────────────────────────────────────────────

  it("G+H navigates to hub", () => {
    const onNavigate = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onNavigate,
      }),
    );

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "h" });

    expect(onNavigate).toHaveBeenCalledWith("hub");
  });

  it("G+F navigates to finyk", () => {
    const onNavigate = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onNavigate,
      }),
    );

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "f" });

    expect(onNavigate).toHaveBeenCalledWith("finyk");
  });

  it("G+Z navigates to fizruk", () => {
    const onNavigate = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onNavigate,
      }),
    );

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "z" });

    expect(onNavigate).toHaveBeenCalledWith("fizruk");
  });

  it("G+R navigates to routine", () => {
    const onNavigate = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onNavigate,
      }),
    );

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "r" });

    expect(onNavigate).toHaveBeenCalledWith("routine");
  });

  it("G+N navigates to nutrition", () => {
    const onNavigate = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onNavigate,
      }),
    );

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "n" });

    expect(onNavigate).toHaveBeenCalledWith("nutrition");
  });

  it("G+<unknown> does not call onNavigate", () => {
    const onNavigate = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onNavigate,
      }),
    );

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "x" }); // not in map

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("G chord does not fire from editable field for first key", () => {
    const onNavigate = vi.fn();
    const input = document.createElement("input");
    document.body.append(input);
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onNavigate,
      }),
    );

    fireEvent.keyDown(input, { key: "g" });
    fireEvent.keyDown(window, { key: "h" });

    // G was in an input, no chord should have started
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("G chord expires after timeout without firing", () => {
    vi.useFakeTimers();
    const onNavigate = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onNavigate,
      }),
    );

    fireEvent.keyDown(window, { key: "g" });
    // Advance past the 1 s window
    vi.advanceTimersByTime(1100);
    fireEvent.keyDown(window, { key: "h" });

    expect(onNavigate).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("is a no-op when onNavigate is not provided", () => {
    // Should not throw.
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
      }),
    );
    expect(() => {
      fireEvent.keyDown(window, { key: "g" });
      fireEvent.keyDown(window, { key: "h" });
    }).not.toThrow();
  });

  // ── N — «створити» в поточному контексті (рішення власника 2026-09-16) ──

  it("N calls onCreate and swallows the key", () => {
    const onCreate = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onCreate,
      }),
    );
    const event = new KeyboardEvent("keydown", {
      key: "n",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("N does not fire from an editable field nor with Cmd/Alt held", () => {
    const onCreate = vi.fn();
    const input = document.createElement("input");
    document.body.append(input);
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onCreate,
      }),
    );
    fireEvent.keyDown(input, { key: "n" });
    fireEvent.keyDown(window, { key: "n", metaKey: true });
    fireEvent.keyDown(window, { key: "n", altKey: true });
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("G N stays a navigation chord — onCreate is not called for the second key", () => {
    const onCreate = vi.fn();
    const onNavigate = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onNavigate,
        onCreate,
      }),
    );
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "n" });
    expect(onNavigate).toHaveBeenCalledWith("nutrition");
    expect(onCreate).not.toHaveBeenCalled();
  });

  // ── Cmd/Ctrl+Z — «Повернути» з видимого undo-тоста ────────────────────────

  it("Cmd+Z calls onUndo and prevents the browser default only when something was undone", () => {
    const onUndo = vi.fn<() => boolean>().mockReturnValueOnce(true);
    onUndo.mockReturnValueOnce(false);
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onUndo,
      }),
    );
    const first = new KeyboardEvent("keydown", {
      key: "z",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(first);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true);

    const second = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(second);
    expect(onUndo).toHaveBeenCalledTimes(2);
    expect(second.defaultPrevented).toBe(false);
  });

  it("Cmd+Z leaves text fields and Cmd+Shift+Z (redo) to the browser", () => {
    const onUndo = vi.fn<() => boolean>().mockReturnValue(true);
    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    renderHook(() =>
      useHubKeyboardShortcuts({
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onUndo,
      }),
    );
    fireEvent.keyDown(textarea, { key: "z", metaKey: true });
    fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });
    expect(onUndo).not.toHaveBeenCalled();
  });

  // ── sec-13 / priv-15: під замком застосунку клавіші не працюють ───────────

  describe("disabled (App Lock)", () => {
    const setup = (disabled: boolean) => {
      const handlers = {
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onOpenAssistant: vi.fn(),
        onNavigate: vi.fn(),
        onCreate: vi.fn(),
        onUndo: vi.fn<() => boolean>().mockReturnValue(true),
      };
      renderHook(() => useHubKeyboardShortcuts({ ...handlers, disabled }));
      return handlers;
    };

    const press = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      window.dispatchEvent(event);
      return event;
    };

    it("Ctrl+K, ?, Ctrl+/, N, Cmd+Z and G-chords call nothing and are not prevented", () => {
      const h = setup(true);
      // Фокус на кнопці (не поле вводу) — саме так обходили замок.
      const button = document.createElement("button");
      document.body.append(button);
      button.focus();

      const events = [
        press({ key: "k", ctrlKey: true }),
        press({ key: "?", shiftKey: true }),
        press({ key: "/", ctrlKey: true }),
        press({ key: "n" }),
        press({ key: "z", metaKey: true }),
        press({ key: "g" }),
        press({ key: "f" }),
      ];

      expect(h.onOpenSearch).not.toHaveBeenCalled();
      expect(h.onOpenShortcuts).not.toHaveBeenCalled();
      expect(h.onOpenAssistant).not.toHaveBeenCalled();
      expect(h.onNavigate).not.toHaveBeenCalled();
      expect(h.onCreate).not.toHaveBeenCalled();
      expect(h.onUndo).not.toHaveBeenCalled();
      for (const e of events) expect(e.defaultPrevented).toBe(false);
    });

    it("the same keys work once disabled is false (control)", () => {
      const h = setup(false);
      press({ key: "k", ctrlKey: true });
      press({ key: "?", shiftKey: true });
      press({ key: "/", ctrlKey: true });
      press({ key: "g" });
      press({ key: "f" });
      expect(h.onOpenSearch).toHaveBeenCalledTimes(1);
      expect(h.onOpenShortcuts).toHaveBeenCalledTimes(1);
      expect(h.onOpenAssistant).toHaveBeenCalledTimes(1);
      expect(h.onNavigate).toHaveBeenCalledWith("finyk");
    });

    it("a G pressed before the lock does not complete its chord after locking", () => {
      const handlers = {
        onOpenSearch: vi.fn(),
        onOpenShortcuts: vi.fn(),
        onNavigate: vi.fn(),
      };
      const { rerender } = renderHook(
        ({ disabled }) => useHubKeyboardShortcuts({ ...handlers, disabled }),
        { initialProps: { disabled: false } },
      );
      press({ key: "g" });
      rerender({ disabled: true });
      press({ key: "f" });
      rerender({ disabled: false });
      press({ key: "f" });
      expect(handlers.onNavigate).not.toHaveBeenCalled();
    });
  });
});
