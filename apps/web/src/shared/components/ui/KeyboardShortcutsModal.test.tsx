/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  renderHook,
  act,
} from "@testing-library/react";
import {
  useKeyboardShortcutsModal,
  type KeyboardShortcut,
} from "./KeyboardShortcutsModal";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModalUI";

afterEach(cleanup);

describe("KeyboardShortcutsModal (UI)", () => {
  it("renders nothing when closed", () => {
    render(<KeyboardShortcutsModal open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the dialog with title and default shortcuts grouped by category", () => {
    render(<KeyboardShortcutsModal open onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Комбінації клавіш")).toBeInTheDocument();
    // Category headings from DEFAULT_SHORTCUTS.
    expect(screen.getByText("Загальні")).toBeInTheDocument();
    expect(screen.getByText("Навігація")).toBeInTheDocument();
    expect(screen.getByText("Дії")).toBeInTheDocument();
  });

  it("close button and backdrop both call onClose", () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsModal open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Закрити" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Закрити модальне вікно" }),
    );
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders custom shortcuts passed via props", () => {
    const shortcuts: KeyboardShortcut[] = [
      { keys: ["X"], description: "Зробити щось", category: "Тест" },
    ];
    render(
      <KeyboardShortcutsModal open onClose={() => {}} shortcuts={shortcuts} />,
    );
    expect(screen.getByText("Зробити щось")).toBeInTheDocument();
    expect(screen.getByText("Тест")).toBeInTheDocument();
  });

  it("groups shortcuts with no category under 'Інше'", () => {
    render(
      <KeyboardShortcutsModal
        open
        onClose={() => {}}
        shortcuts={[{ keys: ["Z"], description: "No category" }]}
      />,
    );
    expect(screen.getByText("Інше")).toBeInTheDocument();
  });
});

describe("useKeyboardShortcutsModal", () => {
  it("toggles open on '?' keydown and closes via onClose", () => {
    const { result } = renderHook(() => useKeyboardShortcutsModal());
    expect(result.current.open).toBe(false);
    act(() => {
      fireEvent.keyDown(document, { key: "?" });
    });
    expect(result.current.open).toBe(true);
    act(() => result.current.onClose());
    expect(result.current.open).toBe(false);
  });

  it("ignores '?' while typing in an input", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const { result } = renderHook(() => useKeyboardShortcutsModal());
    act(() => {
      fireEvent.keyDown(input, { key: "?" });
    });
    expect(result.current.open).toBe(false);
    input.remove();
  });

  it("ignores '?' combined with a modifier", () => {
    const { result } = renderHook(() => useKeyboardShortcutsModal());
    act(() => {
      fireEvent.keyDown(document, { key: "?", metaKey: true });
    });
    expect(result.current.open).toBe(false);
  });
});
