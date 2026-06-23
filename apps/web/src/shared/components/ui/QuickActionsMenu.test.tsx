// @vitest-environment jsdom
/**
 * Tests for `QuickActionsMenu` — radial long-press menu.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import { QuickActionsMenu, type QuickAction } from "./QuickActionsMenu";

const actions: QuickAction[] = [
  { id: "a", icon: "plus", label: "Add", onClick: vi.fn() },
  { id: "b", icon: "pencil", label: "Edit", onClick: vi.fn() },
  { id: "c", icon: "trash", label: "Delete", onClick: vi.fn() },
];

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("QuickActionsMenu", () => {
  it("renders the trigger with menu ARIA, closed by default", () => {
    render(<QuickActionsMenu trigger={<span>FAB</span>} actions={actions} />);
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens the radial menu after a long press", () => {
    const onOpen = vi.fn();
    render(
      <QuickActionsMenu
        trigger={<span>FAB</span>}
        actions={actions}
        onOpen={onOpen}
      />,
    );
    const trigger = screen.getByRole("button");
    act(() => {
      fireEvent.mouseDown(trigger);
      vi.advanceTimersByTime(500);
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  it("does not open if the press is released before the delay", () => {
    render(<QuickActionsMenu trigger={<span>FAB</span>} actions={actions} />);
    const trigger = screen.getByRole("button");
    act(() => {
      fireEvent.mouseDown(trigger);
      vi.advanceTimersByTime(200);
      fireEvent.mouseUp(trigger);
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens immediately on Enter key", () => {
    render(<QuickActionsMenu trigger={<span>FAB</span>} actions={actions} />);
    const trigger = screen.getByRole("button");
    act(() => {
      fireEvent.keyDown(trigger, { key: "Enter" });
    });
    // anchorRect is null on keyboard open (no getBoundingClientRect path),
    // so the portal menu isn't drawn — but the open state flips.
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("fires the action onClick and closes when an action is chosen", () => {
    const onClick = vi.fn();
    const localActions: QuickAction[] = [
      { id: "x", icon: "plus", label: "X", onClick },
    ];
    render(
      <QuickActionsMenu trigger={<span>FAB</span>} actions={localActions} />,
    );
    const trigger = screen.getByRole("button");
    act(() => {
      fireEvent.mouseDown(trigger);
      vi.advanceTimersByTime(500);
    });
    fireEvent.click(screen.getByRole("menuitem", { name: /X/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <QuickActionsMenu
        trigger={<span>FAB</span>}
        actions={actions}
        onClose={onClose}
      />,
    );
    const trigger = screen.getByRole("button");
    act(() => {
      fireEvent.mouseDown(trigger);
      vi.advanceTimersByTime(500);
    });
    const backdrop = screen.getByRole("button", { name: "Закрити меню" });
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("supports the bottom position variant", () => {
    render(
      <QuickActionsMenu
        trigger={<span>FAB</span>}
        actions={actions}
        position="bottom"
      />,
    );
    const trigger = screen.getByRole("button");
    act(() => {
      fireEvent.mouseDown(trigger);
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
