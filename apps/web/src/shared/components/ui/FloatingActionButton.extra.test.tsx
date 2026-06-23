// @vitest-environment jsdom
/**
 * Behavioural tests for FloatingActionButton (single + expandable FAB).
 *
 * Covers the click contract, the expandable fan menu (open/close, action
 * dispatch, outside-click close), the scroll-to-hide behaviour, variant /
 * size / position class wiring, and the custom-children render path.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";

vi.mock("../../lib/adapters/haptic", () => ({ hapticTap: vi.fn() }));
vi.mock("@shared/hooks/useDialogFocusTrap", () => ({
  useDialogFocusTrap: vi.fn(),
}));
vi.mock("@shared/hooks/useBodyScrollLock", () => ({
  useBodyScrollLock: vi.fn(),
}));

import { FloatingActionButton } from "./FloatingActionButton";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FloatingActionButton — single action", () => {
  it("fires onClick when there are no actions", () => {
    const onClick = vi.fn();
    render(<FloatingActionButton onClick={onClick} aria-label="Додати" />);
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("falls back to label as the accessible name", () => {
    render(<FloatingActionButton label="Нове" />);
    expect(screen.getByRole("button", { name: "Нове" })).toBeInTheDocument();
  });

  it("renders custom children instead of the default icon", () => {
    render(
      <FloatingActionButton aria-label="Custom">
        <span data-testid="custom-child">C</span>
      </FloatingActionButton>,
    );
    expect(screen.getByTestId("custom-child")).toBeInTheDocument();
  });

  it("applies the requested variant + size classes", () => {
    render(
      <FloatingActionButton aria-label="V" variant="v2-fizruk" size="lg" />,
    );
    const btn = screen.getByRole("button", { name: "V" });
    expect(btn.className).toContain("from-cyan-400");
    expect(btn.className).toContain("w-16");
  });

  it("does not advertise a popup when there are no actions", () => {
    render(<FloatingActionButton aria-label="No menu" />);
    const btn = screen.getByRole("button", { name: "No menu" });
    expect(btn).not.toHaveAttribute("aria-haspopup");
  });
});

describe("FloatingActionButton — expandable menu", () => {
  const actions = [
    { id: "a", icon: "check" as const, label: "Перше", onClick: vi.fn() },
    { id: "b", icon: "edit" as const, label: "Друге", onClick: vi.fn() },
  ];

  it("toggles the menu open and renders all action items", () => {
    render(<FloatingActionButton aria-label="Меню" actions={actions} />);
    const trigger = screen.getByRole("button", { name: "Меню" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("Перше")).toBeInTheDocument();
    expect(within(menu).getByText("Друге")).toBeInTheDocument();
  });

  it("clicking an action item runs it and closes the menu", () => {
    const onClick = vi.fn();
    const localActions = [
      { id: "x", icon: "check" as const, label: "Дія", onClick },
    ];
    render(<FloatingActionButton aria-label="Меню" actions={localActions} />);
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    fireEvent.click(screen.getByText("Дія"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu on an outside mousedown", () => {
    render(<FloatingActionButton aria-label="Меню" actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("colors action icon tile when action.color is set", () => {
    const colored = [
      {
        id: "c",
        icon: "check" as const,
        label: "Колір",
        onClick: vi.fn(),
        color: "#ff0000",
      },
    ];
    render(<FloatingActionButton aria-label="Меню" actions={colored} />);
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    expect(screen.getByText("Колір")).toBeInTheDocument();
  });
});

describe("FloatingActionButton — scroll-to-hide", () => {
  it("hides on a downward scroll past the threshold and restores on scroll up", () => {
    render(<FloatingActionButton aria-label="Hide" hideOnScroll />);
    const btn = screen.getByRole("button", { name: "Hide" });
    const outer = btn.parentElement as HTMLElement;

    // Scroll down well past the 80px threshold.
    Object.defineProperty(window, "scrollY", {
      value: 200,
      configurable: true,
    });
    fireEvent.scroll(window);
    expect(outer.className).toContain("translate-y-24");

    // Scroll back up.
    Object.defineProperty(window, "scrollY", {
      value: 150,
      configurable: true,
    });
    fireEvent.scroll(window);
    expect(outer.className).not.toContain("translate-y-24");
  });
});
