/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { Popover } from "./Popover";

afterEach(cleanup);

/**
 * Contract tests for the DS Popover primitive. Locks the open/close
 * semantics (click-toggle, outside-click, Escape dismiss) and accessible
 * attributes (aria-expanded, aria-haspopup, role="menu").
 */
describe("Popover", () => {
  it("renders trigger and hides panel when closed", () => {
    const { getByRole, queryByRole } = render(
      <Popover trigger={<span>Open</span>}>
        <button>Item</button>
      </Popover>,
    );
    // Trigger is visible. The Popover wraps the trigger in a
    // `<div role="button">` so we look up by the wrapper's accessible
    // name (derived from its child text). Passing a `<button>` as the
    // trigger would nest a real button inside the wrapper button — DOM
    // contract says only one of them can be the focusable trigger, so
    // we use a `<span>` here to mirror the production pattern (consumers
    // pass non-interactive content; the Popover provides the role).
    expect(getByRole("button", { name: "Open" })).toBeTruthy();
    // Panel not rendered when closed
    expect(queryByRole("menu")).toBeNull();
  });

  it("opens panel on trigger click", () => {
    render(
      <Popover trigger={<span>Toggle</span>}>
        <button>Action</button>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: /toggle/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("sets aria-expanded=false when closed and true when open", () => {
    render(
      <Popover trigger={<span>Menu</span>}>
        <button>Item</button>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: /menu/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on Escape key", () => {
    render(
      <Popover trigger={<span>Menu</span>}>
        <button>Item</button>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: /menu/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on outside mousedown", () => {
    render(
      <div>
        <Popover trigger={<span>Menu</span>}>
          <button>Item</button>
        </Popover>
        <div data-testid="outside">Outside</div>
      </div>,
    );
    const trigger = screen.getByRole("button", { name: /menu/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does NOT close when clicking inside the panel", () => {
    render(
      <Popover trigger={<span>Menu</span>}>
        <button>Item inside</button>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: /menu/i });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    fireEvent.mouseDown(menu);
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("controlled mode: renders open when open=true", () => {
    render(
      <Popover trigger={<span>Menu</span>} open={true} onOpenChange={() => {}}>
        <button>Item</button>
      </Popover>,
    );
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("controlled mode: calls onOpenChange when trigger is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <Popover
        trigger={<span>Menu</span>}
        open={false}
        onOpenChange={onOpenChange}
      >
        <button>Item</button>
      </Popover>,
    );
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("opens via Enter key on the trigger", () => {
    render(
      <Popover trigger={<span>Menu</span>}>
        <button>Item</button>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: /menu/i });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("applies placement class — bottom-end puts panel on the right", () => {
    render(
      <Popover trigger={<span>Menu</span>} placement="bottom-end">
        <button>Item</button>
      </Popover>,
    );
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    const menu = screen.getByRole("menu");
    expect(menu.className).toContain("right-0");
  });
});
