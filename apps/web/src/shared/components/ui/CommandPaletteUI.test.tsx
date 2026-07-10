/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { useEffect } from "react";
import { CommandPaletteUI } from "./CommandPaletteUI";
import {
  CommandPaletteProvider,
  useCommandPaletteControls,
  useRegisterCommand,
} from "./CommandPalette";
import { RECENTS_STORE } from "./CommandPalette.context";

afterEach(() => {
  cleanup();
  RECENTS_STORE.set([]);
});

type HarnessCommands = Array<{
  id: string;
  title: string;
  run: () => void;
  group?: string;
  description?: string;
  keywords?: string[];
  disabled?: boolean;
  shortcut?: string;
}>;

function HarnessInner({
  commands,
  onOpenRef,
}: {
  commands: HarnessCommands;
  onOpenRef?: { current: (() => void) | null } | undefined;
}) {
  const controls = useCommandPaletteControls();
  useRegisterCommand("test", commands);
  useEffect(() => {
    if (onOpenRef) onOpenRef.current = controls.open;
  }, [onOpenRef, controls.open]);
  useEffect(() => {
    controls.open();
    // Mount-only test bootstrap — open the palette once harness mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <CommandPaletteUI />;
}

/** Mounts the provider, opens the palette, and registers the given commands. */
function Harness({
  commands,
  onOpenRef,
}: {
  commands: HarnessCommands;
  onOpenRef?: { current: (() => void) | null };
}) {
  return (
    <CommandPaletteProvider>
      <HarnessInner commands={commands} onOpenRef={onOpenRef} />
    </CommandPaletteProvider>
  );
}

const cmds = (extra: Record<string, unknown> = {}) => [
  { id: "a", title: "Додати витрату", run: vi.fn(), group: "Finyk" },
  { id: "b", title: "Відкрити налаштування", run: vi.fn(), group: "Hub" },
  {
    id: "c",
    title: "Сканувати чек",
    run: vi.fn(),
    group: "Finyk",
    keywords: ["scan", "qr"],
    ...extra,
  },
];

describe("CommandPaletteUI", () => {
  it("renders the dialog with search input and all commands grouped", () => {
    render(<Harness commands={cmds()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Знайди команду…")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Додати витрату/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Finyk" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Hub" })).toBeInTheDocument();
  });

  it("filters commands by query (title and keywords) after debounce", () => {
    vi.useFakeTimers();
    try {
      render(<Harness commands={cmds()} />);
      const input = screen.getByPlaceholderText("Знайди команду…");
      fireEvent.change(input, { target: { value: "scan" } });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      // Only the command with the "scan" keyword survives.
      expect(
        screen.getByRole("option", { name: /Сканувати чек/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /Додати витрату/ }),
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows an empty-state message when nothing matches", () => {
    vi.useFakeTimers();
    try {
      render(<Harness commands={cmds()} />);
      const input = screen.getByPlaceholderText("Знайди команду…");
      fireEvent.change(input, { target: { value: "zzzznope" } });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByText("Нічого не знайдено")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // Commands are grouped by `group` (Map insertion order), so the flat
  // keyboard-nav order is Finyk first ([a, c]) then Hub ([b]):
  //   index 0 → "Додати витрату" (a)
  //   index 1 → "Сканувати чек" (c)
  //   index 2 → "Відкрити налаштування" (b)
  it("ArrowDown moves selection and Enter activates the highlighted command", () => {
    const list = cmds();
    render(<Harness commands={list} />);
    const input = screen.getByPlaceholderText("Знайди команду…");

    // First option starts active.
    const first = screen.getByRole("option", { name: /Додати витрату/ });
    expect(first.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const second = screen.getByRole("option", { name: /Сканувати чек/ });
    expect(second.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(input, { key: "Enter" });
    // `c` is the third entry in the source array but second in flat order.
    expect(list[2]!.run).toHaveBeenCalledTimes(1);
  });

  it("ArrowUp wraps to the last command", () => {
    const list = cmds();
    render(<Harness commands={list} />);
    const input = screen.getByPlaceholderText("Знайди команду…");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    const last = screen.getByRole("option", { name: /Відкрити налаштування/ });
    expect(last.getAttribute("aria-selected")).toBe("true");
  });

  it("Home/End jump to first/last command", () => {
    render(<Harness commands={cmds()} />);
    const input = screen.getByPlaceholderText("Знайди команду…");
    fireEvent.keyDown(input, { key: "End" });
    expect(
      screen
        .getByRole("option", { name: /Відкрити налаштування/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.keyDown(input, { key: "Home" });
    expect(
      screen
        .getByRole("option", { name: /Додати витрату/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("clicking a command runs it and closes the palette", () => {
    const list = cmds();
    render(<Harness commands={list} />);
    fireEvent.click(
      screen.getByRole("option", { name: /Відкрити налаштування/ }),
    );
    expect(list[1]!.run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hovering a command makes it the active option", () => {
    render(<Harness commands={cmds()} />);
    const second = screen.getByRole("option", {
      name: /Відкрити налаштування/,
    });
    fireEvent.mouseEnter(second);
    expect(second.getAttribute("aria-selected")).toBe("true");
  });

  it("disabled command does not run and is marked aria-disabled", () => {
    const list = cmds({ disabled: true });
    render(<Harness commands={list} />);
    const disabled = screen.getByRole("option", { name: /Сканувати чек/ });
    expect(disabled.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(disabled);
    expect(list[2]!.run).not.toHaveBeenCalled();
  });

  it("backdrop click closes the palette", () => {
    render(<Harness commands={cmds()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Закрити палітру команд" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape closes the palette via the focus-trap handler", () => {
    render(<Harness commands={cmds()} />);
    const input = screen.getByPlaceholderText("Знайди команду…");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a 'Нещодавні' group when there are recent commands", () => {
    RECENTS_STORE.set(["b"]);
    render(<Harness commands={cmds()} />);
    expect(
      screen.getByRole("group", { name: "Нещодавні" }),
    ).toBeInTheDocument();
  });

  it("locks body scroll while open and restores on close", () => {
    render(<Harness commands={cmds()} />);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(
      screen.getByRole("button", { name: "Закрити палітру команд" }),
    );
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
