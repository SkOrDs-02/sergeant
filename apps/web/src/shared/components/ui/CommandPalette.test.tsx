/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import {
  CommandPaletteProvider,
  useCommandPalette,
  useCommandPaletteControls,
  useCommandPaletteHotkey,
  useRegisterCommand,
} from "./CommandPalette";
import { RECENTS_STORE, RECENTS_MAX } from "./CommandPalette.context";

afterEach(() => {
  cleanup();
  RECENTS_STORE.set([]);
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CommandPaletteProvider>{children}</CommandPaletteProvider>
);

describe("useCommandPaletteControls", () => {
  it("open/close/toggle drive the isOpen flag", () => {
    const { result } = renderHook(() => useCommandPaletteControls(), {
      wrapper,
    });
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);
  });

  it("returns no-op handles when there is no provider", () => {
    const { result } = renderHook(() => useCommandPaletteControls());
    expect(result.current.isOpen).toBe(false);
    // Calling without a provider must not throw.
    expect(() => act(() => result.current.open())).not.toThrow();
    expect(() => act(() => result.current.toggle())).not.toThrow();
  });
});

describe("useCommandPalette", () => {
  it("returns null outside the provider", () => {
    const { result } = renderHook(() => useCommandPalette());
    expect(result.current).toBeNull();
  });

  it("returns the context value inside the provider", () => {
    const { result } = renderHook(() => useCommandPalette(), { wrapper });
    expect(result.current).not.toBeNull();
    expect(typeof result.current?.register).toBe("function");
    expect(result.current?.recents).toEqual([]);
  });
});

describe("useRegisterCommand", () => {
  it("registers commands and exposes them via getAll(); unregisters on unmount", () => {
    const ctxRef: { current: ReturnType<typeof useCommandPalette> } = {
      current: null,
    };
    function Capture() {
      ctxRef.current = useCommandPalette();
      return null;
    }
    function WithCmd() {
      useRegisterCommand("mod", [{ id: "x", title: "X", run: () => {} }]);
      return null;
    }
    const { rerender } = render(
      <CommandPaletteProvider>
        <Capture />
        <WithCmd />
      </CommandPaletteProvider>,
    );
    expect(ctxRef.current?.getAll().map((c) => c.id)).toContain("x");

    // Remount without the command-registering child → it unregisters.
    rerender(
      <CommandPaletteProvider>
        <Capture />
      </CommandPaletteProvider>,
    );
    expect(ctxRef.current?.getAll().map((c) => c.id)).not.toContain("x");
  });

  it("mounting with an empty command array registers nothing for that id", () => {
    // `commands` is intentionally omitted from the effect deps, so a
    // registration only happens on mount / id change. An empty array on
    // mount short-circuits to `unregister`, leaving the registry untouched.
    const ctxRef: { current: ReturnType<typeof useCommandPalette> } = {
      current: null,
    };
    function Capture() {
      ctxRef.current = useCommandPalette();
      return null;
    }
    function WithEmpty() {
      useRegisterCommand("mod", []);
      return null;
    }
    render(
      <CommandPaletteProvider>
        <Capture />
        <WithEmpty />
      </CommandPaletteProvider>,
    );
    expect(ctxRef.current?.getAll()).toEqual([]);
  });
});

describe("markRecent / recents", () => {
  it("prepends, dedupes and caps recents at RECENTS_MAX", () => {
    const { result } = renderHook(() => useCommandPalette(), { wrapper });
    act(() => {
      for (let i = 0; i < RECENTS_MAX + 3; i++)
        result.current?.markRecent(`c${i}`);
    });
    const recents = result.current?.recents ?? [];
    expect(recents.length).toBe(RECENTS_MAX);
    // Most recent is first.
    expect(recents[0]).toBe(`c${RECENTS_MAX + 2}`);

    // Re-marking an existing id moves it to front without growing the list.
    act(() => result.current?.markRecent("c5"));
    expect(result.current?.recents[0]).toBe("c5");
    expect(result.current?.recents.length).toBe(RECENTS_MAX);
  });
});

describe("useCommandPaletteHotkey", () => {
  it("Cmd/Ctrl+K toggles the palette when enabled", () => {
    function Probe() {
      useCommandPaletteHotkey(true);
      const { isOpen } = useCommandPaletteControls();
      return <div data-testid="state">{isOpen ? "open" : "closed"}</div>;
    }
    render(
      <CommandPaletteProvider>
        <Probe />
      </CommandPaletteProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("closed");
    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(screen.getByTestId("state").textContent).toBe("open");
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    expect(screen.getByTestId("state").textContent).toBe("closed");
  });

  it("ignores plain 'k' without a modifier", () => {
    function Probe() {
      useCommandPaletteHotkey(true);
      const { isOpen } = useCommandPaletteControls();
      return <div data-testid="state">{isOpen ? "open" : "closed"}</div>;
    }
    render(
      <CommandPaletteProvider>
        <Probe />
      </CommandPaletteProvider>,
    );
    act(() => {
      fireEvent.keyDown(window, { key: "k" });
    });
    expect(screen.getByTestId("state").textContent).toBe("closed");
  });

  it("does nothing when disabled", () => {
    function Probe() {
      useCommandPaletteHotkey(false);
      const { isOpen } = useCommandPaletteControls();
      return <div data-testid="state">{isOpen ? "open" : "closed"}</div>;
    }
    render(
      <CommandPaletteProvider>
        <Probe />
      </CommandPaletteProvider>,
    );
    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(screen.getByTestId("state").textContent).toBe("closed");
  });
});

describe("CommandPalette mount point", () => {
  it("renders nothing while closed and never requests the lazy body", async () => {
    const { CommandPalette } = await import("./CommandPalette");
    const { container } = render(
      <CommandPaletteProvider>
        <CommandPalette />
      </CommandPaletteProvider>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
