/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  renderHook,
  act,
  waitFor,
} from "@testing-library/react";
import {
  useKeyboardShortcutsModal,
  useRegisterShortcuts,
  ShortcutRegistryContext,
  ShortcutRegistryProvider,
  type KeyboardShortcut,
} from "./KeyboardShortcutsModal";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModalUI";
import { useContext } from "react";

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

describe("ShortcutRegistryProvider + useRegisterShortcuts", () => {
  const moduleShortcuts: KeyboardShortcut[] = [
    { keys: ["G", "F"], description: "Перейти до Фініка", category: "Finyk" },
  ];

  function RegistryReader() {
    const registry = useContext(ShortcutRegistryContext);
    return (
      <div data-testid="registered-shortcuts">
        {registry
          ?.getAll()
          .map((shortcut) => shortcut.description)
          .join("|") ?? "none"}
      </div>
    );
  }

  function RegisteringProbe({
    id = "finyk",
    shortcuts = moduleShortcuts,
  }: {
    id?: string;
    shortcuts?: KeyboardShortcut[];
  }) {
    useRegisterShortcuts(id, shortcuts);
    return null;
  }

  it("registers module shortcuts and unregisters them on unmount", async () => {
    const { rerender } = render(
      <ShortcutRegistryProvider>
        <RegisteringProbe />
        <RegistryReader />
      </ShortcutRegistryProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("registered-shortcuts")).toHaveTextContent(
        "Перейти до Фініка",
      ),
    );

    rerender(
      <ShortcutRegistryProvider>
        <RegistryReader />
      </ShortcutRegistryProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("registered-shortcuts").textContent).toBe(""),
    );
  });

  it("updates a registration when the shortcut signature changes", async () => {
    const { rerender } = render(
      <ShortcutRegistryProvider>
        <RegisteringProbe shortcuts={moduleShortcuts} />
        <RegistryReader />
      </ShortcutRegistryProvider>,
    );

    rerender(
      <ShortcutRegistryProvider>
        <RegisteringProbe
          shortcuts={[
            {
              keys: ["G", "N"],
              description: "Перейти до харчування",
              category: "Nutrition",
            },
          ]}
        />
        <RegistryReader />
      </ShortcutRegistryProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("registered-shortcuts")).toHaveTextContent(
        "Перейти до харчування",
      ),
    );
  });

  it("is a no-op outside the provider and with empty shortcut lists", () => {
    function EmptyProbe() {
      useRegisterShortcuts("empty", []);
      return <span>ok</span>;
    }

    expect(() => render(<EmptyProbe />)).not.toThrow();
    expect(screen.getByText("ok")).toBeInTheDocument();
  });
});
