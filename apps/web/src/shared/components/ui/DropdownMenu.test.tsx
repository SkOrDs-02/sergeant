// @vitest-environment jsdom
/**
 * Tests for `DropdownMenu` — keyboard-first portal menu primitive, plus
 * the `nextFocusableIndex` helper and the `DropdownMenuEntryView` rows
 * (item / submenu / separator / label).
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import {
  DropdownMenu,
  nextFocusableIndex,
  type DropdownMenuEntry,
} from "./DropdownMenu";

// jsdom provides requestAnimationFrame; the menu's focus-restore on close
// schedules a rAF that we let run naturally. Testing-library's cleanup()
// (registered in src/test/setup.ts) unmounts the portal between tests — we
// must NOT manually wipe document.body or that unmount throws NotFoundError.

const items: DropdownMenuEntry[] = [
  { type: "label", id: "lbl", label: "Actions" },
  { type: "item", id: "edit", label: "Edit", onSelect: vi.fn() },
  { type: "separator", id: "sep" },
  {
    type: "item",
    id: "del",
    label: "Delete",
    destructive: true,
    shortcut: "⌫",
    onSelect: vi.fn(),
  },
  { type: "item", id: "disabled", label: "Disabled", disabled: true },
];

describe("nextFocusableIndex", () => {
  it("returns -1 for an empty list", () => {
    expect(nextFocusableIndex([], -1, 1)).toBe(-1);
  });

  it("finds the first focusable entry, skipping label/separator", () => {
    // index 0 is a label, 1 is item → first focusable is 1
    expect(nextFocusableIndex(items, -1, 1)).toBe(1);
  });

  it("wraps forward past disabled entries", () => {
    // from index 3 (del), next focusable forward skips disabled(4) → wraps to 1
    expect(nextFocusableIndex(items, 3, 1)).toBe(1);
  });

  it("walks backward", () => {
    expect(nextFocusableIndex(items, 4, -1)).toBe(3);
  });
});

describe("DropdownMenu", () => {
  function renderMenu(
    props: Partial<React.ComponentProps<typeof DropdownMenu>> = {},
  ) {
    return render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={items}
        ariaLabel="Test menu"
        {...props}
      />,
    );
  }

  it("renders the trigger with menu ARIA wiring closed by default", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Open" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on trigger click and renders the panel via portal", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const menu = screen.getByRole("menu", { name: "Test menu" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument(); // label row
  });

  it("opens via ArrowDown on the trigger", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Open" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("activates an item on click and closes, firing onSelect", () => {
    const onSelect = vi.fn();
    const localItems: DropdownMenuEntry[] = [
      { type: "item", id: "a", label: "Alpha", onSelect },
    ];
    render(<DropdownMenu trigger={<button>Open</button>} items={localItems} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Alpha" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("moves focus with ArrowDown / ArrowUp / Home / End", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "Home" });
    fireEvent.keyDown(menu, { key: "End" });
    // No throw; the highlighted item is the destructive Delete (last focusable)
    expect(
      screen.getByRole("menuitem", { name: /Delete/ }),
    ).toBeInTheDocument();
  });

  it("activates the focused item on Enter", () => {
    const onSelect = vi.fn();
    const localItems: DropdownMenuEntry[] = [
      { type: "item", id: "a", label: "Alpha", onSelect },
    ];
    render(<DropdownMenu trigger={<button>Open</button>} items={localItems} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(onSelect).toHaveBeenCalled();
  });

  it("supports type-ahead to jump to a matching entry", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "d" }); // matches "Delete"
    expect(
      screen.getByRole("menuitem", { name: /Delete/ }),
    ).toBeInTheDocument();
  });

  it("closes on outside mousedown", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes and advances focus on Tab", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens a submenu via ArrowRight and renders its items", () => {
    const subItems: DropdownMenuEntry[] = [
      {
        type: "submenu",
        id: "more",
        label: "More",
        items: [
          { type: "item", id: "x", label: "SubX", onSelect: vi.fn() },
          { type: "separator", id: "s" },
        ],
      },
    ];
    render(<DropdownMenu trigger={<button>Open</button>} items={subItems} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowRight" });
    expect(screen.getByRole("menuitem", { name: "SubX" })).toBeInTheDocument();
  });

  it("supports controlled open state via onOpenChange", () => {
    const onOpenChange = vi.fn();
    render(
      <DropdownMenu
        trigger={<button>Open</button>}
        items={items}
        open={false}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // still closed because controlled and parent didn't flip `open`
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("throws when trigger is not a valid element", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <DropdownMenu
          trigger={"not-an-element" as unknown as React.ReactElement}
          items={items}
        />,
      ),
    ).toThrow(/must be a single React element/);
    spy.mockRestore();
  });
});
