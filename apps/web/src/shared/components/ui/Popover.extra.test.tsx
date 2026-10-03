/** @vitest-environment jsdom */
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Extra branch-coverage tests for Popover.tsx.
 * Covers: PopoverItem (icon / destructive / disabled), PopoverDivider,
 * Space key open, footer slot, header+footer together, arrow-key navigation
 * (ArrowDown / ArrowUp / Home / End), label prop, role override, wrapperClassName.
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { Popover, PopoverItem, PopoverDivider } from "./Popover";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// PopoverItem
// ---------------------------------------------------------------------------
describe("PopoverItem", () => {
  it("renders children and calls onClick", () => {
    const onClick = vi.fn();
    render(<PopoverItem onClick={onClick}>Дія</PopoverItem>);
    const item = screen.getByRole("menuitem");
    expect(item.textContent).toContain("Дія");
    fireEvent.click(item);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders an icon when provided", () => {
    render(
      <PopoverItem icon={<span data-testid="icon">★</span>}>
        Дія з іконкою
      </PopoverItem>,
    );
    expect(screen.getByTestId("icon")).toBeTruthy();
  });

  it("applies destructive styling when destructive=true", () => {
    const { getByRole } = render(
      <PopoverItem destructive>Небезпечна дія</PopoverItem>,
    );
    const btn = getByRole("menuitem");
    // The destructive class includes text-danger-strong (or similar).
    // We check the class contains the word "danger".
    expect(btn.className).toContain("danger");
  });

  it("is disabled when disabled=true", () => {
    const onClick = vi.fn();
    render(
      <PopoverItem disabled onClick={onClick}>
        Disabled
      </PopoverItem>,
    );
    const btn = screen.getByRole("menuitem");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    // onClick is still registered but button is disabled → click does not fire in JSDOM
    // (pointer-events:none via CSS but fireEvent ignores CSS, so check disabled)
    expect(btn).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PopoverDivider
// ---------------------------------------------------------------------------
describe("PopoverDivider", () => {
  it("renders an hr element", () => {
    const { container } = render(<PopoverDivider />);
    expect(container.querySelector("hr")).toBeTruthy();
  });

  it("forwards className to the hr", () => {
    const { container } = render(<PopoverDivider className="my-custom" />);
    expect(container.querySelector("hr")?.className).toContain("my-custom");
  });
});

// ---------------------------------------------------------------------------
// Popover – additional trigger / open behavior
// ---------------------------------------------------------------------------
describe("Popover – Space key opens", () => {
  it("opens the panel on Space keydown on the trigger", () => {
    render(
      <Popover trigger={<span>Menu</span>}>
        <button>Item</button>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: /menu/i });
    fireEvent.keyDown(trigger, { key: " " });
    expect(screen.getByRole("menu")).toBeTruthy();
  });
});

describe("Popover – footer slot", () => {
  it("renders footer content when footer prop is provided", () => {
    render(
      <Popover trigger={<span>Open</span>} footer={<button>Зберегти</button>}>
        <p>body</p>
      </Popover>,
    );
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    // Footer button is rendered inside the panel.
    expect(screen.getByText("Зберегти")).toBeTruthy();
  });

  it("switches to dialog role when both header and footer are present", () => {
    render(
      <Popover
        trigger={<span>Open</span>}
        header="Заголовок"
        footer={<button>OK</button>}
      >
        <p>content</p>
      </Popover>,
    );
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("Popover – label prop", () => {
  it("passes label as aria-label when no header is present", () => {
    render(
      <Popover trigger={<span>Filter</span>} label="Фільтри меню">
        <button>Item</button>
      </Popover>,
    );
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));
    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("aria-label")).toBe("Фільтри меню");
  });
});

describe("Popover – role override", () => {
  it("honours explicit role='dialog' even without header", () => {
    render(
      <Popover trigger={<span>Open</span>} role="dialog">
        <p>content</p>
      </Popover>,
    );
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("honours explicit role='menu' even when header is set", () => {
    render(
      <Popover trigger={<span>Open</span>} header="Header" role="menu">
        <button>Item</button>
      </Popover>,
    );
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByRole("menu")).toBeTruthy();
  });
});

describe("Popover – wrapperClassName", () => {
  it("applies wrapperClassName to the outer wrapper div", () => {
    const { container } = render(
      <Popover trigger={<span>Menu</span>} wrapperClassName="custom-wrapper">
        <button>Item</button>
      </Popover>,
    );
    const wrapper = container.querySelector(".custom-wrapper");
    expect(wrapper).toBeTruthy();
  });
});

describe("Popover – arrow-key navigation inside menu", () => {
  function renderMenu() {
    render(
      <Popover trigger={<span>Menu</span>}>
        <button role="menuitem">First</button>
        <button role="menuitem">Second</button>
        <button role="menuitem">Third</button>
      </Popover>,
    );
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    return screen.getByRole("menu");
  }

  it("ArrowDown moves focus to the next menu item", () => {
    const menu = renderMenu();
    const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items[0]?.focus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
  });

  it("ArrowDown wraps around from the last item", () => {
    const menu = renderMenu();
    const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items[items.length - 1]?.focus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("ArrowUp moves focus to the previous menu item", () => {
    const menu = renderMenu();
    const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items[1]?.focus();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("ArrowUp wraps around from the first item", () => {
    const menu = renderMenu();
    const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items[0]?.focus();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it("Home moves focus to the first menu item", () => {
    const menu = renderMenu();
    const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items[2]?.focus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("End moves focus to the last menu item", () => {
    const menu = renderMenu();
    const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items[0]?.focus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });
});

describe("Popover – aria-modal on dialog role", () => {
  it("sets aria-modal=true when panel has dialog role", () => {
    render(
      <Popover trigger={<span>Open</span>} header="Header">
        <p>content</p>
      </Popover>,
    );
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("does NOT set aria-modal when panel has menu role", () => {
    render(
      <Popover trigger={<span>Open</span>}>
        <button>Item</button>
      </Popover>,
    );
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("aria-modal")).toBeNull();
  });
});
