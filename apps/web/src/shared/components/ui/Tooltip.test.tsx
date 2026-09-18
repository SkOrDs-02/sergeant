/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Tooltip } from "./Tooltip";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * Contract tests for the Tooltip primitive. The panel is portaled to
 * document.body, so we use `screen.*` queries — they walk the full
 * document, whereas the render-returned helpers are scoped to the
 * RTL container.
 */
describe("Tooltip", () => {
  it("does not render the tooltip panel when closed", () => {
    render(
      <Tooltip content="Щоденний ліміт">
        <button type="button">Ліміт</button>
      </Tooltip>,
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on focus after the open delay and exposes aria-describedby", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Щоденний ліміт" openDelay={150}>
        <button type="button">Ліміт</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button") as HTMLButtonElement;

    fireEvent.focus(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const panel = screen.getByRole("tooltip");
    expect(panel).not.toBeNull();
    expect(panel.textContent).toBe("Щоденний ліміт");
    expect(btn.getAttribute("aria-describedby")).toBe(panel.id);
  });

  it("opens on mouseenter, closes on mouseleave", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Help" openDelay={100}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button") as HTMLButtonElement;

    fireEvent.mouseEnter(btn);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("closes on Escape key from the trigger", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Help" openDelay={50}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button") as HTMLButtonElement;

    fireEvent.focus(btn);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    fireEvent.keyDown(btn, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("closes on outside mousedown", () => {
    vi.useFakeTimers();
    render(
      <div>
        <Tooltip content="Help" openDelay={50}>
          <button type="button">Trigger</button>
        </Tooltip>
        <button type="button" data-testid="outside">
          Outside
        </button>
      </div>,
    );
    fireEvent.focus(screen.getByText("Trigger"));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not open when disabled=true", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Help" disabled openDelay={50}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole("button"));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("preserves trigger's existing onClick / onKeyDown handlers", () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn();
    render(
      <Tooltip content="Help">
        <button type="button" onClick={onClick} onKeyDown={onKeyDown}>
          Trigger
        </button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button") as HTMLButtonElement;
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it("size='md' applies larger padding + body-typescale classes", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Detail" size="md" openDelay={0}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole("button"));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    const panel = screen.getByRole("tooltip");
    expect(panel.className).toContain("text-style-body");
    expect(panel.className).toContain("px-3");
    expect(panel.className).toContain("py-2");
  });

  it("accepts legacy `top-center` placement as an alias", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Help" placement="top-center" openDelay={0}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole("button"));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });
});
