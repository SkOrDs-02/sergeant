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
});
